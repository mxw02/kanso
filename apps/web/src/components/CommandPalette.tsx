import React, { useState, useEffect } from 'react';
import { Search, Plus, Layers, Bot, Table, LayoutGrid, Cpu, HelpCircle } from 'lucide-react';

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
  onSetView: (view: 'board' | 'list') => void;
  onOpenMcp: () => void;
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
  onSetView,
  onOpenMcp,
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-24 p-4 animate-in fade-in duration-100">
      <div
        className="bg-[#121624] border border-zinc-700/80 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="p-3.5 border-b border-zinc-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command, issue key (e.g. KAN-1), or search text..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
          />
          <kbd className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="p-2 max-h-96 overflow-y-auto space-y-3 text-xs">
          {/* Quick Actions */}
          <div>
            <div className="text-[10px] font-semibold text-zinc-400 px-2 py-1 uppercase tracking-wider">
              Actions
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => {
                  onClose();
                  onOpenCreateIssue();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 hover:text-white transition"
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Create new issue</span>
                </div>
                <kbd className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">C</kbd>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onSetView('board');
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 hover:text-white transition"
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
                  <span>Switch to Kanban Board</span>
                </div>
                <kbd className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">B</kbd>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onSetView('list');
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 hover:text-white transition"
              >
                <div className="flex items-center gap-2">
                  <Table className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Switch to Compact List View</span>
                </div>
                <kbd className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">L</kbd>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenMcp();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 hover:text-white transition"
              >
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-amber-400" />
                  <span>Model Context Protocol (MCP) Setup</span>
                </div>
                <span className="text-[10px] text-zinc-400">Port 3001</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenShortcuts();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 hover:text-white transition"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Keyboard Shortcuts</span>
                </div>
                <kbd className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">?</kbd>
              </button>
            </div>
          </div>

          {/* Issues Found */}
          {filteredIssues.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-zinc-400 px-2 py-1 uppercase tracking-wider">
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
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 hover:text-white transition"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono text-indigo-400 text-[11px]">{issue.identifier}</span>
                      <span className="truncate">{issue.title}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
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
              <div className="text-[10px] font-semibold text-zinc-400 px-2 py-1 uppercase tracking-wider">
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
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 hover:text-white transition"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{p.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">[{p.key}]</span>
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
