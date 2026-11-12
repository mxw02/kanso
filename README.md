<div align="center">

# 簡素 KANSO

### The Lean, Agent-First & MCP-Native Open Source Jira Alternative

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![MCP](https://img.shields.io/badge/MCP-Native%20Support-emerald?logo=anthropic)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-black?logo=fastify&logoColor=white)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

**Kanso (簡素)** is a Japanese aesthetic principle of simplicity, purity, and the elimination of clutter.  
Kanso is built from the ground up for modern engineering teams where **autonomous AI agents** and **human engineers** work alongside each other in the same backlog and sprint.

[Quickstart](#-quickstart-mit-docker) • [Architecture](#-architecture--tech-stack) • [MCP Integration](#-model-context-protocol-mcp) • [Agentic Features](#-agentic-first-features) • [Docs](docs/architecture.md)

</div>

---

## 🎯 Warum Kanso? (The Jira Alternative)

Traditionelle Issue-Tracker wie Jira wurden für eine Ära entwickelt, in der ausschließlich Menschen manuell Formulare ausfüllten und endlose Dropdowns durchklickten. Sie sind langsam, überladen, komplex zu konfigurieren und für KI-Agenten unzugänglich.

**Kanso kehrt diesen Ansatz um:**
- 🤖 **Agent-First Native**: Issues sind erstklassige Bürger für Menschen **und** autonome Agenten (`HUMAN` vs. `AGENT`).
- 🔌 **MCP-Native**: Vollständige Unterstützung des **Model Context Protocol (MCP)**. Beliebige Agenten in Claude Desktop, Cursor, Antigravity oder Custom Swarms können Kanso steuern.
- ⚡ **Radikal schnell & aufgeräumt**: Inspiriert von Linear und japanischer Zen-Ästhetik. Tastaturfokussiert, blitzschnell (<50ms Latenz), kein Bloat.
- 📡 **Echtzeit Event-Stream**: Server-Sent Events (SSE) und Redis pub/sub synchronisieren Board und Agenten instant.
- 🐳 **100% Dockerisiert**: Ein Befehl genügt, um die gesamte Suite (PostgreSQL, Redis, API, MCP Server, Frontend) zu starten.

---

## 🚀 Quickstart mit Docker

Das gesamte System lässt sich mit einem einzigen Befehl per **Docker Compose** starten:

```bash
# 1. Repository klonen
git clone https://github.com/mxw02/kanso.git
cd kanso

# 2. Umgebungskonfiguration kopieren
cp .env.example .env

# 3. Alle Services via Docker starten
make up
# oder direkt: docker compose up -d

# 4. Datenbank mit Beispieldaten & Agenten-Workflows initialisieren
make seed
```

### 🌐 Verfügbare Services

| Service | URL / Port | Beschreibung |
|---|---|---|
| **Kanso Web UI** | [http://localhost:3000](http://localhost:3000) | Zen-fokussiertes Sprint-Board mit Live-Agentenstatus |
| **Kanso API** | [http://localhost:4000](http://localhost:4000) | Fastify REST API, Health & SSE Event Stream |
| **Kanso MCP Server** | [http://localhost:3001/sse](http://localhost:3001/sse) | Model Context Protocol SSE Endpoint für AI Agenten |
| **PostgreSQL 16** | `localhost:5432` | Persistente Relationale Datenbank (Prisma ORM) |
| **Redis 7** | `localhost:6379` | Message Bus & Realtime Event Broker |

---

## 🤖 Model Context Protocol (MCP)

Kanso liefert einen produktionsreifen MCP-Server aus, der sowohl über **SSE (HTTP)** als auch über **Stdio (CLI)** angesprochen werden kann.

### Einbindung in Claude Desktop & Cursor

Füge Folgendes zu deiner MCP-Konfiguration (`claude_desktop_config.json` oder Cursor MCP Settings) hinzu:

```json
{
  "mcpServers": {
    "kanso": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

### Bereitgestellte MCP Tools

| Tool | Beschreibung |
|---|---|
| `kanso_list_projects` | Listet alle Projekte mit Key, Name und Ticket-Zahlen auf |
| `kanso_list_issues` | Filtert Tickets nach Status, Priorität, Assignee (`HUMAN`/`AGENT`) und Freitext |
| `kanso_get_issue` | Ruft das vollständige Issue inklusive Subtasks, Kommentare und AgentRuns ab |
| `kanso_create_issue` | Erstellt ein neues Ticket oder zerlegt Stories in Subtasks mit Agentenkontext |
| `kanso_update_issue` | Aktualisiert Status (`TODO`, `IN_PROGRESS`, `DONE` etc.), Prio und Zuweisung |
| `kanso_add_comment` | Postet Fortschrittsberichte, PR-Links oder Zwischenstände (als Agent oder Mensch) |
| `kanso_record_agent_run` | Protokolliert Agenten-Lebenszyklus, Model, Prompt und verbrauchte Token |

*Ausführliche MCP-Spezifikation unter [`docs/mcp-spec.md`](docs/mcp-spec.md).*

---

## 🧠 Agentic-First Features

### 1. Dual-Citizen Assignees
Ein Ticket kann menschlichen Entwicklern oder spezialisierten Subagenten zugewiesen werden:
```typescript
{
  "identifier": "KAN-2",
  "title": "Automate PR triage and task breakdown",
  "assigneeType": "AGENT",
  "assigneeName": "agent-triage-v1",
  "status": "IN_PROGRESS"
}
```

### 2. Task Decomposition (Story -> Subtasks)
Ein Agent kann über das Tool `kanso_create_issue` mit gesetzter `parentId` komplexe Anforderungen selbstständig in überprüfbare Teilaufgaben zerlegen.

### 3. Agent Execution Audit Log
Jeder Agenten-Lauf wird transparent getrackt: Welches Model (`claude-3-7-sonnet`, `gemini-1.5-pro` etc.) wurde verwendet? Wie viele Tokens wurden verbraucht? Welcher Pull Request wurde erzeugt?

---

## 🏗️ Architecture & Tech Stack

```
kanso/
├── docker-compose.yml       # Production-ready Multi-Container Setup
├── Makefile                 # Make-Befehle für schnelles Developer-Handling
├── packages/
│   └── shared/              # Shared TypeScript Typen & DTOs (@kanso/shared)
├── apps/
│   ├── api/                 # Fastify REST/SSE Backend + Prisma ORM + PostgreSQL
│   ├── mcp-server/          # Native MCP Server (@modelcontextprotocol/sdk)
│   └── web/                 # Minimalistisches React + Vite + Tailwind CSS Web UI
└── docs/
    ├── architecture.md      # Vertiefte Architektur-Dokumentation
    └── mcp-spec.md          # MCP Tools, Resources & Prompts Spezifikation
```

### Tech Stack Details

- **Backend**: Node.js 20+, Fastify 4 (Schema-basiert, <50ms Latenz), TypeScript
- **ORM & DB**: Prisma ORM, PostgreSQL 16
- **Events & Realtime**: Server-Sent Events (SSE), Redis 7
- **AI / MCP**: `@modelcontextprotocol/sdk` (Transport: SSE & Stdio)
- **Frontend**: React 18, Vite 5, Tailwind CSS, Lucide Icons, Dark-Zen Theme
- **Containerization**: Docker Multi-Stage Builds, Nginx Alpine

---

## 🛠️ Nützliche Make-Befehle

```bash
make up        # Startet alle Docker-Container im Hintergrund
make down      # Stoppt alle Container
make logs      # Zeigt Live-Logs der Container an
make build     # Baut alle Docker-Images neu
make seed      # Befüllt die Datenbank mit Demodaten & Agenten-Aufgaben
make ps        # Zeigt den Status aller laufenden Services
make clean     # Stoppt Container und löscht persistente Volumes
```

---

## 📄 Lizenz

Dieses Projekt steht unter der **Apache-2.0 Lizenz**. Siehe [LICENSE](LICENSE) für Details.

---

<div align="center">
Entwickelt mit Fokus auf Einfachheit, Autonomie und Eleganz.  
<strong>簡素 (Kanso)</strong> — Weniger Ballast, mehr Code.
</div>
