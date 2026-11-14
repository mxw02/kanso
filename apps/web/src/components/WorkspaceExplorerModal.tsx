import React, { useState, useMemo } from 'react';
import {
  X,
  Building2,
  FolderTree,
  FolderOpen,
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Check,
} from 'lucide-react';

interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

export interface ExplorerProjectItem {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  workspaceId?: string | null;
  _count?: { issues?: number };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaces: WorkspaceItem[];
  projects: ExplorerProjectItem[];
  activeWorkspaceId: string;
  activeProjectId: string | null;
  canCreate: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectProject: (project: ExplorerProjectItem) => void;
  onCreateProject: (workspaceId?: string, parentId?: string | null) => void;
}

export const WorkspaceExplorerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  workspaces,
  projects,
  activeWorkspaceId,
  activeProjectId,
  canCreate,
  onSelectWorkspace,
  onSelectProject,
  onCreateProject,
}) => {
  const [search, setSearch] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});

  const visibleProjects = useMemo(() => {
    const byWs = activeWorkspaceId
      ? projects.filter((p) => p.workspaceId === activeWorkspaceId)
      : projects;
    if (!search.trim()) return byWs;
    const q = search.trim().toLowerCase();
    const matchedIds = new Set(
      byWs.filter((p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)).map((p) => p.id)
    );
    // Keep ancestors of matched projects so tree context remains intact
    const byId = new Map(byWs.map((p) => [p.id, p]));
    for (const id of Array.from(matchedIds)) {
      let cur = byId.get(id);
      while (cur?.parentId && byId.has(cur.parentId)) {
        matchedIds.add(cur.parentId);
        cur = byId.get(cur.parentId);
      }
    }
    return byWs.filter((p) => matchedIds.has(p.id));
  }, [projects, activeWorkspaceId, search]);

  const { childrenMap, roots } = useMemo(() => {
    const byId = new Map(visibleProjects.map((p) => [p.id, p]));
    const map = new Map<string | null, ExplorerProjectItem[]>();
    for (const p of visibleProjects) {
      const key = p.parentId && byId.has(p.parentId) ? p.parentId : null;
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return { childrenMap: map, roots: map.get(null) || [] };
  }, [visibleProjects]);

  if (!isOpen) return null;

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNode = (proj: ExplorerProjectItem, depth: number, visited = new Set<string>()): React.ReactNode => {
    if (visited.has(proj.id)) return null;
    visited.add(proj.id);

    const children = childrenMap.get(proj.id) || [];
    const hasChildren = children.length > 0;
    const isCollapsed = Boolean(collapsedIds[proj.id]) && !search.trim();
    const isActive = proj.id === activeProjectId;
    const issueCount = proj._count?.issues ?? 0;

    return (
      <div key={proj.id}>
        <div
          onClick={() => {
            onSelectProject(proj);
            onClose();
          }}
          style={{ paddingLeft: `${12 + depth * 22}px` }}
          className={`group flex items-center justify-between pr-3 py-2 rounded-xl cursor-pointer transition border ${
            isActive
              ? 'bg-teal-50/90 border-teal-200 text-teal-900'
              : 'bg-white hover:bg-zinc-50 border-transparent hover:border-zinc-200 text-zinc-800'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleCollapse(proj.id, e)}
                className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 shrink-0"
              >
                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}

            {hasChildren ? (
              <FolderOpen className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-700' : 'text-amber-600'}`} />
            ) : (
              <LayoutGrid className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-700' : 'text-zinc-400'}`} />
            )}

            <span className="text-xs font-semibold truncate">{proj.name}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200/70 shrink-0">
              {proj.key}
            </span>
            {isActive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700 bg-teal-100/70 px-1.5 py-0.5 rounded-full shrink-0">
                <Check className="w-3 h-3" />
                Aktiv
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-zinc-400 font-mono">
              {issueCount} {issueCount === 1 ? 'Ticket' : 'Tickets'}
            </span>
            {canCreate && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                  onCreateProject(proj.workspaceId || activeWorkspaceId || undefined, proj.id);
                }}
                title={`Unterprojekt unter "${proj.name}" anlegen`}
                className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded-lg bg-zinc-100 hover:bg-teal-700 hover:text-white text-zinc-700 text-[10px] font-semibold transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Unterprojekt
              </button>
            )}
          </div>
        </div>

        {hasChildren && !isCollapsed && (
          <div className="mt-0.5 space-y-0.5">
            {children.map((child) => renderNode(child, depth + 1, new Set(visited)))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-900/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-4xl h-[76vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
              <FolderTree className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Organisationen, Projekte & Boards</h2>
              <p className="text-[11px] text-zinc-500">
                Wähle ein Projekt oder Unterprojekt, um direkt in das zugehörige Board zu wechseln.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateProject(activeWorkspaceId || undefined, null);
                }}
                className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Neues Projekt
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: 2-Column Explorer */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Organizations */}
          <div className="w-60 border-r border-zinc-100 bg-zinc-50/50 p-3 flex flex-col gap-1 overflow-y-auto shrink-0">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Organisationen
            </div>
            <button
              type="button"
              onClick={() => onSelectWorkspace('')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                !activeWorkspaceId
                  ? 'bg-white border border-zinc-200 text-teal-800 font-semibold shadow-2xs'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                Alle Organisationen
              </span>
              <span className="text-[10px] font-mono text-zinc-400">{projects.length}</span>
            </button>

            {workspaces.map((ws) => {
              const count = projects.filter((p) => p.workspaceId === ws.id).length;
              const active = activeWorkspaceId === ws.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => onSelectWorkspace(ws.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                    active
                      ? 'bg-white border border-zinc-200 text-teal-800 font-semibold shadow-2xs'
                      : 'text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Building2 className="w-3.5 h-3.5 shrink-0 text-teal-700" />
                    <span className="truncate">{ws.name}</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Right: Project Tree */}
          <div className="flex-1 flex flex-col min-w-0 p-4">
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Projekte, Unterprojekte oder Key durchsuchen..."
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-8 pr-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {roots.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400 text-xs py-10">
                  <FolderTree className="w-8 h-8 mb-2 text-zinc-300" />
                  <span>Keine Projekte gefunden.</span>
                </div>
              ) : (
                roots.map((root) => renderNode(root, 0))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
