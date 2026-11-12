import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  GitPullRequest,
  Plus,
  Check,
  ExternalLink,
  Layers,
  Copy,
  Lock,
  Globe,
  Trash2,
  Sparkles,
  RefreshCw,
  FolderGit2,
} from 'lucide-react';

interface GitRepo {
  fullName: string;
  name: string;
  description: string;
  url: string;
  defaultBranch: string;
  isPrivate: boolean;
  stars: number;
  language: string;
}

interface GitConnection {
  id: string;
  provider: string;
  accountName: string;
  instanceUrl?: string;
  createdAt: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (newProject: any) => void;
  canEdit: boolean;
}

export const GitIntegrationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onProjectCreated,
  canEdit,
}) => {
  const [activeTab, setActiveTab] = useState<'create_board' | 'accounts' | 'webhooks'>('create_board');
  const [provider, setProvider] = useState<'github' | 'gitlab'>('github');
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [connections, setConnections] = useState<GitConnection[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Selected Repo to create Board
  const [selectedRepo, setSelectedRepo] = useState<string>('mxw02/kanso');
  const [boardName, setBoardName] = useState('kanso');
  const [boardKey, setBoardKey] = useState('KAN');
  const [seedIssues, setSeedIssues] = useState(true);
  const [creatingBoard, setCreatingBoard] = useState(false);

  // New Connection Form
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || '';
  const webhookUrl = `${window.location.origin}/api/webhooks/git`;

  const fetchData = async () => {
    try {
      setLoadingRepos(true);
      const [connRes, repoRes] = await Promise.all([
        fetch(`${API_URL}/api/git/connections`),
        fetch(`${API_URL}/api/git/repos?provider=${provider}`),
      ]);

      if (connRes.ok) {
        setConnections(await connRes.json());
      }
      if (repoRes.ok) {
        const rList: GitRepo[] = await repoRes.json();
        setRepos(rList);
        if (rList.length > 0 && !selectedRepo) {
          handleSelectRepo(rList[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load git data', err);
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, provider]);

  if (!isOpen) return null;

  const handleSelectRepo = (repo: GitRepo) => {
    setSelectedRepo(repo.fullName);
    setBoardName(repo.name);
    const generatedKey = repo.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'GIT';
    setBoardKey(generatedKey);
  };

  const handleCreateBoardFromRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepo) return;

    try {
      setCreatingBoard(true);
      const res = await fetch(`${API_URL}/api/git/create-board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          repo: selectedRepo,
          name: boardName,
          key: boardKey.toUpperCase().trim(),
          defaultBranch: 'main',
          seedIssues,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Fehler beim Erstellen des Repository-Boards');
        return;
      }

      const created = await res.json();
      onProjectCreated(created);
      onClose();
    } catch (err) {
      console.error('Failed to create board from git repo', err);
    } finally {
      setCreatingBoard(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim()) return;

    try {
      const res = await fetch(`${API_URL}/api/git/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          accountName: accountName.trim(),
          accessToken: accessToken.trim() || undefined,
          instanceUrl: instanceUrl.trim() || undefined,
        }),
      });

      if (res.ok) {
        setAccountName('');
        setAccessToken('');
        setInstanceUrl('');
        setShowAddAccount(false);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to connect git account', err);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    if (!confirm('Git-Verbindung wirklich trennen?')) return;
    try {
      await fetch(`${API_URL}/api/git/connections/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('Failed to remove connection', err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full h-[620px] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Versionskontrolle (GitHub & GitLab)</h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Git Sync
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Verknüpfe Git Repositories, erstelle dedizierte Boards und synchronisiere Commits & PRs.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 bg-white flex items-center gap-6 text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveTab('create_board')}
            className={`py-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'create_board'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Neues Board aus Git-Repo</span>
          </button>

          <button
            onClick={() => setActiveTab('accounts')}
            className={`py-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'accounts'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            <span>Verbundene Accounts ({connections.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('webhooks')}
            className={`py-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'webhooks'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <GitPullRequest className="w-4 h-4" />
            <span>Webhook & Auto-Close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: CREATE BOARD FROM REPO */}
          {activeTab === 'create_board' && (
            <div className="space-y-5">
              {/* Provider Picker */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-700">Git Provider:</span>
                <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setProvider('github')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1.5 ${
                      provider === 'github' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <span>GitHub</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProvider('gitlab')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1.5 ${
                      provider === 'gitlab' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <span>GitLab</span>
                  </button>
                </div>
              </div>

              {/* Repositories List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Repository für das Board auswählen
                  </label>
                  <button
                    onClick={fetchData}
                    className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingRepos ? 'animate-spin' : ''}`} />
                    <span>Aktualisieren</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 max-h-48 overflow-y-auto p-1">
                  {repos.map((r) => {
                    const isSelected = selectedRepo === r.fullName;
                    return (
                      <div
                        key={r.fullName}
                        onClick={() => handleSelectRepo(r)}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900 truncate">{r.fullName}</span>
                            {r.isPrivate ? (
                              <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                            ) : (
                              <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-1">{r.description}</p>
                        </div>

                        <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400 font-mono">
                          <span className="font-semibold text-slate-600">{r.language}</span>
                          <span>·</span>
                          <span>Branch: {r.defaultBranch}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Board Configuration Form */}
              <form onSubmit={handleCreateBoardFromRepo} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Neues Board konfigurieren</span>
                </h3>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Board- & Projektname *
                    </label>
                    <input
                      type="text"
                      required
                      value={boardName}
                      onChange={(e) => setBoardName(e.target.value)}
                      placeholder="z. B. Kanso Core Platform"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Projekt-Key (Kürzel) *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={boardKey}
                      onChange={(e) => setBoardKey(e.target.value.toUpperCase())}
                      placeholder="KAN"
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold uppercase rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seedIssues}
                    onChange={(e) => setSeedIssues(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-700 font-medium">
                    Initial-Tickets für CI/CD, Branch-Regeln und MCP-Automation generieren
                  </span>
                </label>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={creatingBoard || !selectedRepo || !boardName.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{creatingBoard ? 'Erstelle Board...' : `Board für ${selectedRepo} anlegen`}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: CONNECTED ACCOUNTS */}
          {activeTab === 'accounts' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Verbundene Git-Konten</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verbinde deine GitHub- und GitLab-Organisationen für automatisches Ticket-Linking.
                  </p>
                </div>

                {!showAddAccount && canEdit && (
                  <button
                    onClick={() => setShowAddAccount(true)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Account verbinden</span>
                  </button>
                )}
              </div>

              {/* Add Account Drawer Form */}
              {showAddAccount && (
                <form
                  onSubmit={handleAddAccount}
                  className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3 animate-in fade-in duration-100"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-950">Neuen Git-Account hinzufügen</span>
                    <button
                      type="button"
                      onClick={() => setShowAddAccount(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Abbrechen
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Provider</label>
                      <select
                        value={provider}
                        onChange={(e: any) => setProvider(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                      >
                        <option value="github">GitHub</option>
                        <option value="gitlab">GitLab (Cloud oder Self-Hosted)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Benutzer- / Organisationsname *
                      </label>
                      <input
                        type="text"
                        required
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="z. B. mxw02 oder acme-corp"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Personal Access Token (PAT) (Optional für private Repositories)
                    </label>
                    <input
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddAccount(false)}
                      className="px-3 py-1 text-xs text-slate-500"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      disabled={!accountName.trim()}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
                    >
                      Account verknüpfen
                    </button>
                  </div>
                </form>
              )}

              {/* Accounts list */}
              <div className="space-y-2">
                {connections.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-700">
                        {c.provider === 'gitlab' ? 'GL' : 'GH'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{c.accountName}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 uppercase">
                            Verbunden
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">{c.instanceUrl || 'https://github.com'}</p>
                      </div>
                    </div>

                    {canEdit && (
                      <button
                        onClick={() => handleDeleteConnection(c.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: WEBHOOKS & AUTO-CLOSE */}
          {activeTab === 'webhooks' && (
            <div className="space-y-5 text-xs text-slate-700">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Webhook-Konfiguration für GitHub & GitLab
                </h3>
                <p className="text-slate-500 mt-0.5">
                  Füge diesen Webhook in den Repository-Einstellungen deines Git-Providers ein, um automatisches Ticket-Closing und PR-Reviews zu aktivieren.
                </p>
              </div>

              {/* Webhook URL Box */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                <label className="block text-[11px] font-semibold text-slate-600">Payload URL:</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-[11px] text-indigo-700">
                    {webhookUrl}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg font-semibold text-slate-700 flex items-center gap-1 shadow-xs transition"
                  >
                    {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedWebhook ? 'Kopiert' : 'Kopieren'}</span>
                  </button>
                </div>
              </div>

              {/* Smart Keyword Guide */}
              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30 space-y-2">
                <h4 className="font-bold text-indigo-950">Unterstützte Smart Commit Keywords</h4>
                <div className="space-y-1 text-slate-600">
                  <div>
                    <strong className="text-slate-900">Auto-Close auf DONE:</strong>{' '}
                    <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-700">
                      Fixes #KEY-12
                    </code>
                    , <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-700">Closes KEY-12</code>
                    , <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-700">Resolves #KEY-12</code>
                  </div>
                  <div>
                    <strong className="text-slate-900">Verknüpfen & Referenzieren:</strong>{' '}
                    <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-700">
                      Refs #KEY-12
                    </code>
                    , <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-700">See KEY-12</code>
                  </div>
                  <div>
                    <strong className="text-slate-900">Pull Request Auto-Review:</strong> PRs mit Ticket-Referenz setzen den Status automatisch auf <code className="font-mono text-slate-900">IN_REVIEW</code>.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200/60 transition"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
