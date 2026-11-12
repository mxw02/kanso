import React, { useState } from 'react';
import { Plus, X, Bot, User, Tag } from 'lucide-react';

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
  const [priority, setPriority] = useState('MEDIUM');
  const [type, setType] = useState('TASK');
  const [assigneeMode, setAssigneeMode] = useState<'AGENT' | 'HUMAN' | 'UNASSIGNED'>('AGENT');
  const [agentName, setAgentName] = useState('agent-triage-v1');
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || '');
  const [labels, setLabels] = useState('mcp, v1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const selectedUser = users.find((u) => u.id === selectedUserId);
      const payload: any = {
        projectId,
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        type,
        assigneeType: assigneeMode,
        assigneeId: assigneeMode === 'HUMAN' ? selectedUser?.id : null,
        assigneeName:
          assigneeMode === 'AGENT'
            ? agentName
            : assigneeMode === 'HUMAN'
            ? selectedUser?.name
            : null,
        labels: labels
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean),
      };

      await onCreate(payload);
      setTitle('');
      setDescription('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-[#121624] border border-zinc-700/80 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-bold text-white">New Issue</h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          {/* Title */}
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Issue Title *</label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Implement Fastify rate limiter middleware"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#090b14] border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-zinc-300 font-medium mb-1">
              Description <span className="text-zinc-500">(Markdown supported)</span>
            </label>
            <textarea
              rows={4}
              placeholder="Provide background, requirements, acceptance criteria..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#090b14] border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono text-xs"
            />
          </div>

          {/* Row 1: Status, Priority, Type */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-[#090b14] border border-zinc-700 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-[#090b14] border border-zinc-700 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-[#090b14] border border-zinc-700 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="TASK">Task</option>
                <option value="BUG">Bug</option>
                <option value="STORY">Story</option>
                <option value="EPIC">Epic</option>
              </select>
            </div>
          </div>

          {/* Row 2: Assignee Target */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#090b14] border border-zinc-800">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Assignee Type</label>
              <select
                value={assigneeMode}
                onChange={(e: any) => setAssigneeMode(e.target.value)}
                className="w-full bg-[#141828] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="AGENT">🤖 AI Agent (Autonomous)</option>
                <option value="HUMAN">👤 Team Member</option>
                <option value="UNASSIGNED">Unassigned</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">
                {assigneeMode === 'AGENT'
                  ? 'Agent Name'
                  : assigneeMode === 'HUMAN'
                  ? 'Team Member'
                  : 'Assignee'}
              </label>
              {assigneeMode === 'AGENT' ? (
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. agent-coder-v1"
                  className="w-full bg-[#141828] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              ) : assigneeMode === 'HUMAN' ? (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full bg-[#141828] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="py-1.5 text-zinc-500 text-xs italic">No assignee</div>
              )}
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Labels (comma-separated)</label>
            <input
              type="text"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              placeholder="mcp, agentic, ui, backend"
              className="w-full bg-[#090b14] border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/30 transition"
          >
            Create Issue
          </button>
        </div>
      </form>
    </div>
  );
};
