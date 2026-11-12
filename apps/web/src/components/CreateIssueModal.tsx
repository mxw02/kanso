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
} from 'lucide-react';

interface Column {
  id: string;
  title: string;
}

interface UserItem {
  id: string;
  name: string;
  role: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  columns: Column[];
  users: UserItem[];
  defaultStatus?: string;
  projectId?: string;
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
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(defaultStatus || (columns[1]?.id ?? 'TODO'));
  const [priority, setPriority] = useState<'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
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
        type: 'TASK',
        assigneeType: selectedAssignee.type,
        assigneeId: selectedAssignee.type === 'HUMAN' ? selectedAssignee.id : null,
        assigneeName: selectedAssignee.name || null,
        labels: selectedLabels,
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
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white border border-slate-200/90 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col overflow-visible"
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
        <div className="px-6 pt-5 pb-2 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 text-sm">New Issue</span>
            <span className="text-slate-300">·</span>
            <span className="font-mono text-[11px] text-slate-500">Draft</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Seamless Editor (Linear-style) */}
        <div className="px-6 py-3 space-y-2">
          {/* Title Input */}
          <input
            ref={titleInputRef}
            type="text"
            required
            placeholder="Issue title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-lg font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none leading-snug"
          />

          {/* Description Input */}
          <textarea
            rows={5}
            placeholder="Add description, acceptance criteria, or markdown notes..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none resize-none leading-relaxed font-sans"
          />
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
                className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[11px] border border-slate-200/80 cursor-pointer hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition"
              >
                <span>#{lbl}</span>
                <X className="w-3 h-3 text-slate-400 group-hover:text-rose-600" />
              </span>
            ))}
          </div>
        )}

        {/* Property Selector Bar (Interactive Pills) */}
        <div
          className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2 flex-wrap text-xs"
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-medium shadow-2xs transition"
            >
              <Circle className="w-3 h-3 text-indigo-600 fill-indigo-600/20" />
              <span>{currentColumn?.title || status}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {statusOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
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
                      status === col.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>{col.title}</span>
                    {status === col.id && <Check className="w-3.5 h-3.5 text-indigo-600" />}
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-medium shadow-2xs transition"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  priority === 'URGENT'
                    ? 'bg-rose-500'
                    : priority === 'HIGH'
                    ? 'bg-amber-500'
                    : priority === 'LOW'
                    ? 'bg-blue-400'
                    : 'bg-slate-400'
                }`}
              />
              <span>{priority}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {priorityOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-40 bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
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
                      priority === p ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>{p}</span>
                    {priority === p && <Check className="w-3.5 h-3.5 text-indigo-600" />}
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
                  ? 'bg-slate-100 border-slate-200 text-slate-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {selectedAssignee.type === 'AGENT' ? (
                <Bot className="w-3.5 h-3.5 text-emerald-600" />
              ) : selectedAssignee.type === 'HUMAN' ? (
                <User className="w-3.5 h-3.5 text-slate-600" />
              ) : (
                <User className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{selectedAssignee.name || 'Assignee'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {assigneeOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-50 max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                {/* AI Agents Group */}
                <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider flex items-center gap-1">
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
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Bot className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-mono text-[11px]">{agent.name}</div>
                        <div className="text-[10px] text-slate-400">{agent.desc}</div>
                      </div>
                    </div>
                    {selectedAssignee.name === agent.name && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                ))}

                <div className="my-1.5 border-t border-slate-100" />

                {/* Team Members Group */}
                <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
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
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                      <span>{u.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 uppercase">{u.role}</span>
                  </button>
                ))}

                <div className="my-1.5 border-t border-slate-100" />

                {/* Unassigned */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAssignee({ type: 'UNASSIGNED', id: null, name: null });
                    setAssigneeOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-50 text-slate-500"
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-medium shadow-2xs transition"
            >
              <Tag className="w-3 h-3 text-slate-400" />
              <span>Label</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {labelsOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-2">
                <div className="text-[10px] font-semibold text-slate-400 px-1 uppercase tracking-wider">
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
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      #{lbl}
                    </button>
                  ))}
                </div>

                <form onSubmit={addCustomLabel} className="pt-1 border-t border-slate-100 flex gap-1">
                  <input
                    type="text"
                    placeholder="New label..."
                    value={customLabelInput}
                    onChange={(e) => setCustomLabelInput(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs rounded font-medium"
                  >
                    Add
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Keyboard Hint & Primary Action */}
        <div className="px-6 py-3.5 border-t border-slate-200 flex items-center justify-between bg-white rounded-b-2xl">
          <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500">⌘</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500">↵</kbd>
            <span className="text-slate-400 ml-1 font-sans">to create</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || !title.trim()}
              onClick={handleSubmit}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs transition"
            >
              Create Issue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
