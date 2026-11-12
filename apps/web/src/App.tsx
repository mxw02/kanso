import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  User,
  Plus,
  Radio,
  Layers,
  Search,
  Filter,
  LayoutGrid,
  Table,
  Cpu,
  HelpCircle,
  RotateCcw,
  Shield,
  Copy,
  Check,
  ChevronDown,
} from 'lucide-react';
import { KanbanBoard } from './components/KanbanBoard';
import { ListView } from './components/ListView';
import { IssueDetailModal } from './components/IssueDetailModal';
import { CreateIssueModal } from './components/CreateIssueModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsModal } from './components/ShortcutsModal';

interface StatusColumn {
  id: string;
  title: string;
  color?: string;
}

interface Project {
  id: string;
  key: string;
  name: string;
  description?: string;
  columns?: StatusColumn[];
  workspace?: {
    id: string;
    name: string;
  };
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  avatarUrl?: string;
}

const DEFAULT_COLUMNS: StatusColumn[] = [
  { id: 'BACKLOG', title: 'Backlog' },
  { id: 'TODO', title: 'To Do' },
  { id: 'IN_PROGRESS', title: 'In Progress' },
  { id: 'IN_REVIEW', title: 'In Review' },
  { id: 'DONE', title: 'Done' },
];

export default function App() {
  const [issues, setIssues] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [currentUser, setCurrentUser] = useState<UserItem>({
    id: '1',
    name: 'Alex Rivera',
    email: 'alex.admin@kanso.local',
    role: 'ADMIN',
  });

  // Views & Modals
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [sseConnected, setSseConnected] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCreateIssue, setShowCreateIssue] = useState(false);
  const [createIssueDefaultStatus, setCreateIssueDefaultStatus] = useState<string | undefined>(undefined);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);
  const [copiedMcp, setCopiedMcp] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterAssignee, setFilterAssignee] = useState<'ALL' | 'AGENT' | 'HUMAN' | 'UNASSIGNED'>('ALL');
  const [filterLabel, setFilterLabel] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  const canEdit = currentUser.role === 'ADMIN' || currentUser.role === 'MEMBER';
  const canAdmin = currentUser.role === 'ADMIN';

  // Load Initial Data
  const fetchData = async () => {
    try {
      const [pRes, uRes] = await Promise.all([
        fetch(`${API_URL}/api/projects`),
        fetch(`${API_URL}/api/users`),
      ]);

      if (pRes.ok) {
        const pData: Project[] = await pRes.json();
        setProjects(pData);
        if (pData.length > 0 && !activeProject) {
          setActiveProject(pData[0]);
        }
      }

      if (uRes.ok) {
        const uData: UserItem[] = await uRes.json();
        setUsers(uData);
        if (uData.length > 0 && !currentUser) {
          setCurrentUser(uData[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  // Fetch Issues with active filters
  const fetchIssues = async () => {
    try {
      const params = new URLSearchParams();
      if (activeProject?.id) params.set('projectId', activeProject.id);
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      if (filterPriority !== 'ALL') params.set('priority', filterPriority);
      if (filterAssignee !== 'ALL') params.set('assigneeType', filterAssignee);
      if (filterLabel) params.set('label', filterLabel);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`${API_URL}/api/issues?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setIssues(data);

        // If an issue is open in modal, refresh its details
        if (selectedIssue) {
          const fresh = data.find((i: any) => i.id === selectedIssue.id);
          if (fresh) {
            const fullRes = await fetch(`${API_URL}/api/issues/${selectedIssue.id}`);
            if (fullRes.ok) {
              const fullIssue = await fullRes.json();
              setSelectedIssue(fullIssue);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch issues:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [activeProject, filterStatus, filterPriority, filterAssignee, filterLabel, searchQuery]);

  // Realtime SSE Event Stream
  useEffect(() => {
    const eventSource = new EventSource(`${API_URL}/api/events`);
    eventSource.onopen = () => setSseConnected(true);
    eventSource.onerror = () => setSseConnected(false);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          [
            'issue_created',
            'issue_updated',
            'issue_deleted',
            'comment_added',
            'agent_run_started',
            'agent_run_updated',
            'project_created',
          ].includes(data.type)
        ) {
          fetchIssues();
          if (data.type === 'project_created') {
            fetchData();
          }
        }
      } catch (e) {
        // Heartbeat or malformed
      }
    };

    return () => {
      eventSource.close();
    };
  }, [activeProject, selectedIssue?.id]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      } else if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key.toLowerCase() === 'c' && canEdit) {
        e.preventDefault();
        setCreateIssueDefaultStatus(undefined);
        setShowCreateIssue(true);
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setViewMode('board');
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setViewMode('list');
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(true);
      } else if (e.key === 'Escape') {
        setShowCommandPalette(false);
        setShowShortcuts(false);
        setSelectedIssue(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit]);

  // Actions
  const handleUpdateIssueStatus = async (issueId: string, newStatus: string) => {
    if (!canEdit) return;
    try {
      await fetch(`${API_URL}/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          actorName: currentUser.name,
          actorType: 'HUMAN',
        }),
      });
      fetchIssues();
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleUpdateIssue = async (issueId: string, payload: any) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`${API_URL}/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          actorName: currentUser.name,
          actorType: 'HUMAN',
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedIssue(updated);
        fetchIssues();
      }
    } catch (err) {
      console.error('Failed to update issue', err);
    }
  };

  const handleDeleteIssue = async (issueId: string) => {
    if (!canEdit) return;
    try {
      await fetch(`${API_URL}/api/issues/${issueId}`, { method: 'DELETE' });
      setSelectedIssue(null);
      fetchIssues();
    } catch (err) {
      console.error('Failed to delete issue', err);
    }
  };

  const handleAddComment = async (issueId: string, content: string) => {
    try {
      await fetch(`${API_URL}/api/issues/${issueId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: currentUser.name,
          authorType: 'HUMAN',
          content,
        }),
      });
      const fullRes = await fetch(`${API_URL}/api/issues/${issueId}`);
      if (fullRes.ok) {
        setSelectedIssue(await fullRes.json());
      }
      fetchIssues();
    } catch (err) {
      console.error('Failed to add comment', err);
    }
  };

  const handleCreateSubIssue = async (parentId: string, title: string) => {
    if (!canEdit || !activeProject) return;
    try {
      await fetch(`${API_URL}/api/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          title,
          parentId,
          status: 'TODO',
          actorName: currentUser.name,
        }),
      });
      const fullRes = await fetch(`${API_URL}/api/issues/${parentId}`);
      if (fullRes.ok) {
        setSelectedIssue(await fullRes.json());
      }
      fetchIssues();
    } catch (err) {
      console.error('Failed to create subtask', err);
    }
  };

  const handleCreateIssue = async (payload: any) => {
    if (!canEdit) return;
    try {
      await fetch(`${API_URL}/api/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          actorName: currentUser.name,
        }),
      });
      fetchIssues();
    } catch (err) {
      console.error('Failed to create issue', err);
    }
  };

  const handleCreateProject = async (payload: any) => {
    if (!canAdmin && !canEdit) return;
    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        setProjects((prev) => [...prev, created]);
        setActiveProject(created);
      }
    } catch (err) {
      console.error('Failed to create project', err);
    }
  };

  const activeColumns = activeProject?.columns && activeProject.columns.length > 0
    ? activeProject.columns
    : DEFAULT_COLUMNS;

  const allLabels = Array.from(new Set(issues.flatMap((i) => i.labels || [])));

  const mcpConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        kanso: {
          url: 'http://localhost:3001/sse',
        },
      },
    },
    null,
    2
  );

  return (
    <div className="min-h-screen bg-[#090b14] text-zinc-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* ======================================================== */}
      {/* TOP HEADER BAR                                           */}
      {/* ======================================================== */}
      <header className="h-16 border-b border-zinc-800/80 bg-[#0d101a]/90 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-5">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 text-sm">
              簡
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-base">KANSO</span>
              <span className="text-[10px] text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/80 font-mono">
                v1.0
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          {/* Project Switcher */}
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <select
              value={activeProject?.id || ''}
              onChange={(e) => {
                const found = projects.find((p) => p.id === e.target.value);
                if (found) setActiveProject(found);
              }}
              className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer hover:text-indigo-300 transition"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                  {p.name} [{p.key}]
                </option>
              ))}
            </select>

            {canEdit && (
              <button
                onClick={() => setShowCreateProject(true)}
                title="Create Project"
                className="text-[11px] p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Global Search / Command Bar Trigger */}
        <button
          onClick={() => setShowCommandPalette(true)}
          className="hidden md:flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition text-xs w-72 justify-between shadow-inner"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search or command...</span>
          </div>
          <kbd className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700 font-mono">
            ⌘K
          </kbd>
        </button>

        {/* Right Nav Actions */}
        <div className="flex items-center gap-3">
          {/* Live Realtime SSE Indicator */}
          <div className="hidden lg:flex items-center gap-2 text-xs px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">
            <span
              className={`w-2 h-2 rounded-full ${
                sseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="text-zinc-400 text-[11px]">
              {sseConnected ? 'Live Realtime' : 'Offline'}
            </span>
          </div>

          {/* MCP Server Button */}
          <button
            onClick={() => setShowMcpModal(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/30 transition shadow-sm"
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">MCP 3001</span>
          </button>

          {/* Keyboard Shortcuts */}
          <button
            onClick={() => setShowShortcuts(true)}
            title="Keyboard Shortcuts (?)"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Active User / Role Switcher Persona */}
          <div className="relative group">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition">
              <Shield
                className={`w-3.5 h-3.5 ${
                  currentUser.role === 'ADMIN'
                    ? 'text-amber-400'
                    : currentUser.role === 'MEMBER'
                    ? 'text-indigo-400'
                    : 'text-zinc-400'
                }`}
              />
              <span className="text-xs font-medium text-white">{currentUser.name}</span>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                  currentUser.role === 'ADMIN'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : currentUser.role === 'MEMBER'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                {currentUser.role}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </div>

            {/* Persona Switcher Dropdown */}
            <div className="absolute right-0 mt-1 w-56 bg-[#121624] border border-zinc-700/80 rounded-xl shadow-xl p-1.5 hidden group-hover:block z-40">
              <div className="text-[10px] font-semibold text-zinc-400 px-2 py-1 uppercase tracking-wider">
                Switch Role / Persona
              </div>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setCurrentUser(u)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition ${
                    currentUser.id === u.id
                      ? 'bg-indigo-600/30 text-white font-medium'
                      : 'hover:bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">{u.name}</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800">
                    {u.role}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* New Issue Button */}
          {canEdit && (
            <button
              onClick={() => {
                setCreateIssueDefaultStatus(undefined);
                setShowCreateIssue(true);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-md shadow-indigo-500/25 transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Issue</span>
            </button>
          )}
        </div>
      </header>

      {/* ======================================================== */}
      {/* FILTER & VIEW TOGGLE BAR                                 */}
      {/* ======================================================== */}
      <section className="px-6 py-3 border-b border-zinc-800/60 bg-[#0e111c] flex flex-wrap items-center justify-between gap-4 sticky top-16 z-20">
        {/* Left: View Mode Toggle & Search */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Board vs List Toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
            <button
              onClick={() => setViewMode('board')}
              title="Kanban Board View (B)"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                viewMode === 'board'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>

            <button
              onClick={() => setViewMode('list')}
              title="Compact List View (L)"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>

          {/* Search Input Filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Filter issues (press /)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-900/90 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 w-52 md:w-64"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">Status: All</option>
            {activeColumns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">Priority: All</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={filterAssignee}
            onChange={(e: any) => setFilterAssignee(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">Assignee: All</option>
            <option value="AGENT">🤖 Autonomous Agents</option>
            <option value="HUMAN">👤 Team Members</option>
            <option value="UNASSIGNED">Unassigned</option>
          </select>

          {/* Reset Filters */}
          {(searchQuery || filterStatus !== 'ALL' || filterPriority !== 'ALL' || filterAssignee !== 'ALL' || filterLabel) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('ALL');
                setFilterPriority('ALL');
                setFilterAssignee('ALL');
                setFilterLabel(null);
              }}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white px-2 py-1 rounded bg-zinc-800/80 transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Right: Label Chips */}
        {allLabels.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-sm">
            <span className="text-[10px] text-zinc-400 uppercase font-semibold">Tags:</span>
            {allLabels.map((lbl) => (
              <button
                key={lbl}
                onClick={() => setFilterLabel(filterLabel === lbl ? null : lbl)}
                className={`text-[10px] font-mono px-2 py-0.5 rounded transition ${
                  filterLabel === lbl
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                #{lbl}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ======================================================== */}
      {/* MAIN VIEW CONTENT (KANBAN OR LIST)                       */}
      {/* ======================================================== */}
      <main className="flex-1 p-6 overflow-hidden flex flex-col">
        {viewMode === 'board' ? (
          <KanbanBoard
            columns={activeColumns}
            issues={issues}
            canEdit={canEdit}
            onSelectIssue={async (issue) => {
              const res = await fetch(`${API_URL}/api/issues/${issue.id}`);
              if (res.ok) setSelectedIssue(await res.json());
              else setSelectedIssue(issue);
            }}
            onUpdateStatus={handleUpdateIssueStatus}
            onOpenCreateInColumn={(colId) => {
              setCreateIssueDefaultStatus(colId);
              setShowCreateIssue(true);
            }}
          />
        ) : (
          <ListView
            columns={activeColumns}
            issues={issues}
            canEdit={canEdit}
            onSelectIssue={async (issue) => {
              const res = await fetch(`${API_URL}/api/issues/${issue.id}`);
              if (res.ok) setSelectedIssue(await res.json());
              else setSelectedIssue(issue);
            }}
            onUpdateStatus={handleUpdateIssueStatus}
          />
        )}
      </main>

      {/* ======================================================== */}
      {/* MODALS & PANELS                                          */}
      {/* ======================================================== */}
      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        issues={issues}
        projects={projects}
        onSelectIssue={async (issue) => {
          const res = await fetch(`${API_URL}/api/issues/${issue.id}`);
          if (res.ok) setSelectedIssue(await res.json());
          else setSelectedIssue(issue);
        }}
        onSelectProject={(project) => setActiveProject(project)}
        onOpenCreateIssue={() => {
          setCreateIssueDefaultStatus(undefined);
          setShowCreateIssue(true);
        }}
        onOpenCreateProject={() => setShowCreateProject(true)}
        onSetView={(v) => setViewMode(v)}
        onOpenMcp={() => setShowMcpModal(true)}
        onOpenShortcuts={() => setShowShortcuts(true)}
      />

      {/* Shortcuts Modal */}
      <ShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Issue Detail Modal */}
      <IssueDetailModal
        issue={selectedIssue}
        columns={activeColumns}
        users={users}
        currentUser={currentUser}
        canEdit={canEdit}
        onClose={() => setSelectedIssue(null)}
        onUpdate={handleUpdateIssue}
        onDelete={handleDeleteIssue}
        onAddComment={handleAddComment}
        onCreateSubIssue={handleCreateSubIssue}
      />

      {/* Create Issue Modal */}
      <CreateIssueModal
        isOpen={showCreateIssue}
        onClose={() => setShowCreateIssue(false)}
        columns={activeColumns}
        users={users}
        defaultStatus={createIssueDefaultStatus}
        projectId={activeProject?.id}
        onCreate={handleCreateIssue}
      />

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onCreate={handleCreateProject}
      />

      {/* MCP Configuration Modal */}
      {showMcpModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121624] border border-zinc-700/80 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Model Context Protocol (MCP) Setup</h2>
                  <p className="text-xs text-zinc-400">Port 3001 (SSE & Stdio)</p>
                </div>
              </div>
              <button onClick={() => setShowMcpModal(false)} className="text-zinc-400 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <p>
                Kanso provides a built-in MCP server at port <code className="text-indigo-300">3001</code>.
                Agents running in Claude Desktop, Cursor, Antigravity, or Python can read project context, triage issues, decompose stories into subtasks, and log progress.
              </p>

              <div>
                <span className="font-semibold text-zinc-200 block mb-1.5">
                  Claude Desktop / Cursor Configuration:
                </span>
                <div className="relative">
                  <pre className="bg-[#090b12] p-3 rounded-lg border border-zinc-800 text-[11px] font-mono text-emerald-400 overflow-x-auto">
                    {mcpConfigSnippet}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(mcpConfigSnippet);
                      setCopiedMcp(true);
                      setTimeout(() => setCopiedMcp(false), 2000);
                    }}
                    className="absolute top-2 right-2 flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded text-[11px] text-zinc-200 border border-zinc-700 transition"
                  >
                    {copiedMcp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedMcp ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowMcpModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
