import React, { useState, useEffect } from 'react';
import {
  Bot,
  User,
  History,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Send,
  Sparkles,
  CheckSquare,
  Square,
  Link2,
  AlertTriangle,
  GitBranch,
  GitPullRequest,
  GitCommit,
  Copy,
  ExternalLink,
  Plus,
  Calendar,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  status: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  type: string;
  assigneeType: 'HUMAN' | 'AGENT' | 'UNASSIGNED';
  assigneeId?: string | null;
  assigneeName?: string | null;
  labels: string[];
  sprintId?: string | null;
  sprint?: { id: string; name: string; status: string } | null;
  comments?: any[];
  activities?: any[];
  subIssues?: any[];
  outgoingRelations?: any[];
  incomingRelations?: any[];
  gitLinks?: any[];
  agentRuns?: any[];
  createdAt: string;
  updatedAt: string;
}

interface UserItem {
  id: string;
  name: string;
  role: string;
  email?: string;
  avatarUrl?: string;
  gitUsername?: string;
}

interface SprintItem {
  id: string;
  name: string;
  status: string;
}

interface OtherIssue {
  id: string;
  identifier: string;
  title: string;
  status: string;
}

interface Props {
  issue: Issue | null;
  columns: { id: string; title: string }[];
  users: UserItem[];
  currentUser: { name: string; role: string };
  allIssues?: OtherIssue[];
  sprints?: SprintItem[];
  canEdit: boolean;
  onClose: () => void;
  onUpdate: (issueId: string, payload: any) => Promise<void>;
  onDelete: (issueId: string) => Promise<void>;
  onAddComment: (issueId: string, content: string) => Promise<void>;
  onCreateSubIssue: (parentId: string, title: string) => Promise<void>;
  onSelectIssue?: (issueId: string) => void;
}

export const IssueDetailModal: React.FC<Props> = ({
  issue,
  columns,
  users,
  currentUser,
  allIssues = [],
  sprints = [],
  canEdit,
  onClose,
  onUpdate,
  onDelete,
  onAddComment,
  onCreateSubIssue,
  onSelectIssue,
}) => {
  const [activeTab, setActiveTab] = useState<'comments' | 'activity' | 'git'>('comments');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descText, setDescText] = useState('');
  const [titleText, setTitleText] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [copiedBranch, setCopiedBranch] = useState(false);

  // Issue relations form state
  const [showAddRelation, setShowAddRelation] = useState(false);
  const [relationTargetId, setRelationTargetId] = useState('');
  const [relationType, setRelationType] = useState<'BLOCKS' | 'IS_BLOCKED_BY' | 'RELATES_TO' | 'DUPLICATES'>('IS_BLOCKED_BY');
  const [submittingRelation, setSubmittingRelation] = useState(false);
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);

  // Git simulation form state
  const [showSimulateGit, setShowSimulateGit] = useState(false);
  const [gitMsg, setGitMsg] = useState('');
  const [gitType, setGitType] = useState<'commit' | 'pull_request'>('commit');

  const API_URL = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    if (issue) {
      setDescText(issue.description || '');
      setTitleText(issue.title || '');
      setIsEditingDesc(false);
      setIsEditingTitle(false);
      setShowAddRelation(false);
      setShowSimulateGit(false);
      setAssigneeDropdownOpen(false);
      setGitMsg(`Fixes #${issue.identifier}: resolve implementation requirements`);
    }
  }, [issue]);

  if (!issue) return null;

  // Blocker determination
  // 1. Outgoing relation where this issue IS_BLOCKED_BY target
  // 2. Incoming relation where source issue BLOCKS this issue
  const blockers: any[] = [];
  if (issue.outgoingRelations) {
    for (const r of issue.outgoingRelations) {
      if (r.type === 'IS_BLOCKED_BY' && r.targetIssue?.status !== 'DONE') {
        blockers.push({ id: r.targetIssue.id, identifier: r.targetIssue.identifier, title: r.targetIssue.title, status: r.targetIssue.status, relationId: r.id });
      }
    }
  }
  if (issue.incomingRelations) {
    for (const r of issue.incomingRelations) {
      if (r.type === 'BLOCKS' && r.sourceIssue?.status !== 'DONE') {
        blockers.push({ id: r.sourceIssue.id, identifier: r.sourceIssue.identifier, title: r.sourceIssue.title, status: r.sourceIssue.status, relationId: r.id });
      }
    }
  }

  const branchName = `${issue.identifier.toLowerCase()}-${issue.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36)}`;

  const handleCopyBranch = () => {
    navigator.clipboard.writeText(`git checkout -b ${branchName}`);
    setCopiedBranch(true);
    setTimeout(() => setCopiedBranch(false), 2000);
  };

  const handleSaveDescription = async () => {
    await onUpdate(issue.id, { description: descText });
    setIsEditingDesc(false);
  };

  const handleSaveTitle = async () => {
    if (!titleText.trim()) return;
    await onUpdate(issue.id, { title: titleText.trim() });
    setIsEditingTitle(false);
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      await onAddComment(issue.id, newComment.trim());
      setNewComment('');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCreateSubtaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    await onCreateSubIssue(issue.id, newSubtaskTitle.trim());
    setNewSubtaskTitle('');
  };

  const handleToggleSubtaskStatus = async (sub: any) => {
    if (!canEdit) return;
    const nextStatus = sub.status === 'DONE' ? 'TODO' : 'DONE';
    try {
      await fetch(`${API_URL}/api/issues/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, actorName: currentUser.name }),
      });
      // Refresh current issue
      await onUpdate(issue.id, {});
    } catch (err) {
      console.error('Failed to toggle subtask', err);
    }
  };

  // Add Relation
  const handleAddRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relationTargetId) return;
    try {
      setSubmittingRelation(true);
      const res = await fetch(`${API_URL}/api/issues/${issue.id}/relations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIssueId: relationTargetId,
          type: relationType,
        }),
      });
      if (res.ok) {
        setShowAddRelation(false);
        setRelationTargetId('');
        await onUpdate(issue.id, {});
      } else {
        const err = await res.json();
        alert(err.error || 'Fehler beim Verknüpfen');
      }
    } catch (err) {
      console.error('Failed to add relation', err);
    } finally {
      setSubmittingRelation(false);
    }
  };

  // Delete Relation
  const handleDeleteRelation = async (relationId: string) => {
    if (!canEdit) return;
    try {
      await fetch(`${API_URL}/api/issues/${issue.id}/relations/${relationId}`, {
        method: 'DELETE',
      });
      await onUpdate(issue.id, {});
    } catch (err) {
      console.error('Failed to delete relation', err);
    }
  };

  // Simulate Git Hook
  const handleSimulateGit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitMsg.trim()) return;

    try {
      const commitHash = Math.random().toString(16).substring(2, 9);
      if (gitType === 'commit') {
        await fetch(`${API_URL}/api/webhooks/git`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref: 'refs/heads/main',
            commits: [
              {
                id: commitHash,
                message: gitMsg,
                url: `https://github.com/mxw02/kanso/commit/${commitHash}`,
                author: { name: currentUser.name },
              },
            ],
          }),
        });
      } else {
        const prNumber = Math.floor(Math.random() * 80) + 10;
        await fetch(`${API_URL}/api/webhooks/git`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'closed',
            pull_request: {
              number: prNumber,
              title: gitMsg,
              html_url: `https://github.com/mxw02/kanso/pull/${prNumber}`,
              merged: true,
              user: { login: currentUser.name.toLowerCase().replace(/\s+/g, '') },
              head: { ref: branchName },
            },
          }),
        });
      }
      setShowSimulateGit(false);
      await onUpdate(issue.id, {});
    } catch (err) {
      console.error('Failed to simulate git', err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full h-[90vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded">
              {issue.identifier}
            </span>
            <span className="text-xs text-slate-500 font-medium px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
              {issue.type}
            </span>

            {issue.sprint && (
              <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>{issue.sprint.name}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to delete ${issue.identifier}?`)) {
                    onDelete(issue.id);
                  }
                }}
                title="Delete issue"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5 border-r border-slate-200">
            {/* Blocker Alert Banner */}
            {blockers.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Dieses Ticket wird durch unerledigte Abhängigkeiten blockiert:</span>
                </div>
                <div className="space-y-1 pl-6">
                  {blockers.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => onSelectIssue && onSelectIssue(b.id)}
                      className="flex items-center gap-2 hover:underline cursor-pointer font-medium"
                    >
                      <span className="font-mono font-bold text-amber-800">{b.identifier}</span>
                      <span>{b.title}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 uppercase font-semibold">
                        {b.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Title */}
            <div>
              {isEditingTitle && canEdit ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={titleText}
                    onChange={(e) => setTitleText(e.target.value)}
                    className="flex-1 bg-white border border-indigo-500 rounded-lg px-3 py-1.5 text-base font-bold text-slate-900 focus:outline-none"
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setTitleText(issue.title);
                      setIsEditingTitle(false);
                    }}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="group flex items-start justify-between gap-3">
                  <h1 className="text-xl font-bold text-slate-900 leading-snug">{issue.title}</h1>
                  {canEdit && (
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Description (Markdown) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/80">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Description
                </span>
                {canEdit && !isEditingDesc && (
                  <button
                    onClick={() => setIsEditingDesc(true)}
                    className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium transition"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              {isEditingDesc && canEdit ? (
                <div className="space-y-2">
                  <textarea
                    rows={6}
                    value={descText}
                    onChange={(e) => setDescText(e.target.value)}
                    placeholder="Write with markdown (# headers, - lists, `code`, **bold**)..."
                    className="w-full bg-white border border-indigo-500 rounded-lg p-3 text-xs text-slate-900 focus:outline-none font-mono"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setDescText(issue.description || '');
                        setIsEditingDesc(false);
                      }}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveDescription}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <MarkdownViewer
                  content={issue.description || '_No description provided._'}
                  className="min-h-[50px]"
                />
              )}
            </div>

            {/* Sub-tasks Section */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Sub-tasks ({issue.subIssues?.length || 0})
                  </span>
                </div>
              </div>

              {issue.subIssues && issue.subIssues.length > 0 && (
                <div className="space-y-1.5">
                  {issue.subIssues.map((sub: any) => {
                    const isDone = sub.status === 'DONE';
                    return (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs hover:border-slate-300 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => handleToggleSubtaskStatus(sub)}
                            disabled={!canEdit}
                            className="text-slate-400 hover:text-indigo-600"
                          >
                            {isDone ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <span
                            onClick={() => onSelectIssue && onSelectIssue(sub.id)}
                            className="font-mono text-indigo-600 font-semibold text-[11px] hover:underline cursor-pointer"
                          >
                            {sub.identifier}
                          </span>
                          <span className={`font-medium ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {sub.title}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                            isDone ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {sub.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {canEdit && (
                <form onSubmit={handleCreateSubtaskSubmit} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add sub-task (press Enter)..."
                    className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs rounded-lg font-medium transition"
                  >
                    Add
                  </button>
                </form>
              )}
            </div>

            {/* Ticket-Verknüpfungen (Relations & Blockers) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Verknüpfungen & Blocker ({(issue.outgoingRelations?.length || 0) + (issue.incomingRelations?.length || 0)})
                  </span>
                </div>
                {canEdit && !showAddRelation && (
                  <button
                    onClick={() => setShowAddRelation(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Verknüpfung</span>
                  </button>
                )}
              </div>

              {/* Add Relation Inline Form */}
              {showAddRelation && (
                <form
                  onSubmit={handleAddRelation}
                  className="p-3 rounded-lg border border-indigo-200 bg-white space-y-2.5 animate-in fade-in duration-100"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Typ</label>
                      <select
                        value={relationType}
                        onChange={(e: any) => setRelationType(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded border border-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="IS_BLOCKED_BY">wird blockiert durch</option>
                        <option value="BLOCKS">blockiert</option>
                        <option value="RELATES_TO">bezieht sich auf</option>
                        <option value="DUPLICATES">dupliziert</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Ziel-Ticket</label>
                      <select
                        value={relationTargetId}
                        onChange={(e) => setRelationTargetId(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded border border-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">Ticket auswählen...</option>
                        {allIssues
                          .filter((i) => i.id !== issue.id)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.identifier}: {i.title.slice(0, 30)}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddRelation(false)}
                      className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      disabled={!relationTargetId || submittingRelation}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-semibold"
                    >
                      {submittingRelation ? 'Verknüpfe...' : 'Verknüpfen'}
                    </button>
                  </div>
                </form>
              )}

              {/* Relations List */}
              <div className="space-y-1.5">
                {issue.outgoingRelations?.map((rel: any) => (
                  <div
                    key={rel.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                        {rel.type === 'IS_BLOCKED_BY'
                          ? 'wird blockiert durch'
                          : rel.type === 'BLOCKS'
                          ? 'blockiert'
                          : rel.type === 'DUPLICATES'
                          ? 'dupliziert'
                          : 'bezieht sich auf'}
                      </span>
                      <span
                        onClick={() => onSelectIssue && onSelectIssue(rel.targetIssue.id)}
                        className="font-mono text-indigo-600 font-semibold hover:underline cursor-pointer"
                      >
                        {rel.targetIssue?.identifier}
                      </span>
                      <span className="text-slate-800 truncate max-w-xs">{rel.targetIssue?.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                        {rel.targetIssue?.status}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteRelation(rel.id)}
                          className="text-slate-400 hover:text-red-600 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {issue.incomingRelations?.map((rel: any) => (
                  <div
                    key={rel.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                        {rel.type === 'BLOCKS'
                          ? 'wird blockiert durch'
                          : rel.type === 'IS_BLOCKED_BY'
                          ? 'blockiert'
                          : 'verknüpft von'}
                      </span>
                      <span
                        onClick={() => onSelectIssue && onSelectIssue(rel.sourceIssue.id)}
                        className="font-mono text-indigo-600 font-semibold hover:underline cursor-pointer"
                      >
                        {rel.sourceIssue?.identifier}
                      </span>
                      <span className="text-slate-800 truncate max-w-xs">{rel.sourceIssue?.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                        {rel.sourceIssue?.status}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteRelation(rel.id)}
                          className="text-slate-400 hover:text-red-600 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {(!issue.outgoingRelations || issue.outgoingRelations.length === 0) &&
                  (!issue.incomingRelations || issue.incomingRelations.length === 0) &&
                  !showAddRelation && (
                    <div className="text-xs text-slate-400 italic py-1">Keine Verknüpfungen vorhanden.</div>
                  )}
              </div>
            </div>

            {/* Tabs: Comments vs Activity Log vs Git */}
            <div>
              <div className="flex items-center gap-4 border-b border-slate-200 pb-2 mb-4">
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`flex items-center gap-1.5 text-xs font-semibold pb-1 transition border-b-2 -mb-2.5 ${
                    activeTab === 'comments'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Discussion ({issue.comments?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('activity')}
                  className={`flex items-center gap-1.5 text-xs font-semibold pb-1 transition border-b-2 -mb-2.5 ${
                    activeTab === 'activity'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Aktivitäts-Log ({issue.activities?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('git')}
                  className={`flex items-center gap-1.5 text-xs font-semibold pb-1 transition border-b-2 -mb-2.5 ${
                    activeTab === 'git'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Git & Commits ({issue.gitLinks?.length || 0})</span>
                </button>
              </div>

              {/* Comments Tab */}
              {activeTab === 'comments' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {issue.comments?.map((comment: any) => (
                      <div
                        key={comment.id}
                        className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            {comment.authorType === 'AGENT' ? (
                              <div className="flex items-center gap-1 text-emerald-700 font-mono text-[11px] font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                <Bot className="w-3 h-3 text-emerald-600" />
                                <span>{comment.authorName}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-slate-700 text-[11px] font-semibold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                                <User className="w-3 h-3 text-slate-500" />
                                <span>{comment.authorName}</span>
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(comment.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <MarkdownViewer content={comment.content} />
                      </div>
                    ))}

                    {(!issue.comments || issue.comments.length === 0) && (
                      <div className="text-center py-6 text-xs text-slate-400">
                        No discussion on this ticket yet.
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleCommentSubmit} className="space-y-2">
                    <textarea
                      rows={3}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder={`Comment as ${currentUser.name}...`}
                      className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400">Markdown supported</span>
                      <button
                        type="submit"
                        disabled={submittingComment || !newComment.trim()}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Post Comment</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Activity Log Tab */}
              {activeTab === 'activity' && (
                <div className="space-y-2.5">
                  {issue.activities?.map((act: any) => (
                    <div
                      key={act.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                    >
                      <div className="mt-0.5">
                        {act.actorType === 'AGENT' ? (
                          <Bot className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <User className="w-4 h-4 text-slate-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{act.actorName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(act.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs mt-0.5">{act.details}</p>
                      </div>
                    </div>
                  ))}

                  {(!issue.activities || issue.activities.length === 0) && (
                    <div className="text-center py-6 text-xs text-slate-400">
                      No activity recorded yet.
                    </div>
                  )}
                </div>
              )}

              {/* Git & Commits Tab */}
              {activeTab === 'git' && (
                <div className="space-y-4">
                  {/* Branch helper banner */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <GitBranch className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Feature Branch erstellen</div>
                        <code className="text-[11px] font-mono text-slate-500">git checkout -b {branchName}</code>
                      </div>
                    </div>

                    <button
                      onClick={handleCopyBranch}
                      className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded-md text-xs font-semibold text-slate-700 shadow-xs transition"
                    >
                      {copiedBranch ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedBranch ? 'Kopiert' : 'Kopieren'}</span>
                    </button>
                  </div>

                  {/* Simulate Git Hook Trigger */}
                  {showSimulateGit ? (
                    <form onSubmit={handleSimulateGit} className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
                      <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                        <GitCommit className="w-4 h-4 text-indigo-600" />
                        <span>Git Push / PR Hook simulieren</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={gitType}
                          onChange={(e: any) => setGitType(e.target.value)}
                          className="px-2.5 py-1 text-xs rounded border border-slate-200 bg-white"
                        >
                          <option value="commit">Commit auf main</option>
                          <option value="pull_request">Merged PR</option>
                        </select>
                        <input
                          type="text"
                          value={gitMsg}
                          onChange={(e) => setGitMsg(e.target.value)}
                          placeholder="Commit-Message mit 'Fixes #...'"
                          className="col-span-2 px-2.5 py-1 text-xs rounded border border-slate-200 bg-white"
                        />
                      </div>

                      <p className="text-[11px] text-slate-500">
                        Keyword <code className="font-mono text-indigo-600 font-bold">Fixes #{issue.identifier}</code> schließt das Ticket automatisch auf Status DONE.
                      </p>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowSimulateGit(false)}
                          className="px-2.5 py-1 text-xs text-slate-500"
                        >
                          Abbrechen
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
                        >
                          Ausführen & Ticket aktualisieren
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex justify-end">
                      <button
                        onClick={() => setShowSimulateGit(true)}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Git Commit / PR Hook testen</span>
                      </button>
                    </div>
                  )}

                  {/* Linked commits & PRs */}
                  <div className="space-y-2">
                    {issue.gitLinks?.map((git: any) => (
                      <div
                        key={git.id}
                        className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                            {git.type === 'pull_request' ? <GitPullRequest className="w-4 h-4 text-purple-600" /> : <GitCommit className="w-4 h-4 text-indigo-600" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900">{git.reference}</span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded uppercase ${
                                  git.status === 'merged'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {git.status || 'COMMITTED'}
                              </span>
                            </div>
                            <p className="text-slate-600 text-xs mt-0.5">{git.title}</p>
                          </div>
                        </div>

                        {git.url && (
                          <a
                            href={git.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-slate-400 hover:text-indigo-600"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    ))}

                    {(!issue.gitLinks || issue.gitLinks.length === 0) && (
                      <div className="text-center py-6 text-xs text-slate-400">
                        Noch keine Commits oder Pull Requests mit diesem Ticket verknüpft.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Properties */}
          <div className="w-72 p-6 bg-slate-50 space-y-5 text-xs overflow-y-auto shrink-0">
            {/* Status */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Status
              </label>
              {canEdit ? (
                <select
                  value={issue.status}
                  onChange={(e) => onUpdate(issue.id, { status: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-medium focus:outline-none focus:border-indigo-500"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2 bg-white border border-slate-200 rounded-lg text-slate-800 font-medium">
                  {columns.find((c) => c.id === issue.status)?.title || issue.status}
                </div>
              )}
            </div>

            {/* Sprint Assignment */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Sprint / Cycle
              </label>
              {canEdit ? (
                <select
                  value={issue.sprintId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdate(issue.id, { sprintId: val ? val : null });
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option value="">📁 Product Backlog (kein Sprint)</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.status === 'ACTIVE' ? '🏃 ' : ''}{s.name} ({s.status})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2 bg-white border border-slate-200 rounded-lg text-slate-800">
                  {issue.sprint?.name || 'Product Backlog'}
                </div>
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Priority
              </label>
              {canEdit ? (
                <select
                  value={issue.priority}
                  onChange={(e: any) => onUpdate(issue.id, { priority: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option value="URGENT">Urgent</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              ) : (
                <div className="p-2 bg-white border border-slate-200 rounded-lg text-slate-800 font-medium">
                  {issue.priority}
                </div>
              )}
            </div>

            {/* Assignee Target */}
            <div className="relative">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Assignee
              </label>
              {canEdit ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setAssigneeDropdownOpen(!assigneeDropdownOpen)}
                    className="w-full bg-white border border-slate-300 hover:border-slate-400 rounded-xl px-3 py-2 text-slate-900 font-medium focus:outline-none focus:border-indigo-500 flex items-center justify-between text-xs transition cursor-pointer shadow-2xs"
                  >
                    {issue.assigneeType === 'AGENT' ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                          <Bot className="w-3.5 h-3.5 text-emerald-700" />
                        </div>
                        <span className="font-mono text-emerald-800 font-semibold truncate">
                          {issue.assigneeName || 'agent-triage-v1'}
                        </span>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                          AGENT
                        </span>
                      </div>
                    ) : issue.assigneeType === 'HUMAN' ? (
                      (() => {
                        const assignedUser = users.find((u) => u.id === issue.assigneeId || u.name === issue.assigneeName);
                        return (
                          <div className="flex items-center gap-2 min-w-0">
                            {assignedUser?.avatarUrl ? (
                              <img
                                src={assignedUser.avatarUrl}
                                alt={issue.assigneeName || ''}
                                className="w-5 h-5 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0 border border-indigo-200">
                                {(issue.assigneeName || 'U').charAt(0)}
                              </div>
                            )}
                            <span className="font-semibold text-slate-800 truncate">
                              {issue.assigneeName}
                            </span>
                            {assignedUser?.role && (
                              <span
                                className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                                  assignedUser.role === 'ADMIN'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : assignedUser.role === 'MEMBER'
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {assignedUser.role}
                              </span>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex items-center gap-2 text-slate-400">
                        <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                          <User className="w-3 h-3" />
                        </div>
                        <span className="text-slate-500">Unassigned</span>
                      </div>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1.5" />
                  </button>

                  {/* Dropdown Popover */}
                  {assigneeDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-72 overflow-y-auto">
                      {/* Unassigned Option */}
                      <button
                        type="button"
                        onClick={() => {
                          onUpdate(issue.id, {
                            assigneeType: 'UNASSIGNED',
                            assigneeName: null,
                            assigneeId: null,
                          });
                          setAssigneeDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition cursor-pointer ${
                          issue.assigneeType === 'UNASSIGNED'
                            ? 'bg-slate-100 text-slate-900 font-semibold'
                            : 'hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                            <User className="w-3 h-3" />
                          </div>
                          <span>Unassigned</span>
                        </div>
                        {issue.assigneeType === 'UNASSIGNED' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                      </button>

                      <div className="my-1.5 border-t border-slate-100" />

                      {/* Autonomous AI Agents */}
                      <div className="text-[10px] font-semibold text-slate-400 px-2.5 py-1 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>Autonomous AI Agents</span>
                      </div>
                      {[
                        { id: 'agent-triage-v1', desc: 'Auto-triage, backlog & task breakdown' },
                        { id: 'agent-coder-v1', desc: 'Autonomous coding & test runner' },
                        { id: 'agent-reviewer-v1', desc: 'PR verification & quality gates' },
                      ].map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => {
                            onUpdate(issue.id, {
                              assigneeType: 'AGENT',
                              assigneeName: agent.id,
                              assigneeId: null,
                            });
                            setAssigneeDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer text-left ${
                            issue.assigneeType === 'AGENT' && issue.assigneeName === agent.id
                              ? 'bg-emerald-50 text-emerald-900 font-semibold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5 h-5 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                              <Bot className="w-3.5 h-3.5 text-emerald-700" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-mono text-[11px] truncate">{agent.id}</div>
                              <div className="text-[10px] text-slate-400 truncate">{agent.desc}</div>
                            </div>
                          </div>
                          {issue.assigneeType === 'AGENT' && issue.assigneeName === agent.id && (
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />
                          )}
                        </button>
                      ))}

                      <div className="my-1.5 border-t border-slate-100" />

                      {/* Team Members */}
                      <div className="text-[10px] font-semibold text-slate-400 px-2.5 py-1 uppercase tracking-wider">
                        Team Members ({users.length})
                      </div>
                      {users.map((u) => {
                        const isSelected =
                          issue.assigneeType === 'HUMAN' && (issue.assigneeId === u.id || issue.assigneeName === u.name);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              onUpdate(issue.id, {
                                assigneeType: 'HUMAN',
                                assigneeName: u.name,
                                assigneeId: u.id,
                              });
                              setAssigneeDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50/80 text-indigo-900 font-semibold'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-indigo-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center font-bold text-[10px] text-indigo-700">
                                {u.avatarUrl ? (
                                  <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                                ) : (
                                  u.name.charAt(0)
                                )}
                              </div>
                              <div className="text-left min-w-0">
                                <div className="truncate font-medium">{u.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono truncate">
                                  {u.gitUsername ? `@${u.gitUsername}` : u.email}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-1">
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                                  u.role === 'ADMIN'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : u.role === 'MEMBER'
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {u.role}
                              </span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2 bg-white border border-slate-200 rounded-lg text-slate-800 flex items-center gap-2 text-xs">
                  {issue.assigneeName || 'Unassigned'}
                </div>
              )}
            </div>

            {/* Labels */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Labels
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {issue.labels?.map((label) => (
                  <span
                    key={label}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 font-medium"
                  >
                    #{label}
                  </span>
                ))}
              </div>
            </div>

            {/* Agent execution details if any */}
            {issue.agentRuns && issue.agentRuns.length > 0 && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Agent Execution</span>
                </div>
                <div className="text-slate-600">
                  Agent: <span className="font-mono text-slate-900 font-medium">{issue.agentRuns[0].agentName}</span>
                </div>
                <div className="text-slate-600">
                  Status: <span className="font-semibold text-emerald-700">{issue.agentRuns[0].status}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
