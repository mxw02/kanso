import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.KANSO_API_URL || process.env.API_BASE_URL || 'http://localhost:4000';
const MCP_PORT = parseInt(process.env.MCP_PORT || '3001', 10);
const MCP_TRANSPORT = process.env.MCP_TRANSPORT || 'sse'; // 'sse' or 'stdio'

// Helper for making API calls to Kanso backend
async function fetchApi(path: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kanso API Error (${response.status}): ${errorText}`);
  }

  return response.json();
}

function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'kanso-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // 1. LIST TOOLS
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'kanso_list_projects',
          description: 'Get all available projects in Kanso with project keys and issue counts.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'kanso_list_issues',
          description: 'Search and filter issues in Kanso by status, priority, assignee, or search term.',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Filter by project key (e.g. KAN)' },
              status: {
                type: 'string',
                enum: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'],
                description: 'Filter by issue status',
              },
              priority: {
                type: 'string',
                enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'],
                description: 'Filter by priority',
              },
              assigneeType: {
                type: 'string',
                enum: ['HUMAN', 'AGENT', 'UNASSIGNED'],
                description: 'Filter by assignee type',
              },
              search: { type: 'string', description: 'Text search in title and description' },
            },
          },
        },
        {
          name: 'kanso_get_issue',
          description: 'Retrieve full details of an issue by identifier (e.g. KAN-1), including comments, sub-tasks, and agent runs.',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: { type: 'string', description: 'Issue identifier (e.g. KAN-1 or UUID)' },
            },
            required: ['identifier'],
          },
        },
        {
          name: 'kanso_create_issue',
          description: 'Create a new issue, task, bug, or sub-task in Kanso with agentic context.',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Project key (e.g. KAN). Defaults to first active project if omitted.' },
              title: { type: 'string', description: 'Title of the issue' },
              description: { type: 'string', description: 'Detailed issue description / instructions / acceptance criteria' },
              type: {
                type: 'string',
                enum: ['TASK', 'BUG', 'STORY', 'EPIC'],
                description: 'Type of issue (default: TASK)',
              },
              priority: {
                type: 'string',
                enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'],
                description: 'Priority (default: MEDIUM)',
              },
              assigneeType: {
                type: 'string',
                enum: ['HUMAN', 'AGENT', 'UNASSIGNED'],
                description: 'Assignee type (default: AGENT if agent is creating for itself, or UNASSIGNED)',
              },
              assigneeName: { type: 'string', description: 'Name of the human or agent assignee' },
              labels: {
                type: 'array',
                items: { type: 'string' },
                description: 'Labels/tags (e.g. ["agentic", "frontend"])',
              },
              parentId: { type: 'string', description: 'Parent issue ID or identifier if this is a subtask' },
            },
            required: ['title'],
          },
        },
        {
          name: 'kanso_update_issue',
          description: 'Update an existing issue status, priority, assignee, or labels.',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: { type: 'string', description: 'Issue identifier (e.g. KAN-1)' },
              status: {
                type: 'string',
                enum: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'],
                description: 'New issue status',
              },
              priority: {
                type: 'string',
                enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'],
                description: 'New priority level',
              },
              assigneeType: {
                type: 'string',
                enum: ['HUMAN', 'AGENT', 'UNASSIGNED'],
              },
              assigneeName: { type: 'string', description: 'Assignee name' },
              labels: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['identifier'],
          },
        },
        {
          name: 'kanso_add_comment',
          description: 'Add a comment or progress update to an issue (signed as human or agent).',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: { type: 'string', description: 'Issue identifier (e.g. KAN-1)' },
              content: { type: 'string', description: 'Markdown content of the comment' },
              authorName: { type: 'string', description: 'Name of the agent or user posting' },
              authorType: {
                type: 'string',
                enum: ['HUMAN', 'AGENT'],
                description: 'Whether the author is a human or an AI agent (default: AGENT)',
              },
            },
            required: ['identifier', 'content', 'authorName'],
          },
        },
        {
          name: 'kanso_record_agent_run',
          description: 'Record an autonomous agent execution lifecycle, token usage, and result summary for an issue.',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: { type: 'string', description: 'Issue identifier (e.g. KAN-1)' },
              agentName: { type: 'string', description: 'Agent identifier or role name' },
              agentModel: { type: 'string', description: 'Model identifier (e.g. claude-3-7-sonnet, gemini-1.5-pro)' },
              prompt: { type: 'string', description: 'Instruction or task assigned to the agent' },
              status: {
                type: 'string',
                enum: ['RUNNING', 'COMPLETED', 'FAILED'],
                description: 'Current status of the run',
              },
              resultSummary: { type: 'string', description: 'Summary of changes, PR links, or outcome' },
              tokensUsed: { type: 'number', description: 'Estimated tokens used' },
            },
            required: ['identifier', 'agentName'],
          },
        },
      ],
    };
  });

  // 2. CALL TOOL HANDLER
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      if (name === 'kanso_list_projects') {
        const projects = await fetchApi('/api/projects');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(projects, null, 2),
            },
          ],
        };
      }

      if (name === 'kanso_list_issues') {
        const queryParams = new URLSearchParams();
        if (args.status) queryParams.set('status', String(args.status));
        if (args.priority) queryParams.set('priority', String(args.priority));
        if (args.assigneeType) queryParams.set('assigneeType', String(args.assigneeType));
        if (args.search) queryParams.set('search', String(args.search));

        const issues = await fetchApi(`/api/issues?${queryParams.toString()}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(issues, null, 2),
            },
          ],
        };
      }

      if (name === 'kanso_get_issue') {
        const identifier = String(args.identifier);
        const issue = await fetchApi(`/api/issues/${encodeURIComponent(identifier)}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(issue, null, 2),
            },
          ],
        };
      }

      if (name === 'kanso_create_issue') {
        const created = await fetchApi('/api/issues', {
          method: 'POST',
          body: JSON.stringify(args),
        });
        return {
          content: [
            {
              type: 'text',
              text: `Issue ${created.identifier} created successfully!\n\n${JSON.stringify(created, null, 2)}`,
            },
          ],
        };
      }

      if (name === 'kanso_update_issue') {
        const identifier = String(args.identifier);
        const updatePayload: Record<string, unknown> = { ...args };
        delete updatePayload.identifier;

        const updated = await fetchApi(`/api/issues/${encodeURIComponent(identifier)}`, {
          method: 'PATCH',
          body: JSON.stringify(updatePayload),
        });

        return {
          content: [
            {
              type: 'text',
              text: `Issue ${identifier} updated successfully!\n\n${JSON.stringify(updated, null, 2)}`,
            },
          ],
        };
      }

      if (name === 'kanso_add_comment') {
        const identifier = String(args.identifier);
        const comment = await fetchApi(`/api/issues/${encodeURIComponent(identifier)}/comments`, {
          method: 'POST',
          body: JSON.stringify({
            authorName: args.authorName,
            authorType: args.authorType || 'AGENT',
            content: args.content,
          }),
        });

        return {
          content: [
            {
              type: 'text',
              text: `Comment added to ${identifier} successfully:\n${JSON.stringify(comment, null, 2)}`,
            },
          ],
        };
      }

      if (name === 'kanso_record_agent_run') {
        const identifier = String(args.identifier);
        const run = await fetchApi(`/api/issues/${encodeURIComponent(identifier)}/agent-runs`, {
          method: 'POST',
          body: JSON.stringify({
            agentName: args.agentName,
            agentModel: args.agentModel,
            prompt: args.prompt,
          }),
        });

        return {
          content: [
            {
              type: 'text',
              text: `Agent run logged for ${identifier}:\n${JSON.stringify(run, null, 2)}`,
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${err.message}`,
          },
        ],
      };
    }
  });

  // 3. RESOURCES HANDLER
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'kanso://projects',
          name: 'All Projects',
          description: 'Overview of all active projects in Kanso',
          mimeType: 'application/json',
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (uri === 'kanso://projects') {
      const projects = await fetchApi('/api/projects');
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  });

  // 4. PROMPTS HANDLER
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'triage_issue',
          description: 'Analyze an open issue, evaluate acceptance criteria, and recommend subtasks or agent assignments.',
          arguments: [
            {
              name: 'identifier',
              description: 'Issue identifier to triage (e.g. KAN-1)',
              required: true,
            },
          ],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === 'triage_issue') {
      const id = args?.identifier || 'KAN-1';
      return {
        description: `Triage and decompose issue ${id}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please fetch issue ${id} using kanso_get_issue. Analyze its title, description, and comments. Propose an architectural approach, decompose it into actionable subtasks with kanso_create_issue, and update the status to IN_PROGRESS.`,
            },
          },
        ],
      };
    }
    throw new Error(`Unknown prompt: ${name}`);
  });

  return server;
}

// Start Server based on Transport Mode
async function main() {
  const isStdio = process.argv.includes('--stdio') || MCP_TRANSPORT === 'stdio';

  if (isStdio) {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🚀 Kanso MCP Server running on stdio');
  } else {
    // Run SSE HTTP server
    const app = express();
    app.use(express.json());

    // CORS for web client access
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'kanso-mcp-server',
        transport: 'sse',
        backendUrl: API_BASE_URL,
      });
    });

    let transport: SSEServerTransport | null = null;
    const server = createMcpServer();

    app.get('/sse', async (req: Request, res: Response) => {
      console.log('🔗 Client connected to MCP SSE transport');
      transport = new SSEServerTransport('/messages', res);
      await server.connect(transport);
    });

    app.post('/messages', async (req: Request, res: Response) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send('SSE connection not yet established');
      }
    });

    app.listen(MCP_PORT, '0.0.0.0', () => {
      console.log(`🤖 Kanso MCP Server listening on SSE port http://0.0.0.0:${MCP_PORT}/sse`);
    });
  }
}

main().catch((err) => {
  console.error('Fatal error in Kanso MCP server:', err);
  process.exit(1);
});
