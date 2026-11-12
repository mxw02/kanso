export type IssueStatus =
  | 'BACKLOG'
  | 'TODO'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'DONE'
  | 'CANCELLED';

export type IssuePriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export type IssueType = 'TASK' | 'BUG' | 'STORY' | 'EPIC';

export type AssigneeType = 'HUMAN' | 'AGENT' | 'UNASSIGNED';

export interface Project {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface Comment {
  id: string;
  issueId: string;
  authorType: 'HUMAN' | 'AGENT';
  authorName: string;
  content: string;
  createdAt: string;
}

export interface Issue {
  id: string;
  identifier: string; // e.g. "KAN-42"
  title: string;
  description?: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  type: IssueType;
  assigneeType: AssigneeType;
  assigneeName?: string | null;
  projectId: string;
  projectKey: string;
  parentId?: string | null;
  labels: string[];
  agentMetadata?: Record<string, unknown> | null;
  comments?: Comment[];
  agentRuns?: AgentRun[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueInput {
  projectId: string;
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  type?: IssueType;
  assigneeType?: AssigneeType;
  assigneeName?: string;
  parentId?: string;
  labels?: string[];
  agentMetadata?: Record<string, unknown>;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  type?: IssueType;
  assigneeType?: AssigneeType;
  assigneeName?: string;
  labels?: string[];
  agentMetadata?: Record<string, unknown>;
}

export interface CreateCommentInput {
  authorType: 'HUMAN' | 'AGENT';
  authorName: string;
  content: string;
}
