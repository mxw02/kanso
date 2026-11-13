import React, { useState, useEffect } from 'react';
import { Search, Plus, Layers, Table, LayoutGrid, HelpCircle, Sparkles, Settings, Calendar, FolderGit2, Users } from 'lucide-react';

interface Issue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
}

interface Project {
  id: string;
  key: string;
  name: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  issues: Issue[];
  projects: Project[];
  onSelectIssue: (issue: Issue) => void;
  onSelectProject: (project: Project) => void;
  onOpenCreateIssue: () => void;
  onOpenCreateProject: () => void;
  onOpenOnboarding: () => void;
  onOpenGitIntegration?: () => void;
  onOpenUserManagement?: () => void;
  onOpenProjectSettings?: () => void;
  onOpenSprintManager?: () => void;
  onFilterSprint?: (sprintId: string) => void;
  onSetView: (view: 'board' | 'list') => void;
  onOpenShortcuts: () => void;
}

export const CommandPalette: React.FC<Props> = ({
  isOpen,
  onClose,
  issues,
  projects,
  onSelectIssue,
  onSelectProject,
  onOpenCreateIssue,
  onOpenCreateProject,
  onOpenOnboarding,
  onOpenGitIntegration,
  onOpenUserManagement,
  onOpenProjectSettings,
  onOpenSprintManager,
  onFilterSprint,
  onSetView,
  onOpenShortcuts,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredIssues = issues.filter(
    (i) =>
      i.title.toLowerCase().includes(query.toLowerCase()) ||
      i.identifier.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.key.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-start justify-center pt-24 p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="p-3.5 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search tickets, projects, or type an action..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <kbd className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="p-2 max-h-96 overflow-y-auto space-y-3 text-xs">
          {/* Quick Actions */}
          <div>
            <div className="text-[10px] font-semibold text-slate-400 px-2.5 py-1 uppercase tracking-wider">
              Actions
            </div>
            <div className="space-y-0.5">
              {onOpenSprintManager && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenSprintManager();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    <span className="font-medium">Sprint & Cycle Management öffnen</span>
                  </div>
                  <kbd className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono border border-slate-200">S</kbd>
                </button>
              )}

              {onFilterSprint && (
                <button
                  onClick={() => {
                    onClose();
                    onFilterSprint('ACTIVE');
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span className="font-medium">Filter: Nur aktiver Sprint</span>
                  </div>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                    Aktiv
                  </span>
                </button>
              )}

              {onOpenGitIntegration && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenGitIntegration();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <FolderGit2 className="w-4 h-4 text-indigo-600" />
                    <span className="font-medium">Git-Integration & Versionskontrolle (+)</span>
                  </div>
                  <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 font-semibold">
                    Git
                  </span>
                </button>
              )}

              {onOpenUserManagement && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenUserManagement();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span className="font-medium">Nutzerverwaltung & Rollen öffnen</span>
                  </div>
                  <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 font-semibold">
                    Team
                  </span>
                </button>
              )}

              {onOpenProjectSettings && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenProjectSettings();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Settings className="w-4 h-4 text-slate-500" />
                    <span className="font-medium">Projekteinstellungen öffnen</span>
                  </div>
                  <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    Settings
                  </span>
                </button>
              )}

              <button
                onClick={() => {
                  onClose();
                  onOpenOnboarding();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span className="font-medium">Projekt-Onboarding & Setup Wizard starten</span>
                </div>
                <span className="text-[10px] text-indigo-600 bg-indigo-50 font-semibold px-2 py-0.5 rounded border border-indigo-200">
                  Wizard
                </span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenCreateIssue();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
              >
                <div className="flex items-center gap-2.5">
                  <Plus className="w-4 h-4 text-indigo-600" />
                  <span className="font-medium">Create new issue</span>
                </div>
                <kbd className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono border border-slate-200">C</kbd>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onSetView('board');
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
              >
                <div className="flex items-center gap-2.5">
                  <LayoutGrid className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">Switch to Kanban Board</span>
                </div>
                <kbd className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono border border-slate-200">B</kbd>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onSetView('list');
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
              >
                <div className="flex items-center gap-2.5">
                  <Table className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">Switch to Table View</span>
                </div>
                <kbd className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono border border-slate-200">L</kbd>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenShortcuts();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
              >
                <div className="flex items-center gap-2.5">
                  <HelpCircle className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">Keyboard Shortcuts</span>
                </div>
                <kbd className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono border border-slate-200">?</kbd>
              </button>
            </div>
          </div>

          {/* Issues Found */}
          {filteredIssues.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-slate-400 px-2.5 py-1 uppercase tracking-wider">
                Issues ({filteredIssues.length})
              </div>
              <div className="space-y-0.5">
                {filteredIssues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => {
                      onClose();
                      onSelectIssue(issue);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-800 transition text-left"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="font-mono text-indigo-600 font-semibold text-[11px]">{issue.identifier}</span>
                      <span className="truncate">{issue.title}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-medium">
                      {issue.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {filteredProjects.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-slate-400 px-2.5 py-1 uppercase tracking-wider">
                Projects
              </div>
              <div className="space-y-0.5">
                {filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onClose();
                      onSelectProject(p);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-800 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-4 h-4 text-slate-500" />
                      <span className="font-medium">{p.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 font-semibold">[{p.key}]</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
