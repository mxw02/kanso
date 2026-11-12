import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from 'jsonwebtoken';
import { PrismaClient, IssuePriority, IssueType, AssigneeType, AgentRunStatus, UserRole, SprintStatus, IssueRelationType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Redis from 'ioredis';

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

    if (password) {
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

  app.get('/api/users', async () => {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
      },
      orderBy: { name: 'asc' },
    });
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
      gitProvider?: string | null;
      gitRepo?: string | null;
      gitBranch?: string | null;
    };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { name, key, description, columns, gitProvider, gitRepo, gitBranch } = request.body;
    const updateData: any = {};

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (columns !== undefined) updateData.columns = columns;
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
        project: { select: { id: true, key: true, name: true, columns: true } },
        sprint: { select: { id: true, name: true, status: true } },
        comments: { orderBy: { createdAt: 'desc' }, take: 5 },
        activities: { orderBy: { createdAt: 'desc' }, take: 5 },
        agentRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
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

    const issue = await prisma.issue.create({
      data: {
        identifier,
        number: nextNumber,
        title: body.title,
        description: body.description || '',
        status: body.status || 'TODO',
        priority: body.priority || IssuePriority.MEDIUM,
        type: body.type || IssueType.TASK,
        assigneeType: body.assigneeType || AssigneeType.UNASSIGNED,
        assigneeId: body.assigneeId || null,
        assigneeName: body.assigneeName || null,
        labels: body.labels || [],
        parentId: body.parentId || null,
        sprintId: body.sprintId || null,
        agentMetadata: body.agentMetadata || undefined,
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
      actorName?: string;
      actorType?: string;
    };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const existing = await prisma.issue.findFirst({
      where: { OR: [{ id }, { identifier: id.toUpperCase() }] },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Issue not found' });
    }

    const body = request.body;
    const actorName = body.actorName || 'User';
    const actorType = body.actorType || 'HUMAN';

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
    updateData.updatedAt = new Date();

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
  // GIT INTEGRATION, CONNECTIONS & REPO BOARDS
  // ==========================================
  app.get('/api/git/connections', async () => {
    let connections = await prisma.gitConnection.findMany({
      orderBy: { createdAt: 'desc' },
    });

    if (connections.length === 0) {
      // Seed initial connection for user
      const defaultConn = await prisma.gitConnection.create({
        data: {
          provider: 'github',
          accountName: 'mxw02',
          instanceUrl: 'https://github.com',
          isDefault: true,
        },
      });
      connections = [defaultConn];
    }

    return connections;
  });

  app.post('/api/git/connections', async (request: FastifyRequest<{
    Body: {
      provider: string;
      accountName: string;
      accessToken?: string;
      instanceUrl?: string;
    };
  }>, reply: FastifyReply) => {
    const { provider, accountName, accessToken, instanceUrl } = request.body;
    if (!accountName) {
      return reply.status(400).send({ error: 'Account- oder Organisationsname ist erforderlich.' });
    }

    const conn = await prisma.gitConnection.create({
      data: {
        provider: provider || 'github',
        accountName: accountName.trim(),
        accessToken: accessToken ? accessToken.trim() : null,
        instanceUrl: instanceUrl ? instanceUrl.trim() : provider === 'gitlab' ? 'https://gitlab.com' : 'https://github.com',
      },
    });

    broadcastEvent('git_connection_created', conn);
    return reply.status(201).send(conn);
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
    Querystring: { provider?: string; account?: string };
  }>) => {
    const { provider = 'github', account = 'mxw02' } = request.query;

    // Preset list of active repositories for this account
    const sampleRepos = [
      {
        fullName: `${account}/kanso`,
        name: 'kanso',
        description: 'Next-gen open source Jira alternative with Agentic MCP support',
        url: `https://${provider === 'gitlab' ? 'gitlab.com' : 'github.com'}/${account}/kanso`,
        defaultBranch: 'main',
        isPrivate: false,
        stars: 42,
        language: 'TypeScript',
      },
      {
        fullName: `${account}/kanso-mcp-agent`,
        name: 'kanso-mcp-agent',
        description: 'Autonomous Coding & Triage MCP Agent for Kanso workspaces',
        url: `https://${provider === 'gitlab' ? 'gitlab.com' : 'github.com'}/${account}/kanso-mcp-agent`,
        defaultBranch: 'main',
        isPrivate: true,
        stars: 18,
        language: 'Python',
      },
      {
        fullName: `${account}/kanso-infra`,
        name: 'kanso-infra',
        description: 'Docker Compose, Kubernetes Helm Charts & Cloud Deployments',
        url: `https://${provider === 'gitlab' ? 'gitlab.com' : 'github.com'}/${account}/kanso-infra`,
        defaultBranch: 'main',
        isPrivate: false,
        stars: 7,
        language: 'HCL',
      },
      {
        fullName: `${account}/web-client`,
        name: 'web-client',
        description: 'Vite & React frontend dashboard',
        url: `https://${provider === 'gitlab' ? 'gitlab.com' : 'github.com'}/${account}/web-client`,
        defaultBranch: 'main',
        isPrivate: true,
        stars: 5,
        language: 'TypeScript',
      },
    ];

    return sampleRepos;
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
