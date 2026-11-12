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
  Sparkles,
  Settings,
  Calendar,
  GitBranch,
  HelpCircle,
  FolderGit2,
  Users,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { KanbanBoard } from './components/KanbanBoard';
import { ListView } from './components/ListView';
import { IssueDetailModal } from './components/IssueDetailModal';
import { CreateIssueModal } from './components/CreateIssueModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsModal } from './components/ShortcutsModal';
import { OnboardingWizard } from './components/OnboardingWizard';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { SprintModal } from './components/SprintModal';
import { GitIntegrationModal } from './components/GitIntegrationModal';
import { UserManagementModal } from './components/UserManagementModal';
import { AuthScreen } from './components/AuthScreen';

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
  gitProvider?: string;
  gitRepo?: string;
  gitBranch?: string;
  gitWebhookSecret?: string;
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
  gitProvider?: string;
  gitUsername?: string;
  createdAt?: string;
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
  const [currentUser, setCurrentUser] = useState<UserItem | null>(() => {
    try {
      const stored = localStorage.getItem('kanso_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [authToken, setAuthToken] = useState<string | null>(() => {
    return localStorage.getItem('kanso_auth_token');
  });

  // Views & Modals
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCreateIssue, setShowCreateIssue] = useState(false);
  const [createIssueDefaultStatus, setCreateIssueDefaultStatus] = useState<string | undefined>(undefined);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [showGitModal, setShowGitModal] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [oauthToast, setOauthToast] = useState<string | null>(null);
  const [sprints, setSprints] = useState<any[]>([]);
  const [focusedIssueIndex, setFocusedIssueIndex] = useState<number>(-1);
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterAssignee, setFilterAssignee] = useState<'ALL' | 'AGENT' | 'HUMAN' | 'UNASSIGNED'>('ALL');
  const [filterSprint, setFilterSprint] = useState('ALL');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const API_URL = import.meta.env.VITE_API_URL || '';

  const canEdit = currentUser ? currentUser.role === 'ADMIN' || currentUser.role === 'MEMBER' : false;
  const canAdmin = currentUser ? currentUser.role === 'ADMIN' : false;

  const handleLogout = () => {
    localStorage.removeItem('kanso_user');
    localStorage.removeItem('kanso_auth_token');
    setCurrentUser(null);
    setAuthToken(null);
  };

  // Check URL params for OAuth redirect on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('auth_token');
    const userParam = params.get('auth_user');

    if (token) {
      localStorage.setItem('kanso_auth_token', token);
      setAuthToken(token);
    }
    if (userParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(userParam));
        localStorage.setItem('kanso_user', JSON.stringify(parsed));
        setCurrentUser(parsed);
        setOauthToast(`Erfolgreich angemeldet als ${parsed.name} (@${parsed.gitUsername || parsed.email})`);
      } catch (e) {
        console.error('Failed to parse auth user:', e);
      }
    }

    if (token || userParam) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, []);

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
        if (pData.length > 0) {
          if (!activeProject) setActiveProject(pData[0]);
        } else {
          setShowOnboarding(true);
        }
      }

      if (uRes.ok) {
        const uData: UserItem[] = await uRes.json();
        setUsers(uData);
        if (uData.length > 0 && !currentUser) {
          // If no user is logged in yet, we let AuthScreen prompt for login
        }
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  const fetchSprints = async () => {
    if (!activeProject?.id) return;
    try {
      const res = await fetch(`${API_URL}/api/sprints?projectId=${activeProject.id}`);
      if (res.ok) {
        setSprints(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch sprints:', err);
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
      if (filterSprint !== 'ALL') params.set('sprintId', filterSprint);
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

    const params = new URLSearchParams(window.location.search);
    if (params.get('git_connected')) {
      const prov = params.get('git_connected');
      const acc = params.get('account') || '';
      setOauthToast(`Erfolgreich mit ${prov === 'gitlab' ? 'GitLab' : 'GitHub'} (${acc}) per OAuth verbunden!`);
      setShowGitModal(true);
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => setOauthToast(null), 4000);
    } else if (params.get('oauth_needs_config')) {
      setShowGitModal(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('oauth_error')) {
      alert(`OAuth-Fehler: ${params.get('oauth_error')}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    fetchIssues();
    fetchSprints();
  }, [activeProject, filterStatus, filterPriority, filterAssignee, filterSprint, searchQuery]);

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
            'sprint_created',
            'sprint_updated',
            'sprint_started',
            'sprint_completed',
            'sprint_deleted',
            'relation_created',
            'relation_deleted',
            'git_link_added',
          ].includes(data.type)
        ) {
          fetchIssues();
          fetchSprints();
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

  // Keyboard Shortcuts Listener (Command Palette, Sprints, J/K Navigation)
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
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        setShowSprintModal(true);
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setViewMode('board');
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setViewMode('list');
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setFocusedIssueIndex((prev) => Math.min(prev + 1, issues.length - 1));
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setFocusedIssueIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        if (focusedIssueIndex >= 0 && issues[focusedIssueIndex]) {
          e.preventDefault();
          const target = issues[focusedIssueIndex];
          fetch(`${API_URL}/api/issues/${target.id}`)
            .then((res) => (res.ok ? res.json() : target))
            .then((data) => setSelectedIssue(data));
        }
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(true);
      } else if (e.key === 'Escape') {
        setShowCommandPalette(false);
        setShowShortcuts(false);
        setShowSprintModal(false);
        setShowProjectSettings(false);
        setSelectedIssue(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, issues, focusedIssueIndex]);

  // Issue Actions
  const handleUpdateIssueStatus = async (issueId: string, newStatus: string) => {
    if (!canEdit) return;
    try {
      await fetch(`${API_URL}/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          actorName: currentUser?.name || 'User',
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
          actorName: currentUser?.name || 'User',
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
          authorName: currentUser?.name || 'User',
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
          actorName: currentUser?.name || 'User',
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
          actorName: currentUser?.name || 'User',
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

  const handleUpdateProject = async (
    projectId: string,
    payload: { name?: string; key?: string; description?: string; columns?: any[] }
  ) => {
    if (!canEdit) return;
    const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Fehler beim Aktualisieren des Projekts');
    }
    const updated = await res.json();
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...updated } : p)));
    if (activeProject?.id === projectId) {
      setActiveProject((prev) => (prev ? { ...prev, ...updated } : updated));
    }
    fetchIssues();
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!canAdmin) return;
    const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Fehler beim Löschen des Projekts');
    }
    const remaining = projects.filter((p) => p.id !== projectId);
    setProjects(remaining);
    if (activeProject?.id === projectId) {
      setActiveProject(remaining.length > 0 ? remaining[0] : null);
    }
    fetchIssues();
  };

  const handleOnboardingComplete = async (projectData: {
    name: string;
    key: string;
    description: string;
    columns: { id: string; title: string }[];
    seedSampleIssues: boolean;
    selectedAgents: string[];
    gitProvider?: string;
    gitRepo?: string;
    gitBranch?: string;
  }) => {
    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectData.name,
          key: projectData.key,
          description: projectData.description,
          columns: projectData.columns,
          gitProvider: projectData.gitProvider,
          gitRepo: projectData.gitRepo,
          gitBranch: projectData.gitBranch,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Fehler beim Erstellen des Projekts');
        return;
      }

      const createdProject = await res.json();
      setProjects((prev) => [...prev, createdProject]);
      setActiveProject(createdProject);

      // Seed tailored sample issues for the new workflow if checked
      if (projectData.seedSampleIssues && projectData.columns.length > 0) {
        const cols = projectData.columns;
        const col0 = cols[0].id;
        const col1 = cols.length > 1 ? cols[1].id : col0;
        const col2 = cols.length > 2 ? cols[2].id : col1;
        const mainAgent = projectData.selectedAgents[0] || 'agent-triage-v1';

        const sampleIssues = [
          {
            projectId: createdProject.id,
            title: `Architektur & System-Spezifikation für ${createdProject.name}`,
            description: `### Scope & Anforderungen\n- [ ] Zielarchitektur definieren\n- [ ] Schnittstellen & MCP-Tools konfigurieren\n- [ ] Meilensteine mit Team abstimmen`,
            status: col0,
            priority: 'HIGH',
            type: 'STORY',
            assigneeType: 'HUMAN',
            assigneeId: currentUser?.id || '',
            assigneeName: currentUser?.name || 'User',
            labels: ['architecture', 'spec'],
          },
          {
            projectId: createdProject.id,
            title: `Autonome Triage & Task-Decomposition via ${mainAgent}`,
            description: `### Agentic Workflow\n1. Analysiere offene Feature-Anforderungen.\n2. Zerlege komplexe Stories in Subtasks mit \`kanso_create_issue\`.\n3. Aktualisiere Status und berichte Fortschritt via Kommentar.`,
            status: col1,
            priority: 'URGENT',
            type: 'TASK',
            assigneeType: 'AGENT',
            assigneeName: mainAgent,
            labels: ['agentic', 'mcp', 'automation'],
          },
          {
            projectId: createdProject.id,
            title: `End-to-End Verifikation & Quality Gate durchführen`,
            description: `### Test & Akzeptanz\n- [ ] Unit- & Integrationstests ausführen\n- [ ] Code-Coverage und Security-Audit prüfen\n- [ ] Freigabe für Production Rollout`,
            status: col2,
            priority: 'MEDIUM',
            type: 'TASK',
            assigneeType: 'HUMAN',
            assigneeId: currentUser?.id || '',
            assigneeName: currentUser?.name || 'User',
            labels: ['qa', 'verification'],
          },
        ];

        for (const issue of sampleIssues) {
          await fetch(`${API_URL}/api/issues`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(issue),
          });
        }
      }

      fetchIssues();
    } catch (err) {
      console.error('Fehler beim Onboarding:', err);
    }
  };

  const activeColumns = activeProject?.columns && activeProject.columns.length > 0
    ? activeProject.columns
    : DEFAULT_COLUMNS;

  const activeSprint = sprints.find((s) => s.status === 'ACTIVE');
  const hasActiveFilters = searchQuery || filterStatus !== 'ALL' || filterPriority !== 'ALL' || filterAssignee !== 'ALL' || filterSprint !== 'ALL';

  if (!currentUser) {
    return (
      <AuthScreen
        onLoginSuccess={(user, token) => {
          localStorage.setItem('kanso_user', JSON.stringify(user));
          localStorage.setItem('kanso_auth_token', token);
          setCurrentUser(user);
          setAuthToken(token);
          fetchData();
        }}
        apiBaseUrl={API_URL}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* OAuth Toast Notification */}
      {oauthToast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
          <Sparkles className="w-4 h-4 text-emerald-200" />
          <span>{oauthToast}</span>
        </div>
      )}
      {/* ======================================================== */}
      {/* REFINED ZEN HEADER                                       */}
      {/* ======================================================== */}
      <header className="h-14 border-b border-slate-200/80 bg-white/95 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        {/* Left: Brand Breadcrumb & Project Selector */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 pr-1">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-xs">
              簡
            </div>
            <span className="font-bold tracking-tight text-slate-900 text-sm">Kanso</span>
          </div>

          <span className="text-slate-300 font-light select-none">/</span>

          {/* Project Breadcrumb with Styled Dropdown */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex items-center">
              <select
                value={activeProject?.id || ''}
                onChange={(e) => {
                  const found = projects.find((p) => p.id === e.target.value);
                  if (found) setActiveProject(found);
                }}
                className="appearance-none bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs py-1.5 pl-2.5 pr-7 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer transition shadow-2xs"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} [{p.key}]
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 pointer-events-none" />
            </div>

            {/* Project Quick Actions (Settings, Setup Wizard, Git, New Project) */}
            {canEdit && (
              <div className="flex items-center gap-0.5 text-slate-400">
                {activeProject && (
                  <button
                    onClick={() => setShowProjectSettings(true)}
                    title="Projekteinstellungen"
                    className="p-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-700 transition"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setShowGitModal(true)}
                  title="Git-Integration & Versionskontrolle"
                  className="p-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition"
                >
                  <FolderGit2 className="w-3.5 h-3.5 text-indigo-600" />
                </button>
                <button
                  onClick={() => setShowOnboarding(true)}
                  title="Projekt Setup-Wizard"
                  className="p-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowCreateProject(true)}
                  title="Neues Projekt erstellen"
                  className="p-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center: Search & Command Palette Bar */}
        <div className="relative w-72 md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search tickets or press ⌘K..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setShowCommandPalette(true);
              }
            }}
            className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg pl-8 pr-16 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
          />
          <div className="absolute right-2 top-1.5 flex items-center gap-1 pointer-events-none">
            <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-400 font-semibold shadow-2xs">
              /
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-400 font-semibold shadow-2xs">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right: Shortcuts, User Persona & New Issue Button */}
        <div className="flex items-center gap-2.5">
          {/* Keyboard Shortcuts Trigger */}
          <button
            onClick={() => setShowShortcuts(true)}
            title="Tastenkürzel anzeigen (?)"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-200" />

          {/* User Persona & Management Switcher */}
          <div className="relative group">
            <div className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer transition border border-transparent hover:border-slate-200">
              <div className="w-6 h-6 rounded-full bg-indigo-100 border border-indigo-200/80 flex items-center justify-center text-[11px] font-bold text-indigo-700 overflow-hidden shrink-0">
                {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" />
                ) : (
                  currentUser.name.charAt(0)
                )}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-800 leading-none flex items-center gap-1">
                  <span>{currentUser.name}</span>
                  {currentUser.gitUsername && (
                    <span className="text-[10px] text-slate-400 font-mono font-normal">
                      (@{currentUser.gitUsername})
                    </span>
                  )}
                </span>
                <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5 flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      currentUser.role === 'ADMIN'
                        ? 'bg-rose-500'
                        : currentUser.role === 'MEMBER'
                        ? 'bg-indigo-500'
                        : 'bg-slate-400'
                    }`}
                  />
                  {currentUser.role}
                </span>
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </div>

            {/* Dropdown Menu */}
            <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-2 hidden group-hover:block z-40 animate-in fade-in zoom-in-95 duration-100">
              {/* Profile Card Header */}
              <div className="px-2.5 py-2 border-b border-slate-100 mb-1.5">
                <div className="font-semibold text-xs text-slate-800 truncate">{currentUser.name}</div>
                <div className="text-[11px] text-slate-400 font-mono truncate">{currentUser.email}</div>
                {currentUser.gitUsername && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span>{currentUser.gitProvider || 'git'}: @{currentUser.gitUsername}</span>
                  </div>
                )}
              </div>

              {/* Management Actions */}
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setShowUserManagement(true)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span>Nutzerverwaltung & Rollen</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowGitModal(true)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition cursor-pointer"
                >
                  <FolderGit2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Git-Integration & Repos</span>
                </button>

                {canAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowProjectSettings(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-500" />
                    <span>Projekteinstellungen</span>
                  </button>
                )}
              </div>

              {/* Persona Switcher (Multi-User testing) */}
              {users.length > 1 && (
                <div className="mt-2 pt-1.5 border-t border-slate-100">
                  <div className="text-[10px] font-semibold text-slate-400 px-2 py-0.5 uppercase tracking-wider">
                    Benutzer wechseln
                  </div>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={async () => {
                          const res = await fetch(`${API_URL}/api/auth/switch-user`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: u.id }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            setCurrentUser(data.user);
                            setAuthToken(data.token);
                            localStorage.setItem('kanso_user', JSON.stringify(data.user));
                            localStorage.setItem('kanso_auth_token', data.token);
                          }
                        }}
                        className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-xs transition cursor-pointer ${
                          currentUser.id === u.id
                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <div className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[9px] font-bold overflow-hidden shrink-0">
                            {u.avatarUrl ? (
                              <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                            ) : (
                              u.name.charAt(0)
                            )}
                          </div>
                          <span className="truncate">{u.name}</span>
                        </div>
                        <span className="text-[9px] font-mono uppercase text-slate-400">
                          {u.role}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Logout */}
              <div className="mt-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>Abmelden</span>
                </button>
              </div>
            </div>
          </div>

          {/* New Issue Button (Primary CTA) */}
          {canEdit && (
            <button
              onClick={() => {
                setCreateIssueDefaultStatus(undefined);
                setShowCreateIssue(true);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Issue</span>
              <kbd className="hidden sm:inline-block ml-0.5 text-[9px] font-mono bg-indigo-500/80 px-1 py-0.2 rounded text-indigo-100">
                C
              </kbd>
            </button>
          )}
        </div>
      </header>

      {/* ======================================================== */}
      {/* SECONDARY TOOLBAR & FILTER BAR                           */}
      {/* ======================================================== */}
      <section className="px-6 py-2 border-b border-slate-200/80 bg-white/70 backdrop-blur-sm flex items-center justify-between gap-4 sticky top-14 z-20 text-xs">
        <div className="flex items-center gap-3">
          {/* View Toggle: Board vs List */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/80">
            <button
              onClick={() => setViewMode('board')}
              title="Kanban Board (B)"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                viewMode === 'board'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>

            <button
              onClick={() => setViewMode('list')}
              title="Table View (L)"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Sprints Manager Pill */}
          {activeProject && (
            <button
              onClick={() => setShowSprintModal(true)}
              title="Sprint & Cycle Management (S)"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition shadow-2xs"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>{activeSprint ? activeSprint.name : 'Sprints'}</span>
              {activeSprint && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          )}

          {/* Git Integration Pill / Quick Action */}
          <button
            onClick={() => setShowGitModal(true)}
            title={activeProject?.gitRepo ? `Verbunden mit ${activeProject.gitRepo} (${activeProject.gitBranch || 'main'}) - Klicken für Details & Webhook` : 'Git-Repository verbinden'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition shadow-2xs border ${
              activeProject?.gitRepo
                ? 'bg-indigo-50/70 border-indigo-200 text-indigo-700 hover:bg-indigo-100/70'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>{activeProject?.gitRepo ? activeProject.gitRepo : '+ Versionskontrolle'}</span>
            {activeProject?.gitBranch && (
              <span className="text-[10px] font-mono text-indigo-500 font-normal">
                :{activeProject.gitBranch}
              </span>
            )}
          </button>

          {/* Filter Group */}
          <div className="flex items-center gap-1.5">
            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer hover:bg-slate-50 transition shadow-2xs"
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
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer hover:bg-slate-50 transition shadow-2xs"
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
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer hover:bg-slate-50 transition shadow-2xs"
            >
              <option value="ALL">Assignee: All</option>
              <option value="AGENT">🤖 AI Agents</option>
              <option value="HUMAN">👤 Team Members</option>
              <option value="UNASSIGNED">Unassigned</option>
            </select>

            {/* Sprint Filter */}
            <select
              value={filterSprint}
              onChange={(e) => setFilterSprint(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer hover:bg-slate-50 transition shadow-2xs"
            >
              <option value="ALL">Sprint: All</option>
              <option value="ACTIVE">🏃 Aktiver Sprint</option>
              <option value="BACKLOG">📁 Backlog (kein Sprint)</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>

            {/* Reset Filters */}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('ALL');
                  setFilterPriority('ALL');
                  setFilterAssignee('ALL');
                  setFilterSprint('ALL');
                }}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Right count with subtle dot */}
        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
          <span>{issues.length} {issues.length === 1 ? 'ticket' : 'tickets'}</span>
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
        onOpenOnboarding={() => setShowOnboarding(true)}
        onOpenGitIntegration={() => setShowGitModal(true)}
        onOpenUserManagement={() => setShowUserManagement(true)}
        onOpenProjectSettings={() => setShowProjectSettings(true)}
        onOpenSprintManager={() => setShowSprintModal(true)}
        onFilterSprint={(sId) => setFilterSprint(sId)}
        onSetView={(v) => setViewMode(v)}
        onOpenShortcuts={() => setShowShortcuts(true)}
      />

      {/* Shortcuts Modal */}
      <ShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Onboarding Wizard */}
      <OnboardingWizard
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={handleOnboardingComplete}
      />

      {/* Project Settings Modal */}
      <ProjectSettingsModal
        isOpen={showProjectSettings}
        onClose={() => setShowProjectSettings(false)}
        project={activeProject}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        canEdit={canEdit}
        canAdmin={canAdmin}
      />

      {/* Sprint Modal */}
      <SprintModal
        isOpen={showSprintModal}
        onClose={() => setShowSprintModal(false)}
        projectId={activeProject?.id || ''}
        projectKey={activeProject?.key || ''}
        canEdit={canEdit}
        onSprintUpdated={() => {
          fetchSprints();
          fetchIssues();
        }}
      />

      {/* Issue Detail Modal */}
      <IssueDetailModal
        issue={selectedIssue}
        columns={activeColumns}
        users={users}
        currentUser={currentUser}
        allIssues={issues}
        sprints={sprints}
        canEdit={canEdit}
        onClose={() => setSelectedIssue(null)}
        onUpdate={handleUpdateIssue}
        onDelete={handleDeleteIssue}
        onAddComment={handleAddComment}
        onCreateSubIssue={handleCreateSubIssue}
        onSelectIssue={async (issueId) => {
          const res = await fetch(`${API_URL}/api/issues/${issueId}`);
          if (res.ok) setSelectedIssue(await res.json());
        }}
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

      {/* Git Integration & Dedicated Repo Boards Modal */}
      <GitIntegrationModal
        isOpen={showGitModal}
        onClose={() => setShowGitModal(false)}
        canEdit={canEdit}
        onProjectCreated={(newProject) => {
          setProjects((prev) => [...prev, newProject]);
          setActiveProject(newProject);
          fetchIssues();
        }}
      />

      {/* User Management & Roles Modal */}
      <UserManagementModal
        isOpen={showUserManagement}
        onClose={() => setShowUserManagement(false)}
        currentUser={currentUser}
        onUserUpdated={fetchData}
        apiBaseUrl={API_URL}
      />
    </div>
  );
}
