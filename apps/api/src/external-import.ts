import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { GoalStatus, IssuePriority, IssueType, PrismaClient } from '@prisma/client';
import { decryptSecret } from './crypto';
import {
  getProjectColumns,
  mapJiraPriority,
  mapJiraStatus,
  mapJiraType,
  MappedExternalIssue,
  ProjectColumn,
  upsertExternalIssue,
} from './jira-import';

interface ExternalMilestoneInput {
  externalSource: string;
  externalKey: string;
  title: string;
  description?: string | null;
  status: GoalStatus;
  targetDate?: Date | null;
}

async function upsertExternalGoal(
  prisma: PrismaClient,
  projectId: string,
  input: ExternalMilestoneInput,
  broadcastEvent: (event: string, data: any) => void
): Promise<{ goalId: string; outcome: 'created' | 'updated' }> {
  const existing = await prisma.goal.findUnique({
    where: {
      projectId_externalSource_externalKey: {
        projectId,
        externalSource: input.externalSource,
        externalKey: input.externalKey,
      },
    },
  });

  if (existing) {
    const updated = await prisma.goal.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        description: input.description ?? existing.description,
        status: input.status,
        targetDate: input.targetDate ?? existing.targetDate,
      },
      include: { _count: { select: { issues: true } } },
    });
    broadcastEvent('goal_updated', updated);
    return { goalId: updated.id, outcome: 'updated' };
  }

  const created = await prisma.goal.create({
    data: {
      projectId,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      color: input.externalSource.startsWith('linear') ? '#4f46e5' : '#0f766e',
      targetDate: input.targetDate ?? null,
      externalSource: input.externalSource,
      externalKey: input.externalKey,
    },
    include: { _count: { select: { issues: true } } },
  });
  broadcastEvent('goal_created', created);
  return { goalId: created.id, outcome: 'created' };
}

function inferTypeFromLabels(labels: string[]): IssueType {
  for (const l of labels) {
    const t = mapJiraType(l);
    if (t !== IssueType.TASK) return t;
  }
  return IssueType.TASK;
}

function inferPriorityFromLabels(labels: string[]): IssuePriority {
  for (const l of labels) {
    const norm = l.toLowerCase();
    if (norm.includes('urgent') || norm.includes('critical') || norm === 'p0' || norm.includes('blocker')) {
      return IssuePriority.URGENT;
    }
    if (norm.includes('high') || norm === 'p1') return IssuePriority.HIGH;
    if (norm.includes('low') || norm === 'p3' || norm.includes('minor')) return IssuePriority.LOW;
  }
  return IssuePriority.MEDIUM;
}

function mapGitIssueStatus(
  state: string,
  labels: string[],
  projectColumns: ProjectColumn[]
): string {
  if (state === 'closed') {
    return mapJiraStatus('Done', 'done', null, projectColumns);
  }
  for (const label of labels) {
    const mapped = mapJiraStatus(label, undefined, null, projectColumns);
    if (mapped !== (projectColumns[0]?.id || 'BACKLOG')) {
      return mapped;
    }
  }
  return projectColumns[0]?.id || 'BACKLOG';
}

async function resolveGitTokenAndBase(
  prisma: PrismaClient,
  provider: 'github' | 'gitlab',
  overrideToken?: string,
  overrideInstanceUrl?: string
): Promise<{ token: string | null; instanceUrl: string }> {
  const conn = await prisma.gitConnection.findFirst({
    where: { provider },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });

  const savedToken = conn?.accessToken ? decryptSecret(conn.accessToken) : null;
  const usableSaved = savedToken && !savedToken.startsWith('simulated_') ? savedToken : null;
  const token = overrideToken?.trim() || usableSaved || null;
  const instanceUrl = (
    overrideInstanceUrl?.trim() ||
    conn?.instanceUrl ||
    (provider === 'gitlab' ? 'https://gitlab.com' : 'https://github.com')
  ).replace(/\/+$/, '');

  return { token, instanceUrl };
}

async function fetchGitIssues(params: {
  provider: 'github' | 'gitlab';
  repo: string;
  state: 'open' | 'closed' | 'all';
  token: string | null;
  instanceUrl: string;
  includePullRequests?: boolean;
}): Promise<any[]> {
  const { provider, repo, state, token, instanceUrl, includePullRequests } = params;

  if (provider === 'github') {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Kanso-Issue-Tracker',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const url = `https://api.github.com/repos/${repo}/issues?state=${encodeURIComponent(state)}&per_page=100`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new Error(
          `GitHub-Abruf fehlgeschlagen (${res.status}). Prüfe Repository-Name "${repo}" und Token-Berechtigung (für private Repos wird ein Token mit repo-Scope benötigt).`
        );
      }
      throw new Error(`GitHub HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const raw: any = await res.json();
    const list = Array.isArray(raw) ? raw : [];
    return includePullRequests ? list : list.filter((item: any) => !item.pull_request);
  }

  // GitLab
  const glState = state === 'open' ? 'opened' : state;
  const headers: Record<string, string> = {
    'User-Agent': 'Kanso-Issue-Tracker',
  };
  if (token) headers['PRIVATE-TOKEN'] = token;

  const url = `${instanceUrl}/api/v4/projects/${encodeURIComponent(repo)}/issues?state=${encodeURIComponent(glState)}&per_page=100`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw new Error(
        `GitLab-Abruf fehlgeschlagen (${res.status}). Prüfe Projektpfad "${repo}" und Token-Berechtigung.`
      );
    }
    throw new Error(`GitLab HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const raw: any = await res.json();
  return Array.isArray(raw) ? raw : [];
}

function mapLinearPriority(priority: unknown): IssuePriority {
  if (typeof priority === 'number') {
    if (priority === 1) return IssuePriority.URGENT;
    if (priority === 2) return IssuePriority.HIGH;
    if (priority === 4) return IssuePriority.LOW;
    return IssuePriority.MEDIUM;
  }
  return mapJiraPriority(priority ? String(priority) : null);
}

function mapLinearStatus(
  stateObj: { name?: string; type?: string } | string | undefined,
  projectColumns: ProjectColumn[]
): string {
  const stateName = typeof stateObj === 'string' ? stateObj : stateObj?.name || '';
  const stateType = typeof stateObj === 'string' ? '' : (stateObj?.type || '').toLowerCase();

  let categoryKey: string | undefined;
  if (stateType === 'completed' || stateType === 'canceled' || stateType === 'cancelled') {
    categoryKey = 'done';
  } else if (stateType === 'started') {
    categoryKey = 'indeterminate';
  }
  return mapJiraStatus(stateName, categoryKey, null, projectColumns);
}

async function fetchLinearIssuesFromApi(params: {
  apiKey: string;
  teamKey?: string;
  includeCompleted?: boolean;
}): Promise<any[]> {
  const query = `
    query KansoLinearImport($after: String) {
      issues(first: 100, after: $after) {
        nodes {
          id
          identifier
          title
          description
          priority
          dueDate
          url
          state { name type }
          team { key name }
          labels { nodes { name } }
          project { id name description state targetDate }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const collected: any[] = [];
  let after: string | null = null;

  for (let page = 0; page < 5; page++) {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: params.apiKey.trim(),
      },
      body: JSON.stringify({ query, variables: { after } }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Linear API HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const payload: any = await res.json();
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new Error(payload.errors[0]?.message || 'Linear GraphQL-Fehler');
    }

    const nodes = payload?.data?.issues?.nodes;
    if (Array.isArray(nodes)) collected.push(...nodes);

    const pageInfo = payload?.data?.issues?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
    after = pageInfo.endCursor;
  }

  return collected.filter((issue) => {
    if (params.teamKey?.trim()) {
      const tk = params.teamKey.trim().toUpperCase();
      const issueTeam = String(issue.team?.key || '').toUpperCase();
      if (issueTeam && issueTeam !== tk) return false;
    }
    if (params.includeCompleted === false) {
      const st = String(issue.state?.type || '').toLowerCase();
      if (st === 'completed' || st === 'canceled' || st === 'cancelled') return false;
    }
    return true;
  });
}

function normalizeLinearExportItems(rawExport: unknown): any[] {
  let parsed = rawExport;
  if (typeof rawExport === 'string') {
    parsed = JSON.parse(rawExport);
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as any;
    if (Array.isArray(obj.issues)) return obj.issues;
    if (Array.isArray(obj.nodes)) return obj.nodes;
    if (Array.isArray(obj.data?.issues?.nodes)) return obj.data.issues.nodes;
  }
  throw new Error('Ungültiges Linear-Export-Format. Erwartet wird ein JSON-Array oder { issues: [...] }.');
}

function extractLinearLabels(raw: any): string[] {
  if (Array.isArray(raw?.labels?.nodes)) {
    return raw.labels.nodes.map((l: any) => String(l.name || '')).filter(Boolean);
  }
  if (Array.isArray(raw?.labels)) {
    return raw.labels.map((l: any) => (typeof l === 'string' ? l : String(l?.name || ''))).filter(Boolean);
  }
  if (typeof raw?.labels === 'string') {
    return raw.labels.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
}

export function registerExternalImportRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  broadcastEvent: (event: string, data: any) => void
) {
  // Preview GitHub / GitLab Issues
  app.post('/api/projects/:projectId/import/git/preview', async (request: FastifyRequest<{
    Params: { projectId: string };
    Body: {
      provider?: 'github' | 'gitlab';
      repo?: string;
      state?: 'open' | 'closed' | 'all';
      accessToken?: string;
      instanceUrl?: string;
      includePullRequests?: boolean;
    };
  }>, reply: FastifyReply) => {
    const project = await prisma.project.findUnique({ where: { id: request.params.projectId } });
    if (!project) return reply.status(404).send({ error: 'Projekt nicht gefunden.' });

    const provider = (request.body?.provider || project.gitProvider?.toLowerCase() || 'github') as 'github' | 'gitlab';
    const repo = (request.body?.repo || project.gitRepo || '').trim();
    const state = request.body?.state || 'open';

    if (!repo) {
      return reply.status(400).send({ error: 'Bitte Repository-Name (z. B. owner/repo) angeben.' });
    }

    try {
      const { token, instanceUrl } = await resolveGitTokenAndBase(
        prisma,
        provider,
        request.body?.accessToken,
        request.body?.instanceUrl
      );
      const rawIssues = await fetchGitIssues({
        provider,
        repo,
        state,
        token,
        instanceUrl,
        includePullRequests: request.body?.includePullRequests,
      });
      const columns = getProjectColumns(project.columns);

      const issues = rawIssues.map((item) => {
        const numberOrIid = provider === 'github' ? item.number : item.iid;
        const labels: string[] = Array.isArray(item.labels)
          ? item.labels.map((l: any) => (typeof l === 'string' ? l : String(l?.name || ''))).filter(Boolean)
          : [];
        return {
          externalKey: `${repo}#${numberOrIid}`,
          title: item.title,
          status: mapGitIssueStatus(item.state, labels, columns),
          priority: inferPriorityFromLabels(labels),
          type: inferTypeFromLabels(labels),
          labels,
          milestone: item.milestone?.title || null,
          url: provider === 'github' ? item.html_url : item.web_url,
        };
      });

      return { total: issues.length, hasSavedToken: Boolean(token), issues };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Git-Issues konnten nicht geladen werden.' });
    }
  });

  // Sync GitHub / GitLab Issues into Kanso (idempotent via externalSource + externalKey)
  app.post('/api/projects/:projectId/import/git/sync', async (request: FastifyRequest<{
    Params: { projectId: string };
    Body: {
      provider?: 'github' | 'gitlab';
      repo?: string;
      state?: 'open' | 'closed' | 'all';
      accessToken?: string;
      instanceUrl?: string;
      includePullRequests?: boolean;
      importMilestonesAsGoals?: boolean;
    };
  }>, reply: FastifyReply) => {
    const project = await prisma.project.findUnique({ where: { id: request.params.projectId } });
    if (!project) return reply.status(404).send({ error: 'Projekt nicht gefunden.' });

    const provider = (request.body?.provider || project.gitProvider?.toLowerCase() || 'github') as 'github' | 'gitlab';
    const repo = (request.body?.repo || project.gitRepo || '').trim();
    const state = request.body?.state || 'open';
    const importMilestones = request.body?.importMilestonesAsGoals !== false;

    if (!repo) {
      return reply.status(400).send({ error: 'Bitte Repository-Name (z. B. owner/repo) angeben.' });
    }

    try {
      const { token, instanceUrl } = await resolveGitTokenAndBase(
        prisma,
        provider,
        request.body?.accessToken,
        request.body?.instanceUrl
      );
      const rawIssues = await fetchGitIssues({
        provider,
        repo,
        state,
        token,
        instanceUrl,
        includePullRequests: request.body?.includePullRequests,
      });
      const columns = getProjectColumns(project.columns);

      let created = 0;
      let updated = 0;
      let goalsCreated = 0;
      let goalsUpdated = 0;
      const milestoneGoalCache = new Map<string, string>();

      for (const item of rawIssues) {
        const numberOrIid = provider === 'github' ? item.number : item.iid;
        const labels: string[] = Array.isArray(item.labels)
          ? item.labels.map((l: any) => (typeof l === 'string' ? l : String(l?.name || ''))).filter(Boolean)
          : [];

        let goalId: string | null = null;
        if (importMilestones && item.milestone?.title) {
          const mKey = `${repo}#${provider === 'github' ? item.milestone.number : item.milestone.id}`;
          if (milestoneGoalCache.has(mKey)) {
            goalId = milestoneGoalCache.get(mKey)!;
          } else {
            const rawDue = item.milestone.due_on || item.milestone.due_date || null;
            const goalRes = await upsertExternalGoal(
              prisma,
              project.id,
              {
                externalSource: `${provider}-milestone`,
                externalKey: mKey,
                title: String(item.milestone.title).trim(),
                description: item.milestone.description || null,
                status: item.milestone.state === 'closed' ? GoalStatus.COMPLETED : GoalStatus.ACTIVE,
                targetDate: rawDue ? new Date(rawDue) : null,
              },
              broadcastEvent
            );
            goalId = goalRes.goalId;
            milestoneGoalCache.set(mKey, goalId);
            if (goalRes.outcome === 'created') goalsCreated += 1;
            else goalsUpdated += 1;
          }
        }

        const rawDue = item.due_date || item.milestone?.due_on || item.milestone?.due_date || null;
        const mapped: MappedExternalIssue = {
          externalSource: provider,
          externalKey: `${repo}#${numberOrIid}`,
          externalUrl: provider === 'github' ? item.html_url : item.web_url,
          title: String(item.title || `${repo}#${numberOrIid}`).trim(),
          description: (provider === 'github' ? item.body : item.description) || null,
          status: mapGitIssueStatus(item.state, labels, columns),
          priority: inferPriorityFromLabels(labels),
          type: inferTypeFromLabels(labels),
          labels,
          dueDate: rawDue ? new Date(rawDue) : null,
          goalId,
        };

        const outcome = await upsertExternalIssue(
          prisma,
          project,
          mapped,
          `${provider === 'github' ? 'GitHub' : 'GitLab'} Import`,
          broadcastEvent
        );
        if (outcome === 'created') created += 1;
        else updated += 1;
      }

      return {
        created,
        updated,
        goalsCreated,
        goalsUpdated,
        total: rawIssues.length,
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Git-Issues konnten nicht synchronisiert werden.' });
    }
  });

  // Preview Linear Issues (via API-Key or JSON Export)
  app.post('/api/projects/:projectId/import/linear/preview', async (request: FastifyRequest<{
    Params: { projectId: string };
    Body: {
      apiKey?: string;
      teamKey?: string;
      includeCompleted?: boolean;
      exportJson?: string | any[];
    };
  }>, reply: FastifyReply) => {
    const project = await prisma.project.findUnique({ where: { id: request.params.projectId } });
    if (!project) return reply.status(404).send({ error: 'Projekt nicht gefunden.' });

    const { apiKey, teamKey, includeCompleted, exportJson } = request.body || {};
    if (!apiKey?.trim() && !exportJson) {
      return reply.status(400).send({ error: 'Bitte Linear API-Key oder einen JSON-Export angeben.' });
    }

    try {
      const rawIssues = apiKey?.trim()
        ? await fetchLinearIssuesFromApi({ apiKey, teamKey, includeCompleted })
        : normalizeLinearExportItems(exportJson);
      const columns = getProjectColumns(project.columns);

      const issues = rawIssues.map((item: any) => {
        const labels = extractLinearLabels(item);
        return {
          externalKey: String(item.identifier || item.id || item.key || ''),
          title: String(item.title || ''),
          status: mapLinearStatus(item.state || item.status, columns),
          priority: mapLinearPriority(item.priority),
          type: inferTypeFromLabels(labels),
          labels,
          projectName: item.project?.name || null,
          url: item.url || null,
        };
      });

      return { total: issues.length, issues };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Linear-Daten konnten nicht geladen werden.' });
    }
  });

  // Sync Linear Issues into Kanso (idempotent via externalSource='linear' + externalKey)
  app.post('/api/projects/:projectId/import/linear/sync', async (request: FastifyRequest<{
    Params: { projectId: string };
    Body: {
      apiKey?: string;
      teamKey?: string;
      includeCompleted?: boolean;
      exportJson?: string | any[];
      importProjectsAsGoals?: boolean;
    };
  }>, reply: FastifyReply) => {
    const project = await prisma.project.findUnique({ where: { id: request.params.projectId } });
    if (!project) return reply.status(404).send({ error: 'Projekt nicht gefunden.' });

    const { apiKey, teamKey, includeCompleted, exportJson } = request.body || {};
    const importProjects = request.body?.importProjectsAsGoals !== false;

    if (!apiKey?.trim() && !exportJson) {
      return reply.status(400).send({ error: 'Bitte Linear API-Key oder einen JSON-Export angeben.' });
    }

    try {
      const rawIssues = apiKey?.trim()
        ? await fetchLinearIssuesFromApi({ apiKey, teamKey, includeCompleted })
        : normalizeLinearExportItems(exportJson);
      const columns = getProjectColumns(project.columns);

      let created = 0;
      let updated = 0;
      let goalsCreated = 0;
      let goalsUpdated = 0;
      const goalCache = new Map<string, string>();

      for (const item of rawIssues) {
        if (!item?.title?.trim()) continue;
        const extKey = String(item.identifier || item.id || item.key || '').trim();
        if (!extKey) continue;

        const labels = extractLinearLabels(item);
        let goalId: string | null = null;
        if (importProjects && item.project?.name) {
          const pKey = String(item.project.id || item.project.name);
          if (goalCache.has(pKey)) {
            goalId = goalCache.get(pKey)!;
          } else {
            const goalRes = await upsertExternalGoal(
              prisma,
              project.id,
              {
                externalSource: 'linear-project',
                externalKey: pKey,
                title: String(item.project.name).trim(),
                description: item.project.description || null,
                status: item.project.state === 'completed' ? GoalStatus.COMPLETED : GoalStatus.ACTIVE,
                targetDate: item.project.targetDate ? new Date(item.project.targetDate) : null,
              },
              broadcastEvent
            );
            goalId = goalRes.goalId;
            goalCache.set(pKey, goalId);
            if (goalRes.outcome === 'created') goalsCreated += 1;
            else goalsUpdated += 1;
          }
        }

        const mapped: MappedExternalIssue = {
          externalSource: 'linear',
          externalKey: extKey,
          externalUrl: item.url || null,
          title: String(item.title).trim(),
          description: item.description || null,
          status: mapLinearStatus(item.state || item.status, columns),
          priority: mapLinearPriority(item.priority),
          type: inferTypeFromLabels(labels),
          labels,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          goalId,
        };

        const outcome = await upsertExternalIssue(prisma, project, mapped, 'Linear Import', broadcastEvent);
        if (outcome === 'created') created += 1;
        else updated += 1;
      }

      return {
        created,
        updated,
        goalsCreated,
        goalsUpdated,
        total: rawIssues.length,
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Linear-Import fehlgeschlagen.' });
    }
  });
}
