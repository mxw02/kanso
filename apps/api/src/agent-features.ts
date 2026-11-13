import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient, AssigneeType } from '@prisma/client';
import {
  computeAgentReadiness,
  ProjectWorkflowConfig,
  ProofOfWorkCheck,
  StageAgentConfig,
  WorkflowTransitionRule,
} from '@kanso/shared';

type BroadcastFn = (event: string, data: unknown) => void;

const CLOSED_STATUSES = new Set(['DONE', 'CANCELLED']);

/**
 * Returns all open blocking issues for the given issueId (1F).
 */
export async function getOpenBlockers(prisma: PrismaClient, issueId: string) {
  const [incomingBlocks, outgoingBlockedBy] = await Promise.all([
    prisma.issueRelation.findMany({
      where: { targetIssueId: issueId, type: 'BLOCKS' },
      include: {
        sourceIssue: {
          select: { id: true, identifier: true, title: true, status: true, priority: true },
        },
      },
    }),
    prisma.issueRelation.findMany({
      where: { sourceIssueId: issueId, type: 'IS_BLOCKED_BY' },
      include: {
        targetIssue: {
          select: { id: true, identifier: true, title: true, status: true, priority: true },
        },
      },
    }),
  ]);

  const blockers = [
    ...incomingBlocks.map((r) => r.sourceIssue),
    ...outgoingBlockedBy.map((r) => r.targetIssue),
  ].filter((b) => !CLOSED_STATUSES.has(b.status.toUpperCase()));

  const seen = new Set<string>();
  return blockers.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

/**
 * Checks downstream issues blocked by `resolvedIssueId` and notifies when all blockers are resolved (1F).
 */
export async function notifyUnblockedDependents(
  prisma: PrismaClient,
  broadcastEvent: BroadcastFn,
  resolvedIssueId: string,
  resolvedIdentifier: string
) {
  const [outgoingBlocks, incomingBlockedBy] = await Promise.all([
    prisma.issueRelation.findMany({
      where: { sourceIssueId: resolvedIssueId, type: 'BLOCKS' },
      select: { targetIssueId: true },
    }),
    prisma.issueRelation.findMany({
      where: { targetIssueId: resolvedIssueId, type: 'IS_BLOCKED_BY' },
      select: { sourceIssueId: true },
    }),
  ]);

  const dependentIds = Array.from(
    new Set([
      ...outgoingBlocks.map((r) => r.targetIssueId),
      ...incomingBlockedBy.map((r) => r.sourceIssueId),
    ])
  );

  for (const depId of dependentIds) {
    const remaining = await getOpenBlockers(prisma, depId);
    if (remaining.length === 0) {
      const depIssue = await prisma.issue.findUnique({ where: { id: depId } });
      if (!depIssue || CLOSED_STATUSES.has(depIssue.status.toUpperCase())) continue;

      await prisma.activityLog.create({
        data: {
          issueId: depId,
          actorType: 'SYSTEM',
          actorName: 'Dependency Graph',
          action: 'UPDATED',
          details: `Blocker ${resolvedIdentifier} wurde abgeschlossen — Ticket ist jetzt frei für Agenten-Bearbeitung.`,
        },
      });
      broadcastEvent('issue_unblocked', {
        issueId: depId,
        identifier: depIssue.identifier,
        unblockedBy: resolvedIdentifier,
      });
    }
  }
}

/**
 * Validates Proof-of-Work checks when an agent tries to move an issue to DONE (1E).
 */
export function validateProofOfWorkGate(
  proofOfWorkRaw: unknown,
  targetStatus: string | undefined,
  actorType: string,
  forceDone?: boolean
): string | null {
  if (!targetStatus || targetStatus.toUpperCase() !== 'DONE') return null;
  if (forceDone && actorType !== 'AGENT') return null;

  const checks = Array.isArray(proofOfWorkRaw) ? (proofOfWorkRaw as ProofOfWorkCheck[]) : [];
  if (checks.length === 0) return null;

  const incomplete = checks.filter((c) => c.status !== 'PASSED');
  if (incomplete.length > 0 && (actorType === 'AGENT' || !forceDone)) {
    const names = incomplete.map((c) => `"${c.title}" (${c.status})`).join(', ');
    return `Proof-of-Work Gate: ${incomplete.length} Check(s) noch nicht PASSED (${names}).`;
  }
  return null;
}

/**
 * Evaluates Stage-Based Multi-Agent Pipeline auto-handoff when status changes (2.1).
 */
export function resolveStageHandoff(
  stageAgentsRaw: unknown,
  newStatus: string
): StageAgentConfig | null {
  if (!stageAgentsRaw || typeof stageAgentsRaw !== 'object') return null;
  const map = stageAgentsRaw as Record<string, StageAgentConfig>;
  const cfg = map[newStatus];
  if (cfg && cfg.autoAssign && cfg.agentName?.trim()) {
    return cfg;
  }
  return null;
}

/**
 * Evaluates a workflow transition rule's conditions against an issue.
 */
async function evaluateTransitionRule(
  prisma: PrismaClient,
  rule: WorkflowTransitionRule,
  issue: any,
  actorType: string,
  openBlockersCache?: { value?: any[] }
): Promise<string[]> {
  const errors: string[] = [];
  const cond = rule.conditions || {};

  if (cond.allowedActors && cond.allowedActors.length > 0) {
    if (!cond.allowedActors.includes(actorType as any)) {
      errors.push(`Akteur '${actorType}' darf diesen Übergang nicht ausführen (erlaubt: ${cond.allowedActors.join(', ')}).`);
    }
  }

  if (cond.allowedTypes && cond.allowedTypes.length > 0) {
    if (!cond.allowedTypes.includes(issue.type)) {
      errors.push(`Ticket-Typ '${issue.type}' ist für diesen Übergang nicht zugelassen (erlaubt: ${cond.allowedTypes.join(', ')}).`);
    }
  }

  if (cond.requiredLabels && cond.requiredLabels.length > 0) {
    const issueLabels = new Set((issue.labels || []).map((l: string) => l.toLowerCase()));
    const missingLabels = cond.requiredLabels.filter((l) => !issueLabels.has(l.toLowerCase()));
    if (missingLabels.length > 0) {
      errors.push(`Fehlende Labels: ${missingLabels.join(', ')}.`);
    }
  }

  if (cond.requireAssignee && (!issue.assigneeType || issue.assigneeType === 'UNASSIGNED')) {
    errors.push('Ticket muss zuerst einem Menschen oder Agenten zugewiesen werden.');
  }

  if (cond.requireNoHitlPause && (issue.hitlState || issue.agentStatus === 'AWAITING_HUMAN')) {
    errors.push(`Offene HITL-Entscheidung (${issue.hitlState || 'AWAITING_HUMAN'}) muss zuerst geklärt werden.`);
  }

  if (cond.requireCiSuccess && issue.ciStatus !== 'SUCCESS') {
    errors.push(`CI-Status muss 'SUCCESS' sein (aktuell: ${issue.ciStatus || 'NONE'}).`);
  }

  if (cond.requireProofOfWorkPassed) {
    const checks = Array.isArray(issue.proofOfWork) ? (issue.proofOfWork as ProofOfWorkCheck[]) : [];
    const incomplete = checks.filter((c) => c.status !== 'PASSED');
    if (checks.length === 0) {
      errors.push('Mindestens ein Proof-of-Work Check muss definiert und PASSED sein.');
    } else if (incomplete.length > 0) {
      errors.push(`${incomplete.length} Proof-of-Work Check(s) sind noch nicht PASSED.`);
    }
  }

  if (cond.requireNoOpenBlockers || (cond.minReadinessScore !== undefined && cond.minReadinessScore > 0)) {
    const blockers =
      openBlockersCache?.value ?? (await getOpenBlockers(prisma, issue.id));
    if (openBlockersCache) openBlockersCache.value = blockers;

    if (cond.requireNoOpenBlockers && blockers.length > 0) {
      errors.push(`Offene Blocker verhindern den Übergang: ${blockers.map((b) => b.identifier).join(', ')}.`);
    }

    if (cond.minReadinessScore !== undefined && cond.minReadinessScore > 0) {
      const readiness = computeAgentReadiness({
        title: issue.title,
        description: issue.description,
        proofOfWork: issue.proofOfWork as ProofOfWorkCheck[] | null,
        targetFiles: issue.targetFiles,
        hasOpenBlockers: blockers.length > 0,
      });
      if (readiness.score < cond.minReadinessScore) {
        errors.push(`Agent-Readiness Score (${readiness.score}%) liegt unter dem Minimum (${cond.minReadinessScore}%).`);
      }
    }
  }

  return errors;
}

/**
 * Validates whether an issue may transition to `targetStatus` under project workflow rules.
 */
export async function validateWorkflowTransition(
  prisma: PrismaClient,
  workflowRulesRaw: unknown,
  issue: any,
  targetStatus: string,
  actorType: string
): Promise<string | null> {
  if (!workflowRulesRaw || typeof workflowRulesRaw !== 'object') return null;
  const wf = workflowRulesRaw as ProjectWorkflowConfig;
  const transitions = Array.isArray(wf.transitions) ? wf.transitions.filter((t) => t.enabled !== false) : [];
  if (transitions.length === 0 && !wf.enforceStrictTransitions) return null;

  const fromUpper = issue.status.toUpperCase();
  const toUpper = targetStatus.toUpperCase();
  const matching = transitions.filter(
    (t) =>
      (t.from.toUpperCase() === fromUpper || t.from === '*') &&
      t.to.toUpperCase() === toUpper
  );

  if (matching.length === 0) {
    if (wf.enforceStrictTransitions) {
      return `Workflow "${wf.name || 'Standard'}": Übergang von '${issue.status}' nach '${targetStatus}' ist nicht erlaubt.`;
    }
    return null;
  }

  const cache: { value?: any[] } = {};
  const allRuleErrors: string[][] = [];
  for (const rule of matching) {
    const errs = await evaluateTransitionRule(prisma, rule, issue, actorType, cache);
    if (errs.length === 0) return null; // At least one matching transition rule passes!
    allRuleErrors.push(errs);
  }

  const firstErrs = allRuleErrors[0] || [];
  return `Workflow-Regel (${issue.status} → ${targetStatus}): ${firstErrs.join(' ')}`;
}

/**
 * Helper to resolve issue by UUID or identifier (e.g. KAN-12).
 */
async function findIssueByIdOrIdentifier(prisma: PrismaClient, idOrIdentifier: string) {
  return prisma.issue.findFirst({
    where: {
      OR: [{ id: idOrIdentifier }, { identifier: idOrIdentifier.toUpperCase() }],
    },
  });
}

export function registerAgentFeatureRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  broadcastEvent: BroadcastFn
) {
  // 1B: HITL Needs-Attention Inbox
  app.get(
    '/api/hitl/inbox',
    async (request: FastifyRequest<{ Querystring: { projectId?: string } }>) => {
      const { projectId } = request.query;
      return prisma.issue.findMany({
        where: {
          ...(projectId ? { projectId } : {}),
          OR: [{ hitlState: { not: null } }, { agentStatus: 'AWAITING_HUMAN' }],
        },
        include: {
          project: { select: { id: true, key: true, name: true } },
          traceEvents: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }
  );

  // 1B: Agent requests human clarification / plan approval / risk approval
  app.post(
    '/api/issues/:id/hitl/request',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          hitlState: 'NEEDS_CLARIFICATION' | 'PLAN_APPROVAL' | 'RISK_APPROVAL';
          hitlPrompt: string;
          agentName?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const existing = await findIssueByIdOrIdentifier(prisma, request.params.id);
      if (!existing) return reply.status(404).send({ error: 'Issue not found' });

      const { hitlState, hitlPrompt, agentName } = request.body;
      const actor = agentName || existing.assigneeName || 'AI Agent';

      const updated = await prisma.issue.update({
        where: { id: existing.id },
        data: {
          hitlState,
          hitlPrompt,
          hitlResponse: null,
          agentStatus: 'AWAITING_HUMAN',
          activities: {
            create: {
              actorType: 'AGENT',
              actorName: actor,
              action: 'UPDATED',
              details: `HITL Gate (${hitlState}): ${hitlPrompt}`,
            },
          },
          traceEvents: {
            create: {
              agentName: actor,
              phase: 'INFO',
              title: `Wartet auf Mensch (${hitlState})`,
              detail: hitlPrompt,
              status: 'RUNNING',
            },
          },
        },
        include: {
          project: true,
          traceEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
          activities: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      });

      broadcastEvent('issue_updated', updated);
      broadcastEvent('hitl_requested', { issueId: updated.id, identifier: updated.identifier, hitlState });
      return updated;
    }
  );

  // 1B: Human resolves HITL gate
  app.post(
    '/api/issues/:id/hitl/resolve',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          action: 'APPROVE' | 'REJECT' | 'ANSWER';
          response?: string;
          actorName?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const existing = await findIssueByIdOrIdentifier(prisma, request.params.id);
      if (!existing) return reply.status(404).send({ error: 'Issue not found' });

      const { action, response, actorName } = request.body;
      const humanName = actorName || 'User';
      const nextAgentStatus = action === 'REJECT' ? 'BLOCKED' : 'THINKING';
      const summaryText =
        action === 'APPROVE'
          ? `Freigegeben von ${humanName}${response ? `: ${response}` : ''}`
          : action === 'REJECT'
            ? `Abgelehnt von ${humanName}${response ? `: ${response}` : ''}`
            : `Antwort von ${humanName}: ${response || ''}`;

      const updated = await prisma.issue.update({
        where: { id: existing.id },
        data: {
          hitlState: null,
          hitlResponse: response || action,
          agentStatus: nextAgentStatus,
          comments: {
            create: {
              authorType: AssigneeType.HUMAN,
              authorName: humanName,
              content: `**HITL Entscheidung (${action}):** ${response || (action === 'APPROVE' ? 'Freigegeben' : 'Abgelehnt')}`,
            },
          },
          activities: {
            create: {
              actorType: 'HUMAN',
              actorName: humanName,
              action: 'UPDATED',
              details: summaryText,
            },
          },
          traceEvents: {
            create: {
              agentName: existing.assigneeName || 'AI Agent',
              phase: 'INFO',
              title: `Menschliche Entscheidung: ${action}`,
              detail: response || undefined,
              status: action === 'REJECT' ? 'FAILED' : 'SUCCESS',
            },
          },
        },
        include: {
          project: true,
          comments: { orderBy: { createdAt: 'asc' } },
          activities: { orderBy: { createdAt: 'desc' }, take: 10 },
          traceEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });

      broadcastEvent('issue_updated', updated);
      broadcastEvent('hitl_resolved', { issueId: updated.id, identifier: updated.identifier, action });
      return updated;
    }
  );

  // 1C: Get live execution trace events for an issue
  app.get(
    '/api/issues/:id/traces',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const existing = await findIssueByIdOrIdentifier(prisma, request.params.id);
      if (!existing) return reply.status(404).send({ error: 'Issue not found' });

      return prisma.agentTraceEvent.findMany({
        where: { issueId: existing.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    }
  );

  // 1C: Push a live execution trace event + optionally update agentStatus
  app.post(
    '/api/issues/:id/traces',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          agentName?: string;
          phase?: string;
          title: string;
          detail?: string;
          filePath?: string;
          status?: string;
          agentStatus?: string;
          tokensUsed?: number;
          durationMs?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const existing = await findIssueByIdOrIdentifier(prisma, request.params.id);
      if (!existing) return reply.status(404).send({ error: 'Issue not found' });

      const body = request.body;
      const trace = await prisma.agentTraceEvent.create({
        data: {
          issueId: existing.id,
          agentName: body.agentName || existing.assigneeName || 'AI Agent',
          phase: body.phase || 'INFO',
          title: body.title,
          detail: body.detail,
          filePath: body.filePath,
          status: body.status || 'INFO',
          tokensUsed: body.tokensUsed,
          durationMs: body.durationMs,
        },
      });

      if (body.agentStatus) {
        const updatedIssue = await prisma.issue.update({
          where: { id: existing.id },
          data: { agentStatus: body.agentStatus },
        });
        broadcastEvent('issue_updated', updatedIssue);
      }

      broadcastEvent('agent_trace_added', { issueId: existing.id, identifier: existing.identifier, trace });
      return reply.status(201).send(trace);
    }
  );

  // 1E: Update Proof-of-Work verification checks & CI status
  app.patch(
    '/api/issues/:id/proof-of-work',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          proofOfWork?: ProofOfWorkCheck[];
          ciStatus?: string;
          actorName?: string;
          actorType?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const existing = await findIssueByIdOrIdentifier(prisma, request.params.id);
      if (!existing) return reply.status(404).send({ error: 'Issue not found' });

      const { proofOfWork, ciStatus, actorName, actorType } = request.body;
      const passedCount = Array.isArray(proofOfWork)
        ? proofOfWork.filter((c) => c.status === 'PASSED').length
        : 0;
      const totalCount = Array.isArray(proofOfWork) ? proofOfWork.length : 0;

      const updated = await prisma.issue.update({
        where: { id: existing.id },
        data: {
          ...(proofOfWork !== undefined ? { proofOfWork: proofOfWork as any } : {}),
          ...(ciStatus !== undefined ? { ciStatus } : {}),
          activities: {
            create: {
              actorType: actorType || 'HUMAN',
              actorName: actorName || 'User',
              action: 'UPDATED',
              details:
                proofOfWork !== undefined
                  ? `Proof of Work aktualisiert (${passedCount}/${totalCount} Checks PASSED)`
                  : `CI Status aktualisiert: ${ciStatus}`,
            },
          },
        },
        include: {
          project: true,
          activities: { orderBy: { createdAt: 'desc' }, take: 10 },
          traceEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });

      broadcastEvent('issue_updated', updated);
      return updated;
    }
  );

  // 2.6: Set ephemeral preview environment URL & screenshot
  app.post(
    '/api/issues/:id/preview',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          previewUrl?: string | null;
          previewScreenshotUrl?: string | null;
          actorName?: string;
          actorType?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const existing = await findIssueByIdOrIdentifier(prisma, request.params.id);
      if (!existing) return reply.status(404).send({ error: 'Issue not found' });

      const { previewUrl, previewScreenshotUrl, actorName, actorType } = request.body;
      const updated = await prisma.issue.update({
        where: { id: existing.id },
        data: {
          ...(previewUrl !== undefined ? { previewUrl } : {}),
          ...(previewScreenshotUrl !== undefined ? { previewScreenshotUrl } : {}),
          activities: {
            create: {
              actorType: actorType || 'AGENT',
              actorName: actorName || existing.assigneeName || 'Preview Bot',
              action: 'UPDATED',
              details: previewUrl
                ? `Preview-Environment verknüpft: ${previewUrl}`
                : 'Preview-Environment aktualisiert',
            },
          },
        },
      });

      broadcastEvent('issue_updated', updated);
      return updated;
    }
  );

  // 2.2: Compute Agent-Readiness Score
  app.get(
    '/api/issues/:id/readiness',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const existing = await findIssueByIdOrIdentifier(prisma, request.params.id);
      if (!existing) return reply.status(404).send({ error: 'Issue not found' });

      const openBlockers = await getOpenBlockers(prisma, existing.id);
      return computeAgentReadiness({
        title: existing.title,
        description: existing.description,
        proofOfWork: existing.proofOfWork as unknown as ProofOfWorkCheck[] | null,
        targetFiles: existing.targetFiles,
        hasOpenBlockers: openBlockers.length > 0,
      });
    }
  );

  // Workflow Management: Get project workflow
  app.get(
    '/api/projects/:id/workflow',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const project = await prisma.project.findFirst({
        where: { OR: [{ id }, { key: id.toUpperCase() }] },
      });
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const columns = Array.isArray(project.columns) ? project.columns : [];
      const workflow = (project.workflowRules as unknown as ProjectWorkflowConfig | null) || {
        name: 'Standard Workflow',
        enforceStrictTransitions: false,
        transitions: [],
      };

      return {
        projectId: project.id,
        projectKey: project.key,
        columns,
        workflow,
      };
    }
  );

  // Workflow Management: Create or update project workflow (UI & MCP)
  app.put(
    '/api/projects/:id/workflow',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: ProjectWorkflowConfig;
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const project = await prisma.project.findFirst({
        where: { OR: [{ id }, { key: id.toUpperCase() }] },
      });
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const body = request.body;
      const sanitized: ProjectWorkflowConfig = {
        name: (body.name || 'Custom Workflow').trim(),
        enforceStrictTransitions: Boolean(body.enforceStrictTransitions),
        transitions: Array.isArray(body.transitions)
          ? body.transitions.map((t, idx) => ({
              id: t.id || `rule-${Date.now()}-${idx}`,
              name: t.name?.trim() || undefined,
              from: String(t.from || '*').toUpperCase(),
              to: String(t.to || 'DONE').toUpperCase(),
              enabled: t.enabled !== false,
              conditions: t.conditions || {},
            }))
          : [],
      };

      const updated = await prisma.project.update({
        where: { id: project.id },
        data: { workflowRules: sanitized as any },
      });

      broadcastEvent('project_updated', updated);
      return {
        projectId: updated.id,
        projectKey: updated.key,
        workflow: sanitized,
      };
    }
  );

  // Workflow Management: Check allowed transitions for a specific issue
  app.get(
    '/api/issues/:id/allowed-transitions',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { actorType?: string };
      }>,
      reply: FastifyReply
    ) => {
      const existing = await prisma.issue.findFirst({
        where: { OR: [{ id: request.params.id }, { identifier: request.params.id.toUpperCase() }] },
        include: { project: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Issue not found' });

      const actorType = (request.query.actorType || 'AGENT').toUpperCase();
      const columns = Array.isArray(existing.project?.columns)
        ? (existing.project.columns as { id: string; title: string }[])
        : [
            { id: 'BACKLOG', title: 'Backlog' },
            { id: 'TODO', title: 'Todo' },
            { id: 'IN_PROGRESS', title: 'In Progress' },
            { id: 'IN_REVIEW', title: 'In Review' },
            { id: 'DONE', title: 'Done' },
          ];

      const results = await Promise.all(
        columns
          .filter((col) => col.id.toUpperCase() !== existing.status.toUpperCase())
          .map(async (col) => {
            const reason = await validateWorkflowTransition(
              prisma,
              existing.project?.workflowRules,
              existing,
              col.id,
              actorType
            );
            return {
              targetStatus: col.id,
              title: col.title,
              allowed: reason === null,
              reason,
            };
          })
      );

      return {
        identifier: existing.identifier,
        currentStatus: existing.status,
        actorType,
        transitions: results,
      };
    }
  );
}
