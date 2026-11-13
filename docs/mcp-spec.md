# Kanso Model Context Protocol (MCP) Specification

Kanso features native support for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), allowing autonomous AI agents, coding assistants (such as Claude Desktop, Cursor, Antigravity, and Goose), and LLM pipelines to interact directly with your project boards, backlog, and issue lifecycles.

---

## Connection Setup

### 1. Claude Desktop / Cursor (SSE Mode - Recommended)

Add the following to your `claude_desktop_config.json` or Cursor MCP settings:

```json
{
  "mcpServers": {
    "kanso": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

### 2. Local CLI / Stdio Mode

To run via standard input/output without Docker:

```json
{
  "mcpServers": {
    "kanso": {
      "command": "node",
      "args": ["/path/to/kanso/apps/mcp-server/dist/index.js", "--stdio"],
      "env": {
        "KANSO_API_URL": "http://localhost:4000"
      }
    }
  }
}
```

---

## Exposed MCP Tools

| Tool Name | Parameters | Description |
|---|---|---|
| `kanso_list_projects` | None | Lists all projects with keys, names, and issue counts. |
| `kanso_list_issues` | `projectKey`, `status`, `priority`, `assigneeType`, `search` | Queries and filters issues across projects. |
| `kanso_get_issue` | `identifier` (e.g. `KAN-1`) | Fetches full issue details, comments, and agent runs. |
| `kanso_create_issue` | `title`, `description`, `type`, `priority`, `assigneeType`, `assigneeName`, `labels`, `parentId` | Creates a new issue, bug, or subtask. |
| `kanso_update_issue` | `identifier`, `status`, `priority`, `assigneeType`, `assigneeName`, `labels` | Updates state, reassigns, or moves an issue. |
| `kanso_add_comment` | `identifier`, `content`, `authorName`, `authorType` | Adds a comment or progress report (signed as Human or Agent). |
| `kanso_record_agent_run` | `identifier`, `agentName`, `agentModel`, `prompt`, `status`, `resultSummary`, `tokensUsed` | Logs an agent execution milestone and resource consumption. |

---

## Exposed MCP Resources

- **`kanso://projects`**  
  Returns a JSON array of all active projects, roadmap context, and issue volumes.

---

## Pre-Packaged Agent Prompts

- **`triage_issue`**:  
  Accepts an `identifier` parameter. Instructs the agent to fetch the issue, evaluate requirements and acceptance criteria, decompose complex deliverables into sub-tasks via `kanso_create_issue`, and update status to `IN_PROGRESS`.
