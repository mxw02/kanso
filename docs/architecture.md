# Kanso Architecture Overview

> **簡素 (Kanso)**: Japanese aesthetic principle of simplicity, elimination of clutter, and focus on the essential.

Kanso is designed from the ground up as a **lean, agent-first, MCP-native alternative to Jira**. Traditional project management suites are burdened with excessive configuration, slow response times, and legacy workflows optimized strictly for manual human interaction. Kanso is built for modern engineering organizations where **autonomous AI agents** and **human engineers** collaborate seamlessly in the same sprint.

---

## High-Level Architecture

```
                  +----------------------------------------------+
                  |  AI Agents / LLMs (Claude, Cursor, Swarms)   |
                  +----------------------------------------------+
                                         |
                                         | Model Context Protocol (MCP)
                                         v
   +--------------------+     +---------------------+
   | Human Engineers    |     |  Kanso MCP Server   |
   | (Web Browser / UI) |     |  (SSE / Stdio)      |
   +--------------------+     +---------------------+
             |                           |
             | HTTP / SSE                | Internal REST
             v                           v
   +------------------------------------------------+
   |                Kanso Core API                  |
   |           (Node.js / Fastify / TypeScript)     |
   +------------------------------------------------+
             |                           |
             v                           v
   +--------------------+     +---------------------+
   |  PostgreSQL 16     |     |   Redis (Events)    |
   |  (Prisma ORM)      |     |   (Pub/Sub, Stream) |
   +--------------------+     +---------------------+
```

---

## Core Pillars

### 1. Agent-First & Autonomous Workflows
- **Dual Citizen Assignees**: Issues can be assigned to humans (`HUMAN`) or AI agents (`AGENT`).
- **Autonomous Task Decomposition**: An agent can take a parent feature ticket (`STORY` or `EPIC`) and automatically decompose it into child tasks (`TASK`), verify acceptance criteria, and create subtasks.
- **Execution Lifecycle & Token Auditing**: The `AgentRun` model logs agent execution status (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`), system prompts, token usage, and PR summaries directly onto the issue.
- **Real-Time Event Stream**: Server-Sent Events (SSE) and Redis broadcast updates instantly to both connected agents and the frontend.

### 2. Native Model Context Protocol (MCP)
- Fully compliant with Anthropic's [Model Context Protocol](https://modelcontextprotocol.io/).
- Exposes standardized tools, resources, and prompt templates.
- Any MCP-compliant client (Claude Desktop, Cursor, Antigravity, custom Python/Node scripts) can connect out of the box via:
  - **SSE Transport**: `http://localhost:3001/sse`
  - **Stdio Transport**: `kanso-mcp --stdio`

### 3. Zen & Minimalist Performance
- Sub-50ms API response times powered by Fastify and Prisma.
- Zero clutter: clean keyboard-first UI inspired by Linear and Japanese minimalism.
- Containerized one-command deployment with Docker Compose.

---

## Directory Structure

```
kanso/
├── docker-compose.yml       # Production/local multi-container deployment
├── Makefile                 # Developer CLI shortcuts (make up, make seed, etc.)
├── README.md                # Project documentation and quickstart
├── packages/
│   └── shared/              # Shared TypeScript schemas and types (@kanso/shared)
├── apps/
│   ├── api/                 # Fastify REST/SSE backend + Prisma ORM
│   ├── mcp-server/          # Native MCP Server (SSE & Stdio transports)
│   └── web/                 # Minimalist React + Tailwind CSS Web UI (Nginx)
└── docs/
    ├── architecture.md      # Architectural design and philosophy
    └── mcp-spec.md          # MCP tool and resource specifications
```
