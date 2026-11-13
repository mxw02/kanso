import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Bot,
  User,
  Tag,
  Circle,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronDown,
  Check,
  Target,
  Paperclip,
  Loader2,
} from 'lucide-react';
import { computeReadiness } from '../utils/readiness';
import type { GoalItem } from './GoalsModal';
import { extractFilesFromClipboard, insertMarkdownAtCursor, uploadFileToKanso } from '../utils/uploadFile';
import { AttachmentPreviewStrip } from './AttachmentPreviewStrip';
import { MentionTextarea } from './MentionTextarea';
import { IssueTemplate, resolveProjectTemplates } from '../utils/issueTemplates';

interface Column {
  id: string;
  title: string;
}

interface UserItem {
  id: string;
  name: string;
  role: string;
  email?: string;
  avatarUrl?: string;
  gitUsername?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  columns: Column[];
  users: UserItem[];
  defaultStatus?: string;
  projectId?: string;
  goals?: GoalItem[];
  templates?: IssueTemplate[] | null;
  onCreate: (payload: any) => Promise<void>;
}

const PRESET_AGENTS = [
  { id: 'agent-triage-v1', name: 'agent-triage-v1', desc: 'Auto-triage & decompose' },
  { id: 'agent-coder-v1', name: 'agent-coder-v1', desc: 'Code implementation' },
  { id: 'agent-reviewer-v1', name: 'agent-reviewer-v1', desc: 'Code review & verification' },
];

const PRESET_LABELS = ['mcp', 'agentic', 'ui', 'api', 'bug', 'feature'];

export const CreateIssueModal: React.FC<Props> = ({
  isOpen,
  onClose,
  columns,
  users,
  defaultStatus,
  projectId,
  goals = [],
  templates,
  onCreate,
}) => {
  const availableTemplates = resolveProjectTemplates(templates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [issueType, setIssueType] = useState<'TASK' | 'BUG' | 'FEATURE' | 'EPIC'>('TASK');
  const [proofOfWorkChecks, setProofOfWorkChecks] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(defaultStatus || (columns[1]?.id ?? 'TODO'));
  const [priority, setPriority] = useState<'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [goalId, setGoalId] = useState<string>('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragOverDesc, setDragOverDesc] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const API_URL = import.meta.env.VITE_API_URL || '';

  const handleFileUpload = async (
    files: FileList | File[] | null | undefined,
    textarea: HTMLTextAreaElement | null
  ) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploadingFile(true);
    try {
      for (const file of Array.from(files)) {
        const res = await uploadFileToKanso(file, API_URL);
        setDescription((prev) => {
          let nextVal = prev;
          insertMarkdownAtCursor(textarea, prev, res.markdown, (v) => {
            nextVal = v;
          });
          return nextVal;
        });
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload fehlgeschlagen.');
    } finally {
      setUploadingFile(false);
    }
  };
  const [selectedAssignee, setSelectedAssignee] = useState<{
    type: 'HUMAN' | 'AGENT' | 'UNASSIGNED';
    id?: string | null;
    name?: string | null;
  }>({
    type: 'AGENT',
    name: 'agent-triage-v1',
  });
  const [selectedLabels, setSelectedLabels] = useState<string[]>(['mcp']);
  const [customLabelInput, setCustomLabelInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dropdown open states
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedTemplateId('');
      setIssueType('TASK');
      setProofOfWorkChecks([]);
      setTitle('');
      setDescription('');
      setStatus(defaultStatus || (columns[1]?.id ?? 'TODO'));
      setPriority('MEDIUM');
      setSelectedAssignee({ type: 'AGENT', name: 'agent-triage-v1' });
      setSelectedLabels(['mcp']);
      setStatusOpen(false);
      setPriorityOpen(false);
      setAssigneeOpen(false);
      setLabelsOpen(false);
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [isOpen, defaultStatus, columns]);

  const applyTemplate = (tpl: IssueTemplate | null) => {
    if (!tpl) {
      setSelectedTemplateId('');
      setIssueType('TASK');
      setProofOfWorkChecks([]);
      return;
    }
    setSelectedTemplateId(tpl.id);
    setIssueType(tpl.type || 'TASK');
    setPriority(tpl.priority || 'MEDIUM');
    setSelectedLabels(tpl.labels || []);
    setProofOfWorkChecks(tpl.proofOfWorkChecks || []);
    if (tpl.titlePrefix && !title.trim()) {
      setTitle(tpl.titlePrefix);
    }
    setDescription(tpl.body || '');
  };

  // Handle Cmd+Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      if (statusOpen || priorityOpen || assigneeOpen || labelsOpen) {
        setStatusOpen(false);
        setPriorityOpen(false);
        setAssigneeOpen(false);
        setLabelsOpen(false);
      } else {
        onClose();
      }
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const payload: any = {
        projectId,
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        type: issueType,
        assigneeType: selectedAssignee.type,
        assigneeId: selectedAssignee.type === 'HUMAN' ? selectedAssignee.id : null,
        assigneeName: selectedAssignee.name || null,
        labels: selectedLabels,
        goalId: goalId || null,
        proofOfWork:
          proofOfWorkChecks.length > 0
            ? proofOfWorkChecks.map((checkTitle, idx) => ({
                id: `pow-tpl-${Date.now()}-${idx}`,
                title: checkTitle,
                status: 'PENDING',
              }))
            : undefined,
      };

      await onCreate(payload);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleLabel = (lbl: string) => {
    if (selectedLabels.includes(lbl)) {
      setSelectedLabels(selectedLabels.filter((l) => l !== lbl));
    } else {
      setSelectedLabels([...selectedLabels, lbl]);
    }
  };

  const addCustomLabel = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customLabelInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (clean && !selectedLabels.includes(clean)) {
      setSelectedLabels([...selectedLabels, clean]);
      setCustomLabelInput('');
    }
  };

  if (!isOpen) return null;

  const currentColumn = columns.find((c) => c.id === status);

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white border border-zinc-200/90 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col"
        onClick={(e) => {
          e.stopPropagation();
          // close dropdowns on background click
          setStatusOpen(false);
          setPriorityOpen(false);
          setAssigneeOpen(false);
          setLabelsOpen(false);
        }}
      >
        {/* Top Minimal Bar */}
        <div className="px-6 pt-5 pb-2 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-900 text-sm">New Issue</span>
            <span className="text-zinc-300">·</span>
            <span className="font-mono text-[11px] text-zinc-500">Draft</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Seamless Editor (Linear-style) */}
        <div className="px-6 py-3 space-y-2">
          {/* Template Selector Pills */}
          {availableTemplates.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mr-1">
                Vorlage:
              </span>
              <button
                type="button"
                onClick={() => applyTemplate(null)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition ${
                  !selectedTemplateId
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                Leer
              </button>
              {availableTemplates.map((tpl) => {
                const active = selectedTemplateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    title={tpl.description || tpl.name}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition ${
                      active
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:border-teal-400'
                    }`}
                  >
                    {tpl.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Title Input */}
          <input
            ref={titleInputRef}
            type="text"
            required
            placeholder="Issue title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-lg font-semibold text-zinc-900 placeholder:text-zinc-300 focus:outline-none leading-snug"
          />

          {/* Description Input */}
          <div
            onDragOver={(e) => {
              if (e.dataTransfer?.types.includes('Files')) {
                e.preventDefault();
                setDragOverDesc(true);
              }
            }}
            onDragLeave={() => setDragOverDesc(false)}
            onDrop={(e) => {
              if (e.dataTransfer?.files?.length) {
                e.preventDefault();
                setDragOverDesc(false);
                handleFileUpload(e.dataTransfer.files, null);
              }
            }}
            className={`rounded-lg transition ${
              dragOverDesc ? 'bg-teal-50/40 ring-2 ring-teal-500/30 p-2' : ''
            }`}
          >
            <MentionTextarea
              rows={selectedTemplateId || description.split('\n').length > 5 ? 10 : 6}
              placeholder="Beschreibung, Akzeptanzkriterien, @Mentions oder Bilder/Dateien per Paste (⌘V) & Drag-and-Drop einfügen..."
              value={description}
              onChange={setDescription}
              users={users}
              projectId={projectId}
              apiUrl={API_URL}
              onPaste={(e) => {
                const files = extractFilesFromClipboard(e.clipboardData);
                if (files.length > 0) {
                  e.preventDefault();
                  handleFileUpload(files, e.currentTarget);
                }
              }}
              className="w-full min-h-[140px] text-xs text-zinc-700 placeholder:text-zinc-300 focus:outline-none resize-y leading-relaxed font-sans bg-transparent"
            />
            <AttachmentPreviewStrip
              markdown={description}
              onRemove={(raw) =>
                setDescription((prev) => prev.replace(raw, '').replace(/\n{3,}/g, '\n\n').trim())
              }
            />
            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-teal-700 cursor-pointer font-medium">
                {uploadingFile ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5" />
                )}
                <span>{uploadingFile ? 'Wird hochgeladen...' : 'Bild / Datei anhängen'}</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleFileUpload(e.target.files, null);
                    e.target.value = '';
                  }}
                />
              </label>
              {uploadError && <span className="text-[11px] text-rose-600">{uploadError}</span>}
            </div>
            {proofOfWorkChecks.length > 0 && (
              <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-teal-50/70 border border-teal-200/80 text-[11px] text-teal-900 flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">Proof-of-Work-Checks aus Vorlage:</span>
                {proofOfWorkChecks.map((c, idx) => (
                  <span key={idx} className="px-1.5 py-0.2 rounded bg-white border border-teal-200 text-[10px]">
                    • {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected Labels Pill Bar (if any selected) */}
        {selectedLabels.length > 0 && (
          <div className="px-6 pb-2 flex items-center gap-1.5 flex-wrap">
            {selectedLabels.map((lbl) => (
              <span
                key={lbl}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLabel(lbl);
                }}
                className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 font-mono text-[11px] border border-zinc-200/80 cursor-pointer hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition"
              >
                <span>#{lbl}</span>
                <X className="w-3 h-3 text-zinc-400 group-hover:text-rose-600" />
              </span>
            ))}
          </div>
        )}

        {/* Property Selector Bar (Interactive Pills) */}
        <div
          className="px-6 py-3 border-t border-zinc-100 bg-zinc-50/60 flex items-center gap-2 flex-wrap text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Status Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setStatusOpen(!statusOpen);
                setPriorityOpen(false);
                setAssigneeOpen(false);
                setLabelsOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 font-medium shadow-2xs transition"
            >
              <Circle className="w-3 h-3 text-teal-700 fill-teal-700/20" />
              <span>{currentColumn?.title || status}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {statusOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-44 bg-white border border-zinc-200 rounded-xl shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[10px] font-semibold text-zinc-400 px-2 py-1 uppercase tracking-wider">
                  Status
                </div>
                {columns.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => {
                      setStatus(col.id);
                      setStatusOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                      status === col.id ? 'bg-teal-50 text-teal-800 font-semibold' : 'hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <span>{col.title}</span>
                    {status === col.id && <Check className="w-3.5 h-3.5 text-teal-700" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Priority Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setPriorityOpen(!priorityOpen);
                setStatusOpen(false);
                setAssigneeOpen(false);
                setLabelsOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 font-medium shadow-2xs transition"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  priority === 'URGENT'
                    ? 'bg-rose-500'
                    : priority === 'HIGH'
                    ? 'bg-amber-500'
                    : priority === 'LOW'
                    ? 'bg-blue-400'
                    : 'bg-zinc-400'
                }`}
              />
              <span>{priority}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {priorityOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-40 bg-white border border-zinc-200 rounded-xl shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[10px] font-semibold text-zinc-400 px-2 py-1 uppercase tracking-wider">
                  Priority
                </div>
                {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPriority(p);
                      setPriorityOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                      priority === p ? 'bg-teal-50 text-teal-800 font-semibold' : 'hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <span>{p}</span>
                    {priority === p && <Check className="w-3.5 h-3.5 text-teal-700" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Unified Assignee Pill (AI Agent & Human Team) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setAssigneeOpen(!assigneeOpen);
                setStatusOpen(false);
                setPriorityOpen(false);
                setLabelsOpen(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-medium shadow-2xs transition ${
                selectedAssignee.type === 'AGENT'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : selectedAssignee.type === 'HUMAN'
                  ? 'bg-zinc-100 border-zinc-200 text-zinc-800'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
              }`}
            >
              {selectedAssignee.type === 'AGENT' ? (
                <Bot className="w-3.5 h-3.5 text-emerald-600" />
              ) : selectedAssignee.type === 'HUMAN' ? (
                (() => {
                  const assignedUser = users.find((usr) => usr.id === selectedAssignee.id || usr.name === selectedAssignee.name);
                  return assignedUser?.avatarUrl ? (
                    <img src={assignedUser.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-zinc-600" />
                  );
                })()
              ) : (
                <User className="w-3.5 h-3.5 text-zinc-400" />
              )}
              <span>{selectedAssignee.name || 'Assignee'}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {assigneeOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-60 bg-white border border-zinc-200 rounded-xl shadow-xl p-1.5 z-50 max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                {/* AI Agents Group */}
                <div className="text-[10px] font-semibold text-zinc-400 px-2 py-1 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>Autonomous AI Agents</span>
                </div>
                {PRESET_AGENTS.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => {
                      setSelectedAssignee({ type: 'AGENT', name: agent.name });
                      setAssigneeOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition text-left ${
                      selectedAssignee.type === 'AGENT' && selectedAssignee.name === agent.name
                        ? 'bg-emerald-50 text-emerald-800 font-semibold'
                        : 'hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Bot className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-mono text-[11px]">{agent.name}</div>
                        <div className="text-[10px] text-zinc-400">{agent.desc}</div>
                      </div>
                    </div>
                    {selectedAssignee.name === agent.name && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                ))}

                <div className="my-1.5 border-t border-zinc-100" />

                {/* Team Members Group */}
                <div className="text-[10px] font-semibold text-zinc-400 px-2 py-1 uppercase tracking-wider">
                  Team Members
                </div>
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedAssignee({ type: 'HUMAN', id: u.id, name: u.name });
                      setAssigneeOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                      selectedAssignee.type === 'HUMAN' && selectedAssignee.id === u.id
                        ? 'bg-teal-50 text-teal-800 font-semibold'
                        : 'hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt={u.name} className="w-5 h-5 rounded-full object-cover border border-zinc-200 shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-[10px] shrink-0 border border-teal-200">
                          {u.name.charAt(0)}
                        </div>
                      )}
                      <div className="text-left min-w-0">
                        <span className="font-medium text-zinc-800 truncate block">{u.name}</span>
                        {u.gitUsername && (
                          <span className="text-[10px] text-zinc-400 font-mono truncate block">@{u.gitUsername}</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0 ml-1 ${
                      u.role === 'ADMIN'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : u.role === 'MEMBER'
                        ? 'bg-teal-50 text-teal-800 border border-teal-200'
                        : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                    }`}>
                      {u.role}
                    </span>
                  </button>
                ))}

                <div className="my-1.5 border-t border-zinc-100" />

                {/* Unassigned */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAssignee({ type: 'UNASSIGNED', id: null, name: null });
                    setAssigneeOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-zinc-50 text-zinc-500"
                >
                  Unassigned
                </button>
              </div>
            )}
          </div>

          {/* Labels Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setLabelsOpen(!labelsOpen);
                setStatusOpen(false);
                setPriorityOpen(false);
                setAssigneeOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 font-medium shadow-2xs transition"
            >
              <Tag className="w-3 h-3 text-zinc-400" />
              <span>Label</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {labelsOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-52 bg-white border border-zinc-200 rounded-xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-2">
                <div className="text-[10px] font-semibold text-zinc-400 px-1 uppercase tracking-wider">
                  Select Labels
                </div>
                <div className="flex flex-wrap gap-1">
                  {PRESET_LABELS.map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => toggleLabel(lbl)}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded transition ${
                        selectedLabels.includes(lbl)
                          ? 'bg-teal-50 text-teal-800 border border-teal-200 font-semibold'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      #{lbl}
                    </button>
                  ))}
                </div>

                <form onSubmit={addCustomLabel} className="pt-1 border-t border-zinc-100 flex gap-1">
                  <input
                    type="text"
                    placeholder="New label..."
                    value={customLabelInput}
                    onChange={(e) => setCustomLabelInput(e.target.value)}
                    className="flex-1 bg-zinc-50 border border-zinc-200 rounded px-2 py-1 text-xs text-zinc-800 focus:outline-none focus:border-teal-600"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-xs rounded font-medium"
                  >
                    Add
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Optional Parent Goal */}
          {goals.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white shadow-2xs">
              <Target className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="bg-transparent text-xs font-medium text-zinc-700 focus:outline-none cursor-pointer max-w-[180px]"
              >
                <option value="">Kein Ziel</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer: Agent-Readiness + Keyboard Hint & Primary Action */}
        <div className="px-6 py-3.5 border-t border-zinc-200 flex items-center justify-between bg-white rounded-b-2xl gap-3">
          {(() => {
            const readiness = computeReadiness({ description });
            return (
              <div className="flex items-center gap-2 text-[11px]">
                <span
                  title={readiness.missing.join(' • ')}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border ${
                    readiness.level === 'READY'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : readiness.level === 'NEEDS_CONTEXT'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  Readiness {readiness.score}%
                </span>
                <span className="hidden sm:inline text-zinc-400 font-mono">⌘↵</span>
              </div>
            );
          })()}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || !title.trim()}
              onClick={handleSubmit}
              className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs transition"
            >
              Create Issue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
