import React, { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  FolderTree,
  RefreshCw,
} from 'lucide-react';

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

interface ProjectItem {
  id: string;
  key: string;
  name: string;
  kind?: 'PROJECT' | 'BOARD';
  parentId?: string | null;
  workspaceId?: string | null;
}

interface OidcProviderItem {
  id: string;
  workspaceId?: string | null;
  workspace?: { id: string; name: string; slug: string } | null;
  name: string;
  slug: string;
  issuerUrl: string;
  clientId: string;
  hasClientSecret: boolean;
  scopes: string;
  verifiedDomains: string[];
  jitProvisioning: boolean;
  enabled: boolean;
  callbackUrl: string;
}

interface Props {
  mode: 'sso' | 'orgs';
  apiBaseUrl: string;
  users: UserItem[];
  onChanged?: () => void;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('kanso_auth_token') || localStorage.getItem('kanso_token');
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

export const SsoOrgAdminPanel: React.FC<Props> = ({ mode, apiBaseUrl, users, onChanged }) => {
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // System Auth Settings
  const [allowGitLogin, setAllowGitLogin] = useState(true);
  const [allowSelfServiceBoardCreation, setAllowSelfServiceBoardCreation] = useState(true);
  const [enforceSso, setEnforceSso] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // OIDC Providers
  const [providers, setProviders] = useState<OidcProviderItem[]>([]);
  const [oidcName, setOidcName] = useState('');
  const [oidcIssuer, setOidcIssuer] = useState('');
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [oidcDomains, setOidcDomains] = useState('');
  const [oidcWorkspaceId, setOidcWorkspaceId] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  // Orgs & Board Permissions
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [selectedWsId, setSelectedWsId] = useState('');
  const [wsMembers, setWsMembers] = useState<any[]>([]);
  const [wsMemberUserId, setWsMemberUserId] = useState('');
  const [wsMemberRole, setWsMemberRole] = useState<'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST'>('MEMBER');

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projMembers, setProjMembers] = useState<any[]>([]);
  const [projMemberUserId, setProjMemberUserId] = useState('');
  const [projMemberRole, setProjMemberRole] = useState<'ADMIN' | 'EDITOR' | 'VIEWER'>('EDITOR');

  const loadAll = async () => {
    try {
      const [wsRes, projRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/workspaces`, { headers: authHeaders() }),
        fetch(`${apiBaseUrl}/api/projects`, { headers: authHeaders() }),
      ]);
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        setWorkspaces(wsData);
        if (!selectedWsId && wsData.length > 0) setSelectedWsId(wsData[0].id);
      }
      if (projRes.ok) {
        const pData = await projRes.json();
        setProjects(pData);
        if (!selectedProjectId && pData.length > 0) setSelectedProjectId(pData[0].id);
      }

      if (mode === 'sso') {
        const [setRes, oidcRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/admin/auth-settings`, { headers: authHeaders() }),
          fetch(`${apiBaseUrl}/api/admin/oidc-providers`, { headers: authHeaders() }),
        ]);
        if (setRes.ok) {
          const s = await setRes.json();
          setAllowGitLogin(Boolean(s.allowGitLogin));
          setAllowSelfServiceBoardCreation(Boolean(s.allowSelfServiceBoardCreation));
          setEnforceSso(Boolean(s.enforceSso));
        }
        if (oidcRes.ok) {
          setProviders(await oidcRes.json());
        }
      }
    } catch (err: any) {
      setStatusMsg({ type: 'err', text: err.message || 'Laden fehlgeschlagen' });
    }
  };

  useEffect(() => {
    loadAll();
  }, [mode]);

  useEffect(() => {
    if (!selectedWsId || mode !== 'orgs') return;
    fetch(`${apiBaseUrl}/api/workspaces/${selectedWsId}/members`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then(setWsMembers)
      .catch(() => {});
  }, [selectedWsId, mode]);

  useEffect(() => {
    if (!selectedProjectId || mode !== 'orgs') return;
    fetch(`${apiBaseUrl}/api/projects/${selectedProjectId}/members`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then(setProjMembers)
      .catch(() => {});
  }, [selectedProjectId, mode]);

  const handleSaveAuthSettings = async () => {
    setSavingSettings(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/auth-settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          allowGitLogin,
          allowSelfServiceBoardCreation,
          enforceSso,
        }),
      });
      if (res.ok) {
        setStatusMsg({ type: 'ok', text: 'Auth- & Board-Richtlinien gespeichert.' });
        onChanged?.();
      } else {
        const err = await res.json();
        setStatusMsg({ type: 'err', text: err.error || 'Speichern fehlgeschlagen' });
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateOidc = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const res = await fetch(`${apiBaseUrl}/api/admin/oidc-providers`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: oidcName,
        issuerUrl: oidcIssuer,
        clientId: oidcClientId,
        clientSecret: oidcClientSecret,
        verifiedDomains: oidcDomains.split(',').map((s) => s.trim()).filter(Boolean),
        workspaceId: oidcWorkspaceId || null,
      }),
    });
    if (res.ok) {
      setOidcName('');
      setOidcIssuer('');
      setOidcClientId('');
      setOidcClientSecret('');
      setOidcDomains('');
      setStatusMsg({ type: 'ok', text: 'OIDC-Provider angelegt.' });
      await loadAll();
    } else {
      const err = await res.json();
      setStatusMsg({ type: 'err', text: err.error || 'OIDC-Provider konnte nicht erstellt werden' });
    }
  };

  const handleTestOidc = async (id: string) => {
    setTestingId(id);
    setStatusMsg(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/oidc-providers/${id}/test`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatusMsg({ type: 'ok', text: `Discovery OK (${data.issuer}) → Auth: ${data.authorizationEndpoint}` });
      } else {
        setStatusMsg({ type: 'err', text: data.error || 'Discovery fehlgeschlagen' });
      }
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteOidc = async (id: string) => {
    const res = await fetch(`${apiBaseUrl}/api/admin/oidc-providers/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok) {
      setProviders((prev) => prev.filter((p) => p.id !== id));
      setStatusMsg({ type: 'ok', text: 'OIDC-Provider entfernt.' });
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    const res = await fetch(`${apiBaseUrl}/api/workspaces`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: newWsName.trim(), description: newWsDesc.trim() || undefined }),
    });
    if (res.ok) {
      const created = await res.json();
      setNewWsName('');
      setNewWsDesc('');
      setSelectedWsId(created.id);
      setStatusMsg({ type: 'ok', text: `Organisation "${created.name}" erstellt.` });
      await loadAll();
      onChanged?.();
    }
  };

  const handleAddWsMember = async () => {
    if (!selectedWsId || !wsMemberUserId) return;
    const res = await fetch(`${apiBaseUrl}/api/workspaces/${selectedWsId}/members`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userId: wsMemberUserId, role: wsMemberRole }),
    });
    if (res.ok) {
      const list = await fetch(`${apiBaseUrl}/api/workspaces/${selectedWsId}/members`, { headers: authHeaders() }).then((r) => r.json());
      setWsMembers(list);
      setStatusMsg({ type: 'ok', text: 'Organisationsmitglied gespeichert.' });
    }
  };

  const handleRemoveWsMember = async (userId: string) => {
    if (!selectedWsId) return;
    await fetch(`${apiBaseUrl}/api/workspaces/${selectedWsId}/members/${userId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    setWsMembers((prev) => prev.filter((m) => m.userId !== userId));
  };

  const handleAddProjectMember = async () => {
    if (!selectedProjectId || !projMemberUserId) return;
    const res = await fetch(`${apiBaseUrl}/api/projects/${selectedProjectId}/members`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userId: projMemberUserId, role: projMemberRole }),
    });
    if (res.ok) {
      const list = await fetch(`${apiBaseUrl}/api/projects/${selectedProjectId}/members`, { headers: authHeaders() }).then((r) => r.json());
      setProjMembers(list);
      setStatusMsg({ type: 'ok', text: 'Board-Freigabe gespeichert.' });
    }
  };

  const handleRemoveProjectMember = async (userId: string) => {
    if (!selectedProjectId) return;
    await fetch(`${apiBaseUrl}/api/projects/${selectedProjectId}/members/${userId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    setProjMembers((prev) => prev.filter((m) => m.userId !== userId));
  };

  return (
    <div className="space-y-5">
      {statusMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            statusMsg.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {statusMsg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {mode === 'sso' && (
        <>
          {/* Deployment Auth & Board Creation Policy */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              <span>Unternehmens-Deployment: Login & Board-Erstellung</span>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enforceSso}
                onChange={(e) => setEnforceSso(e.target.checked)}
                className="mt-0.5 rounded border-zinc-300 text-teal-700"
              />
              <div>
                <div className="font-semibold text-zinc-900">SSO erzwingen (zwangsläufig via OIDC anmelden)</div>
                <div className="text-[11px] text-zinc-500">
                  Blendet GitHub/GitLab auf dem Login-Screen aus und blockiert Git-Login serverseitig.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allowGitLogin}
                disabled={enforceSso}
                onChange={(e) => setAllowGitLogin(e.target.checked)}
                className="mt-0.5 rounded border-zinc-300 text-teal-700 disabled:opacity-40"
              />
              <div>
                <div className="font-semibold text-zinc-900">Anmeldung über GitHub / GitLab erlauben</div>
                <div className="text-[11px] text-zinc-500">
                  Ermöglicht Self-Service-Login über GitHub/GitLab OAuth oder Git-Handle.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allowSelfServiceBoardCreation}
                onChange={(e) => setAllowSelfServiceBoardCreation(e.target.checked)}
                className="mt-0.5 rounded border-zinc-300 text-teal-700"
              />
              <div>
                <div className="font-semibold text-zinc-900">Nutzer dürfen selbstständig Boards/Projekte erstellen</div>
                <div className="text-[11px] text-zinc-500">
                  Wenn deaktiviert, können nur Administratoren neue Boards anlegen und für Nutzer freigeben.
                </div>
              </div>
            </label>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleSaveAuthSettings}
                disabled={savingSettings}
                className="px-3.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? 'Speichere...' : 'Richtlinien speichern'}
              </button>
            </div>
          </div>

          {/* Configured OIDC Providers */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
              <KeyRound className="w-4 h-4 text-teal-700" />
              <span>Konfigurierte OIDC-Provider ({providers.length})</span>
            </div>

            {providers.length === 0 ? (
              <div className="text-xs text-zinc-500 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-4 text-center">
                Noch kein OIDC-Provider hinterlegt (z. B. Keycloak, Microsoft Entra ID, Okta, Authentik).
              </div>
            ) : (
              <div className="space-y-2">
                {providers.map((p) => (
                  <div key={p.id} className="p-3 bg-white border border-zinc-200 rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-900">{p.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{p.slug}</span>
                        {p.workspace && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                            Org: {p.workspace.name}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono truncate">{p.issuerUrl}</div>
                      <div className="text-[10px] text-zinc-400 font-mono truncate">Callback: {p.callbackUrl}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTestOidc(p.id)}
                        disabled={testingId === p.id}
                        className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${testingId === p.id ? 'animate-spin' : ''}`} />
                        Test
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOidc(p.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new OIDC Provider */}
          <form onSubmit={handleCreateOidc} className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2.5">
            <div className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-teal-700" />
              <span>Neuen OIDC-Provider hinzufügen</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={oidcName}
                onChange={(e) => setOidcName(e.target.value)}
                placeholder="Name (z. B. Uni Keycloak / Entra ID)"
                className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
              <input
                type="url"
                required
                value={oidcIssuer}
                onChange={(e) => setOidcIssuer(e.target.value)}
                placeholder="Issuer URL (https://idp.example.com/realms/main)"
                className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
              />
              <input
                type="text"
                required
                value={oidcClientId}
                onChange={(e) => setOidcClientId(e.target.value)}
                placeholder="Client ID"
                className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
              />
              <input
                type="password"
                value={oidcClientSecret}
                onChange={(e) => setOidcClientSecret(e.target.value)}
                placeholder="Client Secret (verschlüsselt gespeichert)"
                className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
              />
              <input
                type="text"
                value={oidcDomains}
                onChange={(e) => setOidcDomains(e.target.value)}
                placeholder="E-Mail-Domains (z. B. acme.de, uni.de)"
                className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
              <select
                value={oidcWorkspaceId}
                onChange={(e) => setOidcWorkspaceId(e.target.value)}
                className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
              >
                <option value="">Ziel-Organisation (optional)</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold cursor-pointer"
            >
              OIDC-Provider anlegen
            </button>
          </form>
        </>
      )}

      {mode === 'orgs' && (
        <div className="space-y-5">
          {/* Create Organization */}
          <form onSubmit={handleCreateWorkspace} className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2.5">
            <div className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-teal-700" />
              <span>Neue Organisation (Konto) anlegen</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="Organisationsname (z. B. Acme GmbH)"
                className="flex-1 bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={newWsDesc}
                onChange={(e) => setNewWsDesc(e.target.value)}
                placeholder="Beschreibung (optional)"
                className="flex-1 bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
              <button
                type="submit"
                disabled={!newWsName.trim()}
                className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Anlegen
              </button>
            </div>
          </form>

          {/* Workspace Members */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-900">Organisations-Mitglieder</span>
              <select
                value={selectedWsId}
                onChange={(e) => setSelectedWsId(e.target.value)}
                className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1 text-xs"
              >
                <option value="">Organisation wählen...</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedWsId && (
              <>
                <div className="flex gap-2">
                  <select
                    value={wsMemberUserId}
                    onChange={(e) => setWsMemberUserId(e.target.value)}
                    className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <option value="">Nutzer wählen...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                  <select
                    value={wsMemberRole}
                    onChange={(e) => setWsMemberRole(e.target.value as any)}
                    className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <option value="OWNER">OWNER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="MEMBER">MEMBER</option>
                    <option value="GUEST">GUEST</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddWsMember}
                    disabled={!wsMemberUserId}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                  >
                    Zuweisen
                  </button>
                </div>

                <div className="divide-y divide-zinc-100">
                  {wsMembers.map((m) => (
                    <div key={m.id} className="py-1.5 flex items-center justify-between text-xs">
                      <span>
                        <strong>{m.user?.name}</strong> <span className="text-zinc-400">({m.user?.email})</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100">{m.role}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveWsMember(m.userId)}
                          className="text-zinc-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Per-Board / Per-Project Access */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                <FolderTree className="w-4 h-4 text-teal-700" />
                <span>Einzelne Nutzer für Board / Projekt freigeben</span>
              </div>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1 text-xs"
              >
                <option value="">Board / Projekt wählen...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.key} · {p.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedProjectId && (
              <>
                <div className="flex gap-2">
                  <select
                    value={projMemberUserId}
                    onChange={(e) => setProjMemberUserId(e.target.value)}
                    className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <option value="">Nutzer freigeben...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                  <select
                    value={projMemberRole}
                    onChange={(e) => setProjMemberRole(e.target.value as any)}
                    className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddProjectMember}
                    disabled={!projMemberUserId}
                    className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                  >
                    Freigeben
                  </button>
                </div>

                <div className="divide-y divide-zinc-100">
                  {projMembers.length === 0 ? (
                    <div className="text-[11px] text-zinc-400 py-2">
                      Keine expliziten Board-Freigaben eingetragen.
                    </div>
                  ) : (
                    projMembers.map((m) => (
                      <div key={m.id} className="py-1.5 flex items-center justify-between text-xs">
                        <span>
                          <strong>{m.user?.name}</strong> <span className="text-zinc-400">({m.user?.email})</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-50 text-teal-800">{m.role}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveProjectMember(m.userId)}
                            className="text-zinc-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
