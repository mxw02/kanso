import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AssigneeType, IssuePriority, IssueType, PrismaClient } from '@prisma/client';
import { decryptSecret, encryptSecret } from './crypto';

interface ProjectColumn {
  id: string;
  title: string;
}

interface MappedExternalIssue {
  externalSource: string;
  externalKey: string;
  externalUrl?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority: IssuePriority;
  type: IssueType;
  labels: string[];
  dueDate?: Date | null;
}

/**
 * Extracts readable plain text from Jira Cloud ADF (Atlassian Document Format) or plain strings.
 */
function extractJiraDescription(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (typeof raw !== 'object') return null;

  const walk = (node: any): string => {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node.type === 'text') return node.text || '';
    if (node.type === 'hardBreak') return '\n';
    if (Array.isArray(node.content)) {
      const inner = node.content.map(walk).join('');
      if (['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'].includes(node.type)) {
        return `${inner}\n`;
      }
      return inner;
    }
    return '';
  };

  const text = walk(raw).replace(/\n{3,}/g, '\n\n').trim();
  return text || null;
}

function mapJiraPriority(name?: string | null): IssuePriority {
  const norm = (name || '').toLowerCase();
  if (norm.includes('highest') || norm.includes('blocker') || norm.includes('critical') || norm.includes('urgent')) {
    return IssuePriority.URGENT;
  }
  if (norm.includes('high')) return IssuePriority.HIGH;
  if (norm.includes('low') || norm.includes('trivial') || norm.includes('minor')) return IssuePriority.LOW;
  return IssuePriority.MEDIUM;
}

function mapJiraType(name?: string | null): IssueType {
  const norm = (name || '').toLowerCase();
  if (norm.includes('bug') || norm.includes('fehler')) return IssueType.BUG;
  if (norm.includes('epic')) return IssueType.EPIC;
  if (norm.includes('story') || norm.includes('feature') || norm.includes('verbesserung')) return IssueType.STORY;
  return IssueType.TASK;
}

function mapJiraStatus(
  statusName: string | undefined,
  statusCategoryKey: string | undefined,
  customMapping: Record<string, string> | null | undefined,
  projectColumns: ProjectColumn[]
): string {
  const colIds = new Set(projectColumns.map((c) => c.id));
  const fallbackFirst = projectColumns[0]?.id || 'BACKLOG';

  if (statusName && customMapping && customMapping[statusName]) {
    const mapped = customMapping[statusName];
    if (colIds.has(mapped)) return mapped;
  }

  const norm = (statusName || '').toLowerCase();
  if (statusCategoryKey === 'done' || norm.includes('done') || norm.includes('closed') || norm.includes('erledigt')) {
    if (colIds.has('DONE')) return 'DONE';
    return projectColumns[projectColumns.length - 1]?.id || 'DONE';
  }
  if (
    norm.includes('review') ||
    norm.includes('qa') ||
    norm.includes('testing') ||
    norm.includes('prüf')
  ) {
    if (colIds.has('REVIEW')) return 'REVIEW';
  }
  if (
    statusCategoryKey === 'indeterminate' ||
    norm.includes('progress') ||
    norm.includes('bearbeitung') ||
    norm.includes('dev')
  ) {
    if (colIds.has('IN_AGENT_DEV')) return 'IN_AGENT_DEV';
    if (colIds.has('IN_PROGRESS')) return 'IN_PROGRESS';
  }
  if (norm.includes('triage') || norm.includes('spec') || norm.includes('selected')) {
    if (colIds.has('SPEC_TRIAGE')) return 'SPEC_TRIAGE';
  }

  return fallbackFirst;
}

function getProjectColumns(columnsJson: unknown): ProjectColumn[] {
  if (Array.isArray(columnsJson) && columnsJson.length > 0) {
    return columnsJson.map((c: any) => ({ id: String(c.id), title: String(c.title || c.id) }));
  }
  return [
    { id: 'BACKLOG', title: 'Backlog' },
    { id: 'SPEC_TRIAGE', title: 'Spec / Triage' },
    { id: 'IN_AGENT_DEV', title: 'In Agent Dev' },
    { id: 'REVIEW', title: 'Review & QA' },
    { id: 'DONE', title: 'Done' },
  ];
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

async function fetchJiraSearch(params: {
  baseUrl: string;
  email: string;
  apiToken: string;
  jql?: string | null;
  maxResults?: number;
}): Promise<{ total: number; issues: any[] }> {
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  const authHeader = `Basic ${Buffer.from(`${params.email.trim()}:${params.apiToken.trim()}`).toString('base64')}`;
  // Jira Cloud /rest/api/3/search/jql rejects unbounded JQL queries, so default to a bounded 365-day window
  const jql = params.jql?.trim() || 'updated >= -365d ORDER BY updated DESC';
  const maxResults = params.maxResults ?? 100;
  const fields = ['summary', 'description', 'status', 'priority', 'issuetype', 'labels', 'duedate'];

  // Try Jira Cloud v3 /search/jql first; only fall back to v2 /search if endpoint doesn't exist (404/405, e.g. Jira Server/DC)
  const attempts = [
    {
      url: `${baseUrl}/rest/api/3/search/jql`,
      method: 'POST',
      body: JSON.stringify({ jql, maxResults, fields }),
    },
    {
      url: `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=${fields.join(',')}`,
      method: 'GET',
    },
  ];

  let lastError = 'Jira API nicht erreichbar';
  for (const attempt of attempts) {
    const res = await fetch(attempt.url, {
      method: attempt.method,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        ...(attempt.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: attempt.body,
    });

    if (res.ok) {
      const data: any = await res.json();
      const issues = Array.isArray(data.issues) ? data.issues : [];
      return {
        total: typeof data.total === 'number' ? data.total : issues.length,
        issues,
      };
    }

    const errText = await res.text().catch(() => '');
    lastError = `Jira HTTP ${res.status}: ${errText.slice(0, 300)}`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Authentifizierung bei Jira fehlgeschlagen (${res.status}). Bitte E-Mail & API-Token prüfen.`);
    }
    if (res.status === 400) {
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}

function mapRawJiraIssue(
  raw: any,
  baseUrl: string,
  customMapping: Record<string, string> | null | undefined,
  projectColumns: ProjectColumn[]
): MappedExternalIssue {
  const fields = raw.fields || {};
  const key = String(raw.key || raw.id);
  const statusName = fields.status?.name as string | undefined;
  const statusCat = fields.status?.statusCategory?.key as string | undefined;
  const labels = Array.isArray(fields.labels)
    ? fields.labels.map((l: unknown) => String(l).trim()).filter(Boolean)
    : [];
  if (!labels.includes('jira')) {
    labels.push('jira');
  }

  return {
    externalSource: 'jira',
    externalKey: key,
    externalUrl: `${normalizeBaseUrl(baseUrl)}/browse/${key}`,
    title: String(fields.summary || key).trim(),
    description: extractJiraDescription(fields.description),
    status: mapJiraStatus(statusName, statusCat, customMapping, projectColumns),
    priority: mapJiraPriority(fields.priority?.name),
    type: mapJiraType(fields.issuetype?.name),
    labels,
    dueDate: fields.duedate ? new Date(`${fields.duedate}T12:00:00.000Z`) : null,
  };
}

async function upsertExternalIssue(
  prisma: PrismaClient,
  project: { id: string; key: string },
  mapped: MappedExternalIssue,
  actorName: string,
  broadcastEvent: (event: string, data: any) => void
): Promise<'created' | 'updated'> {
  const existing = await prisma.issue.findUnique({
    where: {
      projectId_externalSource_externalKey: {
        projectId: project.id,
        externalSource: mapped.externalSource,
        externalKey: mapped.externalKey,
      },
    },
  });

  if (existing) {
    const updated = await prisma.issue.update({
      where: { id: existing.id },
      data: {
        title: mapped.title,
        description: mapped.description,
        status: mapped.status,
        priority: mapped.priority,
        type: mapped.type,
        labels: mapped.labels,
        dueDate: mapped.dueDate ?? existing.dueDate,
        externalUrl: mapped.externalUrl ?? existing.externalUrl,
        activities: {
          create: {
            actorType: 'SYSTEM',
            actorName,
            action: 'UPDATED',
            details: `Synchronisiert aus ${mapped.externalSource.toUpperCase()} (${mapped.externalKey})`,
          },
        },
      },
      include: { project: true, sprint: true, goal: true },
    });
    broadcastEvent('issue_updated', updated);
    return 'updated';
  }

  const maxIssue = await prisma.issue.findFirst({
    where: { projectId: project.id },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const nextNumber = (maxIssue?.number || 0) + 1;
  const identifier = `${project.key}-${nextNumber}`;

  const created = await prisma.issue.create({
    data: {
      identifier,
      number: nextNumber,
      title: mapped.title,
      description: mapped.description,
      status: mapped.status,
      priority: mapped.priority,
      type: mapped.type,
      assigneeType: AssigneeType.UNASSIGNED,
      labels: mapped.labels,
      dueDate: mapped.dueDate ?? null,
      externalSource: mapped.externalSource,
      externalKey: mapped.externalKey,
      externalUrl: mapped.externalUrl ?? null,
      projectId: project.id,
      activities: {
        create: {
          actorType: 'SYSTEM',
          actorName,
          action: 'CREATED',
          details: `Importiert aus ${mapped.externalSource.toUpperCase()} (${mapped.externalKey})`,
        },
      },
    },
    include: { project: true, sprint: true, goal: true },
  });

  broadcastEvent('issue_created', created);
  return 'created';
}

export function registerImportRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  broadcastEvent: (event: string, data: any) => void
) {
  // Get Jira integration config for a project (without exposing encrypted token)
  app.get('/api/projects/:projectId/jira-integration', async (request: FastifyRequest<{
    Params: { projectId: string };
  }>) => {
    const { projectId } = request.params;
    const cfg = await prisma.jiraIntegration.findUnique({ where: { projectId } });
    if (!cfg) return { configured: false };
    return {
      configured: true,
      id: cfg.id,
      projectId: cfg.projectId,
      baseUrl: cfg.baseUrl,
      email: cfg.email,
      hasApiToken: Boolean(cfg.apiTokenEnc),
      jql: cfg.jql,
      statusMapping: cfg.statusMapping || {},
      webhookSecret: cfg.webhookSecret,
      autoSync: cfg.autoSync,
      lastSyncedAt: cfg.lastSyncedAt,
      lastSyncStats: cfg.lastSyncStats,
    };
  });

  // Save or update Jira integration config
  app.put('/api/projects/:projectId/jira-integration', async (request: FastifyRequest<{
    Params: { projectId: string };
    Body: {
      baseUrl: string;
      email: string;
      apiToken?: string;
      jql?: string;
      statusMapping?: Record<string, string>;
      webhookSecret?: string;
      autoSync?: boolean;
    };
  }>, reply: FastifyReply) => {
    const { projectId } = request.params;
    const { baseUrl, email, apiToken, jql, statusMapping, webhookSecret, autoSync } = request.body;

    if (!baseUrl?.trim() || !email?.trim()) {
      return reply.status(400).send({ error: 'Jira-URL und E-Mail sind erforderlich.' });
    }

    const existing = await prisma.jiraIntegration.findUnique({ where: { projectId } });
    if (!existing && !apiToken?.trim()) {
      return reply.status(400).send({ error: 'API-Token ist bei erstmaliger Einrichtung erforderlich.' });
    }

    const apiTokenEnc = apiToken?.trim()
      ? encryptSecret(apiToken.trim())
      : existing!.apiTokenEnc;

    const saved = await prisma.jiraIntegration.upsert({
      where: { projectId },
      create: {
        projectId,
        baseUrl: normalizeBaseUrl(baseUrl),
        email: email.trim(),
        apiTokenEnc,
        jql: jql?.trim() || null,
        statusMapping: statusMapping || {},
        webhookSecret: webhookSecret?.trim() || null,
        autoSync: Boolean(autoSync),
      },
      update: {
        baseUrl: normalizeBaseUrl(baseUrl),
        email: email.trim(),
        apiTokenEnc,
        jql: jql?.trim() || null,
        statusMapping: statusMapping ?? (existing?.statusMapping as any) ?? {},
        webhookSecret: webhookSecret !== undefined ? (webhookSecret?.trim() || null) : existing?.webhookSecret,
        autoSync: autoSync !== undefined ? Boolean(autoSync) : existing?.autoSync,
      },
    });

    return {
      configured: true,
      id: saved.id,
      projectId: saved.projectId,
      baseUrl: saved.baseUrl,
      email: saved.email,
      hasApiToken: true,
      jql: saved.jql,
      statusMapping: saved.statusMapping || {},
      webhookSecret: saved.webhookSecret,
      autoSync: saved.autoSync,
      lastSyncedAt: saved.lastSyncedAt,
      lastSyncStats: saved.lastSyncStats,
    };
  });

  app.delete('/api/projects/:projectId/jira-integration', async (request: FastifyRequest<{
    Params: { projectId: string };
  }>) => {
    const { projectId } = request.params;
    await prisma.jiraIntegration.deleteMany({ where: { projectId } });
    return { success: true };
  });

  // Preview matching Jira issues before importing
  app.post('/api/projects/:projectId/jira-preview', async (request: FastifyRequest<{
    Params: { projectId: string };
    Body: {
      baseUrl?: string;
      email?: string;
      apiToken?: string;
      jql?: string;
    };
  }>, reply: FastifyReply) => {
    const { projectId } = request.params;
    const saved = await prisma.jiraIntegration.findUnique({ where: { projectId } });

    const baseUrl = request.body.baseUrl?.trim() || saved?.baseUrl;
    const email = request.body.email?.trim() || saved?.email;
    const apiToken = request.body.apiToken?.trim() || (saved?.apiTokenEnc ? decryptSecret(saved.apiTokenEnc) : '');
    const jql = request.body.jql !== undefined ? request.body.jql : saved?.jql;

    if (!baseUrl || !email || !apiToken) {
      return reply.status(400).send({ error: 'Jira-URL, E-Mail und API-Token sind erforderlich.' });
    }

    try {
      const result = await fetchJiraSearch({ baseUrl, email, apiToken, jql, maxResults: 50 });
      const jiraStatuses = Array.from(
        new Set(result.issues.map((i) => i.fields?.status?.name).filter(Boolean))
      ) as string[];

      const preview = result.issues.map((i) => ({
        key: i.key,
        summary: i.fields?.summary || i.key,
        status: i.fields?.status?.name || 'Unknown',
        statusCategory: i.fields?.status?.statusCategory?.key,
        priority: i.fields?.priority?.name || 'Medium',
        type: i.fields?.issuetype?.name || 'Task',
        dueDate: i.fields?.duedate || null,
      }));

      return { total: result.total, jiraStatuses, issues: preview };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Jira-Vorschau fehlgeschlagen.' });
    }
  });

  // Sync Jira issues into Kanso (idempotent via externalSource + externalKey)
  app.post('/api/projects/:projectId/jira-sync', async (request: FastifyRequest<{
    Params: { projectId: string };
    Body?: {
      baseUrl?: string;
      email?: string;
      apiToken?: string;
      jql?: string;
      statusMapping?: Record<string, string>;
    };
  }>, reply: FastifyReply) => {
    const { projectId } = request.params;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.status(404).send({ error: 'Projekt nicht gefunden.' });

    const saved = await prisma.jiraIntegration.findUnique({ where: { projectId } });
    const body = request.body || {};

    const baseUrl = body.baseUrl?.trim() || saved?.baseUrl;
    const email = body.email?.trim() || saved?.email;
    const apiToken = body.apiToken?.trim() || (saved?.apiTokenEnc ? decryptSecret(saved.apiTokenEnc) : '');
    const jql = body.jql !== undefined ? body.jql : saved?.jql;
    const statusMapping = body.statusMapping || (saved?.statusMapping as Record<string, string> | null) || {};
    const projectColumns = getProjectColumns(project.columns);

    if (!baseUrl || !email || !apiToken) {
      return reply.status(400).send({ error: 'Keine gültigen Jira-Zugangsdaten konfiguriert.' });
    }

    try {
      const result = await fetchJiraSearch({ baseUrl, email, apiToken, jql, maxResults: 100 });
      let created = 0;
      let updated = 0;

      for (const rawIssue of result.issues) {
        const mapped = mapRawJiraIssue(rawIssue, baseUrl, statusMapping, projectColumns);
        const outcome = await upsertExternalIssue(prisma, project, mapped, 'Jira Sync', broadcastEvent);
        if (outcome === 'created') created += 1;
        else updated += 1;
      }

      const stats = { created, updated, total: result.issues.length };
      if (saved) {
        await prisma.jiraIntegration.update({
          where: { id: saved.id },
          data: { lastSyncedAt: new Date(), lastSyncStats: stats },
        });
      }

      return stats;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Jira-Synchronisation fehlgeschlagen.' });
    }
  });

  // Real-time Jira Webhook receiver
  app.post('/api/integrations/jira/webhook/:projectId', async (request: FastifyRequest<{
    Params: { projectId: string };
    Querystring: { secret?: string };
    Body: {
      webhookEvent?: string;
      issue?: any;
    };
  }>, reply: FastifyReply) => {
    const { projectId } = request.params;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.status(404).send({ error: 'Projekt nicht gefunden.' });

    const saved = await prisma.jiraIntegration.findUnique({ where: { projectId } });
    if (saved?.webhookSecret) {
      const provided = request.query.secret || (request.headers['x-kanso-webhook-secret'] as string | undefined);
      if (provided !== saved.webhookSecret) {
        return reply.status(401).send({ error: 'Ungültiges Webhook-Secret.' });
      }
    }

    const rawIssue = request.body?.issue;
    if (!rawIssue || !rawIssue.key) {
      return { ignored: true, reason: 'No issue payload' };
    }

    const baseUrl = saved?.baseUrl || 'https://jira.atlassian.net';
    const statusMapping = (saved?.statusMapping as Record<string, string> | null) || {};
    const projectColumns = getProjectColumns(project.columns);

    const mapped = mapRawJiraIssue(rawIssue, baseUrl, statusMapping, projectColumns);
    const outcome = await upsertExternalIssue(prisma, project, mapped, 'Jira Webhook', broadcastEvent);

    return { success: true, outcome, key: mapped.externalKey };
  });

  // Generic CSV / JSON batch import for migration from any issue tracker
  app.post('/api/projects/:projectId/import-csv', async (request: FastifyRequest<{
    Params: { projectId: string };
    Body: {
      issues: Array<{
        title: string;
        description?: string;
        status?: string;
        priority?: string;
        type?: string;
        labels?: string[];
        dueDate?: string | null;
        externalKey?: string;
      }>;
    };
  }>, reply: FastifyReply) => {
    const { projectId } = request.params;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.status(404).send({ error: 'Projekt nicht gefunden.' });

    const rows = Array.isArray(request.body?.issues) ? request.body.issues : [];
    if (rows.length === 0) {
      return reply.status(400).send({ error: 'Keine gültigen Tickets zum Importieren übergeben.' });
    }

    const projectColumns = getProjectColumns(project.columns);
    let created = 0;
    let updated = 0;

    for (const row of rows) {
      if (!row.title?.trim()) continue;

      const labels = Array.isArray(row.labels) ? row.labels.filter(Boolean) : [];
      if (row.externalKey) {
        const mapped: MappedExternalIssue = {
          externalSource: 'csv',
          externalKey: row.externalKey.trim(),
          title: row.title.trim(),
          description: row.description?.trim() || null,
          status: mapJiraStatus(row.status, undefined, null, projectColumns),
          priority: mapJiraPriority(row.priority),
          type: mapJiraType(row.type),
          labels,
          dueDate: row.dueDate ? new Date(row.dueDate) : null,
        };
        const outcome = await upsertExternalIssue(prisma, project, mapped, 'CSV Import', broadcastEvent);
        if (outcome === 'created') created += 1;
        else updated += 1;
      } else {
        const maxIssue = await prisma.issue.findFirst({
          where: { projectId: project.id },
          orderBy: { number: 'desc' },
          select: { number: true },
        });
        const nextNumber = (maxIssue?.number || 0) + 1;
        const identifier = `${project.key}-${nextNumber}`;
        const newIssue = await prisma.issue.create({
          data: {
            identifier,
            number: nextNumber,
            title: row.title.trim(),
            description: row.description?.trim() || null,
            status: mapJiraStatus(row.status, undefined, null, projectColumns),
            priority: mapJiraPriority(row.priority),
            type: mapJiraType(row.type),
            assigneeType: AssigneeType.UNASSIGNED,
            labels,
            dueDate: row.dueDate ? new Date(row.dueDate) : null,
            projectId: project.id,
            activities: {
              create: {
                actorType: 'SYSTEM',
                actorName: 'CSV Import',
                action: 'CREATED',
                details: 'Importiert via CSV',
              },
            },
          },
          include: { project: true, sprint: true, goal: true },
        });
        broadcastEvent('issue_created', newIssue);
        created += 1;
      }
    }

    return { created, updated, total: created + updated };
  });
}
