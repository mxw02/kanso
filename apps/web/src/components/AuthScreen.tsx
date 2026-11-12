import React, { useState, useEffect } from 'react';
import {
  Layers,
  GitBranch,
  ShieldCheck,
  ArrowRight,
  User,
  CheckCircle2,
  Lock,
  Sparkles,
  ExternalLink,
  Users,
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
  onLoginSuccess: (user: UserItem, token: string) => void;
  apiBaseUrl?: string;
}

export const AuthScreen: React.FC<Props> = ({ onLoginSuccess, apiBaseUrl = 'http://localhost:4001' }) => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [manualHandle, setManualHandle] = useState('');
  const [manualProvider, setManualProvider] = useState<'github' | 'gitlab'>('github');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error('Failed to load users:', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOAuthLogin = (provider: 'github' | 'gitlab') => {
    setIsAuthorizing(true);
    window.location.href = `${apiBaseUrl}/api/git/oauth/authorize/${provider}`;
  };

  const handleSwitchUser = async (u: UserItem) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/switch-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id }),
      });
      if (res.ok) {
        const data = await res.json();
        onLoginSuccess(data.user, data.token);
      } else {
        setAuthError('Anmeldung fehlgeschlagen');
      }
    } catch (e: any) {
      setAuthError(e.message || 'Verbindungsfehler');
    }
  };

  const handleManualGitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualHandle.trim()) return;

    setIsAuthorizing(true);
    setAuthError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/git-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: manualProvider,
          username: manualHandle.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onLoginSuccess(data.user, data.token);
      } else {
        const err = await res.json();
        setAuthError(err.error || 'Git-Autorisierung fehlgeschlagen');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Netzwerkfehler');
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center px-4 sm:px-6 relative overflow-hidden font-sans selection:bg-indigo-500 selection:text-white">
      {/* Background radial gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-sky-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main card */}
      <div className="w-full max-w-md relative z-10">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-xl shadow-indigo-600/25 mb-4 ring-1 ring-white/20">
            <Layers className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1.5 flex items-center justify-center gap-2">
            Kanso
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
              v1.2
            </span>
          </h1>
          <p className="text-sm text-slate-400">
            Issue & Project Management. Reduziert auf das Wesentliche.
          </p>
        </div>

        {/* Auth Container */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700/60">
            <Lock className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-200">
              Autorisierung über Versionskontrolle
            </h2>
          </div>

          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Kanso erzwingt GitHub & GitLab als primäre Identitäts- und Anmeldemethode. Nutzer werden eindeutig über ihren Git-Account autorisiert.
          </p>

          {authError && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              {authError}
            </div>
          )}

          {/* Primary OAuth Actions */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleOAuthLogin('github')}
              disabled={isAuthorizing}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 hover:bg-black text-white border border-slate-700/80 hover:border-slate-600 transition shadow-sm group font-medium text-xs cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>Mit GitHub anmelden</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-white transition" />
            </button>

            <button
              type="button"
              onClick={() => handleOAuthLogin('gitlab')}
              disabled={isAuthorizing}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/90 hover:bg-slate-900 text-white border border-slate-700/80 hover:border-orange-500/40 transition shadow-sm group font-medium text-xs cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#FC6D26" d="M22.65 14.39L20.6 8.08c-.14-.42-.55-.7-.99-.7-.45 0-.85.28-.99.7l-1.92 5.92H7.3L5.38 8.08c-.14-.42-.54-.7-.99-.7-.44 0-.85.28-.99.7L1.35 14.39c-.15.46 0 .96.38 1.24L12 23l10.27-7.37c.38-.28.53-.78.38-1.24z" />
                  <path fill="#E24329" d="M12 23l-4.7-8.61h9.4L12 23z" />
                </svg>
                <span>Mit GitLab anmelden</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-white transition" />
            </button>
          </div>

          {/* Quick Direct Git-Handle Login */}
          <div className="mt-5 pt-4 border-t border-slate-700/60">
            <span className="text-[11px] font-medium text-slate-400 mb-2 block">
              Oder direkt mit Git-Handle autorisieren:
            </span>
            <form onSubmit={handleManualGitLogin} className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">@</span>
                <input
                  type="text"
                  value={manualHandle}
                  onChange={(e) => setManualHandle(e.target.value)}
                  placeholder="z. B. mxw02"
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-7 pr-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <select
                value={manualProvider}
                onChange={(e) => setManualProvider(e.target.value as any)}
                className="bg-slate-900/90 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
              <button
                type="submit"
                disabled={!manualHandle.trim() || isAuthorizing}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition cursor-pointer flex items-center justify-center shadow-sm"
              >
                Login
              </button>
            </form>
          </div>

          {/* Workspace Team Accounts (Switching / Testing) */}
          {users.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-700/60">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  Bestehende Workspace-Mitglieder:
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Workspace</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSwitchUser(u)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/50 hover:bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0 border border-slate-600">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          u.name.charAt(0)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-200 truncate group-hover:text-indigo-300 transition">
                          {u.name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate flex items-center gap-1">
                          <span>{u.gitUsername ? `@${u.gitUsername}` : u.email}</span>
                          {u.gitProvider && (
                            <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 uppercase font-semibold">
                              {u.gitProvider}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[9px] font-semibold px-2 py-0.5 rounded-md font-mono shrink-0 ${
                        u.role === 'ADMIN'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : u.role === 'MEMBER'
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}
                    >
                      {u.role}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Feature Highlights Footer */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center text-slate-500 text-[11px]">
          <div className="flex flex-col items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Zero Password</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <GitBranch className="w-4 h-4 text-indigo-400" />
            <span>GitHub & GitLab</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Rollen & Teams</span>
          </div>
        </div>
      </div>
    </div>
  );
};
