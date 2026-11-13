import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Layers,
  Sparkles,
  Bot,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Check,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Shield,
  FileText,
  Clock,
  Hash,
  FolderGit2,
  GitBranch,
  Copy,
  ExternalLink,
} from 'lucide-react';

export interface StatusColumn {
  id: string;
  title: string;
  color?: string;
}

export interface ProjectSettingsData {
  id: string;
  key: string;
  name: string;
  description?: string;
  columns?: StatusColumn[];
  stageAgents?: Record<string, { agentName: string; autoAssign: boolean }> | null;
  workflowRules?: {
    name: string;
    enforceStrictTransitions: boolean;
    transitions: {
      id: string;
      name?: string;
      from: string;
      to: string;
      enabled: boolean;
      conditions: {
        requireNoOpenBlockers?: boolean;
        requireProofOfWorkPassed?: boolean;
        requireCiSuccess?: boolean;
        requireAssignee?: boolean;
        requireNoHitlPause?: boolean;
        minReadinessScore?: number;
        allowedActors?: ('HUMAN' | 'AGENT' | 'SYSTEM')[];
      };
    }[];
  } | null;
  gitProvider?: string;
  gitRepo?: string;
  gitBranch?: string;
  gitWebhookSecret?: string;
  workspace?: {
    id: string;
    name: string;
  };
  _count?: {
    issues: number;
  };
  createdAt?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectSettingsData | null;
  onUpdateProject: (
    projectId: string,
    payload: {
      name?: string;
      key?: string;
      description?: string;
      columns?: StatusColumn[];
      stageAgents?: Record<string, { agentName: string; autoAssign: boolean }> | null;
      workflowRules?: any;
      gitProvider?: string;
      gitRepo?: string;
      gitBranch?: string;
    }
  ) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  canEdit: boolean;
  canAdmin: boolean;
}

type TabKey = 'general' | 'stages' | 'workflow' | 'agents' | 'git' | 'danger';

const DEFAULT_STAGES: StatusColumn[] = [
  { id: 'BACKLOG', title: 'Backlog' },
  { id: 'TODO', title: 'To Do' },
  { id: 'IN_PROGRESS', title: 'In Progress' },
  { id: 'IN_REVIEW', title: 'In Review' },
  { id: 'DONE', title: 'Done' },
];

const PRESET_WORKFLOWS = [
  {
    name: 'Agent-First Engineering',
    columns: [
      { id: 'BACKLOG', title: 'Backlog' },
      { id: 'SPEC_TRIAGE', title: 'Spec / Triage' },
      { id: 'IN_AGENT_DEV', title: 'In Agent Dev' },
      { id: 'REVIEW', title: 'Review & QA' },
      { id: 'DONE', title: 'Done' },
    ],
  },
  {
    name: 'Modern Zen Kanban',
    columns: [
      { id: 'BACKLOG', title: 'Backlog' },
      { id: 'READY', title: 'Ready' },
      { id: 'IN_PROGRESS', title: 'In Progress' },
      { id: 'DONE', title: 'Done' },
    ],
  },
  {
    name: 'Classic Scrum',
    columns: [
      { id: 'PRODUCT_BACKLOG', title: 'Product Backlog' },
      { id: 'SPRINT_BACKLOG', title: 'Sprint Backlog' },
      { id: 'IN_PROGRESS', title: 'In Progress' },
      { id: 'IN_REVIEW', title: 'In Review' },
      { id: 'DONE', title: 'Done' },
    ],
  },
];

export const ProjectSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  project,
  onUpdateProject,
  onDeleteProject,
  canEdit,
  canAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<StatusColumn[]>([]);
  const [stageAgents, setStageAgents] = useState<Record<string, { agentName: string; autoAssign: boolean }>>({});
  const [workflowName, setWorkflowName] = useState('Standard Agent-First Workflow');
  const [enforceStrictTransitions, setEnforceStrictTransitions] = useState(false);
  const [transitions, setTransitions] = useState<any[]>([]);
  const [selectedWorkflowStageId, setSelectedWorkflowStageId] = useState<string>('');
  const [newStageTitle, setNewStageTitle] = useState('');

  // Agent settings (local project configuration state)
  const [autoTriage, setAutoTriage] = useState(true);
  const [agentInstructions, setAgentInstructions] = useState(
    'Priorisiere Unit-Tests vor dem Merge. Halte Commits atomar und dokumentiere Schnittstellen-Änderungen.'
  );
  const [enabledAgents, setEnabledAgents] = useState<string[]>([
    'agent-triage-v1',
    'agent-coder-v1',
    'agent-reviewer-v1',
  ]);

  // Git settings
  const [gitProvider, setGitProvider] = useState<'GITHUB' | 'GITLAB'>('GITHUB');
  const [gitRepo, setGitRepo] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Danger zone
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (project && isOpen) {
      setName(project.name || '');
      setKey(project.key || '');
      setDescription(project.description || '');
      const cols = project.columns && project.columns.length > 0 ? [...project.columns] : [...DEFAULT_STAGES];
      setColumns(cols);
      setStageAgents(project.stageAgents ? { ...project.stageAgents } : {});
      setWorkflowName(project.workflowRules?.name || 'Standard Agent-First Workflow');
      setEnforceStrictTransitions(Boolean(project.workflowRules?.enforceStrictTransitions));
      setTransitions(Array.isArray(project.workflowRules?.transitions) ? [...project.workflowRules!.transitions] : []);
      setSelectedWorkflowStageId(cols[Math.min(1, cols.length - 1)]?.id || cols[0]?.id || '');
      setGitProvider((project.gitProvider as any) || 'GITHUB');
      setGitRepo(project.gitRepo || '');
      setGitBranch(project.gitBranch || 'main');
      setCopiedWebhook(false);
      setNewStageTitle('');
      setDeleteConfirmation('');
      setSaveSuccess(false);
      setErrorMsg('');
      setActiveTab('general');
    }
  }, [project, isOpen]);

  if (!isOpen || !project) return null;

  // Stages handlers
  const handleAddStage = () => {
    if (!newStageTitle.trim()) return;
    const cleanTitle = newStageTitle.trim();
    const id = cleanTitle.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `STAGE_${Date.now()}`;
    
    // Avoid duplicate IDs
    const finalId = columns.some((c) => c.id === id) ? `${id}_${Date.now()}` : id;
    setColumns([...columns, { id: finalId, title: cleanTitle }]);
    setNewStageTitle('');
  };

  const handleUpdateStageTitle = (index: number, newTitle: string) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], title: newTitle };
    setColumns(updated);
  };

  const handleRemoveStage = (index: number) => {
    if (columns.length <= 1) {
      alert('Ein Projekt muss mindestens eine Stage (Spalte) besitzen.');
      return;
    }
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleMoveStage = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    const updated = [...columns];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setColumns(updated);
  };

  const handleApplyPreset = (presetColumns: StatusColumn[]) => {
    setColumns([...presetColumns]);
  };

  // Toggle Agent
  const toggleAgent = (agentId: string) => {
    if (enabledAgents.includes(agentId)) {
      setEnabledAgents(enabledAgents.filter((a) => a !== agentId));
    } else {
      setEnabledAgents([...enabledAgents, agentId]);
    }
  };

  // Save Settings
  const handleSave = async () => {
    if (!canEdit) return;
    if (!name.trim()) {
      setErrorMsg('Projektname darf nicht leer sein.');
      return;
    }
    if (!key.trim()) {
      setErrorMsg('Projekt-Kürzel darf nicht leer sein.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg('');
      await onUpdateProject(project.id, {
        name: name.trim(),
        key: key.toUpperCase().trim(),
        description: description.trim(),
        columns,
        stageAgents,
        workflowRules: {
          name: workflowName.trim() || 'Custom Workflow',
          enforceStrictTransitions,
          transitions,
        },
        gitProvider: gitRepo.trim() ? gitProvider : undefined,
        gitRepo: gitRepo.trim() || undefined,
        gitBranch: gitRepo.trim() ? (gitBranch.trim() || 'main') : undefined,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Fehler beim Speichern der Einstellungen.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Project
  const handleDelete = async () => {
    if (!canAdmin) return;
    if (deleteConfirmation !== project.key) {
      setErrorMsg(`Bitte tippe genau '${project.key}' ein, um das Löschen zu bestätigen.`);
      return;
    }

    try {
      setIsDeleting(true);
      setErrorMsg('');
      await onDeleteProject(project.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Fehler beim Löschen des Projekts.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full bg-white overflow-hidden min-h-0">
      {/* Page Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
          >
            <span>← Zurück zum Board</span>
          </button>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Projekteinstellungen</h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
                {project.key}
              </span>
            </div>
            <p className="text-xs text-slate-500">{project.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-emerald-600 text-xs font-semibold flex items-center gap-1.5 mr-2">
              <Check className="w-3.5 h-3.5" />
              Gespeichert
            </span>
          )}
          {canEdit && activeTab !== 'danger' && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-xs transition flex items-center gap-1.5"
            >
              {isSaving ? 'Speichern...' : 'Änderungen speichern'}
            </button>
          )}
        </div>
      </div>

      {/* Body: Left Sidebar Tabs + Right Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Navigation Tabs */}
          <aside className="w-64 border-r border-slate-200 bg-slate-50/70 p-4 space-y-1 shrink-0 flex flex-col justify-between">
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('general')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  activeTab === 'general'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-4 h-4 text-slate-400" />
                <span>Allgemein</span>
              </button>

              <button
                onClick={() => setActiveTab('stages')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  activeTab === 'stages'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4 text-slate-400" />
                <span>Board Stages ({columns.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('workflow')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  activeTab === 'workflow'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <GitBranch className="w-4 h-4 text-slate-400" />
                <span>Workflow & Regeln ({transitions.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('agents')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  activeTab === 'agents'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-4 h-4 text-slate-400" />
                <span>KI & Agenten</span>
              </button>

              <button
                onClick={() => setActiveTab('git')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  activeTab === 'git'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <FolderGit2 className="w-4 h-4 text-slate-400" />
                <span>Git & Webhooks</span>
              </button>
            </div>

            {canAdmin && (
              <div className="pt-2 border-t border-slate-200">
                <button
                  onClick={() => setActiveTab('danger')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                    activeTab === 'danger'
                      ? 'bg-red-50 text-red-700 border border-red-200 font-semibold'
                      : 'text-red-600 hover:bg-red-50/60'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span>Gefahrenzone</span>
                </button>
              </div>
            )}
          </aside>

          {/* Right Content Area */}
          <main className="flex-1 overflow-y-auto p-6 bg-white">
            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* TAB 1: ALLGEMEIN */}
            {activeTab === 'general' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Projekt-Stammdaten</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Grundlegende Informationen und Kennung dieses Projekts im Workspace.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Projektname *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!canEdit}
                      placeholder="z. B. Autonomous Core"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-900 disabled:bg-slate-50"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Projekt-Kürzel (Key) *
                      </label>
                      <input
                        type="text"
                        maxLength={8}
                        value={key}
                        onChange={(e) => setKey(e.target.value.toUpperCase())}
                        disabled={!canEdit}
                        placeholder="z. B. AUTO"
                        className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-900 disabled:bg-slate-50 uppercase"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Präfix für Ticket-Identifikatoren (z. B. <span className="font-mono">{key || 'AUTO'}-1</span>)
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Workspace
                      </label>
                      <div className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-600 font-medium">
                        {project.workspace?.name || 'Standard Workspace'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Beschreibung
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={!canEdit}
                      placeholder="Wozu dient dieses Projekt? Ziele und Rahmenbedingungen..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-900 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                {/* Metadata Box */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-slate-400" />
                    <span>Tickets im Projekt:</span>
                    <strong className="text-slate-900">{project._count?.issues ?? 0} Tickets</strong>
                  </div>
                  {project.createdAt && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Erstellt am {new Date(project.createdAt).toLocaleDateString('de-DE')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: BOARD STAGES */}
            {activeTab === 'stages' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Board Stages & Workflow</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Passe die Spalten für das Kanban-Board und die Status-Pipeline dieses Projekts an.
                  </p>
                </div>

                {/* Presets */}
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Vorlage anwenden:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_WORKFLOWS.map((p) => (
                        <button
                          key={p.name}
                          onClick={() => handleApplyPreset(p.columns)}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 transition"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stages List */}
                <div className="space-y-2 max-w-2xl">
                  {columns.map((col, index) => (
                    <div
                      key={col.id || index}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition group"
                    >
                      <span className="text-xs font-mono font-semibold text-slate-400 w-6 text-center">
                        {index + 1}
                      </span>

                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={col.title}
                          onChange={(e) => handleUpdateStageTitle(index, e.target.value)}
                          disabled={!canEdit}
                          className="flex-1 px-2.5 py-1 text-xs font-semibold text-slate-800 rounded border border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-white focus:outline-none transition"
                        />
                        <span className="font-mono text-[10px] text-slate-400 uppercase px-1.5 py-0.5 bg-slate-50 rounded border border-slate-100">
                          {col.id}
                        </span>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMoveStage(index, 'up')}
                            disabled={index === 0}
                            title="Nach oben verschieben"
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveStage(index, 'down')}
                            disabled={index === columns.length - 1}
                            title="Nach unten verschieben"
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveStage(index)}
                            title="Stage löschen"
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add new stage */}
                {canEdit && (
                  <div className="flex items-center gap-2 max-w-md pt-2">
                    <input
                      type="text"
                      placeholder="Neue Stage (z. B. Quality Gate, Staging)..."
                      value={newStageTitle}
                      onChange={(e) => setNewStageTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddStage();
                        }
                      }}
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900"
                    />
                    <button
                      onClick={handleAddStage}
                      disabled={!newStageTitle.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold disabled:opacity-40 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Stage hinzufügen</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: KI & AGENTEN */}
            {activeTab === 'workflow' && (() => {
              const activeStage = columns.find((c) => c.id === selectedWorkflowStageId) || columns[0];
              const stageId = activeStage?.id || '';
              const stageRules = transitions.filter((t) => t.to === stageId && t.enabled !== false);
              const isAnySource = stageRules.some((t) => t.from === '*');
              const allowedSources = stageRules.map((t) => t.from);
              const primaryCond = stageRules[0]?.conditions || {};

              const updateStageRules = (updater: (rulesForStage: any[]) => any[]) => {
                setTransitions((prev) => {
                  const others = prev.filter((t) => t.to !== stageId);
                  const current = prev.filter((t) => t.to === stageId);
                  return [...others, ...updater(current)];
                });
              };

              const updateStageCondition = (patch: Record<string, any>) => {
                updateStageRules((current) => {
                  const base =
                    current.length > 0
                      ? current
                      : [{ id: `rule-any-${stageId}-${Date.now()}`, from: '*', to: stageId, enabled: true, conditions: {} }];
                  return base.map((r) => ({
                    ...r,
                    enabled: true,
                    conditions: { ...(r.conditions || {}), ...patch },
                  }));
                });
              };

              const toggleSourceStage = (fromId: string) => {
                updateStageRules((current) => {
                  if (fromId === '*') {
                    return [
                      {
                        id: `rule-any-${stageId}-${Date.now()}`,
                        from: '*',
                        to: stageId,
                        enabled: true,
                        conditions: primaryCond,
                      },
                    ];
                  }
                  const withoutAny = current.filter((r) => r.from !== '*');
                  const exists = withoutAny.some((r) => r.from === fromId);
                  if (exists) {
                    return withoutAny.filter((r) => r.from !== fromId);
                  }
                  return [
                    ...withoutAny,
                    {
                      id: `rule-${fromId}-${stageId}-${Date.now()}`,
                      from: fromId,
                      to: stageId,
                      enabled: true,
                      conditions: primaryCond,
                    },
                  ];
                });
              };

              const countGates = (cond: any) => {
                if (!cond) return 0;
                let n = 0;
                if (cond.requireNoOpenBlockers) n++;
                if (cond.requireProofOfWorkPassed) n++;
                if (cond.requireCiSuccess) n++;
                if (cond.requireAssignee) n++;
                if (cond.requireNoHitlPause) n++;
                if (cond.minReadinessScore) n++;
                if (cond.allowedActors?.length) n++;
                if (cond.allowedTypes?.length) n++;
                return n;
              };

              const summaryParts: string[] = [];
              if (primaryCond.requireNoOpenBlockers) summaryParts.push('keine offenen Blocker');
              if (primaryCond.requireProofOfWorkPassed) summaryParts.push('Proof-of-Work bestanden');
              if (primaryCond.requireCiSuccess) summaryParts.push('CI grün');
              if (primaryCond.requireAssignee) summaryParts.push('Ticket zugewiesen');
              if (primaryCond.requireNoHitlPause) summaryParts.push('keine HITL-Pause');
              if (primaryCond.minReadinessScore) summaryParts.push(`Readiness ≥ ${primaryCond.minReadinessScore}%`);
              if (primaryCond.allowedActors?.length === 1) {
                summaryParts.push(primaryCond.allowedActors[0] === 'HUMAN' ? 'nur Menschen' : 'nur Agenten');
              }
              if (primaryCond.allowedTypes?.length) {
                summaryParts.push(`Typen: ${primaryCond.allowedTypes.join(', ')}`);
              }

              return (
                <div className="space-y-5 max-w-4xl">
                  {/* Header + Presets */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Workflow & Stage-Regeln</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Klicke eine Stage an und definiere, wann ein Ticket dort hinein darf.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const generated: any[] = [];
                          for (let i = 0; i < columns.length - 1; i++) {
                            const from = columns[i].id;
                            const to = columns[i + 1].id;
                            const isLast = i === columns.length - 2;
                            generated.push({
                              id: `rule-${from}-${to}-${Date.now()}-${i}`,
                              from,
                              to,
                              enabled: true,
                              conditions: {
                                requireNoOpenBlockers: i >= 1,
                                requireProofOfWorkPassed: isLast,
                                requireNoHitlPause: isLast || i === columns.length - 3,
                                minReadinessScore: i === 1 ? 50 : undefined,
                              },
                            });
                          }
                          setTransitions(generated);
                          setEnforceStrictTransitions(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold hover:bg-indigo-100"
                      >
                        Agent-First Preset
                      </button>
                      {transitions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTransitions([]);
                            setEnforceStrictTransitions(false);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white text-slate-600 border border-slate-200 text-[11px] font-medium hover:bg-slate-50"
                        >
                          Zurücksetzen
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mode Selector Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setEnforceStrictTransitions(false)}
                      className={`p-3 rounded-xl border text-left transition ${
                        !enforceStrictTransitions
                          ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-900">Flexibel mit Quality-Gates</div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Jede Stage ist erreichbar, aber definierte Eingangs-Regeln werden erzwungen.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnforceStrictTransitions(true)}
                      className={`p-3 rounded-xl border text-left transition ${
                        enforceStrictTransitions
                          ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-900">Strikte Pipeline</div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Tickets dürfen nur über explizit erlaubte Vorgänger-Stages wandern.
                      </p>
                    </button>
                  </div>

                  {/* Visual Pipeline Selector */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      1. Stage auswählen
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {columns.map((col, idx) => {
                        const rulesForCol = transitions.filter((t) => t.to === col.id && t.enabled !== false);
                        const gateCount = countGates(rulesForCol[0]?.conditions);
                        const isSelected = col.id === stageId;
                        return (
                          <React.Fragment key={col.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedWorkflowStageId(col.id)}
                              className={`px-3 py-2 rounded-xl border text-left shrink-0 transition min-w-[115px] ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                                  : 'border-slate-200 bg-white text-slate-800 hover:border-indigo-300'
                              }`}
                            >
                              <div className="text-xs font-semibold truncate">{col.title}</div>
                              <div
                                className={`text-[10px] mt-0.5 ${
                                  isSelected ? 'text-indigo-100' : 'text-slate-400'
                                }`}
                              >
                                {rulesForCol.length === 0
                                  ? enforceStrictTransitions
                                    ? 'Gesperrt'
                                    : 'Offen'
                                  : gateCount > 0
                                    ? `${gateCount} Gate${gateCount > 1 ? 's' : ''}`
                                    : 'Pfad aktiv'}
                              </div>
                            </button>
                            {idx < columns.length - 1 && (
                              <span className="text-slate-300 text-xs font-bold shrink-0">→</span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Stage Inspector */}
                  {activeStage && (
                    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">
                            Regeln für Eingang in „{activeStage.title}“
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Gilt für Drag & Drop, Status-Menü und MCP-Agenten.
                          </p>
                        </div>
                        {stageRules.length > 0 && (
                          <button
                            type="button"
                            onClick={() => updateStageRules(() => [])}
                            className="text-[11px] text-rose-600 hover:underline"
                          >
                            Regeln für Stage löschen
                          </button>
                        )}
                      </div>

                      {/* Source Stages */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Erlaubt aus Stage(s):
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleSourceStage('*')}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                              isAnySource || stageRules.length === 0
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            Überall (*)
                          </button>
                          {columns
                            .filter((c) => c.id !== stageId)
                            .map((c) => {
                              const active = !isAnySource && allowedSources.includes(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => toggleSourceStage(c.id)}
                                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                                    active
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                  }`}
                                >
                                  {c.title}
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      {/* Entry Gate Toggles */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Erforderliche Checks (Entry Gates):
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: 'requireNoOpenBlockers', label: 'Keine offenen Blocker' },
                            { key: 'requireProofOfWorkPassed', label: 'Proof-of-Work bestanden' },
                            { key: 'requireCiSuccess', label: 'CI-Pipeline grün' },
                            { key: 'requireAssignee', label: 'Ticket zugewiesen' },
                            { key: 'requireNoHitlPause', label: 'Keine HITL-Rückfrage offen' },
                          ].map((gate) => {
                            const active = Boolean(primaryCond[gate.key]);
                            return (
                              <button
                                key={gate.key}
                                type="button"
                                onClick={() => updateStageCondition({ [gate.key]: !active })}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition ${
                                  active
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <Check className={`w-3 h-3 ${active ? 'opacity-100 text-emerald-600' : 'opacity-25'}`} />
                                {gate.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Readiness, Actor, Types */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-slate-700">
                            Mindest-Readiness Score:
                          </label>
                          <div className="flex gap-1.5">
                            {[
                              { label: 'Aus', val: undefined },
                              { label: '50%', val: 50 },
                              { label: '75%', val: 75 },
                              { label: '90%', val: 90 },
                            ].map((opt) => {
                              const active = (primaryCond.minReadinessScore || undefined) === opt.val;
                              return (
                                <button
                                  key={opt.label}
                                  type="button"
                                  onClick={() => updateStageCondition({ minReadinessScore: opt.val })}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                                    active
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-slate-700">
                            Wer darf verschieben?
                          </label>
                          <div className="flex gap-1.5">
                            {[
                              { label: 'Alle', val: undefined },
                              { label: 'Nur Mensch', val: ['HUMAN'] },
                              { label: 'Nur Agent', val: ['AGENT'] },
                            ].map((opt) => {
                              const currentActor =
                                primaryCond.allowedActors?.length === 1 ? primaryCond.allowedActors[0] : undefined;
                              const active = currentActor === (opt.val ? opt.val[0] : undefined);
                              return (
                                <button
                                  key={opt.label}
                                  type="button"
                                  onClick={() => updateStageCondition({ allowedActors: opt.val })}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                                    active
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Ticket Types */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Gilt für Ticket-Typen:
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {(['TASK', 'BUG', 'STORY', 'EPIC'] as const).map((t) => {
                            const selectedTypes: string[] = primaryCond.allowedTypes || [];
                            const active = selectedTypes.includes(t);
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => {
                                  const next = active
                                    ? selectedTypes.filter((x) => x !== t)
                                    : [...selectedTypes, t];
                                  updateStageCondition({ allowedTypes: next.length > 0 ? next : undefined });
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                                  active
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                {t}
                              </button>
                            );
                          })}
                          {(!primaryCond.allowedTypes || primaryCond.allowedTypes.length === 0) && (
                            <span className="text-[10px] text-slate-400 self-center ml-1">
                              (Alle Typen erlaubt)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Plain-language live summary */}
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-800">Zusammenfassung: </span>
                        {stageRules.length === 0 && enforceStrictTransitions ? (
                          <span className="text-rose-600">
                            Im strikten Modus ist der Eingang in „{activeStage.title}“ aktuell gesperrt (wähle mindestens eine Quell-Stage).
                          </span>
                        ) : summaryParts.length === 0 ? (
                          <span>
                            Tickets dürfen{' '}
                            {!isAnySource && allowedSources.length > 0
                              ? `aus ${allowedSources
                                  .map((id) => columns.find((c) => c.id === id)?.title || id)
                                  .join(', ')} `
                              : ''}
                            ohne weitere Einschränkung in „{activeStage.title}“ wechseln.
                          </span>
                        ) : (
                          <span>
                            Wechsel in „{activeStage.title}“{' '}
                            {!isAnySource && allowedSources.length > 0
                              ? `(aus ${allowedSources
                                  .map((id) => columns.find((c) => c.id === id)?.title || id)
                                  .join(', ')}) `
                              : ''}
                            erfordert: <strong className="text-slate-800">{summaryParts.join(' · ')}</strong>.
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTab === 'agents' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Autonome KI-Agenten & MCP</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Konfiguriere, welche Agenten auf dieses Projekt zugreifen und Tasks bearbeiten dürfen.
                  </p>
                </div>

                {/* Auto-Triage Switch */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Autonome Ticket-Triage & Klassifikation</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Neu angelegte Tickets werden automatisch vom Triage-Agenten analysiert, mit Tags versehen und in die passende Stage eingeordnet.
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoTriage(!autoTriage)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoTriage ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        autoTriage ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Stage-based Multi-Agent Pipeline (2.1) */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Stage-basierte Multi-Agent-Pipeline (Auto-Handoff)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Weise jeder Board-Spalte einen spezialisierten Agenten zu. Beim Verschieben eines Tickets übernimmt dieser Agent automatisch.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {columns.map((col) => {
                      const cfg = stageAgents[col.id] || { agentName: '', autoAssign: false };
                      return (
                        <div
                          key={col.id}
                          className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3"
                        >
                          <div className="min-w-[110px]">
                            <span className="text-xs font-semibold text-slate-800">{col.title}</span>
                            <span className="block text-[10px] font-mono text-slate-400">{col.id}</span>
                          </div>
                          <select
                            value={cfg.agentName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStageAgents((prev) => ({
                                ...prev,
                                [col.id]: { agentName: val, autoAssign: Boolean(val) },
                              }));
                            }}
                            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-indigo-400"
                          >
                            <option value="">Kein Auto-Handoff</option>
                            <option value="agent-triage-v1">🤖 Triage Agent (agent-triage-v1)</option>
                            <option value="agent-coder-v1">🤖 Coder Agent (agent-coder-v1)</option>
                            <option value="agent-reviewer-v1">🤖 Reviewer Agent (agent-reviewer-v1)</option>
                            <option value="agent-security-v1">🤖 Security Agent (agent-security-v1)</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Allowed Agents */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    Aktive Agenten im Projekt
                  </label>

                  <div className="space-y-2">
                    {[
                      {
                        id: 'agent-triage-v1',
                        name: 'Triage & Decomposition Agent',
                        desc: 'Zerlegt Epics & Stories in umsetzbare Subtasks und setzt Prioritäten.',
                      },
                      {
                        id: 'agent-coder-v1',
                        name: 'Autonomous Coder Agent',
                        desc: 'Implementiert Code-Änderungen über MCP-Tools und reicht PRs ein.',
                      },
                      {
                        id: 'agent-reviewer-v1',
                        name: 'Code Review & Security Agent',
                        desc: 'Überprüft Tickets auf Akzeptanzkriterien, Testabdeckung und Code-Qualität.',
                      },
                    ].map((agent) => {
                      const active = enabledAgents.includes(agent.id);
                      return (
                        <div
                          key={agent.id}
                          onClick={() => toggleAgent(agent.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                            active
                              ? 'border-indigo-200 bg-indigo-50/40'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                                active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              <Bot className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-800">{agent.name}</div>
                              <div className="text-[11px] text-slate-500">{agent.desc}</div>
                            </div>
                          </div>

                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] ${
                              active
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {active && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Context Directives */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Projektkontext & MCP Direktiven für Agenten
                  </label>
                  <textarea
                    rows={3}
                    value={agentInstructions}
                    onChange={(e) => setAgentInstructions(e.target.value)}
                    placeholder="Spezifische Richtlinien für Agenten in diesem Projekt..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Diese Direktiven werden bei jedem Agenten-Prompt über das Kanso MCP Toolset injiziert.
                  </p>
                </div>
              </div>
            )}

            {/* TAB: GIT & WEBHOOKS */}
            {activeTab === 'git' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Git-Repository & Webhooks</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verbinde dieses Board mit einem Git-Repository für automatische Commit- und Pull-Request-Verknüpfung.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Provider Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Git Provider</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setGitProvider('GITHUB')}
                        className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                          gitProvider === 'GITHUB'
                            ? 'bg-indigo-50/60 border-indigo-500 text-indigo-700 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <FolderGit2 className="w-4 h-4 text-slate-700" />
                        <span>GitHub</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGitProvider('GITLAB')}
                        className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                          gitProvider === 'GITLAB'
                            ? 'bg-indigo-50/60 border-indigo-500 text-indigo-700 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <FolderGit2 className="w-4 h-4 text-orange-500" />
                        <span>GitLab</span>
                      </button>
                    </div>
                  </div>

                  {/* Repository Input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Repository (owner/repo)
                    </label>
                    <input
                      type="text"
                      placeholder="z. B. mxw02/kanso"
                      value={gitRepo}
                      onChange={(e) => setGitRepo(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Wird verwendet, um Commits, Branches und Pull Requests diesem Board zuzuordnen.
                    </p>
                  </div>

                  {/* Default Branch */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Default Branch
                    </label>
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        placeholder="main"
                        value={gitBranch}
                        onChange={(e) => setGitBranch(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900"
                      />
                    </div>
                  </div>

                  {/* Webhook Configuration Box */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800">Kanso Webhook URL</span>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `http://localhost:4001/api/webhooks/git`;
                          navigator.clipboard.writeText(url);
                          setCopiedWebhook(true);
                          setTimeout(() => setCopiedWebhook(false), 2000);
                        }}
                        className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium transition"
                      >
                        {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedWebhook ? 'Kopiert!' : 'Kopieren'}</span>
                      </button>
                    </div>

                    <div className="p-2 rounded bg-white border border-slate-200 font-mono text-[11px] text-slate-700 select-all break-all">
                      http://localhost:4001/api/webhooks/git
                    </div>

                    <div className="space-y-1.5 text-[11px] text-slate-500">
                      <p className="font-semibold text-slate-700">Auto-Close Funktion:</p>
                      <p>
                        Schreibe in deine Git Commit-Message z. B. <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-indigo-600">Fixes #{key || 'KAN'}-42</code> oder <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-indigo-600">Resolves #{key || 'KAN'}-42</code>.
                      </p>
                      <p>
                        Kanso schließt das Ticket beim Push oder PR-Merge vollautomatisch und registriert die Commit-SHA im Aktivitätslog.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: GEFAHRENZONE */}
            {activeTab === 'danger' && canAdmin && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-red-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Gefahrenzone: Projekt löschen</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Das Löschen eines Projekts entfernt unwiderruflich alle zugehörigen Tickets, Kommentare und Logs.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-red-200 bg-red-50/40 space-y-4">
                  <div className="text-xs text-slate-700">
                    Bist du sicher, dass du das Projekt <strong className="text-slate-900">{project.name}</strong> (
                    <span className="font-mono font-bold text-red-600">{project.key}</span>) löschen möchtest?
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                      Tippe zur Bestätigung <span className="font-mono font-bold text-red-600">{project.key}</span> ein:
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value.toUpperCase())}
                      placeholder={project.key}
                      className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-red-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-red-700 bg-white uppercase"
                    />
                  </div>

                  <button
                    onClick={handleDelete}
                    disabled={deleteConfirmation !== project.key || isDeleting}
                    className="w-full py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-semibold text-xs transition flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isDeleting ? 'Wird gelöscht...' : 'Projekt unwiderruflich löschen'}</span>
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
    </div>
  );
};
