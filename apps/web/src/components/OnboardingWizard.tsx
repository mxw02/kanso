import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Layers,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  Bot,
  Zap,
  LayoutGrid,
  CheckCircle2,
  X,
  Code2,
  ShieldCheck,
  Kanban,
  GitBranch,
  FolderGit2,
  ChevronDown,
} from 'lucide-react';

interface GitRepoItem {
  fullName: string;
  name: string;
  description?: string;
  language?: string;
}

const DEFAULT_REPOS: GitRepoItem[] = [
  { fullName: 'mxw02/kanso', name: 'kanso', description: 'Next-gen open source Jira alternative with MCP', language: 'TypeScript' },
  { fullName: 'mxw02/kanso-mcp-agent', name: 'kanso-mcp-agent', description: 'Autonomous Coding & Triage MCP Agent', language: 'Python' },
  { fullName: 'mxw02/kanso-infra', name: 'kanso-infra', description: 'Docker Compose, Kubernetes & Deployments', language: 'HCL' },
  { fullName: 'mxw02/web-client', name: 'web-client', description: 'Vite & React frontend dashboard', language: 'TypeScript' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (projectData: {
    name: string;
    key: string;
    description: string;
    columns: { id: string; title: string }[];
    seedSampleIssues: boolean;
    selectedAgents: string[];
    gitProvider?: string;
    gitRepo?: string;
    gitBranch?: string;
  }) => Promise<void>;
}

interface WorkflowTemplate {
  id: string;
  title: string;
  badge?: string;
  description: string;
  icon: React.ReactNode;
  columns: { id: string; title: string }[];
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'agentic',
    title: 'Agent-First Engineering',
    badge: 'Empfohlen',
    description: 'Für Teams, in denen autonome KI-Agenten Tickets triagieren, Code schreiben und Reviews durchführen.',
    icon: <Sparkles className="w-5 h-5 text-indigo-600" />,
    columns: [
      { id: 'BACKLOG', title: 'Backlog' },
      { id: 'SPEC_TRIAGE', title: 'Spec / Triage' },
      { id: 'IN_AGENT_DEV', title: 'In Agent Dev' },
      { id: 'REVIEW', title: 'Review & QA' },
      { id: 'DONE', title: 'Done' },
    ],
  },
  {
    id: 'agile',
    title: 'Klassisches Agile / Scrum',
    description: 'Der bewährte Standard für Entwicklerteams mit geregelten Review- und Testzyklen.',
    icon: <Kanban className="w-5 h-5 text-slate-700" />,
    columns: [
      { id: 'BACKLOG', title: 'Backlog' },
      { id: 'TODO', title: 'To Do' },
      { id: 'IN_PROGRESS', title: 'In Progress' },
      { id: 'IN_REVIEW', title: 'In Review' },
      { id: 'DONE', title: 'Done' },
    ],
  },
  {
    id: 'minimal',
    title: 'Lean Zen Minimalist',
    description: 'Maximale Reduktion auf drei essentielle Phasen ohne bürokratische Reibung.',
    icon: <Zap className="w-5 h-5 text-amber-600" />,
    columns: [
      { id: 'TODO', title: 'To Do' },
      { id: 'DOING', title: 'Doing' },
      { id: 'DONE', title: 'Done' },
    ],
  },
];

export const OnboardingWizard: React.FC<Props> = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // Step 1: Mode & Project Basics
  const [creationMode, setCreationMode] = useState<'git' | 'manual'>('git');
  const [gitProvider, setGitProvider] = useState<'GITHUB' | 'GITLAB'>('GITHUB');
  const [gitRepo, setGitRepo] = useState('mxw02/kanso');
  const [gitBranch, setGitBranch] = useState('main');
  const [repos, setRepos] = useState<GitRepoItem[]>(DEFAULT_REPOS);
  const [isCustomRepo, setIsCustomRepo] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);

  const [projectName, setProjectName] = useState('Kanso Core');
  const [projectKey, setProjectKey] = useState('KAN');
  const [projectDescription, setProjectDescription] = useState('Autonomes Kanban & Git-Board für mxw02/kanso');

  const API_URL = import.meta.env.VITE_API_URL || '';

  // Fetch Repositories on provider change
  useEffect(() => {
    if (!isOpen) return;

    const loadRepos = async () => {
      try {
        setLoadingRepos(true);
        const res = await fetch(`${API_URL}/api/git/repos?provider=${gitProvider.toLowerCase()}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setRepos(data);
          }
        }
      } catch (err) {
        // Fallback
      } finally {
        setLoadingRepos(false);
      }
    };

    loadRepos();
  }, [isOpen, gitProvider]);

  // Step 2: Workflow Template
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('agentic');

  // Step 3: Stages / Columns
  const [columns, setColumns] = useState<{ id: string; title: string }[]>(
    WORKFLOW_TEMPLATES[0].columns
  );
  const [newStageTitle, setNewStageTitle] = useState('');

  // Step 4: Agents & Sample Data
  const [selectedAgents, setSelectedAgents] = useState<string[]>([
    'agent-triage-v1',
    'agent-coder-v1',
    'agent-reviewer-v1',
  ]);
  const [seedSampleIssues, setSeedSampleIssues] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleRepoChange = (repo: string, prov = gitProvider) => {
    setGitRepo(repo);
    const cleanRepo = repo.trim();
    if (cleanRepo) {
      const parts = cleanRepo.split('/');
      const repoName = parts.length > 1 ? parts[1] : parts[0];
      const formattedName = repoName.charAt(0).toUpperCase() + repoName.slice(1);
      setProjectName(formattedName);
      
      const keyGen = repoName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'GIT';
      setProjectKey(keyGen);
      setProjectDescription(`Git-Repository ${cleanRepo} (${prov === 'GITLAB' ? 'GitLab' : 'GitHub'}) mit automatischer Issue-Synchronisation`);
    }
  };

  // Auto-generate project key from name if untouched or standard
  const handleNameChange = (val: string) => {
    setProjectName(val);
    const words = val.trim().split(/\s+/);
    let key = '';
    if (words.length === 1 && words[0].length >= 3) {
      key = words[0].substring(0, 4).toUpperCase();
    } else if (words.length > 1) {
      key = words.map((w) => w[0]).join('').substring(0, 5).toUpperCase();
    } else {
      key = 'PROJ';
    }
    setProjectKey(key.replace(/[^A-Z0-9]/g, ''));
  };

  const handleSelectWorkflow = (template: WorkflowTemplate) => {
    setSelectedWorkflowId(template.id);
    setColumns([...template.columns]);
  };

  const handleAddStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageTitle.trim()) return;
    const cleanId = newStageTitle.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    setColumns([...columns, { id: cleanId, title: newStageTitle.trim() }]);
    setNewStageTitle('');
  };

  const handleRemoveStage = (id: string) => {
    if (columns.length <= 2) return; // Keep at least 2 stages
    setColumns(columns.filter((c) => c.id !== id));
  };

  const toggleAgent = (agentId: string) => {
    if (selectedAgents.includes(agentId)) {
      setSelectedAgents(selectedAgents.filter((a) => a !== agentId));
    } else {
      setSelectedAgents([...selectedAgents, agentId]);
    }
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      await onComplete({
        name: projectName.trim(),
        key: projectKey.trim().toUpperCase(),
        description: projectDescription.trim(),
        columns,
        seedSampleIssues,
        selectedAgents,
        gitProvider: creationMode === 'git' ? gitProvider : undefined,
        gitRepo: creationMode === 'git' && gitRepo.trim() ? gitRepo.trim() : undefined,
        gitBranch: creationMode === 'git' ? (gitBranch.trim() || 'main') : undefined,
      });
      localStorage.setItem('kanso_onboarding_completed', 'true');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Step Indicator */}
        <div className="px-8 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
              簡
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Kanso Projekt-Einrichtung</h2>
              <p className="text-[11px] text-slate-400">Schritt {currentStep} von {totalSteps}</p>
            </div>
          </div>

          {/* Step Bubbles */}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition ${
                  step === currentStep
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : step < currentStep
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {step < currentStep ? <Check className="w-3.5 h-3.5" /> : step}
              </div>
            ))}

            <button
              onClick={onClose}
              className="ml-3 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step Content */}
        <div className="p-8 flex-1 overflow-y-auto max-h-[68vh]">
          {/* ======================================================== */}
          {/* STEP 1: BASISDATEN & KÜRZEL / GIT REPO                   */}
          {/* ======================================================== */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  {creationMode === 'git' ? 'Aus Git-Repository starten' : 'Neues Projekt manuell anlegen'}
                </h3>
                <p className="text-xs text-slate-500">
                  Verbinde ein GitHub / GitLab Repository für automatischen Issue- & Commit-Sync oder erstelle ein klassisches Board.
                </p>
              </div>

              {/* Mode Selector Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCreationMode('git')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                    creationMode === 'git'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FolderGit2 className="w-4 h-4 text-indigo-600" />
                  <span>Aus Git-Repo (GitHub / GitLab)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreationMode('manual')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                    creationMode === 'manual'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4 text-slate-500" />
                  <span>Manuelles Board</span>
                </button>
              </div>

              {/* Git Config Box */}
              {creationMode === 'git' && (
                <div className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-700 font-semibold text-xs">Git Provider & Repository *</label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setGitProvider('GITHUB');
                          handleRepoChange(gitRepo, 'GITHUB');
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                          gitProvider === 'GITHUB'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        GitHub
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGitProvider('GITLAB');
                          handleRepoChange(gitRepo, 'GITLAB');
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                          gitProvider === 'GITLAB'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        GitLab
                      </button>
                    </div>
                  </div>

                  {/* Git Repository Dropdown */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Git-Projekt / Repository auswählen *
                      </label>
                      {loadingRepos && (
                        <span className="text-[10px] text-indigo-600 font-medium animate-pulse">
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
                            handleRepoChange(val);
                          }
                        }}
                        className="w-full appearance-none bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 pr-9 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                      >
                        <option value="" disabled>-- Bitte Git-Projekt auswählen --</option>
                        {repos.map((r) => (
                          <option key={r.fullName} value={r.fullName}>
                            {r.fullName} {r.language ? `(${r.language})` : ''} {r.description ? `— ${r.description.slice(0, 35)}...` : ''}
                          </option>
                        ))}
                        <option value="__CUSTOM__">✏️ Anderes Repository manuell eingeben...</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Custom Input fallback */}
                  {isCustomRepo && (
                    <div className="animate-in fade-in duration-150">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        Eigenes Repository angeben (owner/repo)
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        placeholder="z. B. mxw02/mein-repo"
                        value={gitRepo}
                        onChange={(e) => handleRepoChange(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  )}

                  {/* Quick Select Presets */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-slate-500 font-medium">Vorschläge:</span>
                    {repos.slice(0, 3).map((r) => (
                      <button
                        key={r.fullName}
                        type="button"
                        onClick={() => {
                          setIsCustomRepo(false);
                          handleRepoChange(r.fullName);
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded-md border font-mono transition ${
                          gitRepo === r.fullName && !isCustomRepo
                            ? 'bg-indigo-100/70 border-indigo-300 text-indigo-700 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-indigo-100/60 flex items-center justify-between text-[11px] text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Default Branch:</span>
                      <input
                        type="text"
                        value={gitBranch}
                        onChange={(e) => setGitBranch(e.target.value)}
                        className="bg-white border border-slate-200 rounded px-2 py-0.5 text-[11px] font-mono text-slate-800 w-20 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <span className="text-[10px] text-indigo-600 font-medium">
                      Auto-Close: Fixes #{projectKey || 'KAN'}-42
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1.5">Projekt- / Board-Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="z. B. Customer Mobile App, AI Backend"
                    value={projectName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1.5">
                      Projekt-Kürzel * <span className="text-slate-400 font-normal">(2-5 Großbuchstaben)</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="z. B. CORE"
                      value={projectKey}
                      onChange={(e) => setProjectKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-indigo-600 uppercase focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-center">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Vorschau Ticket-ID</span>
                    <span className="text-base font-mono font-bold text-slate-800">
                      {projectKey ? `${projectKey}-42` : 'KEY-42'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1.5">Beschreibung / Ziel</label>
                  <textarea
                    rows={2}
                    placeholder="Woran arbeitet das Team in diesem Projekt?"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 2: WORKFLOW & METHODIK                              */}
          {/* ======================================================== */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Wähle deinen Workflow</h3>
                <p className="text-xs text-slate-500">
                  Entscheide, wie Tickets durch dein Board wandern. Du kannst die Spalten im nächsten Schritt noch feinjustieren.
                </p>
              </div>

              <div className="space-y-3">
                {WORKFLOW_TEMPLATES.map((tmpl) => {
                  const isSelected = selectedWorkflowId === tmpl.id;
                  return (
                    <div
                      key={tmpl.id}
                      onClick={() => handleSelectWorkflow(tmpl)}
                      className={`p-4 rounded-2xl border cursor-pointer transition flex items-start gap-3.5 ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/40 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="p-2 rounded-xl bg-white border border-slate-200 shrink-0">
                        {tmpl.icon}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-xs font-bold text-slate-900">{tmpl.title}</h4>
                          {tmpl.badge && (
                            <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                              {tmpl.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed mb-2.5">{tmpl.description}</p>

                        {/* Column Preview Chips */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {tmpl.columns.map((col, idx) => (
                            <span
                              key={col.id}
                              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200"
                            >
                              <span>{col.title}</span>
                              {idx < tmpl.columns.length - 1 && <span className="text-slate-300">→</span>}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-1">
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 3: STAGES & STATUS-SPALTEN ANPASSEN                 */}
          {/* ======================================================== */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Passe deine Stages an</h3>
                <p className="text-xs text-slate-500">
                  Benenne deine Status-Spalten um, füge neue Zwischenschritte hinzu oder lösche nicht benötigte Stages.
                </p>
              </div>

              {/* Board Columns list */}
              <div className="space-y-2">
                {columns.map((col, idx) => (
                  <div
                    key={col.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 font-mono text-[10px] flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={col.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setColumns(
                            columns.map((c) => (c.id === col.id ? { ...c, title: val } : c))
                          );
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500"
                      />
                      <span className="font-mono text-[11px] text-slate-400">ID: {col.id}</span>
                    </div>

                    <button
                      type="button"
                      disabled={columns.length <= 2}
                      onClick={() => handleRemoveStage(col.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add stage input */}
              <form onSubmit={handleAddStage} className="flex gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Neue Stage hinzufügen (z. B. QA Verification)..."
                  value={newStageTitle}
                  onChange={(e) => setNewStageTitle(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!newStageTitle.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-40 rounded-xl text-xs font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Stage hinzufügen</span>
                </button>
              </form>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 4: AUTONOME AGENTEN & BEISPIELDATEN                 */}
          {/* ======================================================== */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Aktiviere autonome Agenten</h3>
                <p className="text-xs text-slate-500">
                  Kanso unterstützt Dual-Citizen Assignees. Wähle KI-Agenten, die direkt in deinen Sprint integriert werden.
                </p>
              </div>

              <div className="space-y-2.5 text-xs">
                {[
                  {
                    id: 'agent-triage-v1',
                    name: 'agent-triage-v1',
                    role: 'Automatisierte Ticket-Triage & Task Breakdown',
                    icon: <Bot className="w-4 h-4 text-emerald-600" />,
                  },
                  {
                    id: 'agent-coder-v1',
                    name: 'agent-coder-v1',
                    role: 'Code-Generierung, Bugfixing & PR-Erstellung',
                    icon: <Code2 className="w-4 h-4 text-indigo-600" />,
                  },
                  {
                    id: 'agent-reviewer-v1',
                    name: 'agent-reviewer-v1',
                    role: 'Code Review, Sicherheitsaudits & Akzeptanzprüfung',
                    icon: <ShieldCheck className="w-4 h-4 text-blue-600" />,
                  },
                ].map((agent) => {
                  const isActive = selectedAgents.includes(agent.id);
                  return (
                    <div
                      key={agent.id}
                      onClick={() => toggleAgent(agent.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        isActive
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white border border-slate-200">
                          {agent.icon}
                        </div>
                        <div>
                          <span className="font-mono font-bold text-slate-900 text-xs">{agent.name}</span>
                          <p className="text-slate-500 text-[11px]">{agent.role}</p>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                          isActive
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isActive && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sample issues toggle */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="seedSampleIssues"
                  checked={seedSampleIssues}
                  onChange={(e) => setSeedSampleIssues(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="seedSampleIssues" className="text-xs text-slate-700 cursor-pointer">
                  <span className="font-bold text-slate-900 block mb-0.5">
                    Beispieltickets mit Agenten-Workflows generieren
                  </span>
                  Erstellt initial 3 auf deinen Workflow abgestimmte Tickets (inkl. Agenten-Zuweisung, Subtasks und Aktivitätslog), damit das Board sofort erlebbar ist.
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-8 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep(currentStep - 1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Zurück</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium px-3 py-2"
            >
              Abbrechen
            </button>

            {currentStep < totalSteps ? (
              <button
                type="button"
                disabled={!projectName.trim() || !projectKey.trim()}
                onClick={() => setCurrentStep(currentStep + 1)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold shadow-xs transition"
              >
                <span>Weiter</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinish}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold shadow-sm shadow-indigo-600/30 transition active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>{isSubmitting ? 'Richte Projekt ein...' : 'Projekt einrichten & loslegen'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
