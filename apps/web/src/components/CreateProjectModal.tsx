import React, { useState } from 'react';
import { Layers, X, GitBranch, Sparkles } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: {
    key: string;
    name: string;
    description: string;
    gitProvider?: string;
    gitRepo?: string;
    gitBranch?: string;
  }) => Promise<void>;
}

export const CreateProjectModal: React.FC<Props> = ({ isOpen, onClose, onCreate }) => {
  const [mode, setMode] = useState<'manual' | 'git'>('git');
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Git state
  const [gitProvider, setGitProvider] = useState<'github' | 'gitlab'>('github');
  const [gitRepo, setGitRepo] = useState('mxw02/kanso');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSelectPresetRepo = (repoStr: string) => {
    setGitRepo(repoStr);
    const base = repoStr.split('/')[1] || repoStr;
    setName(base);
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
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">Neues Projekt anlegen</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('git');
              if (!name) handleSelectPresetRepo('mxw02/kanso');
            }}
            className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === 'git' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Aus Git-Repo (GitHub / GitLab)</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === 'manual' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Manuelles Board</span>
          </button>
        </div>

        {/* Git Mode Fields */}
        {mode === 'git' && (
          <div className="p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/30 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700">Git Provider</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGitProvider('github')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    gitProvider === 'github' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  GitHub
                </button>
                <button
                  type="button"
                  onClick={() => setGitProvider('gitlab')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    gitProvider === 'gitlab' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  GitLab
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Repository (owner/repo) *
              </label>
              <input
                type="text"
                required
                value={gitRepo}
                onChange={(e) => {
                  setGitRepo(e.target.value);
                  const base = e.target.value.split('/')[1] || e.target.value;
                  if (base) {
                    setName(base);
                    setKey(base.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'GIT');
                  }
                }}
                placeholder="z. B. mxw02/kanso"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-500">Schnellauswahl:</span>
              {['mxw02/kanso', 'mxw02/kanso-mcp-agent', 'acme/backend-api'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSelectPresetRepo(p)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-indigo-50 border border-slate-200 text-[10px] font-mono text-slate-700 hover:text-indigo-700"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Common Fields */}
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-slate-700 font-semibold mb-1">Projektname *</label>
              <input
                type="text"
                required
                placeholder="z. B. Kanso Platform"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Kürzel (Key) *</label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="z. B. KAN"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono uppercase font-bold focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">Beschreibung</label>
            <textarea
              rows={2}
              placeholder="Zweck und Rahmenbedingungen..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !key.trim() || !name.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs transition"
          >
            {isSubmitting ? 'Wird erstellt...' : 'Projekt & Board erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
};
