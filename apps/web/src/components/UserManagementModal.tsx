import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  Trash2,
  Search,
  ExternalLink,
  Check,
  AlertCircle,
  GitBranch,
  KeyRound,
  Sparkles,
} from 'lucide-react';

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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserItem;
  onUserUpdated?: () => void;
  apiBaseUrl?: string;
}

export const UserManagementModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
  apiBaseUrl = 'http://localhost:4001',
}) => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'MEMBER' | 'VIEWER'>('ALL');
  const [activeTab, setActiveTab] = useState<'members' | 'invite' | 'permissions'>('members');

  // Invite Form state
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER');
  const [inviteProvider, setInviteProvider] = useState<'github' | 'gitlab'>('github');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isAdmin = currentUser.role === 'ADMIN';

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error('Failed to load users:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'ADMIN' | 'MEMBER' | 'VIEWER') => {
    if (!isAdmin) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        const updated = await res.json();
        setUsers(users.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
        setSuccessMsg(`Rolle von ${updated.name} auf ${updated.role} geändert.`);
        if (onUserUpdated) onUserUpdated();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Rollenänderung fehlgeschlagen');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Verbindungsfehler');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!isAdmin) return;
    if (userId === currentUser.id) {
      setErrorMsg('Du kannst deinen eigenen Account nicht löschen.');
      return;
    }

    if (!window.confirm(`Möchtest du das Mitglied "${userName}" wirklich entfernen?`)) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/users/${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setUsers(users.filter((u) => u.id !== userId));
        setSuccessMsg(`Mitglied "${userName}" wurde entfernt.`);
        if (onUserUpdated) onUserUpdated();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Löschen fehlgeschlagen');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Verbindungsfehler');
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setErrorMsg('Name und E-Mail sind erforderlich.');
      return;
    }

    setInviting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
          gitProvider: inviteProvider,
          gitUsername: inviteUsername.trim().replace(/^@/, '') || undefined,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setUsers([...users, created]);
        setSuccessMsg(`Nutzer "${created.name}" wurde erfolgreich autorisiert.`);
        setInviteName('');
        setInviteEmail('');
        setInviteUsername('');
        setActiveTab('members');
        if (onUserUpdated) onUserUpdated();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Autorisierung fehlgeschlagen.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Netzwerkfehler');
    } finally {
      setInviting(false);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.gitUsername && u.gitUsername.toLowerCase().includes(search.toLowerCase()));

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shadow-2xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-800">Nutzerverwaltung</h2>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-zinc-200/70 text-zinc-700">
                  {users.length} {users.length === 1 ? 'Mitglied' : 'Mitglieder'}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Team-Mitglieder, Rollenberechtigungen und autorisierte Git-Identitäten
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/60 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-zinc-100 flex items-center gap-6 bg-white text-xs font-medium text-zinc-500">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`py-3 border-b-2 font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'members'
                ? 'border-teal-700 text-teal-700 font-semibold'
                : 'border-transparent hover:text-zinc-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Mitgliederliste
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('invite')}
              className={`py-3 border-b-2 font-medium transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'invite'
                  ? 'border-teal-700 text-teal-700 font-semibold'
                  : 'border-transparent hover:text-zinc-800'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Nutzer autorisieren
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={`py-3 border-b-2 font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'permissions'
                ? 'border-teal-700 text-teal-700 font-semibold'
                : 'border-transparent hover:text-zinc-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Berechtigungsmatrix
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'members' && (
            <div className="space-y-4">
              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Mitglieder nach Name, E-Mail oder Git-Handle suchen..."
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-teal-600 focus:bg-white transition"
                  />
                </div>
                <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl self-stretch sm:self-auto">
                  {(['ALL', 'ADMIN', 'MEMBER', 'VIEWER'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoleFilter(r)}
                      className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition cursor-pointer ${
                        roleFilter === r
                          ? 'bg-white text-zinc-800 shadow-2xs font-semibold'
                          : 'text-zinc-600 hover:text-zinc-800'
                      }`}
                    >
                      {r === 'ALL' ? 'Alle' : r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Members Table */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-4">Nutzer</th>
                      <th className="py-2.5 px-4">Git-Identität</th>
                      <th className="py-2.5 px-4">Rolle</th>
                      <th className="py-2.5 px-4 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-zinc-400">
                          Keine Mitglieder gefunden.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isSelf = u.id === currentUser.id;
                        return (
                          <tr key={u.id} className="hover:bg-zinc-50/70 transition">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs overflow-hidden shrink-0 border border-zinc-200">
                                  {u.avatarUrl ? (
                                    <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                                  ) : (
                                    u.name.charAt(0)
                                  )}
                                </div>
                                <div>
                                  <div className="font-semibold text-zinc-800 flex items-center gap-1.5">
                                    <span>{u.name}</span>
                                    {isSelf && (
                                      <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.2 rounded font-normal">
                                        Du
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-zinc-500 font-mono">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {u.gitUsername ? (
                                <a
                                  href={
                                    u.gitProvider === 'gitlab'
                                      ? `https://gitlab.com/${u.gitUsername}`
                                      : `https://github.com/${u.gitUsername}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 text-[11px] font-mono group transition"
                                >
                                  {u.gitProvider === 'gitlab' ? (
                                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                                  ) : (
                                    <span className="w-2 h-2 rounded-full bg-zinc-800" />
                                  )}
                                  <span>@{u.gitUsername}</span>
                                  <ExternalLink className="w-3 h-3 text-zinc-400 group-hover:text-zinc-700 transition" />
                                </a>
                              ) : (
                                <span className="text-[11px] text-zinc-400 italic">Nicht verknüpft</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {isAdmin && !isSelf ? (
                                <select
                                  value={u.role}
                                  onChange={(e) => handleRoleChange(u.id, e.target.value as any)}
                                  className={`text-xs font-semibold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none transition ${
                                    u.role === 'ADMIN'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : u.role === 'MEMBER'
                                      ? 'bg-teal-50 text-teal-800 border-teal-200'
                                      : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                                  }`}
                                >
                                  <option value="ADMIN">ADMIN</option>
                                  <option value="MEMBER">MEMBER</option>
                                  <option value="VIEWER">VIEWER</option>
                                </select>
                              ) : (
                                <span
                                  className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                    u.role === 'ADMIN'
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                      : u.role === 'MEMBER'
                                      ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                      : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                                  }`}
                                >
                                  {u.role}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {isAdmin && !isSelf && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u.id, u.name)}
                                  className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                  title="Nutzer entfernen"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'invite' && (
            <form onSubmit={handleInviteSubmit} className="space-y-4 max-w-lg mx-auto">
              <div className="bg-teal-50/70 border border-teal-100 rounded-xl p-4 text-xs text-teal-950 leading-relaxed flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block mb-0.5">Automatische Autorisierung</span>
                  Hinterlege hier die Git-Identität eines neuen Mitarbeiters. Sobald sich dieser über GitHub oder GitLab anmeldet, wird sein Profil direkt autorisiert und mit den festgelegten Rechten ausgestattet.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Vollständiger Name *
                </label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="z. B. Max Mustermann"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  E-Mail-Adresse *
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="max@company.com"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-teal-600 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Git-Provider
                  </label>
                  <select
                    value={inviteProvider}
                    onChange={(e) => setInviteProvider(e.target.value as any)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-teal-600 cursor-pointer"
                  >
                    <option value="github">GitHub</option>
                    <option value="gitlab">GitLab</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Git-Username / Handle
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-zinc-400 font-mono">@</span>
                    <input
                      type="text"
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      placeholder="username"
                      className="w-full pl-7 pr-3 py-2 border border-zinc-300 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-teal-600 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Rolle & Berechtigung *
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-teal-600 cursor-pointer font-medium"
                >
                  <option value="MEMBER">MEMBER — Volle Mitarbeit an Issues & Sprints</option>
                  <option value="ADMIN">ADMIN — Volle Administration & Nutzerverwaltung</option>
                  <option value="VIEWER">VIEWER — Nur-Lese-Zugriff auf Tickets</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('members')}
                  className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {inviting ? 'Wird autorisiert...' : 'Nutzer autorisieren'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Kanso verwendet ein Rollenmodell für maximale Klarheit. Authentifizierte Git-Nutzer erhalten je nach zugewiesener Rolle folgende Berechtigungen:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Admin */}
                <div className="border border-rose-200 rounded-xl p-4 bg-rose-50/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                      ADMIN
                    </span>
                    <span className="text-xs font-semibold text-zinc-800">Volle Kontrolle</span>
                  </div>
                  <ul className="text-[11px] text-zinc-600 space-y-1.5 list-disc list-inside">
                    <li>Nutzerverwaltung & Rollen zuweisen</li>
                    <li>Projekte erstellen, konfigurieren & löschen</li>
                    <li>Git-Verbindungen & Repositories verwalten</li>
                    <li>Sprints planen, starten & abschließen</li>
                    <li>Issues uneingeschränkt verwalten</li>
                  </ul>
                </div>

                {/* Member */}
                <div className="border border-teal-200 rounded-xl p-4 bg-teal-50/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-900">
                      MEMBER
                    </span>
                    <span className="text-xs font-semibold text-zinc-800">Entwickler & Planer</span>
                  </div>
                  <ul className="text-[11px] text-zinc-600 space-y-1.5 list-disc list-inside">
                    <li>Issues erstellen, zuweisen & bearbeiten</li>
                    <li>Status auf Kanban-Board per Drag & Drop verschieben</li>
                    <li>Subtasks, Abhängigkeiten & Kommentare pflegen</li>
                    <li>Sprints einsehen und bearbeiten</li>
                    <li>Kein Zugriff auf administrative Löschungen</li>
                  </ul>
                </div>

                {/* Viewer */}
                <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-zinc-200 text-zinc-700">
                      VIEWER
                    </span>
                    <span className="text-xs font-semibold text-zinc-800">Nur Lesen</span>
                  </div>
                  <ul className="text-[11px] text-zinc-600 space-y-1.5 list-disc list-inside">
                    <li>Einsicht in Boards, Listen und Backlog</li>
                    <li>Details zu Tickets & Kommentaren lesen</li>
                    <li>Sprint-Status und Fortschritt beobachten</li>
                    <li>Keine Schreib- oder Bearbeitungsrechte</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
            <span>Git OAuth Authentifizierung aktiv</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-medium transition cursor-pointer text-xs"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
