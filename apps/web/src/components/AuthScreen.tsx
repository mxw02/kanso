import React, { useState } from 'react';
import {
  Layers,
  GitBranch,
  ShieldCheck,
  ArrowRight,
  Lock,
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
  onLoginSuccess: (user: UserItem, token: string) => void;
  apiBaseUrl?: string;
}

export const AuthScreen: React.FC<Props> = ({ onLoginSuccess, apiBaseUrl = 'http://localhost:4001' }) => {
  const [manualHandle, setManualHandle] = useState('');
  const [manualProvider, setManualProvider] = useState<'github' | 'gitlab'>('github');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleOAuthLogin = (provider: 'github' | 'gitlab') => {
    setIsAuthorizing(true);
    window.location.href = `${apiBaseUrl}/api/git/oauth/authorize/${provider}`;
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
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col justify-center items-center px-4 sm:px-6 py-10 relative overflow-hidden font-sans selection:bg-teal-600 selection:text-white">
      {/* Subtle Zen background accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[760px] h-[500px] bg-teal-600/[0.05] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[480px] h-[480px] bg-sky-500/[0.04] rounded-full blur-3xl pointer-events-none" />

      {/* Main card */}
      <div className="w-full max-w-md relative z-10">
        {/* Brand header */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-teal-700 text-white shadow-sm mb-3.5">
            <Layers className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-1 flex items-center justify-center gap-2">
            Kanso
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200/80 font-semibold">
              v1.2
            </span>
          </h1>
          <p className="text-xs text-zinc-500">
            Agent-First Issue & Project Management. Reduziert auf das Wesentliche.
          </p>
        </div>

        {/* Auth Container */}
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-100">
            <Lock className="w-4 h-4 text-teal-700" />
            <h2 className="text-sm font-semibold text-zinc-900">
              Anmeldung über Versionskontrolle
            </h2>
          </div>

          <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
            Melde dich mit deinem GitHub- oder GitLab-Account an, um auf deine Boards, Workflows und Agenten zuzugreifen.
          </p>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              {authError}
            </div>
          )}

          {/* Primary OAuth Actions */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => handleOAuthLogin('github')}
              disabled={isAuthorizing}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white transition shadow-xs group font-medium text-xs cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 fill-current text-white" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>Mit GitHub anmelden</span>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 group-hover:text-white transition" />
            </button>

            <button
              type="button"
              onClick={() => handleOAuthLogin('gitlab')}
              disabled={isAuthorizing}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 hover:border-orange-300 transition shadow-xs group font-medium text-xs cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#FC6D26" d="M22.65 14.39L20.6 8.08c-.14-.42-.55-.7-.99-.7-.45 0-.85.28-.99.7l-1.92 5.92H7.3L5.38 8.08c-.14-.42-.54-.7-.99-.7-.44 0-.85.28-.99.7L1.35 14.39c-.15.46 0 .96.38 1.24L12 23l10.27-7.37c.38-.28.53-.78.38-1.24z" />
                  <path fill="#E24329" d="M12 23l-4.7-8.61h9.4L12 23z" />
                </svg>
                <span>Mit GitLab anmelden</span>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 group-hover:text-zinc-700 transition" />
            </button>
          </div>

          {/* Quick Direct Git-Handle Login */}
          <div className="mt-5 pt-4 border-t border-zinc-100">
            <span className="text-[11px] font-medium text-zinc-500 mb-2 block">
              Oder direkt mit Git-Handle autorisieren:
            </span>
            <form onSubmit={handleManualGitLogin} className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2 text-xs text-zinc-400 font-mono">@</span>
                <input
                  type="text"
                  value={manualHandle}
                  onChange={(e) => setManualHandle(e.target.value)}
                  placeholder="z. B. mxw02"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-7 pr-3 py-1.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-600/15"
                />
              </div>
              <select
                value={manualProvider}
                onChange={(e) => setManualProvider(e.target.value as any)}
                className="bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-zinc-700 focus:bg-white focus:outline-none focus:border-teal-500 cursor-pointer"
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
              <button
                type="submit"
                disabled={!manualHandle.trim() || isAuthorizing}
                className="px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer flex items-center justify-center shadow-xs"
              >
                Login
              </button>
            </form>
          </div>
        </div>

        {/* Feature Highlights Footer */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center text-zinc-500 text-[11px]">
          <div className="flex flex-col items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Zero Password</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <GitBranch className="w-4 h-4 text-teal-700" />
            <span>GitHub & GitLab</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Rollen & Teams</span>
          </div>
        </div>
      </div>
    </div>
  );
};
