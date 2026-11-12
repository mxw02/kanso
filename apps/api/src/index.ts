import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from 'jsonwebtoken';
import { PrismaClient, IssuePriority, IssueType, AssigneeType, AgentRunStatus, UserRole } from '@prisma/client';
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
    Body: { key: string; name: string; description?: string; workspaceId?: string; columns?: any[] };
  }>, reply: FastifyReply) => {
    const { key, name, description, workspaceId, columns } = request.body;
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
    Body: { name?: string; description?: string; columns?: any[] };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const updated = await prisma.project.update({
      where: { id },
      data: request.body,
    });
    broadcastEvent('project_updated', updated);
    return updated;
  });

  // ==========================================
  // TICKET-MANAGEMENT (ISSUES), FILTER & SUCHE
  // ==========================================
  app.get('/api/issues', async (request: FastifyRequest<{
    Querystring: {
      projectId?: string;
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
    const { projectId, status, priority, assigneeType, assigneeId, label, search, sortField, sortOrder } = request.query;
    const where: any = {};

    if (projectId) where.projectId = projectId;
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
        comments: { orderBy: { createdAt: 'desc' }, take: 5 },
        activities: { orderBy: { createdAt: 'desc' }, take: 5 },
        agentRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
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
        comments: { orderBy: { createdAt: 'asc' } },
        activities: { orderBy: { createdAt: 'desc' } },
        agentRuns: { orderBy: { startedAt: 'desc' } },
        subIssues: true,
        parent: true,
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
        comments: { orderBy: { createdAt: 'desc' }, take: 5 },
        activities: { orderBy: { createdAt: 'desc' }, take: 10 },
        agentRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
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
