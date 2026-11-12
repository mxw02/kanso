<div align="center">

# 簡素 KANSO (v1.0)

### The Lean, Agent-First & MCP-Native Open Source Jira Alternative

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![MCP](https://img.shields.io/badge/MCP-Native%20Support-emerald?logo=anthropic)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-black?logo=fastify&logoColor=white)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

**Kanso (簡素)** ist das japanische Ästhetik-Prinzip der Einfachheit, Klarheit und Beseitigung von Überflüssigem.  
Kanso ist von Grund auf für moderne Ingenieur- und Produktteams konzipiert, in denen **autonome KI-Agenten** und **menschliche Entwickler** Hand in Hand im selben Sprint arbeiten.

[Quickstart](#-quickstart-mit-docker) • [Features v1.0](#-funktionsumfang-version-10) • [Architecture](#-architecture--tech-stack) • [MCP Integration](#-model-context-protocol-mcp) • [Tastaturkürzel](#-tastaturkrzel)

</div>

---

## 🎯 Funktionsumfang (Version 1.0)

### 1. 🎫 Ticket-Management (Issues)
- **Erstellen & Bearbeiten**: Blitzschnelle Erstellung von Tickets mit Markdown-Beschreibungen (# Headers, Checklisten, Codeblöcke).
- **Prioritäten & Typen**: `URGENT`, `HIGH`, `MEDIUM`, `LOW` sowie `TASK`, `BUG`, `STORY`, `EPIC`.
- **Dual-Citizen Assignees**: Zuweisung an Teammitglieder (`HUMAN`) oder autonome KI-Agenten (`AGENT`).
- **Aufgabenzerlegung**: Erstellung und Verfolgung verknüpfter Subtasks direkt im Ticket.

### 2. 📋 Kanban-Board & Listenansicht
- **Interaktives Drag-and-Drop Board**: Flüssiges Verschieben von Tickets zwischen Status-Spalten mit sofortiger Persistenz.
- **Frei definierbare Status-Spalten**: Backlog, To Do, In Progress, In Review, Done (projektbezogen anpassbar).
- **Kompakte Listen-/Tabellenansicht**: Strukturierte Übersicht mit Inline-Statuswechsel, Prioritäts-Badges und Sortierung (`B` für Board, `L` für Liste).

### 3. 🏢 Projekte & Workspaces
- **Saubere Trennung**: Flexible Strukturierung nach Produkten, Teams oder Kundenprojekten.
- **Schneller Projektwechsel**: Nahtloser Switch im Header mit Projekt-Keys (z. B. `KAN`, `OPS`).

### 4. 🔍 Labels, Filter & Volltextsuche
- **Live-Filterleiste**: Nach Status, Priorität, Assignee (Agent vs. Human), Tags und Freitext filtern.
- **Globale Command Palette (`Cmd+K` / `Ctrl+K`)**: Universelle Suche über alle Tickets, Projekte und Schnellaktionen.
- **Schnellfilter (`/`)**: Sofortiger Fokus auf das Suchfeld.

### 5. 💬 Kommentare & Aktivitäts-Log
- **Ticket-Diskussion**: Kommentare mit vollem Markdown-Support und sichtbarer Kennzeichnung (🤖 Agent vs. 👤 Mensch).
- **Transparente Änderungshistorie**: Chronologischer Audit-Trail ("Wer hat wann welchen Status oder Assignee geändert?").

### 6. 👥 Benutzerverwaltung & Rollen
- **Drei Rollenebenen**:
  - `ADMIN`: Voller Zugriff auf Workspaces, Projekte und Ticketverwaltung.
  - `MEMBER`: Tickets erstellen, bearbeiten, kommentieren und Status per Drag-and-Drop ändern.
  - `VIEWER`: Read-Only Ansicht mit Kommentarfunktion.
- **Eingebauter Persona-Switcher**: Zum schnellen Testen verschiedener Benutzerrollen direkt im Header.

---

## 🚀 Quickstart mit Docker

Starten Sie die komplette Kanso-Umgebung mit einem einzigen Befehl:

```bash
# 1. Repository klonen & Verzeichnis betreten
git clone https://github.com/mxw02/kanso.git
cd kanso

# 2. Umgebungskonfiguration anlegen
cp .env.example .env

# 3. Alle Services per Docker Compose starten
make up
# oder: docker compose up -d

# 4. Datenbank mit Beispieldaten (Admin, Member, Viewer, Tickets) initialisieren
make seed
```

### 🌐 Endpunkte

| Service | Adresse | Beschreibung |
|---|---|---|
| **Kanso Web UI** | [http://localhost:3000](http://localhost:3000) | Zen-fokussiertes Dashboard & Board |
| **Kanso API** | [http://localhost:4000](http://localhost:4000) | Fastify REST API & Realtime SSE Stream |
| **Kanso MCP Server** | [http://localhost:3001/sse](http://localhost:3001/sse) | Model Context Protocol SSE Endpoint |
| **PostgreSQL 16** | `localhost:5432` | Relationale Datenbank |
| **Redis 7** | `localhost:6379` | Event-Broker & Cache |

---

## ⌨️ Tastaturkürzel

| Tastenkombination | Aktion |
|---|---|
| <kbd>Cmd</kbd> + <kbd>K</kbd> / <kbd>Ctrl</kbd> + <kbd>K</kbd> | Command Palette & Globale Suche öffnen |
| <kbd>/</kbd> | Filter-Suchleiste fokussieren |
| <kbd>C</kbd> | Neues Ticket erstellen |
| <kbd>B</kbd> | Zum Kanban-Board wechseln |
| <kbd>L</kbd> | Zur kompakten Listenansicht wechseln |
| <kbd>?</kbd> | Übersicht aller Tastenkürzel anzeigen |
| <kbd>ESC</kbd> | Dialoge schließen oder Suche zurücksetzen |

---

## 🤖 Model Context Protocol (MCP)

Jedes MCP-fähige Tool (Claude Desktop, Cursor, Antigravity, Custom Swarms) kann sich direkt mit Kanso verbinden:

```json
{
  "mcpServers": {
    "kanso": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

---

## 🏗️ Architecture & Tech Stack

```
kanso/
├── docker-compose.yml       # Multi-Container Setup (Postgres, Redis, API, MCP, Web)
├── Makefile                 # Make-Befehle (up, down, seed, build, logs)
├── packages/
│   └── shared/              # Shared TypeScript Typen & Interfaces
├── apps/
│   ├── api/                 # Fastify REST/SSE Backend + Prisma ORM
│   ├── mcp-server/          # Native Model Context Protocol Server (Port 3001)
│   └── web/                 # React 18, Vite 5, Tailwind CSS, Lucide Web UI
└── docs/
    ├── architecture.md      # Architektur-Details
    └── mcp-spec.md          # MCP Spezifikation
```

---

## 📄 Lizenz

Apache-2.0 Lizenz. Siehe [LICENSE](LICENSE) für weitere Details.
