import React from 'react';
import {
  AlertTriangle,
  Building2,
  FileText,
  FolderGit2,
  GitBranch,
  KeyRound,
  Layers,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  ProjectSettingsData,
  ProjectSettingsModal,
  ProjectSettingsTabKey,
} from './ProjectSettingsModal';
import { UserManagementModal, UserSettingsTabKey } from './UserManagementModal';

export type UnifiedSettingsTab = ProjectSettingsTabKey | UserSettingsTabKey;

const PROJECT_TABS: ReadonlySet<string> = new Set([
  'general',
  'stages',
  'workflow',
  'templates',
  'agents',
  'git',
  'danger',
]);

interface SettingsPageProps {
  activeTab: UnifiedSettingsTab;
  onSelectTab: (tab: UnifiedSettingsTab) => void;
  onClose: () => void;
  project: ProjectSettingsData | null;
  onUpdateProject: (projectId: string, payload: any) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  canEdit: boolean;
  canAdmin: boolean;
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'MEMBER' | 'VIEWER';
    avatarUrl?: string;
    gitProvider?: string;
    gitUsername?: string;
  };
  onUserUpdated: () => void;
  apiBaseUrl: string;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  activeTab,
  onSelectTab,
  onClose,
  project,
  onUpdateProject,
  onDeleteProject,
  canEdit,
  canAdmin,
  currentUser,
  onUserUpdated,
  apiBaseUrl,
}) => {
  const isProjectTab = Boolean(project) && PROJECT_TABS.has(activeTab);
  const resolvedProjectTab: ProjectSettingsTabKey = isProjectTab
    ? (activeTab as ProjectSettingsTabKey)
    : 'general';
  const resolvedUserTab: UserSettingsTabKey = !isProjectTab
    ? (activeTab as UserSettingsTabKey)
    : 'members';

  const navItemClass = (isActive: boolean, danger = false) =>
    `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition cursor-pointer ${
      danger
        ? isActive
          ? 'bg-red-50 text-red-700 border border-red-200 font-semibold'
          : 'text-red-600 hover:bg-red-50/60'
        : isActive
        ? 'bg-white text-teal-800 shadow-xs border border-zinc-200/80 font-semibold'
        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
    }`;

  return (
    <div className="flex-1 flex flex-col w-full bg-white overflow-hidden min-h-0 h-[calc(100vh-3.5rem)] max-h-[calc(100vh-3.5rem)]">
      {/* Unified Settings Page Header */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/70 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition cursor-pointer shrink-0"
          >
            <span>← Zurück zum Board</span>
          </button>
          <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
            <Settings className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-zinc-900 truncate">Einstellungen</h1>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-zinc-200/70 text-zinc-600 shrink-0">
                /einstellungen
              </span>
            </div>
            <p className="text-xs text-zinc-500 truncate">
              Projekt-Konfiguration, Workflow, Nutzerverwaltung, SSO &amp; MCP Tokens
            </p>
          </div>
        </div>
      </div>

      {/* Body: Unified Left Sidebar + Right Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-200 bg-zinc-50/70 p-3 md:p-4 shrink-0 flex md:flex-col gap-4 overflow-x-auto md:overflow-y-auto">
          {project && (
            <div className="flex md:flex-col gap-1 shrink-0">
              <div className="hidden md:flex items-center justify-between px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                <span className="truncate">Projekt · {project.key}</span>
              </div>
              <button
                type="button"
                onClick={() => onSelectTab('general')}
                className={navItemClass(isProjectTab && resolvedProjectTab === 'general')}
              >
                <Sliders className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Allgemein</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('stages')}
                className={navItemClass(isProjectTab && resolvedProjectTab === 'stages')}
              >
                <Layers className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Board Stages</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('workflow')}
                className={navItemClass(isProjectTab && resolvedProjectTab === 'workflow')}
              >
                <GitBranch className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Workflow &amp; Regeln</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('templates')}
                className={navItemClass(isProjectTab && resolvedProjectTab === 'templates')}
              >
                <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Ticket-Vorlagen</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('agents')}
                className={navItemClass(isProjectTab && resolvedProjectTab === 'agents')}
              >
                <Sparkles className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>KI &amp; Agenten</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('git')}
                className={navItemClass(isProjectTab && resolvedProjectTab === 'git')}
              >
                <FolderGit2 className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Git &amp; Webhooks</span>
              </button>
              {canAdmin && (
                <button
                  type="button"
                  onClick={() => onSelectTab('danger')}
                  className={navItemClass(isProjectTab && resolvedProjectTab === 'danger', true)}
                >
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>Gefahrenzone</span>
                </button>
              )}
            </div>
          )}

          <div className="flex md:flex-col gap-1 shrink-0 md:pt-3 md:border-t md:border-zinc-200">
            <div className="hidden md:flex items-center justify-between px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              <span>Workspace &amp; Nutzer</span>
            </div>
            <button
              type="button"
              onClick={() => onSelectTab('members')}
              className={navItemClass(!isProjectTab && resolvedUserTab === 'members')}
            >
              <Users className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>Mitgliederliste</span>
            </button>
            {canAdmin && (
              <button
                type="button"
                onClick={() => onSelectTab('invite')}
                className={navItemClass(!isProjectTab && resolvedUserTab === 'invite')}
              >
                <UserPlus className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Nutzer autorisieren</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelectTab('permissions')}
              className={navItemClass(!isProjectTab && resolvedUserTab === 'permissions')}
            >
              <Shield className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>Berechtigungsmatrix</span>
            </button>
            {canAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => onSelectTab('sso')}
                  className={navItemClass(!isProjectTab && resolvedUserTab === 'sso')}
                >
                  <KeyRound className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span>SSO &amp; OIDC</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('orgs')}
                  className={navItemClass(!isProjectTab && resolvedUserTab === 'orgs')}
                >
                  <Building2 className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span>Orgs &amp; Boards</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('mcp')}
                  className={navItemClass(!isProjectTab && resolvedUserTab === 'mcp')}
                >
                  <Sparkles className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span>MCP Tokens</span>
                </button>
              </>
            )}
          </div>
        </aside>

        {/* Right Active Section */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {isProjectTab && project ? (
            <ProjectSettingsModal
              isOpen
              embedded
              controlledTab={resolvedProjectTab}
              onClose={onClose}
              project={project}
              onUpdateProject={onUpdateProject}
              onDeleteProject={onDeleteProject}
              canEdit={canEdit}
              canAdmin={canAdmin}
            />
          ) : (
            <UserManagementModal
              isOpen
              embedded
              controlledTab={resolvedUserTab}
              onClose={onClose}
              currentUser={currentUser}
              onUserUpdated={onUserUpdated}
              apiBaseUrl={apiBaseUrl}
            />
          )}
        </div>
      </div>
    </div>
  );
};
