import { PrismaClient, IssuePriority, IssueType, AssigneeType, AgentRunStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_COLUMNS = [
  { id: 'BACKLOG', title: 'Backlog', color: 'border-zinc-700/60' },
  { id: 'TODO', title: 'To Do', color: 'border-blue-500/40' },
  { id: 'IN_PROGRESS', title: 'In Progress', color: 'border-amber-500/40' },
  { id: 'IN_REVIEW', title: 'In Review', color: 'border-purple-500/40' },
  { id: 'DONE', title: 'Done', color: 'border-emerald-500/40' },
];

async function main() {
  console.log('🌱 Seeding Kanso v1.0 database...');

  // Clean existing tables in proper order
  await prisma.activityLog.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Default Users (Admin, Member, Viewer)
  const passwordHash = await bcrypt.hash('password123', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'alex.admin@kanso.local',
      name: 'Alex Rivera',
      password: passwordHash,
      role: UserRole.ADMIN,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    },
  });

  const memberUser = await prisma.user.create({
    data: {
      email: 'sarah.dev@kanso.local',
      name: 'Sarah Chen',
      password: passwordHash,
      role: UserRole.MEMBER,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
    },
  });

  const viewerUser = await prisma.user.create({
    data: {
      email: 'kevin.viewer@kanso.local',
      name: 'Kevin Vance',
      password: passwordHash,
      role: UserRole.VIEWER,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
    },
  });

  console.log(`Created 3 users: Admin (${adminUser.email}), Member (${memberUser.email}), Viewer (${viewerUser.email})`);

  // 2. Create Workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Acme Software Labs',
      slug: 'acme-labs',
      description: 'Primary engineering workspace for core platform and autonomous agent workflows.',
    },
  });

  // 3. Create Projects
  const project1 = await prisma.project.create({
    data: {
      key: 'KAN',
      name: 'Kanso Platform Core',
      description: 'The Agent-First & MCP-Native Open Source Issue Tracking System',
      workspaceId: workspace.id,
      columns: DEFAULT_COLUMNS,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      key: 'OPS',
      name: 'Infrastructure & Cloud',
      description: 'Kubernetes, multi-region failover, and observability pipeline.',
      workspaceId: workspace.id,
      columns: DEFAULT_COLUMNS,
    },
  });

  console.log(`Created Projects: ${project1.name} (${project1.key}), ${project2.name} (${project2.key})`);

  // 4. Create Issues with Markdown descriptions and Activity Logs
  const issue1 = await prisma.issue.create({
    data: {
      identifier: 'KAN-1',
      number: 1,
      title: 'Design MCP Resource Schema for Issue Context',
      description: `### Goal & Acceptance Criteria
- [x] Define \`kanso://projects\` and \`kanso://issues\` resource endpoints.
- [x] Support SSE and Stdio transports out of the box.
- [x] Allow Claude Desktop and Cursor to inspect live sprint state.

> **Note**: Full spec is documented in \`docs/mcp-spec.md\`.`,
      status: 'DONE',
      priority: IssuePriority.HIGH,
      type: IssueType.STORY,
      assigneeType: AssigneeType.HUMAN,
      assigneeId: memberUser.id,
      assigneeName: memberUser.name,
      labels: ['mcp', 'protocol', 'architecture'],
      projectId: project1.id,
      comments: {
        create: [
          {
            authorType: AssigneeType.HUMAN,
            authorName: memberUser.name,
            content: 'Initial specification drafted and verified with `@modelcontextprotocol/sdk`.',
          },
        ],
      },
      activities: {
        create: [
          {
            actorType: 'HUMAN',
            actorName: adminUser.name,
            action: 'CREATED',
            details: 'Created issue KAN-1',
          },
          {
            actorType: 'HUMAN',
            actorName: memberUser.name,
            action: 'STATUS_CHANGED',
            details: 'Changed status from IN_PROGRESS to DONE',
          },
        ],
      },
    },
  });

  const issue2 = await prisma.issue.create({
    data: {
      identifier: 'KAN-2',
      number: 2,
      title: 'Automate PR triage and task breakdown via Agentic MCP hook',
      description: `### Problem Statement
Human triage of incoming PRs is slow and takes away deep focus time.

### Automated Agent Requirements
1. **Analyze PR diff** using git and semantic code analyzer.
2. **Decompose complex user stories** into granular tasks with \`kanso_create_issue\`.
3. **Report progress** back to the board via comment.

\`\`\`typescript
const agent = new AgenticTriageBot({ model: 'claude-3-7-sonnet' });
await agent.execute('KAN-2');
\`\`\``,
      status: 'IN_PROGRESS',
      priority: IssuePriority.URGENT,
      type: IssueType.TASK,
      assigneeType: AssigneeType.AGENT,
      assigneeName: 'agent-triage-v1',
      labels: ['agentic', 'automation', 'mcp'],
      projectId: project1.id,
      agentMetadata: {
        agentId: 'agent-triage-v1',
        capabilities: ['git-diff', 'auto-label', 'subtask-decomposition'],
      },
      comments: {
        create: [
          {
            authorType: AssigneeType.AGENT,
            authorName: 'agent-triage-v1',
            content: '🤖 Analyzed repo requirements: 3 sub-tasks decomposed and linked. Commencing verification pass.',
          },
        ],
      },
      activities: {
        create: [
          {
            actorType: 'HUMAN',
            actorName: adminUser.name,
            action: 'CREATED',
            details: 'Created issue KAN-2',
          },
          {
            actorType: 'AGENT',
            actorName: 'agent-triage-v1',
            action: 'ASSIGNED',
            details: 'Assigned to agent-triage-v1 and status set to IN_PROGRESS',
          },
        ],
      },
      agentRuns: {
        create: [
          {
            agentName: 'agent-triage-v1',
            agentModel: 'claude-3-7-sonnet',
            status: AgentRunStatus.RUNNING,
            prompt: 'Decompose KAN-2 into verifiable unit and integration milestones.',
            startedAt: new Date(),
          },
        ],
      },
    },
  });

  const issue3 = await prisma.issue.create({
    data: {
      identifier: 'KAN-3',
      number: 3,
      title: 'Implement Dark Mode Minimalist Zen UI (Linear & Japanese Aesthetics)',
      description: `### Design Principles
- **No Clutter**: Every element must have a clear purpose.
- **Keyboard First**: Full navigation via \`Cmd+K\`, \`C\` (create), \`B\` (board), \`L\` (list).
- **Fast Views**: Instant toggle between Kanban Drag & Drop and compact Table List view.`,
      status: 'TODO',
      priority: IssuePriority.MEDIUM,
      type: IssueType.STORY,
      assigneeType: AssigneeType.HUMAN,
      assigneeId: memberUser.id,
      assigneeName: memberUser.name,
      labels: ['ui', 'zen', 'performance'],
      projectId: project1.id,
      activities: {
        create: [
          {
            actorType: 'HUMAN',
            actorName: memberUser.name,
            action: 'CREATED',
            details: 'Created issue KAN-3',
          },
        ],
      },
    },
  });

  const issue4 = await prisma.issue.create({
    data: {
      identifier: 'KAN-4',
      number: 4,
      title: 'Docker Compose One-Click Deployment Pipeline',
      description: 'Package PostgreSQL, Redis, Fastify API, MCP Server, and Nginx Web UI cleanly with production ready Dockerfiles.',
      status: 'DONE',
      priority: IssuePriority.HIGH,
      type: IssueType.TASK,
      assigneeType: AssigneeType.HUMAN,
      assigneeId: adminUser.id,
      assigneeName: adminUser.name,
      labels: ['docker', 'infrastructure'],
      projectId: project1.id,
      activities: {
        create: [
          {
            actorType: 'HUMAN',
            actorName: adminUser.name,
            action: 'CREATED',
            details: 'Created issue KAN-4',
          },
          {
            actorType: 'HUMAN',
            actorName: adminUser.name,
            action: 'STATUS_CHANGED',
            details: 'Moved to DONE',
          },
        ],
      },
    },
  });

  const issue5 = await prisma.issue.create({
    data: {
      identifier: 'OPS-1',
      number: 1,
      title: 'Configure automated PostgreSQL WAL archiving & Redis persistence',
      description: 'Setup continuous point-in-time recovery (PITR) for production databases.',
      status: 'TODO',
      priority: IssuePriority.HIGH,
      type: IssueType.TASK,
      assigneeType: AssigneeType.HUMAN,
      assigneeId: adminUser.id,
      assigneeName: adminUser.name,
      labels: ['database', 'ops'],
      projectId: project2.id,
      activities: {
        create: [
          {
            actorType: 'HUMAN',
            actorName: adminUser.name,
            action: 'CREATED',
            details: 'Created issue OPS-1',
          },
        ],
      },
    },
  });

  console.log(`Seeded issues: ${issue1.identifier}, ${issue2.identifier}, ${issue3.identifier}, ${issue4.identifier}, ${issue5.identifier}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
