import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient, IssueStatus, IssuePriority, IssueType, AssigneeType, AgentRunStatus } from '@prisma/client';
import dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const prisma = new PrismaClient();
const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = '0.0.0.0';

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

  // --- Projects ---
  app.get('/api/projects', async () => {
    return prisma.project.findMany({
      include: {
        _count: {
          select: { issues: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/api/projects', async (request: FastifyRequest<{
    Body: { key: string; name: string; description?: string };
  }>, reply: FastifyReply) => {
    const { key, name, description } = request.body;
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
      },
    });
    broadcastEvent('project_created', project);
    return reply.status(201).send(project);
  });

  // --- Issues ---
  app.get('/api/issues', async (request: FastifyRequest<{
    Querystring: {
      projectId?: string;
      status?: IssueStatus;
      priority?: IssuePriority;
      assigneeType?: AssigneeType;
      search?: string;
    };
  }>) => {
    const { projectId, status, priority, assigneeType, search } = request.query;
    const where: any = {};

    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeType) where.assigneeType = assigneeType;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { identifier: { contains: search, mode: 'insensitive' } },
      ];
    }

    return prisma.issue.findMany({
      where,
      include: {
        project: { select: { id: true, key: true, name: true } },
        comments: { orderBy: { createdAt: 'desc' }, take: 5 },
        agentRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
      },
      orderBy: [
        { priority: 'asc' },
        { updatedAt: 'desc' },
      ],
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
      status?: IssueStatus;
      priority?: IssuePriority;
      type?: IssueType;
      assigneeType?: AssigneeType;
      assigneeName?: string;
      labels?: string[];
      parentId?: string;
      agentMetadata?: any;
    };
  }>, reply: FastifyReply) => {
    const body = request.body;
    let project;

    if (body.projectId) {
      project = await prisma.project.findUnique({ where: { id: body.projectId } });
    } else if (body.projectKey) {
      project = await prisma.project.findUnique({ where: { key: body.projectKey.toUpperCase() } });
    } else {
      // Default to first project
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
        status: body.status || IssueStatus.TODO,
        priority: body.priority || IssuePriority.MEDIUM,
        type: body.type || IssueType.TASK,
        assigneeType: body.assigneeType || AssigneeType.UNASSIGNED,
        assigneeName: body.assigneeName || null,
        labels: body.labels || [],
        parentId: body.parentId || null,
        agentMetadata: body.agentMetadata || undefined,
        projectId: project.id,
      },
      include: {
        project: true,
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
      status?: IssueStatus;
      priority?: IssuePriority;
      type?: IssueType;
      assigneeType?: AssigneeType;
      assigneeName?: string;
      labels?: string[];
      agentMetadata?: any;
    };
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const existing = await prisma.issue.findFirst({
      where: { OR: [{ id }, { identifier: id.toUpperCase() }] },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Issue not found' });
    }

    const updated = await prisma.issue.update({
      where: { id: existing.id },
      data: {
        ...request.body,
        updatedAt: new Date(),
      },
      include: {
        project: true,
        comments: { orderBy: { createdAt: 'desc' }, take: 5 },
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

  // --- Comments ---
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

    broadcastEvent('comment_added', { issueId: existing.id, identifier: existing.identifier, comment });
    return reply.status(201).send(comment);
  });

  // --- Agent Runs (Agentic Execution tracking) ---
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

    // Automatically flag issue as assigned to AGENT if not already
    await prisma.issue.update({
      where: { id: existing.id },
      data: {
        assigneeType: AssigneeType.AGENT,
        assigneeName: request.body.agentName,
        status: existing.status === IssueStatus.TODO ? IssueStatus.IN_PROGRESS : existing.status,
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
    console.log(`🚀 Kanso API Server running at http://${HOST}:${PORT}`);
    console.log(`📡 Realtime SSE stream available at http://${HOST}:${PORT}/api/events`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
