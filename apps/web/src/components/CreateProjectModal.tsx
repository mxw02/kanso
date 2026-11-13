import React, { useState, useEffect } from 'react';
import { Layers, X, GitBranch, Sparkles, ChevronDown, FolderGit2 } from 'lucide-react';
import { buildProjectTree } from '../utils/projectTree';

interface GitRepoItem {
  fullName: string;
  name: string;
  description?: string;
  language?: string;
  stars?: number;
}

interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
}

interface ParentProjectOption {
  id: string;
  key: string;
  name: string;
  workspaceId?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaces?: WorkspaceItem[];
  projects?: ParentProjectOption[];
  activeWorkspaceId?: string | null;
  defaultParentId?: string | null;
  onCreate: (payload: {
    key: string;
    name: string;
    description: string;
    workspaceId?: string;
    parentId?: string | null;
    kind?: 'PROJECT' | 'BOARD';
    gitProvider?: string;
    gitRepo?: string;
    gitBranch?: string;
  }) => Promise<void>;
}

export const CreateProjectModal: React.FC<Props> = ({
  isOpen,
  onClose,
  workspaces = [],
  projects = [],
  activeWorkspaceId,
  defaultParentId,
  onCreate,
}) => {
  const [mode, setMode] = useState<'manual' | 'git'>('git');
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspaceId, setWorkspaceId] = useState<string>(activeWorkspaceId || '');
  const [parentId, setParentId] = useState<string>('');
  const [kind, setKind] = useState<'BOARD' | 'PROJECT'>('BOARD');

  // Git state
  const [gitProvider, setGitProvider] = useState<'github' | 'gitlab'>('github');
  const [gitRepo, setGitRepo] = useState('');
  const [repos, setRepos] = useState<GitRepoItem[]>([]);
  const [isCustomRepo, setIsCustomRepo] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    if (isOpen) {
      setWorkspaceId(activeWorkspaceId || '');
      setParentId(defaultParentId || '');
      setKind('BOARD');
    }
  }, [isOpen, activeWorkspaceId, defaultParentId]);

  // Fetch Repositories from Git Provider
  useEffect(() => {
    if (!isOpen) return;

    const loadRepos = async () => {
      try {
        setLoadingRepos(true);
        const res = await fetch(`${API_URL}/api/git/repos?provider=${gitProvider}`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setRepos(list);
          if (list.length > 0) {
            setIsCustomRepo(false);
            if (!gitRepo) handleSelectPresetRepo(list[0].fullName);
          } else {
            setIsCustomRepo(true);
          }
        } else {
          setRepos([]);
          setIsCustomRepo(true);
        }
      } catch (err) {
        setRepos([]);
        setIsCustomRepo(true);
      } finally {
        setLoadingRepos(false);
      }
    };

    loadRepos();
  }, [isOpen, gitProvider]);

  if (!isOpen) return null;

  const handleSelectPresetRepo = (repoStr: string) => {
    setGitRepo(repoStr);
    const base = repoStr.split('/')[1] || repoStr;
    const formattedName = base.charAt(0).toUpperCase() + base.slice(1);
    setName(formattedName);
    const genKey = base.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'GIT';
    setKey(genKey);
    setDescription(`Repository Board verknüpft mit ${gitProvider === 'gitlab' ? 'GitLab' : 'GitHub'}: ${repoStr}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !name.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreate({
        key: key.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim(),
        workspaceId: workspaceId || undefined,
        parentId: parentId || null,
        kind,
        gitProvider: mode === 'git' ? gitProvider : undefined,
        gitRepo: mode === 'git' ? gitRepo.trim() : undefined,
        gitBranch: mode === 'git' ? 'main' : undefined,
      });
      setKey('');
      setName('');
      setDescription('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-zinc-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-zinc-900">Neues Projekt anlegen</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="grid grid-cols-2 p-1 bg-zinc-100 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('git');
              if (!name) handleSelectPresetRepo('mxw02/kanso');
            }}
            className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === 'git' ? 'bg-white text-teal-700 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Aus Git-Repo (GitHub / GitLab)</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === 'manual' ? 'bg-white text-teal-700 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Manuelles Board</span>
          </button>
        </div>

        {/* Git Mode Fields */}
        {mode === 'git' && (
          <div className="p-3.5 rounded-xl border border-teal-100 bg-teal-50/30 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-zinc-700">Git Provider</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGitProvider('github')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    gitProvider === 'github' ? 'bg-teal-700 text-white' : 'bg-white text-zinc-700 border border-zinc-200'
                  }`}
                >
                  GitHub
                </button>
                <button
                  type="button"
                  onClick={() => setGitProvider('gitlab')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    gitProvider === 'gitlab' ? 'bg-teal-700 text-white' : 'bg-white text-zinc-700 border border-zinc-200'
                  }`}
                >
                  GitLab
                </button>
              </div>
            </div>

            {/* Git Repository Dropdown */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-zinc-700">
                  Git-Projekt / Repository auswählen *
                </label>
                {loadingRepos && (
                  <span className="text-[10px] text-teal-700 font-medium animate-pulse">
                    Lade Repositories...
                  </span>
                )}
              </div>

              <div className="relative">
                <select
                  value={isCustomRepo ? '__CUSTOM__' : gitRepo}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__CUSTOM__') {
                      setIsCustomRepo(true);
                      setGitRepo('');
                    } else {
                      setIsCustomRepo(false);
                      handleSelectPresetRepo(val);
                    }
                  }}
                  className="w-full appearance-none bg-white border border-zinc-300 rounded-xl px-3.5 py-2.5 pr-9 text-xs font-mono font-medium text-zinc-800 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 cursor-pointer shadow-2xs"
                >
                  {repos.length === 0 ? (
                    <option value="" disabled>-- Kein Git-Account verbunden (bitte manuell eingeben) --</option>
                  ) : (
                    <option value="" disabled>-- Bitte Git-Projekt auswählen --</option>
                  )}
                  {repos.map((r) => (
                    <option key={r.fullName} value={r.fullName}>
                      {r.fullName} {r.language ? `(${r.language})` : ''} {r.description ? `— ${r.description.slice(0, 35)}...` : ''}
                    </option>
                  ))}
                  <option value="__CUSTOM__">✏️ {repos.length === 0 ? 'Repository manuell eingeben...' : 'Anderes Repository manuell eingeben...'}</option>
                </select>
                <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            {/* Custom Input fallback */}
            {isCustomRepo && (
              <div className="animate-in fade-in duration-150">
                <label className="block text-[10px] font-semibold text-zinc-500 mb-1">
                  Eigenes Repository angeben (owner/repo) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={gitRepo}
                  onChange={(e) => {
                    setGitRepo(e.target.value);
                    const base = e.target.value.split('/')[1] || e.target.value;
                    if (base) {
                      setName(base.charAt(0).toUpperCase() + base.slice(1));
                      setKey(base.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'GIT');
                    }
                  }}
                  placeholder="z. B. mxw02/neues-projekt"
                  className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-1.5 text-zinc-900 font-mono text-xs focus:outline-none focus:border-teal-600"
                />
              </div>
            )}

            {repos.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-zinc-500">Schnellauswahl:</span>
                {repos.slice(0, 3).map((r) => (
                  <button
                    key={r.fullName}
                    type="button"
                    onClick={() => {
                      setIsCustomRepo(false);
                      handleSelectPresetRepo(r.fullName);
                    }}
                    className={`px-2 py-0.5 rounded border text-[10px] font-mono transition ${
                      gitRepo === r.fullName && !isCustomRepo
                        ? 'bg-teal-100/70 border-teal-300 text-teal-800 font-bold'
                        : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700'
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Common Fields */}
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-zinc-700 font-semibold mb-1">Projektname *</label>
              <input
                type="text"
                required
                placeholder="z. B. Kanso Platform"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:border-teal-600"
              />
            </div>

            <div>
              <label className="block text-zinc-700 font-semibold mb-1">Kürzel (Key) *</label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="z. B. KAN"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 font-mono uppercase font-bold focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-700 font-semibold mb-1">Beschreibung</label>
            <textarea
              rows={2}
              placeholder="Zweck und Rahmenbedingungen..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:border-teal-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-zinc-50 border border-zinc-200 rounded-xl p-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
              Organisation
            </label>
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs text-zinc-800"
            >
              <option value="">Keine / Standard</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
              Übergeordnetes Projekt (für Unterprojekt)
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs text-zinc-800"
            >
              <option value="">Oberste Ebene (Hauptprojekt mit eigenem Board)</option>
              {buildProjectTree(projects, workspaceId || null).map(({ project: p, indentLabel }) => (
                <option key={p.id} value={p.id}>
                  {indentLabel}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-medium transition"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !key.trim() || !name.trim()}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs transition"
          >
            {isSubmitting ? 'Wird erstellt...' : 'Projekt & Board erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
};
