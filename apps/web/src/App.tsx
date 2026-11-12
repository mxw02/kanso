import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Layers,
  Search,
  LayoutGrid,
  Table,
  RotateCcw,
  User,
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
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCreateIssue, setShowCreateIssue] = useState(false);
  const [createIssueDefaultStatus, setCreateIssueDefaultStatus] = useState<string | undefined>(undefined);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterAssignee, setFilterAssignee] = useState<'ALL' | 'AGENT' | 'HUMAN' | 'UNASSIGNED'>('ALL');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const API_URL = import.meta.env.VITE_API_URL || '';

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
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`${API_URL}/api/issues?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setIssues(data);

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
  }, [activeProject, filterStatus, filterPriority, filterAssignee, searchQuery]);

  // Realtime SSE Event Stream
  useEffect(() => {
    const eventSource = new EventSource(`${API_URL}/api/events`);
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

  // Issue Actions
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

  const hasActiveFilters = searchQuery || filterStatus !== 'ALL' || filterPriority !== 'ALL' || filterAssignee !== 'ALL';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* ======================================================== */}
      {/* CLEAN MINIMALIST HEADER                                  */}
      {/* ======================================================== */}
      <header className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center font-bold text-white text-xs">
              簡
            </div>
            <span className="font-bold tracking-tight text-slate-900 text-sm">Kanso</span>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Project Dropdown */}
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={activeProject?.id || ''}
              onChange={(e) => {
                const found = projects.find((p) => p.id === e.target.value);
                if (found) setActiveProject(found);
              }}
              className="bg-transparent text-slate-800 font-semibold text-xs focus:outline-none cursor-pointer hover:text-indigo-600 transition"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} [{p.key}]
                </option>
              ))}
            </select>

            {canEdit && (
              <button
                onClick={() => setShowCreateProject(true)}
                title="Create Project"
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search tickets (press /)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          <kbd className="absolute right-2.5 top-2 text-[10px] text-slate-400 font-mono pointer-events-none">
            /
          </kbd>
        </div>

        {/* Right: View Toggle, Persona & New Issue Button */}
        <div className="flex items-center gap-3">
          {/* Board vs List Segmented Control */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200">
            <button
              onClick={() => setViewMode('board')}
              title="Kanban Board (B)"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                viewMode === 'board'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>

            <button
              onClick={() => setViewMode('list')}
              title="Table View (L)"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* User Persona Switcher */}
          <div className="relative group">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-slate-100 cursor-pointer transition border border-transparent hover:border-slate-200">
              <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-700">
                {currentUser.name.charAt(0)}
              </div>
              <span className="text-xs font-medium text-slate-800">{currentUser.name}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-slate-600 uppercase">
                {currentUser.role}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </div>

            {/* Dropdown */}
            <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 hidden group-hover:block z-40">
              <div className="text-[10px] font-semibold text-slate-400 px-2.5 py-1 uppercase tracking-wider">
                Switch User
              </div>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setCurrentUser(u)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                    currentUser.id === u.id
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{u.name}</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase text-slate-500">
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
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Issue</span>
            </button>
          )}
        </div>
      </header>

      {/* ======================================================== */}
      {/* FILTER BAR                                               */}
      {/* ======================================================== */}
      <section className="px-6 py-2.5 border-b border-slate-200 bg-white/70 backdrop-blur flex items-center justify-between gap-4 sticky top-14 z-20 text-xs">
        <div className="flex items-center gap-2.5">
          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer hover:bg-slate-50"
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
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer hover:bg-slate-50"
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
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer hover:bg-slate-50"
          >
            <option value="ALL">Assignee: All</option>
            <option value="AGENT">🤖 AI Agents</option>
            <option value="HUMAN">👤 Team Members</option>
            <option value="UNASSIGNED">Unassigned</option>
          </select>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('ALL');
                setFilterPriority('ALL');
                setFilterAssignee('ALL');
              }}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Right count */}
        <div className="text-[11px] text-slate-400 font-mono">
          {issues.length} {issues.length === 1 ? 'ticket' : 'tickets'}
        </div>
      </section>

      {/* ======================================================== */}
      {/* MAIN VIEW CONTENT                                        */}
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
      {/* MODALS                                                   */}
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
    </div>
  );
}
