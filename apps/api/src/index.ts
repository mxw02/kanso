import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from 'jsonwebtoken';
import { PrismaClient, IssuePriority, IssueType, AssigneeType, AgentRunStatus, UserRole, SprintStatus, IssueRelationType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import {
  getOpenBlockers,
  notifyUnblockedDependents,
  registerAgentFeatureRoutes,
  resolveStageHandoff,
  validateProofOfWorkGate,
  validateWorkflowTransition,
} from './agent-features';
import { decryptSecret, encryptSecret } from './crypto';

dotenv.config();

const prisma = new PrismaClient();
const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'kanso-super-secret-jwt-key-change-in-production-2026';

// Optional Redis for pub/sub event distribution
let redisPub: Redis | null = null;
if (process.env.REDIS_URL) {
  try {
    redisPub = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redisPub.connect().catch(() => {
      console.log('ℹ️ Redis connection optional / offline. Using in-memory event bus.');
    });
  } catch {
    // Ignore and fallback to in-memory
  }
}

// In-memory SSE subscriber list
const sseClients = new Set<FastifyReply>();

function broadcastEvent(type: string, payload: unknown) {
  const data = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    try {
      client.raw.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
  if (redisPub && redisPub.status === 'ready') {
    redisPub.publish('kanso:events', data).catch(() => {});
  }
}

const DEFAULT_COLUMNS = [
  { id: 'BACKLOG', title: 'Backlog', color: 'border-zinc-700/60' },
  { id: 'TODO', title: 'To Do', color: 'border-blue-500/40' },
  { id: 'IN_PROGRESS', title: 'In Progress', color: 'border-amber-500/40' },
  { id: 'IN_REVIEW', title: 'In Review', color: 'border-purple-500/40' },
  { id: 'DONE', title: 'Done', color: 'border-emerald-500/40' },
];

async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Health check
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'kanso-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      agentSupport: true,
      mcpEnabled: true,
    };
  });

  // Realtime Server-Sent Events (SSE)
  app.get('/api/events', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    sseClients.add(reply);
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    request.raw.on('close', () => {
      sseClients.delete(reply);
    });
  });

  // ==========================================
  // AUTH & USERS (Rollen: ADMIN, MEMBER, VIEWER)
  // ==========================================
  app.post('/api/auth/register', async (request: FastifyRequest<{
    Body: { email: string; name: string; password?: string; role?: UserRole };
  }>, reply: FastifyReply) => {
    const { email, name, password, role } = request.body;
    if (!email || !name) {
      return reply.status(400).send({ error: 'Email and Name are required.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: 'User with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password || 'password123', 10);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: passwordHash,
        role: role || UserRole.MEMBER,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return reply.status(201).send({ user, token });
  });

  app.post('/api/auth/login', async (request: FastifyRequest<{
    Body: { email: string; password?: string };
  }>, reply: FastifyReply) => {
    const { email, password } = request.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (password && user.password) {
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      token,
    };
  });

  // Helper: Synchronize Git identity with User account & issue token
  async function syncGitUser(params: {
    provider: 'github' | 'gitlab';
    accountName: string;
    displayName?: string;
    avatarUrl?: string;
    email?: string;
  }) {
    const { provider, accountName, displayName, avatarUrl, email } = params;
    const cleanAccount = accountName.trim().replace(/^@/, '');
    const effectiveEmail = email || `${cleanAccount.toLowerCase()}@${provider}.kanso`;
    const effectiveName = displayName || cleanAccount;

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { gitProvider: provider, gitUsername: cleanAccount },
          { email: effectiveEmail },
        ],
      },
    });

    const totalUsers = await prisma.user.count();
    const role = totalUsers === 0 ? UserRole.ADMIN : UserRole.MEMBER;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: effectiveEmail,
          name: effectiveName,
          avatarUrl: avatarUrl || (provider === 'gitlab'
            ? 'https://gitlab.com/uploads/-/system/user/avatar/42/avatar.png'
            : `https://avatars.githubusercontent.com/${cleanAccount}`),
          role,
          gitProvider: provider,
          gitUsername: cleanAccount,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: effectiveName || user.name,
          avatarUrl: avatarUrl || user.avatarUrl,
          gitProvider: provider,
          gitUsername: cleanAccount,
        },
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        gitUsername: user.gitUsername,
        gitProvider: user.gitProvider,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return { user, token };
  }

  // ==========================================
  // AUTH & USERS (Rollen: ADMIN, MEMBER, VIEWER)
  // ==========================================
  app.get('/api/users', async () => {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        gitProvider: true,
        gitUsername: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  app.post('/api/users', async (request: FastifyRequest<{
    Body: { name: string; email: string; role?: UserRole; gitProvider?: string; gitUsername?: string };
  }>, reply: FastifyReply) => {
    const { name, email, role = UserRole.MEMBER, gitProvider = 'github', gitUsername } = request.body || {};
    if (!name || !email) {
      return reply.status(400).send({ error: 'Name und E-Mail-Adresse sind erforderlich.' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return reply.status(409).send({ error: 'Ein Nutzer mit dieser E-Mail existiert bereits.' });
    }

    const cleanUsername = gitUsername ? gitUsername.trim().replace(/^@/, '') : null;
    const provider = gitProvider || 'github';
    const avatar = cleanUsername
      ? (provider === 'gitlab'
          ? 'https://gitlab.com/uploads/-/system/user/avatar/42/avatar.png'
          : `https://avatars.githubusercontent.com/${cleanUsername}`)
      : null;

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: role || UserRole.MEMBER,
        gitProvider: provider,
        gitUsername: cleanUsername,
        avatarUrl: avatar,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        gitProvider: true,
        gitUsername: true,
        createdAt: true,
      },
    });

    broadcastEvent('user_created', user);
    return reply.status(201).send(user);
  });

  app.patch('/api/users/:id/role', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { role: UserRole };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { role } = request.body || {};
    if (!role || !Object.values(UserRole).includes(role)) {
      return reply.status(400).send({ error: 'Gültige Rolle (ADMIN, MEMBER, VIEWER) erforderlich.' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.status(404).send({ error: 'Nutzer nicht gefunden.' });
    }

    if (user.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
      const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        return reply.status(400).send({ error: 'Der letzte Administrator kann nicht herabgestuft werden.' });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        gitProvider: true,
        gitUsername: true,
        createdAt: true,
      },
    });

    broadcastEvent('user_updated', updated);
    return updated;
  });

  app.delete('/api/users/:id', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.status(404).send({ error: 'Nutzer nicht gefunden.' });
    }

    if (user.role === UserRole.ADMIN) {
      const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        return reply.status(400).send({ error: 'Der letzte Administrator kann nicht gelöscht werden.' });
      }
    }

    await prisma.user.delete({ where: { id } });
    broadcastEvent('user_deleted', { id });
    return { success: true };
  });

  app.post('/api/auth/switch-user', async (request: FastifyRequest<{
    Body: { userId: string };
  }>, reply: FastifyReply) => {
    const { userId } = request.body || {};
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.status(404).send({ error: 'Nutzer nicht gefunden.' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        gitUsername: user.gitUsername,
        gitProvider: user.gitProvider,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        gitProvider: user.gitProvider,
        gitUsername: user.gitUsername,
        createdAt: user.createdAt,
      },
      token,
    };
  });

  app.post('/api/auth/git-login', async (request: FastifyRequest<{
    Body: { provider?: 'github' | 'gitlab'; username: string; displayName?: string; avatarUrl?: string };
  }>, reply: FastifyReply) => {
    const { provider = 'github', username, displayName, avatarUrl } = request.body || {};
    if (!username) {
      return reply.status(400).send({ error: 'Git Username ist erforderlich' });
    }

    const result = await syncGitUser({
      provider,
      accountName: username.trim().replace(/^@/, ''),
      displayName,
      avatarUrl,
    });

    return result;
  });

  // ==========================================
  // WORKSPACES & PROJEKTE
  // ==========================================
  app.get('/api/workspaces', async () => {
    return prisma.workspace.findMany({
      include: {
        projects: {
          select: {
            id: true,
            key: true,
            name: true,
            _count: { select: { issues: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  });

  app.post('/api/workspaces', async (request: FastifyRequest<{
    Body: { name: string; slug?: string; description?: string };
  }>, reply: FastifyReply) => {
    const { name, slug, description } = request.body;
    if (!name) return reply.status(400).send({ error: 'Workspace name is required.' });

    const cleanSlug = (slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-|-$/g, '');
    const workspace = await prisma.workspace.create({
      data: {
        name,
        slug: cleanSlug,
        description,
      },
    });

    broadcastEvent('workspace_created', workspace);
    return reply.status(201).send(workspace);
  });

  app.get('/api/projects', async (request: FastifyRequest<{
    Querystring: { workspaceId?: string };
  }>) => {
    const where: any = {};
    if (request.query.workspaceId) where.workspaceId = request.query.workspaceId;

    return prisma.project.findMany({
      where,
      include: {
        workspace: { select: { id: true, name: true, slug: true } },
        _count: {
          select: { issues: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  app.post('/api/projects', async (request: FastifyRequest<{
    Body: {
      key: string;
      name: string;
      description?: string;
      workspaceId?: string;
      columns?: any[];
      gitProvider?: string;
      gitRepo?: string;
      gitBranch?: string;
    };
  }>, reply: FastifyReply) => {
    const { key, name, description, workspaceId, columns, gitProvider, gitRepo, gitBranch } = request.body;
    if (!key || !name) {
      return reply.status(400).send({ error: 'Key and Name are required.' });
    }
    const cleanKey = key.toUpperCase().trim();
    const existing = await prisma.project.findUnique({ where: { key: cleanKey } });
    if (existing) {
      return reply.status(409).send({ error: `Project key ${cleanKey} already exists.` });
    }

    const project = await prisma.project.create({
      data: {
        key: cleanKey,
        name,
        description,
        workspaceId: workspaceId || null,
        columns: columns || DEFAULT_COLUMNS,
        gitProvider: gitProvider || null,
        gitRepo: gitRepo ? gitRepo.trim() : null,
        gitBranch: gitBranch ? gitBranch.trim() : 'main',
      },
      include: {
        workspace: true,
      },
    });

    broadcastEvent('project_created', project);
    return reply.status(201).send(project);
  });

  app.patch('/api/projects/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: {
      name?: string;
      key?: string;
      description?: string;
      columns?: any[];
      stageAgents?: Record<string, any> | null;
      workflowRules?: any | null;
      gitProvider?: string | null;
      gitRepo?: string | null;
      gitBranch?: string | null;
    };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { name, key, description, columns, stageAgents, workflowRules, gitProvider, gitRepo, gitBranch } = request.body;
    const updateData: any = {};

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (columns !== undefined) updateData.columns = columns;
    if (stageAgents !== undefined) updateData.stageAgents = stageAgents;
    if (workflowRules !== undefined) updateData.workflowRules = workflowRules;
    if (gitProvider !== undefined) updateData.gitProvider = gitProvider;
    if (gitRepo !== undefined) updateData.gitRepo = gitRepo;
    if (gitBranch !== undefined) updateData.gitBranch = gitBranch;

    if (key !== undefined) {
      const cleanKey = key.toUpperCase().trim();
      const existing = await prisma.project.findFirst({
        where: { key: cleanKey, NOT: { id } },
      });
      if (existing) {
        return reply.status(409).send({ error: `Projekt-Kürzel '${cleanKey}' wird bereits verwendet.` });
      }
      updateData.key = cleanKey;
    }

    const updated = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        workspace: true,
        _count: { select: { issues: true } },
      },
    });

    broadcastEvent('project_updated', updated);
    return updated;
  });

  app.delete('/api/projects/:id', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;

    // Check project exists
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: 'Projekt nicht gefunden.' });
    }

    await prisma.project.delete({ where: { id } });
    broadcastEvent('project_deleted', { id, key: existing.key });
    return { success: true, id, key: existing.key };
  });

  // ==========================================
  // TICKET-MANAGEMENT (ISSUES), FILTER & SUCHE
  // ==========================================
  app.get('/api/issues', async (request: FastifyRequest<{
    Querystring: {
      projectId?: string;
      sprintId?: string;
      status?: string;
      priority?: IssuePriority;
      assigneeType?: AssigneeType;
      assigneeId?: string;
      label?: string;
      search?: string;
      sortField?: 'priority' | 'updatedAt' | 'createdAt' | 'identifier';
      sortOrder?: 'asc' | 'desc';
    };
  }>) => {
    const { projectId, sprintId, status, priority, assigneeType, assigneeId, label, search, sortField, sortOrder } = request.query;
    const where: any = {};

    if (projectId) where.projectId = projectId;

    if (sprintId) {
      if (sprintId === 'ACTIVE') {
        const activeSprint = await prisma.sprint.findFirst({
          where: {
            ...(projectId ? { projectId } : {}),
            status: SprintStatus.ACTIVE,
          },
        });
        if (activeSprint) {
          where.sprintId = activeSprint.id;
        } else {
          where.sprintId = 'none-active-filter';
        }
      } else if (sprintId === 'BACKLOG' || sprintId === 'NONE') {
        where.sprintId = null;
      } else if (sprintId !== 'ALL') {
        where.sprintId = sprintId;
      }
    }

    if (status && status !== 'ALL') where.status = status;
    if (priority && (priority as any) !== 'ALL') where.priority = priority;
    if (assigneeType && (assigneeType as any) !== 'ALL') where.assigneeType = assigneeType;
    if (assigneeId) where.assigneeId = assigneeId;
    if (label) where.labels = { has: label };

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { identifier: { contains: term, mode: 'insensitive' } },
        { assigneeName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const orderBy: any = [];
    if (sortField) {
      orderBy.push({ [sortField]: sortOrder || 'asc' });
    } else {
      orderBy.push({ priority: 'asc' });
      orderBy.push({ updatedAt: 'desc' });
    }

    return prisma.issue.findMany({
      where,
      include: {
        project: { select: { id: true, key: true, name: true, columns: true, stageAgents: true } },
        sprint: { select: { id: true, name: true, status: true } },
        comments: { orderBy: { createdAt: 'desc' }, take: 5 },
        activities: { orderBy: { createdAt: 'desc' }, take: 5 },
        agentRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
        traceEvents: { orderBy: { createdAt: 'desc' }, take: 3 },
        gitLinks: true,
        subIssues: { select: { id: true, identifier: true, title: true, status: true } },
        outgoingRelations: {
          include: {
            targetIssue: { select: { id: true, identifier: true, title: true, status: true, priority: true } },
          },
        },
        incomingRelations: {
          include: {
            sourceIssue: { select: { id: true, identifier: true, title: true, status: true, priority: true } },
          },
        },
      },
      orderBy,
    });
  });

  app.get('/api/issues/:id', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const issue = await prisma.issue.findFirst({
      where: {
        OR: [{ id }, { identifier: id.toUpperCase() }],
      },
      include: {
        project: true,
        sprint: true,
        comments: { orderBy: { createdAt: 'asc' } },
        activities: { orderBy: { createdAt: 'desc' } },
        agentRuns: { orderBy: { startedAt: 'desc' } },
        traceEvents: { orderBy: { createdAt: 'desc' }, take: 50 },
        gitLinks: { orderBy: { createdAt: 'desc' } },
        subIssues: { orderBy: { number: 'asc' } },
        parent: true,
        outgoingRelations: {
          include: {
            targetIssue: { select: { id: true, identifier: true, title: true, status: true, priority: true } },
          },
        },
        incomingRelations: {
          include: {
            sourceIssue: { select: { id: true, identifier: true, title: true, status: true, priority: true } },
          },
        },
      },
    });

    if (!issue) {
      return reply.status(404).send({ error: 'Issue not found' });
    }

    return issue;
  });

  app.post('/api/issues', async (request: FastifyRequest<{
    Body: {
      projectId?: string;
      projectKey?: string;
      sprintId?: string;
      title: string;
      description?: string;
      status?: string;
      priority?: IssuePriority;
      type?: IssueType;
      assigneeType?: AssigneeType;
      assigneeId?: string;
      assigneeName?: string;
      labels?: string[];
      parentId?: string;
      agentMetadata?: any;
      proofOfWork?: any;
      targetFiles?: string[];
      previewUrl?: string;
      previewScreenshotUrl?: string;
      actorName?: string;
      actorType?: string;
    };
  }>, reply: FastifyReply) => {
    const body = request.body;
    let project;

    if (body.projectId) {
      project = await prisma.project.findUnique({ where: { id: body.projectId } });
    } else if (body.projectKey) {
      project = await prisma.project.findUnique({ where: { key: body.projectKey.toUpperCase() } });
    } else {
      project = await prisma.project.findFirst();
    }

    if (!project) {
      return reply.status(400).send({ error: 'Valid project required to create an issue.' });
    }

    // Determine issue number
    const lastIssue = await prisma.issue.findFirst({
      where: { projectId: project.id },
      orderBy: { number: 'desc' },
    });
    const nextNumber = (lastIssue?.number || 0) + 1;
    const identifier = `${project.key}-${nextNumber}`;

    const initialStatus = body.status || 'TODO';
    const stageHandoff =
      !body.assigneeName && (!body.assigneeType || body.assigneeType === 'UNASSIGNED')
        ? resolveStageHandoff(project.stageAgents, initialStatus)
        : null;

    const issue = await prisma.issue.create({
      data: {
        identifier,
        number: nextNumber,
        title: body.title,
        description: body.description || '',
        status: initialStatus,
        priority: body.priority || IssuePriority.MEDIUM,
        type: body.type || IssueType.TASK,
        assigneeType: stageHandoff ? AssigneeType.AGENT : (body.assigneeType || AssigneeType.UNASSIGNED),
        assigneeId: body.assigneeId || null,
        assigneeName: stageHandoff ? stageHandoff.agentName : (body.assigneeName || null),
        agentStatus: stageHandoff ? 'THINKING' : undefined,
        labels: body.labels || [],
        parentId: body.parentId || null,
        sprintId: body.sprintId || null,
        agentMetadata: body.agentMetadata || undefined,
        proofOfWork: body.proofOfWork || undefined,
        targetFiles: body.targetFiles || [],
        previewUrl: body.previewUrl || null,
        previewScreenshotUrl: body.previewScreenshotUrl || null,
        projectId: project.id,
        activities: {
          create: [
            {
              actorType: body.actorType || (body.assigneeType === 'AGENT' ? 'AGENT' : 'HUMAN'),
              actorName: body.actorName || body.assigneeName || 'System',
              action: 'CREATED',
              details: `Created issue ${identifier} "${body.title}"`,
            },
          ],
        },
      },
      include: {
        project: true,
        sprint: true,
        activities: true,
      },
    });

    broadcastEvent('issue_created', issue);
    return reply.status(201).send(issue);
  });

  app.patch('/api/issues/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string;
      status?: string;
      priority?: IssuePriority;
      type?: IssueType;
      assigneeType?: AssigneeType;
      assigneeId?: string;
      assigneeName?: string;
      labels?: string[];
      sprintId?: string | null;
      agentMetadata?: any;
      proofOfWork?: any;
      ciStatus?: string;
      previewUrl?: string | null;
      previewScreenshotUrl?: string | null;
      targetFiles?: string[];
      agentStatus?: string | null;
      forceDone?: boolean;
      actorName?: string;
      actorType?: string;
    };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const existing = await prisma.issue.findFirst({
      where: { OR: [{ id }, { identifier: id.toUpperCase() }] },
      include: { project: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Issue not found' });
    }

    const body = request.body;
    const actorName = body.actorName || 'User';
    const actorType = body.actorType || 'HUMAN';

    // 1F: Strict Blocker Gate when an Agent tries to start work (IN_PROGRESS)
    if (
      actorType === 'AGENT' &&
      body.status &&
      body.status !== existing.status &&
      body.status.toUpperCase() === 'IN_PROGRESS'
    ) {
      const openBlockers = await getOpenBlockers(prisma, existing.id);
      if (openBlockers.length > 0) {
        const blockerList = openBlockers.map((b) => `${b.identifier} (${b.status})`).join(', ');
        return reply.status(409).send({
          error: `Blocker-Gate: Ticket ${existing.identifier} ist blockiert durch: ${blockerList}.`,
          openBlockers,
        });
      }
    }

    // 1E: Proof-of-Work Gate before moving to DONE
    const effectiveProof = body.proofOfWork !== undefined ? body.proofOfWork : existing.proofOfWork;
    const powError = validateProofOfWorkGate(effectiveProof, body.status, actorType, body.forceDone);
    if (powError) {
      return reply.status(409).send({ error: powError });
    }

    // Workflow Transition Rules Validation (UI & MCP)
    if (body.status && body.status !== existing.status) {
      const candidateIssue = { ...existing, ...body, proofOfWork: effectiveProof };
      const wfError = await validateWorkflowTransition(
        prisma,
        existing.project?.workflowRules,
        candidateIssue,
        body.status,
        actorType
      );
      if (wfError) {
        return reply.status(409).send({ error: wfError });
      }
    }

    // Track activity changes
    const activityLogsToCreate: any[] = [];
    if (body.status && body.status !== existing.status) {
      activityLogsToCreate.push({
        actorType,
        actorName,
        action: 'STATUS_CHANGED',
        details: `Changed status from ${existing.status} to ${body.status}`,
      });
    }
    if (body.priority && body.priority !== existing.priority) {
      activityLogsToCreate.push({
        actorType,
        actorName,
        action: 'PRIORITY_CHANGED',
        details: `Changed priority from ${existing.priority} to ${body.priority}`,
      });
    }
    if (body.assigneeName !== undefined && body.assigneeName !== existing.assigneeName) {
      activityLogsToCreate.push({
        actorType,
        actorName,
        action: 'ASSIGNED',
        details: body.assigneeName
          ? `Assigned to ${body.assigneeType === 'AGENT' ? '🤖 ' : ''}${body.assigneeName}`
          : 'Unassigned issue',
      });
    }
    if (body.sprintId !== undefined && body.sprintId !== existing.sprintId) {
      activityLogsToCreate.push({
        actorType,
        actorName,
        action: 'UPDATED',
        details: body.sprintId ? 'Moved to Sprint' : 'Removed from Sprint (moved to Backlog)',
      });
    }

    // Clean up update payload (exclude non-db fields)
    const updateData: any = { ...body };
    delete updateData.actorName;
    delete updateData.actorType;
    delete updateData.forceDone;
    updateData.updatedAt = new Date();

    // 2.1: Stage-based Multi-Agent Pipeline Handoff
    let handoffAgent: string | null = null;
    if (body.status && body.status !== existing.status && body.assigneeName === undefined) {
      const handoff = resolveStageHandoff(existing.project?.stageAgents, body.status);
      if (handoff) {
        handoffAgent = handoff.agentName;
        updateData.assigneeType = AssigneeType.AGENT;
        updateData.assigneeName = handoff.agentName;
        updateData.agentStatus = 'THINKING';
        activityLogsToCreate.push({
          actorType: 'SYSTEM',
          actorName: 'Pipeline Router',
          action: 'ASSIGNED',
          details: `Stage-Handoff (${body.status}): Automatisch an 🤖 ${handoff.agentName} übergeben`,
        });
      }
    }

    const updated = await prisma.issue.update({
      where: { id: existing.id },
      data: {
        ...updateData,
        activities: activityLogsToCreate.length > 0 ? { create: activityLogsToCreate } : undefined,
      },
      include: {
        project: true,
        sprint: true,
        gitLinks: true,
        comments: { orderBy: { createdAt: 'desc' }, take: 5 },
        activities: { orderBy: { createdAt: 'desc' }, take: 10 },
        agentRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
        traceEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
        subIssues: true,
        outgoingRelations: {
          include: {
            targetIssue: true,
          },
        },
        incomingRelations: {
          include: {
            sourceIssue: true,
          },
        },
      },
    });

    broadcastEvent('issue_updated', updated);
    if (handoffAgent) {
      broadcastEvent('agent_handoff', {
        issueId: updated.id,
        identifier: updated.identifier,
        status: updated.status,
        agentName: handoffAgent,
      });
    }

    // 1F: Notify unblocked downstream issues when this issue is closed
    if (
      body.status &&
      body.status !== existing.status &&
      ['DONE', 'CANCELLED'].includes(body.status.toUpperCase())
    ) {
      await notifyUnblockedDependents(prisma, broadcastEvent, updated.id, updated.identifier);
    }

    return updated;
  });

  app.delete('/api/issues/:id', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const existing = await prisma.issue.findFirst({
      where: { OR: [{ id }, { identifier: id.toUpperCase() }] },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Issue not found' });
    }

    await prisma.issue.delete({ where: { id: existing.id } });
    broadcastEvent('issue_deleted', { id: existing.id, identifier: existing.identifier });
    return { success: true, identifier: existing.identifier };
  });

  // ==========================================
  // SPRINTS / CYCLES
  // ==========================================
  app.get('/api/sprints', async (request: FastifyRequest<{
    Querystring: { projectId?: string };
  }>) => {
    const { projectId } = request.query;
    const where: any = {};
    if (projectId) where.projectId = projectId;

    return prisma.sprint.findMany({
      where,
      include: {
        _count: { select: { issues: true } },
        issues: {
          select: { id: true, identifier: true, title: true, status: true, priority: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/api/sprints', async (request: FastifyRequest<{
    Body: {
      projectId: string;
      name: string;
      goal?: string;
      startDate?: string;
      endDate?: string;
    };
  }>, reply: FastifyReply) => {
    const { projectId, name, goal, startDate, endDate } = request.body;
    if (!projectId || !name) {
      return reply.status(400).send({ error: 'Projekt und Sprint-Name sind erforderlich.' });
    }

    const sprint = await prisma.sprint.create({
      data: {
        projectId,
        name: name.trim(),
        goal: goal?.trim() || null,
        status: SprintStatus.PLANNED,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
      include: {
        _count: { select: { issues: true } },
        issues: true,
      },
    });

    broadcastEvent('sprint_created', sprint);
    return reply.status(201).send(sprint);
  });

  app.patch('/api/sprints/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: {
      name?: string;
      goal?: string;
      status?: SprintStatus;
      startDate?: string;
      endDate?: string;
    };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { name, goal, status, startDate, endDate } = request.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (goal !== undefined) updateData.goal = goal?.trim() || null;
    if (status !== undefined) updateData.status = status;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;

    const updated = await prisma.sprint.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { issues: true } },
        issues: true,
      },
    });

    broadcastEvent('sprint_updated', updated);
    return updated;
  });

  app.post('/api/sprints/:id/start', async (request: FastifyRequest<{
    Params: { id: string };
    Body?: { durationDays?: number };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const existing = await prisma.sprint.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Sprint nicht gefunden.' });

    const startDate = new Date();
    const duration = request.body?.durationDays || 14;
    const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);

    const updated = await prisma.sprint.update({
      where: { id },
      data: {
        status: SprintStatus.ACTIVE,
        startDate,
        endDate,
      },
      include: {
        _count: { select: { issues: true } },
        issues: true,
      },
    });

    broadcastEvent('sprint_started', updated);
    return updated;
  });

  app.post('/api/sprints/:id/complete', async (request: FastifyRequest<{
    Params: { id: string };
    Body?: { rolloverToSprintId?: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { rolloverToSprintId } = request.body || {};

    const sprint = await prisma.sprint.findUnique({
      where: { id },
      include: {
        issues: true,
        project: true,
      },
    });
    if (!sprint) return reply.status(404).send({ error: 'Sprint nicht gefunden.' });

    // Determine unfinished issues (status not 'DONE')
    const unfinished = sprint.issues.filter((i) => i.status !== 'DONE');

    if (unfinished.length > 0) {
      const targetSprintId = rolloverToSprintId || null;
      await prisma.issue.updateMany({
        where: {
          id: { in: unfinished.map((i) => i.id) },
        },
        data: {
          sprintId: targetSprintId,
        },
      });
    }

    const completed = await prisma.sprint.update({
      where: { id },
      data: {
        status: SprintStatus.COMPLETED,
      },
      include: {
        _count: { select: { issues: true } },
        issues: true,
      },
    });

    broadcastEvent('sprint_completed', {
      sprint: completed,
      rolloverCount: unfinished.length,
      rolloverTo: rolloverToSprintId || 'BACKLOG',
    });

    return reply.send({
      success: true,
      completed,
      rolledOverCount: unfinished.length,
      rolledOverTo: rolloverToSprintId || 'BACKLOG',
    });
  });

  app.delete('/api/sprints/:id', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    // Release issues from sprint
    await prisma.issue.updateMany({
      where: { sprintId: id },
      data: { sprintId: null },
    });

    await prisma.sprint.delete({ where: { id } });
    broadcastEvent('sprint_deleted', { id });
    return { success: true, id };
  });

  // ==========================================
  // TICKET RELATIONS & BLOCKERS
  // ==========================================
  app.post('/api/issues/:id/relations', async (request: FastifyRequest<{
    Params: { id: string };
    Body: {
      targetIssueId: string;
      type?: IssueRelationType;
    };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { targetIssueId, type } = request.body;

    const source = await prisma.issue.findFirst({
      where: { OR: [{ id }, { identifier: id.toUpperCase() }] },
    });
    if (!source) return reply.status(404).send({ error: 'Source issue not found' });

    const target = await prisma.issue.findFirst({
      where: { OR: [{ id: targetIssueId }, { identifier: targetIssueId.toUpperCase() }] },
    });
    if (!target) return reply.status(404).send({ error: 'Target issue not found' });

    if (source.id === target.id) {
      return reply.status(400).send({ error: 'Ein Ticket kann nicht mit sich selbst verknüpft werden.' });
    }

    const relType = type || IssueRelationType.RELATES_TO;

    const relation = await prisma.issueRelation.upsert({
      where: {
        sourceIssueId_targetIssueId_type: {
          sourceIssueId: source.id,
          targetIssueId: target.id,
          type: relType,
        },
      },
      update: {},
      create: {
        sourceIssueId: source.id,
        targetIssueId: target.id,
        type: relType,
      },
      include: {
        targetIssue: true,
        sourceIssue: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        issueId: source.id,
        actorType: 'HUMAN',
        actorName: 'User',
        action: 'UPDATED',
        details: `Verknüpfung hinzugefügt: ${relType} ${target.identifier} ("${target.title}")`,
      },
    });

    broadcastEvent('relation_created', relation);
    return reply.status(201).send(relation);
  });

  app.delete('/api/issues/:id/relations/:relationId', async (request: FastifyRequest<{
    Params: { id: string; relationId: string };
  }>, reply: FastifyReply) => {
    const { relationId } = request.params;
    await prisma.issueRelation.delete({
      where: { id: relationId },
    });
    broadcastEvent('relation_deleted', { id: relationId });
    return { success: true };
  });

  // ==========================================
  // GIT INTEGRATION, OAUTH & REPO BOARDS
  // ==========================================
  let customOAuthConfig = {
    githubClientId: process.env.GITHUB_CLIENT_ID || '',
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    gitlabClientId: process.env.GITLAB_CLIENT_ID || '',
    gitlabClientSecret: process.env.GITLAB_CLIENT_SECRET || '',
    gitlabInstanceUrl: process.env.GITLAB_INSTANCE_URL || 'https://gitlab.com',
  };

  // Load persisted encrypted OAuth app configs from PostgreSQL on startup
  try {
    const savedConfigs = await prisma.oAuthProviderConfig.findMany();
    for (const cfg of savedConfigs) {
      const secret = decryptSecret(cfg.clientSecretEnc);
      if (cfg.provider === 'github' && !customOAuthConfig.githubClientId) {
        customOAuthConfig.githubClientId = cfg.clientId;
        customOAuthConfig.githubClientSecret = secret;
      } else if (cfg.provider === 'gitlab' && !customOAuthConfig.gitlabClientId) {
        customOAuthConfig.gitlabClientId = cfg.clientId;
        customOAuthConfig.gitlabClientSecret = secret;
        if (cfg.instanceUrl) customOAuthConfig.gitlabInstanceUrl = cfg.instanceUrl;
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not load persisted OAuth provider configs:', err);
  }

  async function persistOAuthProvider(
    provider: 'github' | 'gitlab',
    clientId: string,
    clientSecret: string,
    instanceUrl?: string
  ) {
    if (!clientId || !clientSecret) return;
    const clientSecretEnc = encryptSecret(clientSecret);
    await prisma.oAuthProviderConfig.upsert({
      where: { provider },
      update: {
        clientId,
        clientSecretEnc,
        ...(instanceUrl ? { instanceUrl } : {}),
      },
      create: {
        provider,
        clientId,
        clientSecretEnc,
        instanceUrl: instanceUrl || (provider === 'gitlab' ? 'https://gitlab.com' : 'https://github.com'),
      },
    });
  }

  function getRequestOrigins(request: FastifyRequest) {
    const rawProto = (request.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
    const proto = rawProto || request.protocol || 'http';
    const rawHost = (request.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
    const host = rawHost || request.headers.host || 'localhost:4001';
    const apiBaseUrl = (process.env.PUBLIC_API_URL || `${proto}://${host}`).replace(/\/$/, '');
    const inferredWeb = /:(4000|4001)$/.test(host)
      ? `${proto}://${host.replace(/:(4000|4001)$/, ':3000')}`
      : `${proto}://${host}`;
    const webBaseUrl = (process.env.PUBLIC_WEB_URL || inferredWeb).replace(/\/$/, '');
    return { apiBaseUrl, webBaseUrl };
  }

  app.get('/api/git/oauth/config', async (request: FastifyRequest) => {
    const { apiBaseUrl } = getRequestOrigins(request);
    return {
      github: {
        configured: Boolean(customOAuthConfig.githubClientId && customOAuthConfig.githubClientSecret),
        clientId: customOAuthConfig.githubClientId,
        callbackUrl: `${apiBaseUrl}/api/git/oauth/callback/github`,
      },
      gitlab: {
        configured: Boolean(customOAuthConfig.gitlabClientId && customOAuthConfig.gitlabClientSecret),
        clientId: customOAuthConfig.gitlabClientId,
        instanceUrl: customOAuthConfig.gitlabInstanceUrl,
        callbackUrl: `${apiBaseUrl}/api/git/oauth/callback/gitlab`,
      },
    };
  });

  app.post('/api/git/oauth/config', async (request: FastifyRequest<{
    Body: {
      githubClientId?: string;
      githubClientSecret?: string;
      gitlabClientId?: string;
      gitlabClientSecret?: string;
      gitlabInstanceUrl?: string;
    };
  }>) => {
    const { apiBaseUrl } = getRequestOrigins(request);
    const { githubClientId, githubClientSecret, gitlabClientId, gitlabClientSecret, gitlabInstanceUrl } = request.body || {};
    if (githubClientId !== undefined) customOAuthConfig.githubClientId = githubClientId.trim();
    if (githubClientSecret !== undefined) customOAuthConfig.githubClientSecret = githubClientSecret.trim();
    if (gitlabClientId !== undefined) customOAuthConfig.gitlabClientId = gitlabClientId.trim();
    if (gitlabClientSecret !== undefined) customOAuthConfig.gitlabClientSecret = gitlabClientSecret.trim();
    if (gitlabInstanceUrl !== undefined) customOAuthConfig.gitlabInstanceUrl = gitlabInstanceUrl.trim() || 'https://gitlab.com';

    if (customOAuthConfig.githubClientId && customOAuthConfig.githubClientSecret) {
      await persistOAuthProvider('github', customOAuthConfig.githubClientId, customOAuthConfig.githubClientSecret);
    }
    if (customOAuthConfig.gitlabClientId && customOAuthConfig.gitlabClientSecret) {
      await persistOAuthProvider(
        'gitlab',
        customOAuthConfig.gitlabClientId,
        customOAuthConfig.gitlabClientSecret,
        customOAuthConfig.gitlabInstanceUrl
      );
    }

    return {
      success: true,
      github: {
        configured: Boolean(customOAuthConfig.githubClientId && customOAuthConfig.githubClientSecret),
        clientId: customOAuthConfig.githubClientId,
        callbackUrl: `${apiBaseUrl}/api/git/oauth/callback/github`,
      },
      gitlab: {
        configured: Boolean(customOAuthConfig.gitlabClientId && customOAuthConfig.gitlabClientSecret),
        clientId: customOAuthConfig.gitlabClientId,
        instanceUrl: customOAuthConfig.gitlabInstanceUrl,
        callbackUrl: `${apiBaseUrl}/api/git/oauth/callback/gitlab`,
      },
    };
  });

  // Start OAuth Authorization Flow
  app.get('/api/git/oauth/authorize/:provider', async (request: FastifyRequest<{
    Params: { provider: string };
    Querystring: { instanceUrl?: string };
  }>, reply: FastifyReply) => {
    const { provider } = request.params;
    const { instanceUrl } = request.query;
    const { apiBaseUrl, webBaseUrl } = getRequestOrigins(request);

    if (provider === 'github') {
      if (customOAuthConfig.githubClientId) {
        const ghAuthUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
          customOAuthConfig.githubClientId
        )}&redirect_uri=${encodeURIComponent(`${apiBaseUrl}/api/git/oauth/callback/github`)}&scope=repo,read:user,user:email&state=kanso_${Date.now()}`;
        return reply.redirect(ghAuthUrl);
      } else {
        // Seamless 1-Click GitHub Manifest Flow:
        // Automatically redirects to GitHub, prompts the user to create/authorize the Kanso App,
        // and returns the OAuth credentials back to Kanso without manual copy-pasting!
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const manifestObj = {
          name: `Kanso-${randomSuffix}`,
          url: webBaseUrl,
          hook_attributes: {
            url: '',
            active: false,
          },
          redirect_url: `${apiBaseUrl}/api/git/oauth/manifest-callback`,
          callback_urls: [`${apiBaseUrl}/api/git/oauth/callback/github`],
          public: false,
          default_permissions: {
            issues: 'write',
            contents: 'read',
            pull_requests: 'write',
            metadata: 'read',
          },
        };
        const manifestJson = JSON.stringify(manifestObj);

        reply.type('text/html').send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Weiterleitung zu GitHub...</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #0f172a;">
    <div style="background: white; padding: 32px; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center; max-width: 440px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <div style="width: 48px; height: 48px; background: #4f46e5; border-radius: 12px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px;">
        簡
      </div>
      <h2 style="margin: 0 0 8px; font-size: 18px;">Weiterleitung zu GitHub...</h2>
      <p style="margin: 0 0 20px; font-size: 13px; color: #64748b; line-height: 1.5;">
        Kanso leitet dich jetzt direkt zu GitHub weiter, um die Autorisierung mit einem Klick zu bestätigen.
      </p>
      <form id="manifestForm" method="POST" action="https://github.com/settings/apps/new">
        <input type="hidden" name="manifest" value='${manifestJson.replace(/'/g, '&#39;')}' />
        <button type="submit" style="background: #0f172a; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%;">
          Jetzt zu GitHub weiterleiten →
        </button>
      </form>
      <script>
        document.getElementById('manifestForm').submit();
      </script>
    </div>
  </body>
</html>`);
        return;
      }
    }

    if (provider === 'gitlab') {
      const base = instanceUrl || customOAuthConfig.gitlabInstanceUrl || 'https://gitlab.com';
      const gitlabCallback = `${apiBaseUrl}/api/git/oauth/callback/gitlab`;
      if (customOAuthConfig.gitlabClientId) {
        const glAuthUrl = `${base.replace(/\/$/, '')}/oauth/authorize?client_id=${encodeURIComponent(
          customOAuthConfig.gitlabClientId
        )}&redirect_uri=${encodeURIComponent(gitlabCallback)}&response_type=code&scope=api+read_user+read_repository&state=kanso_${Date.now()}`;
        return reply.redirect(glAuthUrl);
      } else {
        // Direct forward to GitLab Application creation with pre-filled redirect URI
        const glAppUrl = `${base.replace(/\/$/, '')}/-/profile/applications?name=Kanso&redirect_uri=${encodeURIComponent(gitlabCallback)}&scopes=api,read_user,read_repository`;
        return reply.redirect(glAppUrl);
      }
    }

    return reply.status(400).send({ error: 'Unbekannter Git Provider' });
  });

  // GitHub App Manifest Callback Handler
  app.get('/api/git/oauth/manifest-callback', async (request: FastifyRequest<{
    Querystring: { code?: string };
  }>, reply: FastifyReply) => {
    const { code } = request.query;
    const { webBaseUrl } = getRequestOrigins(request);
    if (!code) {
      return reply.redirect(`${webBaseUrl}/?oauth_error=Kein+Code+übergeben`);
    }

    try {
      const convertRes = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Kanso-Issue-Tracker',
        },
      });

      if (!convertRes.ok) {
        const errText = await convertRes.text();
        console.error('Manifest conversion failed:', errText);
        return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent('GitHub App Registrierung fehlgeschlagen')}`);
      }

      const appData: any = await convertRes.json();
      customOAuthConfig.githubClientId = appData.client_id;
      customOAuthConfig.githubClientSecret = appData.client_secret;
      await persistOAuthProvider('github', appData.client_id, appData.client_secret);

      const accountName = appData.owner?.login || 'mxw02';
      const displayName = appData.owner?.name || accountName;
      const avatarUrl = appData.owner?.avatar_url || 'https://avatars.githubusercontent.com/u/1024025?v=4';

      const existing = await prisma.gitConnection.findFirst({
        where: { provider: 'github', accountName },
      });

      if (existing) {
        await prisma.gitConnection.update({
          where: { id: existing.id },
          data: {
            displayName,
            avatarUrl,
            authType: 'oauth',
            isDefault: true,
          },
        });
      } else {
        await prisma.gitConnection.create({
          data: {
            provider: 'github',
            accountName,
            displayName,
            avatarUrl,
            instanceUrl: 'https://github.com',
            authType: 'oauth',
            isDefault: true,
          },
        });
      }

      broadcastEvent('git_connection_created', { provider: 'github', accountName });

      const auth = await syncGitUser({
        provider: 'github',
        accountName,
        displayName,
        avatarUrl,
      });

      return reply.redirect(
        `${webBaseUrl}/?auth_token=${encodeURIComponent(auth.token)}&auth_user=${encodeURIComponent(JSON.stringify(auth.user))}&git_connected=github&account=${encodeURIComponent(accountName)}`
      );
    } catch (err: any) {
      console.error('Manifest callback error:', err);
      return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent(err.message || 'Manifest-Fehler')}`);
    }
  });

  // OAuth Callback Handler (handles GitHub & GitLab code exchange)
  app.get('/api/git/oauth/callback/:provider', async (request: FastifyRequest<{
    Params: { provider: string };
    Querystring: { code?: string; state?: string; error?: string; error_description?: string };
  }>, reply: FastifyReply) => {
    const { provider } = request.params;
    const { code, error, error_description } = request.query;
    const { apiBaseUrl, webBaseUrl } = getRequestOrigins(request);

    if (error || !code) {
      return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent(error_description || error || 'Abgebrochen')}`);
    }

    try {
      if (provider === 'github') {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: customOAuthConfig.githubClientId,
            client_secret: customOAuthConfig.githubClientSecret,
            code,
          }),
        });

        const tokenData: any = await tokenRes.json();
        if (!tokenData.access_token) {
          return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent(tokenData.error_description || 'Token-Austausch fehlgeschlagen')}`);
        }

        const userRes = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'User-Agent': 'Kanso-Issue-Tracker',
          },
        });
        const userData: any = await userRes.json();

        // Save or update GitConnection
        const existing = await prisma.gitConnection.findFirst({
          where: { provider: 'github', accountName: userData.login },
        });

        if (existing) {
          await prisma.gitConnection.update({
            where: { id: existing.id },
            data: {
              displayName: userData.name || userData.login,
              avatarUrl: userData.avatar_url,
              accessToken: encryptSecret(tokenData.access_token),
              authType: 'oauth',
              isDefault: true,
            },
          });
        } else {
          await prisma.gitConnection.create({
            data: {
              provider: 'github',
              accountName: userData.login,
              displayName: userData.name || userData.login,
              avatarUrl: userData.avatar_url,
              accessToken: encryptSecret(tokenData.access_token),
              instanceUrl: 'https://github.com',
              authType: 'oauth',
              isDefault: true,
            },
          });
        }

        broadcastEvent('git_connection_created', { provider: 'github', accountName: userData.login });

        const auth = await syncGitUser({
          provider: 'github',
          accountName: userData.login,
          displayName: userData.name || userData.login,
          avatarUrl: userData.avatar_url,
          email: userData.email,
        });

        return reply.redirect(
          `${webBaseUrl}/?auth_token=${encodeURIComponent(auth.token)}&auth_user=${encodeURIComponent(JSON.stringify(auth.user))}&git_connected=github&account=${encodeURIComponent(userData.login)}`
        );
      }

      if (provider === 'gitlab') {
        const base = customOAuthConfig.gitlabInstanceUrl || 'https://gitlab.com';
        const tokenRes = await fetch(`${base.replace(/\/$/, '')}/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: customOAuthConfig.gitlabClientId,
            client_secret: customOAuthConfig.gitlabClientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${apiBaseUrl}/api/git/oauth/callback/gitlab`,
          }),
        });

        const tokenData: any = await tokenRes.json();
        if (!tokenData.access_token) {
          return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent(tokenData.error_description || 'Token-Austausch fehlgeschlagen')}`);
        }

        const userRes = await fetch(`${base.replace(/\/$/, '')}/api/v4/user`, {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });
        const userData: any = await userRes.json();

        const existing = await prisma.gitConnection.findFirst({
          where: { provider: 'gitlab', accountName: userData.username },
        });

        if (existing) {
          await prisma.gitConnection.update({
            where: { id: existing.id },
            data: {
              displayName: userData.name || userData.username,
              avatarUrl: userData.avatar_url,
              accessToken: encryptSecret(tokenData.access_token),
              authType: 'oauth',
              isDefault: true,
            },
          });
        } else {
          await prisma.gitConnection.create({
            data: {
              provider: 'gitlab',
              accountName: userData.username,
              displayName: userData.name || userData.username,
              avatarUrl: userData.avatar_url,
              accessToken: encryptSecret(tokenData.access_token),
              instanceUrl: base,
              authType: 'oauth',
              isDefault: true,
            },
          });
        }

        broadcastEvent('git_connection_created', { provider: 'gitlab', accountName: userData.username });

        const auth = await syncGitUser({
          provider: 'gitlab',
          accountName: userData.username,
          displayName: userData.name || userData.username,
          avatarUrl: userData.avatar_url,
          email: userData.email,
        });

        return reply.redirect(
          `${webBaseUrl}/?auth_token=${encodeURIComponent(auth.token)}&auth_user=${encodeURIComponent(JSON.stringify(auth.user))}&git_connected=gitlab&account=${encodeURIComponent(userData.username)}`
        );
      }
    } catch (err: any) {
      console.error('OAuth callback error:', err);
      return reply.redirect(`${webBaseUrl}/?oauth_error=${encodeURIComponent(err.message || 'OAuth-Fehler')}`);
    }
  });

  app.get('/api/git/connections', async () => {
    const connections = await prisma.gitConnection.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return connections.map(({ accessToken: rawToken, ...rest }) => ({
      ...rest,
      hasToken: Boolean(rawToken),
    }));
  });

  app.post('/api/git/connections', async (request: FastifyRequest<{
    Body: {
      provider: string;
      accountName: string;
      accessToken?: string;
      instanceUrl?: string;
      displayName?: string;
      avatarUrl?: string;
      authType?: string;
    };
  }>, reply: FastifyReply) => {
    const { provider, accountName, accessToken, instanceUrl, displayName, avatarUrl, authType } = request.body;
    if (!accountName) {
      return reply.status(400).send({ error: 'Account- oder Organisationsname ist erforderlich.' });
    }

    const trimmedToken = accessToken ? accessToken.trim() : null;
    const conn = await prisma.gitConnection.create({
      data: {
        provider: provider || 'github',
        accountName: accountName.trim(),
        displayName: displayName ? displayName.trim() : accountName.trim(),
        avatarUrl: avatarUrl ? avatarUrl.trim() : null,
        accessToken: trimmedToken ? encryptSecret(trimmedToken) : null,
        instanceUrl: instanceUrl ? instanceUrl.trim() : provider === 'gitlab' ? 'https://gitlab.com' : 'https://github.com',
        authType: authType || (trimmedToken ? 'pat' : 'oauth'),
      },
    });

    const { accessToken: rawToken, ...safeConn } = conn;
    const publicConn = { ...safeConn, hasToken: Boolean(rawToken) };
    broadcastEvent('git_connection_created', publicConn);
    return reply.status(201).send(publicConn);
  });

  app.delete('/api/git/connections/:id', async (request: FastifyRequest<{
    Params: { id: string };
  }>) => {
    const { id } = request.params;
    await prisma.gitConnection.delete({ where: { id } });
    broadcastEvent('git_connection_deleted', { id });
    return { success: true };
  });

  app.get('/api/git/repos', async (request: FastifyRequest<{
    Querystring: { provider?: string };
  }>) => {
    const { provider = 'github' } = request.query;

    // Check if we have an active connection for this provider
    const conn = await prisma.gitConnection.findFirst({
      where: { provider: provider.toLowerCase() },
    });

    // If nothing is connected, return empty list
    if (!conn) {
      return [];
    }

    const currentAccount = conn.accountName;
    const plainToken = decryptSecret(conn.accessToken);

    // 1. Try authenticated user repos if token is present
    if (plainToken && !plainToken.startsWith('simulated_')) {
      try {
        if (provider === 'github') {
          const ghRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', {
            headers: {
              Authorization: `Bearer ${plainToken}`,
              'User-Agent': 'Kanso-App',
              Accept: 'application/vnd.github+json',
            },
          });
          if (ghRes.ok) {
            const data: any = await ghRes.json();
            if (Array.isArray(data) && data.length > 0) {
              return data.map((r: any) => ({
                fullName: r.full_name,
                name: r.name,
                description: r.description || '',
                url: r.html_url,
                defaultBranch: r.default_branch || 'main',
                isPrivate: Boolean(r.private),
                stars: r.stargazers_count || 0,
                language: r.language || 'Code',
              }));
            }
          }
        }

        if (provider === 'gitlab') {
          const base = (conn.instanceUrl || 'https://gitlab.com').replace(/\/$/, '');
          const glRes = await fetch(`${base}/api/v4/projects?membership=true&per_page=100&order_by=updated_at`, {
            headers: {
              Authorization: `Bearer ${plainToken}`,
            },
          });
          if (glRes.ok) {
            const data: any = await glRes.json();
            if (Array.isArray(data) && data.length > 0) {
              return data.map((r: any) => ({
                fullName: r.path_with_namespace || r.name,
                name: r.name,
                description: r.description || '',
                url: r.web_url,
                defaultBranch: r.default_branch || 'main',
                isPrivate: r.visibility === 'private',
                stars: r.star_count || 0,
                language: 'Code',
              }));
            }
          }
        }
      } catch (e) {
        // Fallback to public repos API below
      }
    }

    // 2. Fetch public repos for the connected account name
    try {
      if (provider === 'github') {
        const ghPubRes = await fetch(`https://api.github.com/users/${encodeURIComponent(currentAccount)}/repos?per_page=100&sort=updated`, {
          headers: {
            'User-Agent': 'Kanso-App',
            Accept: 'application/vnd.github+json',
            ...(plainToken && !plainToken.startsWith('simulated_') ? { Authorization: `Bearer ${plainToken}` } : {}),
          },
        });
        if (ghPubRes.ok) {
          const data: any = await ghPubRes.json();
          if (Array.isArray(data)) {
            return data.map((r: any) => ({
              fullName: r.full_name,
              name: r.name,
              description: r.description || '',
              url: r.html_url,
              defaultBranch: r.default_branch || 'main',
              isPrivate: Boolean(r.private),
              stars: r.stargazers_count || 0,
              language: r.language || 'Code',
            }));
          }
        }
      }

      if (provider === 'gitlab') {
        const base = (conn.instanceUrl || 'https://gitlab.com').replace(/\/$/, '');
        const glPubRes = await fetch(`${base}/api/v4/users/${encodeURIComponent(currentAccount)}/projects?per_page=100&order_by=updated_at`);
        if (glPubRes.ok) {
          const data: any = await glPubRes.json();
          if (Array.isArray(data)) {
            return data.map((r: any) => ({
              fullName: r.path_with_namespace || r.name,
              name: r.name,
              description: r.description || '',
              url: r.web_url,
              defaultBranch: r.default_branch || 'main',
              isPrivate: r.visibility === 'private',
              stars: r.star_count || 0,
              language: 'Code',
            }));
          }
        }
      }
    } catch (e) {
      console.error('Error fetching real repos:', e);
    }

    // Strictly return empty array if no real repositories are found - NO hardcoded demo repos
    return [];
  });

  app.post('/api/git/create-board', async (request: FastifyRequest<{
    Body: {
      provider?: string;
      repo: string;
      name?: string;
      key?: string;
      description?: string;
      defaultBranch?: string;
      seedIssues?: boolean;
    };
  }>, reply: FastifyReply) => {
    const { provider = 'github', repo, name, key, description, defaultBranch = 'main', seedIssues = true } = request.body;
    if (!repo) {
      return reply.status(400).send({ error: 'Git Repository ist erforderlich.' });
    }

    const cleanRepo = repo.trim().replace(/^https?:\/\/(github\.com|gitlab\.com)\//, '');
    const segments = cleanRepo.split('/');
    const repoBase = segments[segments.length - 1] || cleanRepo;

    const projName = name?.trim() || repoBase;
    let projKey = key?.trim().toUpperCase();
    if (!projKey) {
      projKey = repoBase.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
      if (projKey.length < 2) projKey = 'GIT';
    }

    let finalKey = projKey;
    let counter = 1;
    while (await prisma.project.findUnique({ where: { key: finalKey } })) {
      finalKey = `${projKey.slice(0, 3)}${counter++}`;
    }

    const project = await prisma.project.create({
      data: {
        key: finalKey,
        name: projName,
        description: description?.trim() || `Repository Board verknüpft mit ${provider === 'gitlab' ? 'GitLab' : 'GitHub'}: ${cleanRepo}`,
        gitProvider: provider,
        gitRepo: cleanRepo,
        gitBranch: defaultBranch,
        columns: DEFAULT_COLUMNS,
      },
      include: {
        workspace: true,
      },
    });

    if (seedIssues) {
      const initialTickets = [
        {
          title: `CI/CD & GitHub Actions Workflow für ${cleanRepo} einrichten`,
          description: `### Aufgaben\n- [ ] Automatisierte Tests bei Pull Requests ausführen\n- [ ] Linter & Typechecks validieren\n- [ ] Kanso Webhook verknüpfen (\`Fixes #${finalKey}-1\`)`,
          status: 'BACKLOG',
          priority: IssuePriority.HIGH,
          labels: ['ci-cd', 'devops'],
        },
        {
          title: `Branch Protection & PR Merging Rules auf '${defaultBranch}' festlegen`,
          description: `### Richtlinien\n- Jeder PR schließt verknüpfte Kanso-Tickets automatisch bei Merge.\n- Code Reviews und CI-Checks sind Pflicht vor dem Merge.`,
          status: 'TODO',
          priority: IssuePriority.MEDIUM,
          labels: ['git', 'workflow'],
        },
        {
          title: `MCP Autonomous Agent & Tool Server anbinden`,
          description: `### Agentic Automation\n- [ ] Kanso MCP Server für das Repository registrieren\n- [ ] Autonome Code-Generierung und Triage testen`,
          status: 'IN_PROGRESS',
          priority: IssuePriority.URGENT,
          labels: ['agentic', 'mcp'],
        },
      ];

      for (let i = 0; i < initialTickets.length; i++) {
        const t = initialTickets[i];
        await prisma.issue.create({
          data: {
            identifier: `${finalKey}-${i + 1}`,
            number: i + 1,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            labels: t.labels,
            projectId: project.id,
            activities: {
              create: [
                {
                  actorType: 'SYSTEM',
                  actorName: `${provider === 'gitlab' ? 'GitLab' : 'GitHub'} Integration`,
                  action: 'CREATED',
                  details: `Initiales Repository-Ticket für ${cleanRepo} erstellt`,
                },
              ],
            },
          },
        });
      }
    }

    broadcastEvent('project_created', project);
    return reply.status(201).send(project);
  });

  // ==========================================
  // GIT INTEGRATION & WEBHOOKS
  // ==========================================
  app.post('/api/webhooks/git', async (request: FastifyRequest<{
    Body: any;
    Headers: any;
  }>, reply: FastifyReply) => {
    const payload: any = request.body || {};
    const eventsProcessed: any[] = [];

    const linkGitToIssue = async (
      identifier: string,
      linkData: {
        provider: string;
        type: string;
        reference: string;
        title?: string;
        url?: string;
        authorName?: string;
        authorUrl?: string;
        branch?: string;
        status?: string;
        action?: 'close' | 'review' | 'ref';
      }
    ) => {
      const issue = await prisma.issue.findFirst({
        where: { identifier: identifier.toUpperCase() },
        include: { project: true },
      });
      if (!issue) return null;

      const gitLink = await prisma.gitLink.create({
        data: {
          issueId: issue.id,
          provider: linkData.provider,
          type: linkData.type,
          reference: linkData.reference,
          title: linkData.title,
          url: linkData.url,
          authorName: linkData.authorName,
          authorUrl: linkData.authorUrl,
          branch: linkData.branch,
          status: linkData.status,
        },
      });

      if (linkData.action === 'close') {
        const updated = await prisma.issue.update({
          where: { id: issue.id },
          data: {
            status: 'DONE',
            activities: {
              create: [
                {
                  actorType: 'SYSTEM',
                  actorName: `${linkData.provider.toUpperCase()} Integration`,
                  action: 'STATUS_CHANGED',
                  details: `Ticket automatisch geschlossen via Git (${linkData.type} ${linkData.reference}): "${linkData.title || ''}"`,
                },
              ],
            },
          },
        });
        broadcastEvent('issue_updated', updated);
      } else if (linkData.action === 'review' && issue.status === 'TODO') {
        const updated = await prisma.issue.update({
          where: { id: issue.id },
          data: {
            status: 'IN_REVIEW',
            activities: {
              create: [
                {
                  actorType: 'SYSTEM',
                  actorName: `${linkData.provider.toUpperCase()} Integration`,
                  action: 'STATUS_CHANGED',
                  details: `Status auf In Review gesetzt via Pull Request #${linkData.reference}: "${linkData.title || ''}"`,
                },
              ],
            },
          },
        });
        broadcastEvent('issue_updated', updated);
      } else {
        await prisma.activityLog.create({
          data: {
            issueId: issue.id,
            actorType: 'SYSTEM',
            actorName: `${linkData.provider.toUpperCase()} Integration`,
            action: 'UPDATED',
            details: `Git-Referenz verknüpft: ${linkData.type} ${linkData.reference}`,
          },
        });
      }

      broadcastEvent('git_link_added', { issueId: issue.id, identifier: issue.identifier, gitLink });
      return { issue: issue.identifier, gitLink };
    };

    // 1. Commits list (e.g. GitHub/GitLab push event)
    if (Array.isArray(payload.commits)) {
      const branch = (payload.ref || '').replace('refs/heads/', '');
      for (const commit of payload.commits) {
        const msg = commit.message || '';
        const fixRegex = /(?:fixes|closes|resolves)\s*#?([A-Z0-9]+-\d+)/gi;
        const refRegex = /(?:refs|see)?\s*#?([A-Z0-9]+-\d+)/gi;

        let fixMatch;
        const matchedClosed = new Set<string>();
        while ((fixMatch = fixRegex.exec(msg)) !== null) {
          const key = fixMatch[1].toUpperCase();
          matchedClosed.add(key);
          const res = await linkGitToIssue(key, {
            provider: 'github',
            type: 'commit',
            reference: (commit.id || '').substring(0, 7),
            title: msg.split('\n')[0],
            url: commit.url,
            authorName: commit.author?.name,
            branch,
            status: 'committed',
            action: branch === 'main' || branch === 'master' ? 'close' : 'ref',
          });
          if (res) eventsProcessed.push(res);
        }

        let refMatch;
        while ((refMatch = refRegex.exec(msg)) !== null) {
          const key = refMatch[1].toUpperCase();
          if (!matchedClosed.has(key)) {
            const res = await linkGitToIssue(key, {
              provider: 'github',
              type: 'commit',
              reference: (commit.id || '').substring(0, 7),
              title: msg.split('\n')[0],
              url: commit.url,
              authorName: commit.author?.name,
              branch,
              status: 'committed',
              action: 'ref',
            });
            if (res) eventsProcessed.push(res);
          }
        }
      }
    }

    // 2. Pull Request event (GitHub / GitLab)
    const pr = payload.pull_request;
    if (pr) {
      const textToSearch = `${pr.title || ''} ${pr.body || ''} ${pr.head?.ref || ''}`;
      const idRegex = /#?([A-Z0-9]+-\d+)/gi;
      const isMerge = pr.merged === true || (payload.action === 'closed' && pr.merged);
      const isOpened = payload.action === 'opened' || payload.action === 'reopened';

      let m;
      const seen = new Set<string>();
      while ((m = idRegex.exec(textToSearch)) !== null) {
        const key = m[1].toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const res = await linkGitToIssue(key, {
          provider: 'github',
          type: 'pull_request',
          reference: `#${pr.number}`,
          title: pr.title,
          url: pr.html_url,
          authorName: pr.user?.login,
          branch: pr.head?.ref,
          status: isMerge ? 'merged' : pr.state,
          action: isMerge ? 'close' : isOpened ? 'review' : 'ref',
        });
        if (res) eventsProcessed.push(res);
      }
    }

    // 3. Event-Driven CI / Check Run / Workflow Run / GitLab Pipeline Triggers (2.5)
    const ciConclusion =
      payload.check_run?.conclusion ||
      payload.workflow_run?.conclusion ||
      (payload.object_kind === 'pipeline' ? payload.object_attributes?.status : undefined);
    if (ciConclusion) {
      const ciText = `${payload.check_run?.name || ''} ${payload.check_run?.check_suite?.head_branch || ''} ${payload.workflow_run?.head_branch || ''} ${payload.workflow_run?.head_commit?.message || ''} ${payload.object_attributes?.ref || ''} ${payload.commit?.message || ''}`;
      const idRegex = /#?([A-Z0-9]+-\d+)/gi;
      let m;
      const seenCi = new Set<string>();
      const isFailure = ['failure', 'timed_out', 'failed', 'action_required'].includes(String(ciConclusion).toLowerCase());
      const isSuccess = ['success', 'passed'].includes(String(ciConclusion).toLowerCase());

      while ((m = idRegex.exec(ciText)) !== null) {
        const key = m[1].toUpperCase();
        if (seenCi.has(key)) continue;
        seenCi.add(key);
        const issue = await prisma.issue.findFirst({ where: { identifier: key } });
        if (!issue) continue;

        const nextStatus =
          isFailure && ['IN_REVIEW', 'DONE'].includes(issue.status.toUpperCase())
            ? 'IN_PROGRESS'
            : issue.status;

        const updated = await prisma.issue.update({
          where: { id: issue.id },
          data: {
            ciStatus: isFailure ? 'FAILURE' : isSuccess ? 'SUCCESS' : 'PENDING',
            status: nextStatus,
            ...(isFailure ? { agentStatus: 'THINKING' } : {}),
            activities: {
              create: {
                actorType: 'SYSTEM',
                actorName: 'CI Webhook Trigger',
                action: nextStatus !== issue.status ? 'STATUS_CHANGED' : 'UPDATED',
                details: isFailure
                  ? `CI fehlgeschlagen (${ciConclusion}) — Ticket zurück in ${nextStatus} & Agent geweckt.`
                  : `CI Status: ${ciConclusion}`,
              },
            },
            traceEvents: {
              create: {
                agentName: issue.assigneeName || 'CI Trigger',
                phase: isFailure ? 'ERROR' : 'TEST_RUN',
                title: isFailure ? `CI fehlgeschlagen (${ciConclusion})` : `CI erfolgreich (${ciConclusion})`,
                detail: payload.check_run?.html_url || payload.workflow_run?.html_url || undefined,
                status: isFailure ? 'FAILED' : 'SUCCESS',
              },
            },
          },
        });
        broadcastEvent('issue_updated', updated);
        eventsProcessed.push({ issue: key, type: 'ci_trigger', conclusion: ciConclusion });
      }
    }

    // 4. Event-Driven PR Review / Comment Triggers (2.5)
    const reviewBody =
      payload.review?.body ||
      payload.comment?.body ||
      (payload.object_kind === 'note' ? payload.object_attributes?.note : undefined);
    const isChangesRequested =
      payload.review?.state === 'changes_requested' ||
      Boolean(payload.comment?.body && payload.pull_request);
    if (reviewBody && (payload.review || payload.comment || payload.object_kind === 'note')) {
      const refText = `${payload.pull_request?.title || ''} ${payload.pull_request?.head?.ref || ''} ${payload.merge_request?.title || ''} ${payload.merge_request?.source_branch || ''} ${reviewBody}`;
      const idRegex = /#?([A-Z0-9]+-\d+)/gi;
      let m;
      const seenRev = new Set<string>();
      while ((m = idRegex.exec(refText)) !== null) {
        const key = m[1].toUpperCase();
        if (seenRev.has(key)) continue;
        seenRev.add(key);
        const issue = await prisma.issue.findFirst({ where: { identifier: key } });
        if (!issue) continue;

        const reviewer =
          payload.review?.user?.login ||
          payload.comment?.user?.login ||
          payload.user?.username ||
          'Git Reviewer';
        const nextStatus =
          isChangesRequested && issue.status.toUpperCase() === 'IN_REVIEW'
            ? 'IN_PROGRESS'
            : issue.status;

        const updated = await prisma.issue.update({
          where: { id: issue.id },
          data: {
            status: nextStatus,
            agentStatus: 'THINKING',
            comments: {
              create: {
                authorType: AssigneeType.HUMAN,
                authorName: reviewer,
                content: `**Git Review Feedback:**\n${reviewBody}`,
              },
            },
            activities: {
              create: {
                actorType: 'SYSTEM',
                actorName: 'Git Review Trigger',
                action: nextStatus !== issue.status ? 'STATUS_CHANGED' : 'COMMENTED',
                details: `Review-Feedback von ${reviewer} eingegangen — Agent geweckt.`,
              },
            },
          },
        });
        broadcastEvent('issue_updated', updated);
        eventsProcessed.push({ issue: key, type: 'review_trigger', reviewer });
      }
    }

    return reply.send({ success: true, processed: eventsProcessed.length, events: eventsProcessed });
  });

  // Manual Git link endpoint
  app.post('/api/issues/:id/git-links', async (request: FastifyRequest<{
    Params: { id: string };
    Body: {
      provider?: string;
      type: string;
      reference: string;
      title?: string;
      url?: string;
      authorName?: string;
      branch?: string;
      status?: string;
      autoClose?: boolean;
    };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const existing = await prisma.issue.findFirst({
      where: { OR: [{ id }, { identifier: id.toUpperCase() }] },
    });
    if (!existing) return reply.status(404).send({ error: 'Issue not found' });

    const body = request.body;
    const gitLink = await prisma.gitLink.create({
      data: {
        issueId: existing.id,
        provider: body.provider || 'github',
        type: body.type,
        reference: body.reference,
        title: body.title,
        url: body.url,
        authorName: body.authorName,
        branch: body.branch,
        status: body.status || 'open',
      },
    });

    if (body.autoClose || body.status === 'merged') {
      await prisma.issue.update({
        where: { id: existing.id },
        data: {
          status: 'DONE',
          activities: {
            create: [
              {
                actorType: 'SYSTEM',
                actorName: 'Git Integration',
                action: 'STATUS_CHANGED',
                details: `Closed via ${body.type} ${body.reference} (${body.status || 'merged'})`,
              },
            ],
          },
        },
      });
    }

    broadcastEvent('git_link_added', { issueId: existing.id, identifier: existing.identifier, gitLink });
    return reply.status(201).send(gitLink);
  });

  // ==========================================
  // KOMMENTARE & AKTIVITÄTS-LOG
  // ==========================================
  app.get('/api/issues/:id/activities', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const existing = await prisma.issue.findFirst({
      where: { OR: [{ id }, { identifier: id.toUpperCase() }] },
    });

    if (!existing) return reply.status(404).send({ error: 'Issue not found' });

    return prisma.activityLog.findMany({
      where: { issueId: existing.id },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/api/issues/:id/comments', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { authorType?: AssigneeType; authorName: string; content: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const existing = await prisma.issue.findFirst({
      where: { OR: [{ id }, { identifier: id.toUpperCase() }] },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Issue not found' });
    }

    const comment = await prisma.comment.create({
      data: {
        issueId: existing.id,
        authorType: request.body.authorType || AssigneeType.HUMAN,
        authorName: request.body.authorName,
        content: request.body.content,
      },
    });

    // Record activity log for comment
    await prisma.activityLog.create({
      data: {
        issueId: existing.id,
        actorType: request.body.authorType === AssigneeType.AGENT ? 'AGENT' : 'HUMAN',
        actorName: request.body.authorName,
        action: 'COMMENTED',
        details: `Added a comment: "${request.body.content.slice(0, 60)}${request.body.content.length > 60 ? '...' : ''}"`,
      },
    });

    broadcastEvent('comment_added', { issueId: existing.id, identifier: existing.identifier, comment });
    return reply.status(201).send(comment);
  });

  // ==========================================
  // AGENT RUNS
  // ==========================================
  app.post('/api/issues/:id/agent-runs', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { agentName: string; agentModel?: string; prompt?: string };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const existing = await prisma.issue.findFirst({
      where: { OR: [{ id }, { identifier: id.toUpperCase() }] },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Issue not found' });
    }

    // 1F: Enforce strict blocker gate before starting an agent run
    const openBlockers = await getOpenBlockers(prisma, existing.id);
    if (openBlockers.length > 0) {
      const blockerList = openBlockers.map((b) => `${b.identifier} (${b.status})`).join(', ');
      return reply.status(409).send({
        error: `Blocker-Gate: ${existing.identifier} ist noch blockiert durch ${blockerList}.`,
        openBlockers,
      });
    }

    const run = await prisma.agentRun.create({
      data: {
        issueId: existing.id,
        agentName: request.body.agentName,
        agentModel: request.body.agentModel,
        prompt: request.body.prompt,
        status: AgentRunStatus.RUNNING,
      },
    });

    await prisma.issue.update({
      where: { id: existing.id },
      data: {
        assigneeType: AssigneeType.AGENT,
        assigneeName: request.body.agentName,
        agentStatus: 'THINKING',
        status: existing.status === 'TODO' ? 'IN_PROGRESS' : existing.status,
      },
    });

    broadcastEvent('agent_run_started', { issueId: existing.id, identifier: existing.identifier, run });
    return reply.status(201).send(run);
  });

  app.patch('/api/issues/:id/agent-runs/:runId', async (request: FastifyRequest<{
    Params: { id: string; runId: string };
    Body: { status: AgentRunStatus; resultSummary?: string; tokensUsed?: number };
  }>, reply: FastifyReply) => {
    const { runId } = request.params;
    const updated = await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: request.body.status,
        resultSummary: request.body.resultSummary,
        tokensUsed: request.body.tokensUsed,
        endedAt: new Date(),
      },
    });

    broadcastEvent('agent_run_updated', updated);
    return updated;
  });

  registerAgentFeatureRoutes(app, prisma, broadcastEvent);

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`🚀 Kanso API Server v1.0 running at http://${HOST}:${PORT}`);
    console.log(`📡 Realtime SSE stream available at http://${HOST}:${PORT}/api/events`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
