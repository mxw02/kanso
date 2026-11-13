export type UserRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  role: UserRole;
  createdAt: string;
}

export type IssueStatus = string; // Flexible custom status string or standard defaults: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED'

export type IssuePriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export type IssueType = 'TASK' | 'BUG' | 'STORY' | 'EPIC';

export type AssigneeType = 'HUMAN' | 'AGENT' | 'UNASSIGNED';

export type HitlState = 'NEEDS_CLARIFICATION' | 'PLAN_APPROVAL' | 'RISK_APPROVAL';
export type AgentLiveStatus = 'IDLE' | 'THINKING' | 'CODING' | 'TESTING' | 'BLOCKED' | 'AWAITING_HUMAN';
export type CiStatus = 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILURE';

export interface ProofOfWorkCheck {
  id: string;
  title: string;
  command?: string;
  status: 'PENDING' | 'PASSED' | 'FAILED';
  output?: string;
  updatedAt?: string;
}

export interface AgentTraceEvent {
  id: string;
  issueId: string;
  agentName: string;
  phase: 'THINKING' | 'TOOL_CALL' | 'FILE_EDIT' | 'TEST_RUN' | 'ERROR' | 'INFO';
  title: string;
  detail?: string | null;
  filePath?: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'INFO';
  tokensUsed?: number | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface StageAgentConfig {
  agentName: string;
  autoAssign: boolean;
  promptTemplate?: string;
}

export interface WorkflowCondition {
  requireNoOpenBlockers?: boolean;
  requireProofOfWorkPassed?: boolean;
  requireCiSuccess?: boolean;
  requireAssignee?: boolean;
  requireNoHitlPause?: boolean;
  minReadinessScore?: number;
  allowedActors?: ('HUMAN' | 'AGENT' | 'SYSTEM')[];
  allowedTypes?: IssueType[];
  requiredLabels?: string[];
}

export interface WorkflowTransitionRule {
  id: string;
  name?: string;
  from: string; // Stage ID or "*" for any
  to: string;   // Target Stage ID
  enabled: boolean;
  conditions: WorkflowCondition;
}

export interface ProjectWorkflowConfig {
  name: string;
  enforceStrictTransitions: boolean;
  transitions: WorkflowTransitionRule[];
}

export interface AgentReadinessResult {
  score: number;
  level: 'READY' | 'NEEDS_CONTEXT' | 'VAGUE';
  missing: string[];
  checks: {
    hasDescription: boolean;
    hasAcceptanceCriteria: boolean;
    hasTargetFiles: boolean;
    hasNoOpenBlockers: boolean;
  };
}

export interface StatusColumn {
  id: string;
  title: string;
  color?: string;
  order?: number;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  createdAt: string;
  projects?: Project[];
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  workspaceId?: string | null;
  columns: StatusColumn[];
  stageAgents?: Record<string, StageAgentConfig> | null;
  workflowRules?: ProjectWorkflowConfig | null;
  gitProvider?: string | null;
  gitRepo?: string | null;
  gitBranch?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    issues: number;
  };
}

export interface ActivityLog {
  id: string;
  issueId: string;
  actorType: 'HUMAN' | 'AGENT' | 'SYSTEM';
  actorName: string;
  action: 'CREATED' | 'STATUS_CHANGED' | 'PRIORITY_CHANGED' | 'ASSIGNED' | 'UPDATED' | 'COMMENTED';
  details: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  issueId: string;
  authorType: 'HUMAN' | 'AGENT';
  authorName: string;
  content: string;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  issueId: string;
  agentName: string;
  agentModel?: string | null;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  prompt?: string | null;
  resultSummary?: string | null;
  tokensUsed?: number | null;
  startedAt: string;
  endedAt?: string | null;
}

export interface Issue {
  id: string;
  identifier: string; // e.g. "KAN-42"
  number: number;
  title: string;
  description?: string | null;
  status: string;
  priority: IssuePriority;
  type: IssueType;
  assigneeType: AssigneeType;
  assigneeId?: string | null;
  assigneeName?: string | null;
  projectId: string;
  project?: {
    id: string;
    key: string;
    name: string;
  };
  parentId?: string | null;
  subIssues?: Issue[];
  labels: string[];
  agentMetadata?: Record<string, unknown> | null;
  hitlState?: HitlState | null;
  hitlPrompt?: string | null;
  hitlResponse?: string | null;
  agentStatus?: AgentLiveStatus | null;
  proofOfWork?: ProofOfWorkCheck[] | null;
  ciStatus?: CiStatus | null;
  previewUrl?: string | null;
  previewScreenshotUrl?: string | null;
  targetFiles?: string[];
  comments?: Comment[];
  activities?: ActivityLog[];
  agentRuns?: AgentRun[];
  traceEvents?: AgentTraceEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueInput {
  projectId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: IssuePriority;
  type?: IssueType;
  assigneeType?: AssigneeType;
  assigneeId?: string;
  assigneeName?: string;
  parentId?: string;
  labels?: string[];
  agentMetadata?: Record<string, unknown>;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: string;
  priority?: IssuePriority;
  type?: IssueType;
  assigneeType?: AssigneeType;
  assigneeId?: string;
  assigneeName?: string;
  labels?: string[];
  agentMetadata?: Record<string, unknown>;
}

export interface CreateCommentInput {
  authorType: 'HUMAN' | 'AGENT';
  authorName: string;
  content: string;
}

/**
 * Computes an Agent-Readiness Score (0-100) for an issue before an agent picks it up.
 */
export function computeAgentReadiness(input: {
  title?: string | null;
  description?: string | null;
  proofOfWork?: ProofOfWorkCheck[] | null;
  targetFiles?: string[] | null;
  hasOpenBlockers?: boolean;
}): AgentReadinessResult {
  const desc = (input.description || '').trim();
  const hasDescription = desc.length >= 30;
  const hasAcceptanceCriteria =
    (Array.isArray(input.proofOfWork) && input.proofOfWork.length > 0) ||
    /(akzeptanz|acceptance|kriterien|criteria|given|when|then|- \[ \]|test|verify)/i.test(desc);
  const hasTargetFiles = Array.isArray(input.targetFiles) && input.targetFiles.length > 0;
  const hasNoOpenBlockers = !input.hasOpenBlockers;

  let score = 15; // Base score for having a title
  if (hasDescription) score += 30;
  else if (desc.length > 0) score += 10;
  if (hasAcceptanceCriteria) score += 30;
  if (hasTargetFiles) score += 15;
  if (hasNoOpenBlockers) score += 10;

  const missing: string[] = [];
  if (!hasDescription) missing.push('Ausführliche Beschreibung (mind. 30 Zeichen) fehlt');
  if (!hasAcceptanceCriteria) missing.push('Akzeptanzkriterien / Proof-of-Work Checks fehlen');
  if (!hasTargetFiles) missing.push('Ziel-Dateien oder betroffene Module nicht angegeben');
  if (!hasNoOpenBlockers) missing.push('Offene Blocker verhindern autonomen Start');

  const level: AgentReadinessResult['level'] =
    score >= 75 && hasNoOpenBlockers ? 'READY' : score >= 45 ? 'NEEDS_CONTEXT' : 'VAGUE';

  return {
    score: Math.min(100, score),
    level,
    missing,
    checks: {
      hasDescription,
      hasAcceptanceCriteria,
      hasTargetFiles,
      hasNoOpenBlockers,
    },
  };
}
