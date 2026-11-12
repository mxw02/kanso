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
  ShieldCheck,
  Key,
  Settings,
  AlertCircle,
  ArrowUpRight,
  User,
  Sliders,
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
  displayName?: string;
  avatarUrl?: string;
  authType?: string; // 'oauth' or 'pat'
  instanceUrl?: string;
  createdAt: string;
}

interface OAuthConfig {
  github: { configured: boolean; clientId?: string; callbackUrl: string };
  gitlab: { configured: boolean; clientId?: string; instanceUrl?: string; callbackUrl: string };
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

  // New Connection Form (PAT)
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // OAuth State
  const [oauthConfig, setOAuthConfig] = useState<OAuthConfig | null>(null);
  const [showOAuthConfigModal, setShowOAuthConfigModal] = useState(false);
  const [ghClientIdInput, setGhClientIdInput] = useState('');
  const [ghClientSecretInput, setGhClientSecretInput] = useState('');
  const [glClientIdInput, setGlClientIdInput] = useState('');
  const [glClientSecretInput, setGlClientSecretInput] = useState('');
  const [glInstanceUrlInput, setGlInstanceUrlInput] = useState('https://gitlab.com');
  const [isSavingOAuthConfig, setIsSavingOAuthConfig] = useState(false);
  const [oauthSavedNotice, setOauthSavedNotice] = useState(false);
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || '';
  const webhookUrl = `${window.location.origin}/api/webhooks/git`;

  const fetchData = async () => {
    try {
      setLoadingRepos(true);
      const [connRes, repoRes, oauthRes] = await Promise.all([
        fetch(`${API_URL}/api/git/connections`),
        fetch(`${API_URL}/api/git/repos?provider=${provider}`),
        fetch(`${API_URL}/api/git/oauth/config`),
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
      if (oauthRes.ok) {
        const oData: OAuthConfig = await oauthRes.json();
        setOAuthConfig(oData);
        if (oData.github?.clientId) setGhClientIdInput(oData.github.clientId);
        if (oData.gitlab?.clientId) setGlClientIdInput(oData.gitlab.clientId);
        if (oData.gitlab?.instanceUrl) setGlInstanceUrlInput(oData.gitlab.instanceUrl);
      }
    } catch (err) {
      console.error('Failed to load git data', err);
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleOAuthConnect = (prov: 'github' | 'gitlab') => {
    window.location.href = `${API_URL}/api/git/oauth/authorize/${prov}`;
  };

  const handleInstantDevConnect = async (prov: 'github' | 'gitlab') => {
    try {
      setIsConnectingOAuth(true);
      const res = await fetch(`${API_URL}/api/git/oauth/instant-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: prov }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed instant connect', err);
    } finally {
      setIsConnectingOAuth(false);
    }
  };

  const handleSaveOAuthConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingOAuthConfig(true);
      const res = await fetch(`${API_URL}/api/git/oauth/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubClientId: ghClientIdInput,
          githubClientSecret: ghClientSecretInput,
          gitlabClientId: glClientIdInput,
          gitlabClientSecret: glClientSecretInput,
          gitlabInstanceUrl: glInstanceUrlInput,
        }),
      });
      if (res.ok) {
        setOAuthConfig(await res.json());
        setOauthSavedNotice(true);
        setTimeout(() => setOauthSavedNotice(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save oauth config', err);
    } finally {
      setIsSavingOAuthConfig(false);
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

          {/* TAB 2: CONNECTED ACCOUNTS & OAUTH */}
          {activeTab === 'accounts' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Git-Authentifizierung & OAuth Apps
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Melde dich direkt per 1-Klick OAuth mit GitHub oder GitLab an für maximale Benutzerfreundlichkeit.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowOAuthConfigModal(!showOAuthConfigModal)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition flex items-center gap-1.5 shadow-2xs"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>OAuth App einrichten</span>
                </button>
              </div>

              {/* OAuth App Setup Form / Drawer */}
              {showOAuthConfigModal && (
                <form
                  onSubmit={handleSaveOAuthConfig}
                  className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-4 animate-in fade-in duration-150"
                >
                  <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-indigo-950">
                        OAuth App Konfiguration (GitHub & GitLab)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOAuthConfigModal(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Schließen
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-600">
                    Erstelle deine eigene OAuth App bei GitHub (unter <em>Settings → Developer settings → OAuth Apps</em>) oder GitLab und trage hier Client ID & Secret ein.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    {/* GitHub OAuth Fields */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">GitHub OAuth App</span>
                        {oauthConfig?.github.configured && (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Konfiguriert
                          </span>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-600 font-semibold mb-0.5">Client ID</label>
                        <input
                          type="text"
                          value={ghClientIdInput}
                          onChange={(e) => setGhClientIdInput(e.target.value)}
                          placeholder="z. B. Iv1.xxxxxxxxxxxx"
                          className="w-full px-2.5 py-1 text-xs font-mono rounded border border-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-600 font-semibold mb-0.5">Client Secret</label>
                        <input
                          type="password"
                          value={ghClientSecretInput}
                          onChange={(e) => setGhClientSecretInput(e.target.value)}
                          placeholder="••••••••••••••••••••••••"
                          className="w-full px-2.5 py-1 text-xs font-mono rounded border border-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Callback URL: <code className="text-indigo-600 bg-slate-50 px-1 rounded select-all font-mono">http://localhost:4001/api/git/oauth/callback/github</code>
                      </div>
                    </div>

                    {/* GitLab OAuth Fields */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">GitLab OAuth App</span>
                        {oauthConfig?.gitlab.configured && (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Konfiguriert
                          </span>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-600 font-semibold mb-0.5">Application ID (Client ID)</label>
                        <input
                          type="text"
                          value={glClientIdInput}
                          onChange={(e) => setGlClientIdInput(e.target.value)}
                          placeholder="z. B. gl_app_xxxxxxxxxxxx"
                          className="w-full px-2.5 py-1 text-xs font-mono rounded border border-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-600 font-semibold mb-0.5">Secret</label>
                        <input
                          type="password"
                          value={glClientSecretInput}
                          onChange={(e) => setGlClientSecretInput(e.target.value)}
                          placeholder="••••••••••••••••••••••••"
                          className="w-full px-2.5 py-1 text-xs font-mono rounded border border-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Callback URL: <code className="text-indigo-600 bg-slate-50 px-1 rounded select-all font-mono">http://localhost:4001/api/git/oauth/callback/gitlab</code>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {oauthSavedNotice ? (
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>OAuth Konfiguration erfolgreich gespeichert!</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        Änderungen sind sofort aktiv – kein Container-Neustart erforderlich.
                      </span>
                    )}

                    <button
                      type="submit"
                      disabled={isSavingOAuthConfig}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                    >
                      {isSavingOAuthConfig ? 'Speichern...' : 'OAuth Einstellungen speichern'}
                    </button>
                  </div>
                </form>
              )}

              {/* 1-Click OAuth Provider Cards */}
              <div className="grid grid-cols-2 gap-4">
                {/* GitHub OAuth Card */}
                {(() => {
                  const ghConn = connections.find((c) => c.provider === 'github');
                  return (
                    <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                            <FolderGit2 className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-slate-900">GitHub</h4>
                              {ghConn && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Verbunden</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {ghConn
                                ? `Angemeldet als @${ghConn.accountName}`
                                : 'Automatischer OAuth 2.0 Login'}
                            </p>
                          </div>
                        </div>

                        {ghConn && canEdit && (
                          <button
                            onClick={() => handleDeleteConnection(ghConn.id)}
                            title="Verbindung trennen"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {ghConn ? (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-xs">
                          {ghConn.avatarUrl ? (
                            <img src={ghConn.avatarUrl} alt="" className="w-7 h-7 rounded-full border border-slate-200" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                              {ghConn.accountName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 truncate">
                            <span className="font-semibold text-slate-800 block truncate">
                              {ghConn.displayName || ghConn.accountName}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              GitHub · {ghConn.authType === 'pat' ? 'Personal Access Token' : 'OAuth App Token'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => handleOAuthConnect('github')}
                            className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-2"
                          >
                            <FolderGit2 className="w-4 h-4" />
                            <span>Zu GitHub weiterleiten & autorisieren →</span>
                          </button>

                          <button
                            type="button"
                            disabled={isConnectingOAuth}
                            onClick={() => handleInstantDevConnect('github')}
                            className="w-full py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition flex items-center justify-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            <span>1-Klick Dev Login (@mxw02)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* GitLab OAuth Card */}
                {(() => {
                  const glConn = connections.find((c) => c.provider === 'gitlab');
                  return (
                    <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                            <GitBranch className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-slate-900">GitLab</h4>
                              {glConn && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Verbunden</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {glConn
                                ? `Angemeldet als @${glConn.accountName}`
                                : 'GitLab.com oder Self-Hosted'}
                            </p>
                          </div>
                        </div>

                        {glConn && canEdit && (
                          <button
                            onClick={() => handleDeleteConnection(glConn.id)}
                            title="Verbindung trennen"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {glConn ? (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-xs">
                          {glConn.avatarUrl ? (
                            <img src={glConn.avatarUrl} alt="" className="w-7 h-7 rounded-full border border-slate-200" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs">
                              {glConn.accountName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 truncate">
                            <span className="font-semibold text-slate-800 block truncate">
                              {glConn.displayName || glConn.accountName}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 truncate block">
                              {glConn.instanceUrl || 'https://gitlab.com'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => handleOAuthConnect('gitlab')}
                            className="w-full py-2 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-2"
                          >
                            <GitBranch className="w-4 h-4" />
                            <span>Zu GitLab weiterleiten & autorisieren →</span>
                          </button>

                          <button
                            type="button"
                            disabled={isConnectingOAuth}
                            onClick={() => handleInstantDevConnect('gitlab')}
                            className="w-full py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition flex items-center justify-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                            <span>1-Klick Dev Login (@mxw02_gitlab)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Secondary Option: Manual PAT Connection */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">
                    Erweiterte Option: Personal Access Token (PAT)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddAccount(!showAddAccount)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    {showAddAccount ? 'Abbrechen' : '+ Token manuell hinterlegen'}
                  </button>
                </div>

                {showAddAccount && (
                  <form
                    onSubmit={handleAddAccount}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3 mt-3 animate-in fade-in duration-100 text-xs"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Provider</label>
                        <select
                          value={provider}
                          onChange={(e: any) => setProvider(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                        >
                          <option value="github">GitHub</option>
                          <option value="gitlab">GitLab</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Account / Organisation *
                        </label>
                        <input
                          type="text"
                          required
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value)}
                          placeholder="z. B. mxw02"
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Personal Access Token (PAT)
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
                        PAT hinterlegen
                      </button>
                    </div>
                  </form>
                )}
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
