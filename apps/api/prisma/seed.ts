import { PrismaClient, IssueStatus, IssuePriority, IssueType, AssigneeType, AgentRunStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Kanso database...');

  // Clean existing data
  await prisma.agentRun.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();

  // Create Default Project
  const project = await prisma.project.create({
    data: {
      key: 'KAN',
      name: 'Kanso Core Engine',
      description: 'The Agent-First & MCP-Native Open Source Issue Tracking System',
    },
  });

  console.log(`Created Project: ${project.name} (${project.key})`);

  // Create initial issues demonstrating Agentic workflows
  const issue1 = await prisma.issue.create({
    data: {
      identifier: 'KAN-1',
      number: 1,
      title: 'Design MCP Resource Schema for Issue Context',
      description: 'Model Context Protocol (MCP) clients require fast access to active issue schemas, board states, and linked code context.',
      status: IssueStatus.DONE,
      priority: IssuePriority.HIGH,
      type: IssueType.STORY,
      assigneeType: AssigneeType.HUMAN,
      assigneeName: 'Maurice',
      labels: ['mcp', 'protocol', 'architecture'],
      projectId: project.id,
      comments: {
        create: [
          {
            authorType: AssigneeType.HUMAN,
            authorName: 'Maurice',
            content: 'Initial spec defined under docs/mcp-spec.md.',
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
      description: 'When a new GitHub PR or issue is opened, trigger an autonomous agent to summarize changes, verify acceptance criteria, and update KAN issue state.',
      status: IssueStatus.IN_PROGRESS,
      priority: IssuePriority.URGENT,
      type: IssueType.TASK,
      assigneeType: AssigneeType.AGENT,
      assigneeName: 'agent-triage-v1',
      labels: ['agentic', 'automation', 'mcp'],
      projectId: project.id,
      agentMetadata: {
        agentId: 'agent-triage-v1',
        capabilities: ['git-diff', 'auto-label', 'subtask-decomposition'],
      },
      comments: {
        create: [
          {
            authorType: AssigneeType.AGENT,
            authorName: 'agent-triage-v1',
            content: '🤖 Analyzed repo requirements: 3 sub-tasks decomposed and linked.',
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
      description: 'Build a lightning fast React + Tailwind interface honoring Kanso (Simplicity/Clarity), zero bloat, high responsiveness.',
      status: IssueStatus.TODO,
      priority: IssuePriority.MEDIUM,
      type: IssueType.STORY,
      assigneeType: AssigneeType.HUMAN,
      assigneeName: 'Frontend Team',
      labels: ['ui', 'zen', 'performance'],
      projectId: project.id,
    },
  });

  const issue4 = await prisma.issue.create({
    data: {
      identifier: 'KAN-4',
      number: 4,
      title: 'Docker Compose One-Click Deployment Pipeline',
      description: 'Package PostgreSQL, Redis, Fastify API, MCP Server, and Nginx Web UI cleanly with production ready Dockerfiles.',
      status: IssueStatus.DONE,
      priority: IssuePriority.HIGH,
      type: IssueType.TASK,
      assigneeType: AssigneeType.HUMAN,
      assigneeName: 'DevOps',
      labels: ['docker', 'infrastructure'],
      projectId: project.id,
    },
  });

  console.log(`Seeded 4 issues: ${issue1.identifier}, ${issue2.identifier}, ${issue3.identifier}, ${issue4.identifier}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
