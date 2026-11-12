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
  comments?: Comment[];
  activities?: ActivityLog[];
  agentRuns?: AgentRun[];
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
