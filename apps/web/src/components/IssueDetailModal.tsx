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
  ShieldAlert,
  Activity,
  Terminal,
  FileCode2,
  CheckCircle2,
  XCircle,
  Globe,
} from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';
import { computeReadiness, ProofOfWorkCheck } from '../utils/readiness';

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
  hitlState?: string | null;
  hitlPrompt?: string | null;
  hitlResponse?: string | null;
  agentStatus?: string | null;
  proofOfWork?: ProofOfWorkCheck[] | null;
  ciStatus?: string | null;
  previewUrl?: string | null;
  previewScreenshotUrl?: string | null;
  targetFiles?: string[];
  traceEvents?: any[];
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
  const [activeTab, setActiveTab] = useState<'comments' | 'activity' | 'git' | 'trace'>('comments');
  const [hitlReply, setHitlReply] = useState('');
  const [hitlBusy, setHitlBusy] = useState(false);
  const [newPowTitle, setNewPowTitle] = useState('');
  const [newPowCmd, setNewPowCmd] = useState('');
  const [targetFilesInput, setTargetFilesInput] = useState('');
  const [previewUrlInput, setPreviewUrlInput] = useState('');
  const [editingPreview, setEditingPreview] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descText, setDescText] = useState('');
  const [titleText, setTitleText] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [copiedBranch, setCopiedBranch] = useState(false);

  // Collapsible empty sections state
  const [showPowSection, setShowPowSection] = useState(false);
  const [showPreviewSection, setShowPreviewSection] = useState(false);
  const [showSubtasksSection, setShowSubtasksSection] = useState(false);

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
      setShowPowSection(false);
      setShowPreviewSection(false);
      setShowSubtasksSection(false);
      setHitlReply('');
      setNewPowTitle('');
      setNewPowCmd('');
      setTargetFilesInput((issue.targetFiles || []).join(', '));
      setPreviewUrlInput(issue.previewUrl || '');
      setEditingPreview(false);
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

  const readiness = computeReadiness({
    description: issue.description,
    proofOfWork: issue.proofOfWork,
    targetFiles: issue.targetFiles,
    hasOpenBlockers: blockers.length > 0,
  });

  const handleResolveHitl = async (action: 'APPROVE' | 'REJECT' | 'ANSWER') => {
    setHitlBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/issues/${issue.id}/hitl/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          response: hitlReply.trim() || undefined,
          actorName: currentUser.name,
        }),
      });
      if (res.ok) {
        setHitlReply('');
        if (onSelectIssue) onSelectIssue(issue.id);
      }
    } finally {
      setHitlBusy(false);
    }
  };

  const powList: ProofOfWorkCheck[] = Array.isArray(issue.proofOfWork) ? issue.proofOfWork : [];

  const savePowList = async (next: ProofOfWorkCheck[]) => {
    await fetch(`${API_URL}/api/issues/${issue.id}/proof-of-work`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proofOfWork: next,
        actorName: currentUser.name,
        actorType: 'HUMAN',
      }),
    });
    if (onSelectIssue) onSelectIssue(issue.id);
  };

  const handleAddPow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPowTitle.trim()) return;
    const next: ProofOfWorkCheck[] = [
      ...powList,
      {
        id: `pow-${Date.now()}`,
        title: newPowTitle.trim(),
        command: newPowCmd.trim() || undefined,
        status: 'PENDING',
        updatedAt: new Date().toISOString(),
      },
    ];
    setNewPowTitle('');
    setNewPowCmd('');
    await savePowList(next);
  };

  const handleCyclePow = async (checkId: string) => {
    const order: ProofOfWorkCheck['status'][] = ['PENDING', 'PASSED', 'FAILED'];
    const next = powList.map((c) => {
      if (c.id !== checkId) return c;
      const nextStatus = order[(order.indexOf(c.status) + 1) % order.length];
      return { ...c, status: nextStatus, updatedAt: new Date().toISOString() };
    });
    await savePowList(next);
  };

  const handleRemovePow = async (checkId: string) => {
    await savePowList(powList.filter((c) => c.id !== checkId));
  };

  const handleSaveTargetFiles = async () => {
    const files = targetFilesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await onUpdate(issue.id, { targetFiles: files });
  };

  const handleSavePreview = async () => {
    await fetch(`${API_URL}/api/issues/${issue.id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        previewUrl: previewUrlInput.trim() || null,
        actorName: currentUser.name,
        actorType: 'HUMAN',
      }),
    });
    setEditingPreview(false);
    if (onSelectIssue) onSelectIssue(issue.id);
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
      className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-white border border-zinc-200 rounded-2xl max-w-5xl w-full h-[90vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded">
              {issue.identifier}
            </span>
            <span className="text-xs text-zinc-500 font-medium px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200">
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
                className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5 border-r border-zinc-200">
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
                    className="flex-1 bg-white border border-teal-600 rounded-lg px-3 py-1.5 text-base font-bold text-zinc-900 focus:outline-none"
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="p-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setTitleText(issue.title);
                      setIsEditingTitle(false);
                    }}
                    className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="group flex items-start justify-between gap-3">
                  <h1 className="text-xl font-bold text-zinc-900 leading-snug">{issue.title}</h1>
                  {canEdit && (
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-700 transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 1B: Human-in-the-Loop Gate Banner */}
            {issue.hitlState && (
              <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/80 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-amber-900 text-xs font-bold">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>
                      Agent wartet auf Entscheidung:{' '}
                      {issue.hitlState === 'PLAN_APPROVAL'
                        ? 'Plan-Freigabe'
                        : issue.hitlState === 'RISK_APPROVAL'
                          ? 'Risiko-Freigabe'
                          : 'Klärung nötig'}
                    </span>
                  </div>
                </div>
                {issue.hitlPrompt && (
                  <p className="text-xs text-amber-950 bg-white/80 border border-amber-200 rounded-lg p-2.5 whitespace-pre-wrap">
                    {issue.hitlPrompt}
                  </p>
                )}
                {canEdit && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={hitlReply}
                      onChange={(e) => setHitlReply(e.target.value)}
                      placeholder="Antwort oder Begründung..."
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-amber-200 rounded-lg focus:outline-none focus:border-teal-500"
                    />
                    <div className="flex items-center gap-1.5">
                      {issue.hitlState === 'NEEDS_CLARIFICATION' ? (
                        <button
                          disabled={hitlBusy || !hitlReply.trim()}
                          onClick={() => handleResolveHitl('ANSWER')}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
                        >
                          Antwort senden
                        </button>
                      ) : (
                        <>
                          <button
                            disabled={hitlBusy}
                            onClick={() => handleResolveHitl('REJECT')}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Ablehnen
                          </button>
                          <button
                            disabled={hitlBusy}
                            onClick={() => handleResolveHitl('APPROVE')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Freigeben
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2.2: Agent-Readiness Score Bar (compact) */}
            <div className="px-3.5 py-2 rounded-xl border border-zinc-200 bg-zinc-50/70 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                <span className="text-[11px] font-semibold text-zinc-700">Agent-Readiness</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    readiness.level === 'READY'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : readiness.level === 'NEEDS_CONTEXT'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {readiness.score}% · {readiness.level === 'READY' ? 'Bereit' : readiness.level === 'NEEDS_CONTEXT' ? 'Kontext fehlt' : 'Zu vage'}
                </span>
              </div>
              {readiness.missing.length > 0 && (
                <div className="text-[10px] text-zinc-500 flex flex-wrap gap-x-2.5 gap-y-0.5">
                  {readiness.missing.map((m, idx) => (
                    <span key={idx}>• {m}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Description (Markdown) */}
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200/80">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Description
                </span>
                {canEdit && !isEditingDesc && (
                  <button
                    onClick={() => setIsEditingDesc(true)}
                    className="text-xs flex items-center gap-1 text-teal-700 hover:text-teal-800 font-medium transition"
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
                    className="w-full bg-white border border-teal-600 rounded-lg p-3 text-xs text-zinc-900 focus:outline-none font-mono"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setDescText(issue.description || '');
                        setIsEditingDesc(false);
                      }}
                      className="px-3 py-1 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveDescription}
                      className="px-3 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded text-xs font-medium"
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

            {/* Compact Action Bar for Empty Sections */}
            {canEdit &&
              (powList.length === 0 && !showPowSection ||
                !issue.previewUrl && !editingPreview && !showPreviewSection ||
                (issue.subIssues?.length || 0) === 0 && !showSubtasksSection ||
                (issue.outgoingRelations?.length || 0) + (issue.incomingRelations?.length || 0) === 0 && !showAddRelation) && (
                <div className="flex flex-wrap items-center gap-2">
                  {powList.length === 0 && !showPowSection && (
                    <button
                      type="button"
                      onClick={() => setShowPowSection(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-[11px] font-medium text-zinc-600 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>+ Proof of Work</span>
                    </button>
                  )}
                  {!issue.previewUrl && !editingPreview && !showPreviewSection && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowPreviewSection(true);
                        setEditingPreview(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-[11px] font-medium text-zinc-600 transition"
                    >
                      <Globe className="w-3.5 h-3.5 text-sky-600" />
                      <span>+ Preview-URL</span>
                    </button>
                  )}
                  {(issue.subIssues?.length || 0) === 0 && !showSubtasksSection && (
                    <button
                      type="button"
                      onClick={() => setShowSubtasksSection(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-[11px] font-medium text-zinc-600 transition"
                    >
                      <CheckSquare className="w-3.5 h-3.5 text-teal-700" />
                      <span>+ Sub-Task</span>
                    </button>
                  )}
                  {(issue.outgoingRelations?.length || 0) + (issue.incomingRelations?.length || 0) === 0 && !showAddRelation && (
                    <button
                      type="button"
                      onClick={() => setShowAddRelation(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-[11px] font-medium text-zinc-600 transition"
                    >
                      <Link2 className="w-3.5 h-3.5 text-teal-700" />
                      <span>+ Verknüpfung</span>
                    </button>
                  )}
                </div>
              )}

            {/* 1E: Proof of Work (Definition of Done) */}
            {(powList.length > 0 || showPowSection || (issue.ciStatus && issue.ciStatus !== 'NONE')) && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider">
                      Proof of Work ({powList.filter((c) => c.status === 'PASSED').length}/{powList.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {issue.ciStatus && issue.ciStatus !== 'NONE' && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          issue.ciStatus === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : issue.ciStatus === 'FAILURE'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        CI: {issue.ciStatus}
                      </span>
                    )}
                    {powList.length === 0 && showPowSection && (
                      <button
                        type="button"
                        onClick={() => setShowPowSection(false)}
                        className="text-zinc-400 hover:text-zinc-600"
                        title="Ausblenden"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {powList.length > 0 && (
                  <div className="space-y-1.5">
                    {powList.map((check) => (
                      <div
                        key={check.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-zinc-200 text-xs"
                      >
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => handleCyclePow(check.id)}
                          className="flex items-center gap-2 min-w-0 text-left"
                          title="Status umschalten (PENDING → PASSED → FAILED)"
                        >
                          {check.status === 'PASSED' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : check.status === 'FAILED' ? (
                            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-zinc-800 truncate">{check.title}</div>
                            {check.command && (
                              <code className="text-[10px] text-zinc-500 font-mono">{check.command}</code>
                            )}
                          </div>
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleRemovePow(check.id)}
                            className="text-zinc-400 hover:text-rose-600 p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canEdit && (
                  <form onSubmit={handleAddPow} className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={newPowTitle}
                      onChange={(e) => setNewPowTitle(e.target.value)}
                      placeholder="Check (z. B. Unit Tests grün)"
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white focus:outline-none focus:border-teal-500"
                    />
                    <input
                      type="text"
                      value={newPowCmd}
                      onChange={(e) => setNewPowCmd(e.target.value)}
                      placeholder="npm test"
                      className="w-36 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white focus:outline-none focus:border-teal-500"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 text-white text-xs font-medium hover:bg-zinc-900"
                    >
                      + Check
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Ephemeral Preview Environment (2.6) */}
            {(issue.previewUrl || editingPreview || showPreviewSection) && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-sky-600" />
                    <span className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider">
                      Preview-Environment
                    </span>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        if (editingPreview) {
                          setEditingPreview(false);
                          if (!issue.previewUrl) setShowPreviewSection(false);
                        } else {
                          setEditingPreview(true);
                        }
                      }}
                      className="text-[11px] text-teal-700 hover:text-teal-800 font-medium"
                    >
                      {editingPreview ? 'Abbrechen' : issue.previewUrl ? 'Ändern' : '+ Verknüpfen'}
                    </button>
                  )}
                </div>

                {editingPreview ? (
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={previewUrlInput}
                      onChange={(e) => setPreviewUrlInput(e.target.value)}
                      placeholder="https://pr-42.preview.kanso.dev"
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white focus:outline-none focus:border-teal-500"
                    />
                    <button
                      type="button"
                      onClick={handleSavePreview}
                      className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-medium hover:bg-teal-800"
                    >
                      Speichern
                    </button>
                  </div>
                ) : issue.previewUrl ? (
                  <div className="space-y-2">
                    <a
                      href={issue.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-2 rounded-lg bg-white border border-sky-200 text-xs text-sky-700 hover:bg-sky-50 transition"
                    >
                      <span className="truncate font-mono text-[11px]">{issue.previewUrl}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0 ml-2" />
                    </a>
                    {issue.previewScreenshotUrl && (
                      <img
                        src={issue.previewScreenshotUrl}
                        alt="Preview Screenshot"
                        className="w-full max-h-32 object-cover rounded-lg border border-zinc-200"
                      />
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Sub-tasks Section */}
            {((issue.subIssues && issue.subIssues.length > 0) || showSubtasksSection) && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-teal-700" />
                    <span className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                      Sub-tasks ({issue.subIssues?.length || 0})
                    </span>
                  </div>
                  {(issue.subIssues?.length || 0) === 0 && showSubtasksSection && (
                    <button
                      type="button"
                      onClick={() => setShowSubtasksSection(false)}
                      className="text-zinc-400 hover:text-zinc-600"
                      title="Ausblenden"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

              {issue.subIssues && issue.subIssues.length > 0 && (
                <div className="space-y-1.5">
                  {issue.subIssues.map((sub: any) => {
                    const isDone = sub.status === 'DONE';
                    return (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-white border border-zinc-200 text-xs hover:border-zinc-300 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => handleToggleSubtaskStatus(sub)}
                            disabled={!canEdit}
                            className="text-zinc-400 hover:text-teal-700"
                          >
                            {isDone ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <span
                            onClick={() => onSelectIssue && onSelectIssue(sub.id)}
                            className="font-mono text-teal-700 font-semibold text-[11px] hover:underline cursor-pointer"
                          >
                            {sub.identifier}
                          </span>
                          <span className={`font-medium ${isDone ? 'line-through text-zinc-400' : 'text-zinc-800'}`}>
                            {sub.title}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                            isDone ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
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
                    className="flex-1 bg-white border border-zinc-300 rounded-lg px-3 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-teal-600"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-xs rounded-lg font-medium transition"
                  >
                    Add
                  </button>
                </form>
              )}
              </div>
            )}

            {/* Ticket-Verknüpfungen (Relations & Blockers) */}
            {((issue.outgoingRelations?.length || 0) + (issue.incomingRelations?.length || 0) > 0 || showAddRelation) && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-teal-700" />
                  <span className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                    Verknüpfungen & Blocker ({(issue.outgoingRelations?.length || 0) + (issue.incomingRelations?.length || 0)})
                  </span>
                </div>
                {canEdit && !showAddRelation && (
                  <button
                    onClick={() => setShowAddRelation(true)}
                    className="text-xs text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1"
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
                  className="p-3 rounded-lg border border-teal-200 bg-white space-y-2.5 animate-in fade-in duration-100"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-zinc-600 mb-1">Typ</label>
                      <select
                        value={relationType}
                        onChange={(e: any) => setRelationType(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded border border-zinc-200 focus:outline-none focus:border-teal-600"
                      >
                        <option value="IS_BLOCKED_BY">wird blockiert durch</option>
                        <option value="BLOCKS">blockiert</option>
                        <option value="RELATES_TO">bezieht sich auf</option>
                        <option value="DUPLICATES">dupliziert</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-zinc-600 mb-1">Ziel-Ticket</label>
                      <select
                        value={relationTargetId}
                        onChange={(e) => setRelationTargetId(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded border border-zinc-200 focus:outline-none focus:border-teal-600"
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
                      className="px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-800"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      disabled={!relationTargetId || submittingRelation}
                      className="px-3 py-1 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded text-xs font-semibold"
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
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-zinc-200 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 uppercase">
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
                        className="font-mono text-teal-700 font-semibold hover:underline cursor-pointer"
                      >
                        {rel.targetIssue?.identifier}
                      </span>
                      <span className="text-zinc-800 truncate max-w-xs">{rel.targetIssue?.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-500">
                        {rel.targetIssue?.status}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteRelation(rel.id)}
                          className="text-zinc-400 hover:text-red-600 p-0.5"
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
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-zinc-200 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 uppercase">
                        {rel.type === 'BLOCKS'
                          ? 'wird blockiert durch'
                          : rel.type === 'IS_BLOCKED_BY'
                          ? 'blockiert'
                          : 'verknüpft von'}
                      </span>
                      <span
                        onClick={() => onSelectIssue && onSelectIssue(rel.sourceIssue.id)}
                        className="font-mono text-teal-700 font-semibold hover:underline cursor-pointer"
                      >
                        {rel.sourceIssue?.identifier}
                      </span>
                      <span className="text-zinc-800 truncate max-w-xs">{rel.sourceIssue?.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-500">
                        {rel.sourceIssue?.status}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteRelation(rel.id)}
                          className="text-zinc-400 hover:text-red-600 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

              </div>
            </div>
            )}

            {/* Tabs: Comments vs Activity Log vs Git */}
            <div>
              <div className="flex items-center gap-4 border-b border-zinc-200 pb-2 mb-4">
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`flex items-center gap-1.5 text-xs font-semibold pb-1 transition border-b-2 -mb-2.5 ${
                    activeTab === 'comments'
                      ? 'border-teal-700 text-teal-700'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Discussion ({issue.comments?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('activity')}
                  className={`flex items-center gap-1.5 text-xs font-semibold pb-1 transition border-b-2 -mb-2.5 ${
                    activeTab === 'activity'
                      ? 'border-teal-700 text-teal-700'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Aktivitäts-Log ({issue.activities?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('git')}
                  className={`flex items-center gap-1.5 text-xs font-semibold pb-1 transition border-b-2 -mb-2.5 ${
                    activeTab === 'git'
                      ? 'border-teal-700 text-teal-700'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Git & Commits ({issue.gitLinks?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('trace')}
                  className={`flex items-center gap-1.5 text-xs font-semibold pb-1 transition border-b-2 -mb-2.5 ${
                    activeTab === 'trace'
                      ? 'border-teal-700 text-teal-700'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Live Trace ({issue.traceEvents?.length || 0})</span>
                </button>
              </div>

              {/* Comments Tab */}
              {activeTab === 'comments' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {issue.comments?.map((comment: any) => (
                      <div
                        key={comment.id}
                        className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            {comment.authorType === 'AGENT' ? (
                              <div className="flex items-center gap-1 text-emerald-700 font-mono text-[11px] font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                <Bot className="w-3 h-3 text-emerald-600" />
                                <span>{comment.authorName}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-zinc-700 text-[11px] font-semibold bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded">
                                <User className="w-3 h-3 text-zinc-500" />
                                <span>{comment.authorName}</span>
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-400 font-mono">
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
                      <div className="text-center py-6 text-xs text-zinc-400">
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
                      className="w-full bg-white border border-zinc-300 rounded-xl p-3 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-teal-600"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Markdown supported</span>
                      <button
                        type="submit"
                        disabled={submittingComment || !newComment.trim()}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs transition"
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
                      className="flex items-start gap-3 p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs"
                    >
                      <div className="mt-0.5">
                        {act.actorType === 'AGENT' ? (
                          <Bot className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <User className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-800">{act.actorName}</span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {new Date(act.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-zinc-600 text-xs mt-0.5">{act.details}</p>
                      </div>
                    </div>
                  ))}

                  {(!issue.activities || issue.activities.length === 0) && (
                    <div className="text-center py-6 text-xs text-zinc-400">
                      No activity recorded yet.
                    </div>
                  )}
                </div>
              )}

              {/* Git & Commits Tab */}
              {activeTab === 'git' && (
                <div className="space-y-4">
                  {/* Branch helper banner */}
                  <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <GitBranch className="w-4 h-4 text-teal-700 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-zinc-800">Feature Branch erstellen</div>
                        <code className="text-[11px] font-mono text-zinc-500">git checkout -b {branchName}</code>
                      </div>
                    </div>

                    <button
                      onClick={handleCopyBranch}
                      className="flex items-center gap-1 px-3 py-1 bg-white border border-zinc-200 hover:border-zinc-300 rounded-md text-xs font-semibold text-zinc-700 shadow-xs transition"
                    >
                      {copiedBranch ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedBranch ? 'Kopiert' : 'Kopieren'}</span>
                    </button>
                  </div>

                  {/* Simulate Git Hook Trigger */}
                  {showSimulateGit ? (
                    <form onSubmit={handleSimulateGit} className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/40 space-y-3">
                      <div className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                        <GitCommit className="w-4 h-4 text-teal-700" />
                        <span>Git Push / PR Hook simulieren</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={gitType}
                          onChange={(e: any) => setGitType(e.target.value)}
                          className="px-2.5 py-1 text-xs rounded border border-zinc-200 bg-white"
                        >
                          <option value="commit">Commit auf main</option>
                          <option value="pull_request">Merged PR</option>
                        </select>
                        <input
                          type="text"
                          value={gitMsg}
                          onChange={(e) => setGitMsg(e.target.value)}
                          placeholder="Commit-Message mit 'Fixes #...'"
                          className="col-span-2 px-2.5 py-1 text-xs rounded border border-zinc-200 bg-white"
                        />
                      </div>

                      <p className="text-[11px] text-zinc-500">
                        Keyword <code className="font-mono text-teal-700 font-bold">Fixes #{issue.identifier}</code> schließt das Ticket automatisch auf Status DONE.
                      </p>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowSimulateGit(false)}
                          className="px-2.5 py-1 text-xs text-zinc-500"
                        >
                          Abbrechen
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded text-xs font-semibold"
                        >
                          Ausführen & Ticket aktualisieren
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex justify-end">
                      <button
                        onClick={() => setShowSimulateGit(true)}
                        className="text-xs text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1"
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
                        className="p-3 rounded-xl border border-zinc-200 bg-white flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600">
                            {git.type === 'pull_request' ? <GitPullRequest className="w-4 h-4 text-purple-600" /> : <GitCommit className="w-4 h-4 text-teal-700" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-zinc-900">{git.reference}</span>
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
                            <p className="text-zinc-600 text-xs mt-0.5">{git.title}</p>
                          </div>
                        </div>

                        {git.url && (
                          <a
                            href={git.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-zinc-400 hover:text-teal-700"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    ))}

                    {(!issue.gitLinks || issue.gitLinks.length === 0) && (
                      <div className="text-center py-6 text-xs text-zinc-400">
                        Noch keine Commits oder Pull Requests mit diesem Ticket verknüpft.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 1C: Live Execution Trace Tab */}
              {activeTab === 'trace' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">
                      Live-Telemetrie & Tool-Calls des Agenten
                    </span>
                    {issue.agentStatus && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
                        {issue.agentStatus}
                      </span>
                    )}
                  </div>

                  {issue.traceEvents && issue.traceEvents.length > 0 ? (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {issue.traceEvents.map((ev: any) => (
                        <div
                          key={ev.id}
                          className="p-2.5 rounded-xl border border-zinc-200 bg-white text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Terminal className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700">
                                {ev.phase}
                              </span>
                              <span className="font-medium text-zinc-900 truncate">{ev.title}</span>
                            </div>
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                ev.status === 'FAILED'
                                  ? 'bg-rose-50 text-rose-700'
                                  : ev.status === 'SUCCESS'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-zinc-100 text-zinc-600'
                              }`}
                            >
                              {ev.status}
                            </span>
                          </div>
                          {ev.filePath && (
                            <div className="text-[10px] font-mono text-teal-700 pl-5">
                              {ev.filePath}
                            </div>
                          )}
                          {ev.detail && (
                            <pre className="text-[10px] font-mono text-zinc-600 bg-zinc-50 border border-zinc-100 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                              {ev.detail}
                            </pre>
                          )}
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 pl-5">
                            <span>{ev.agentName}</span>
                            <span>{new Date(ev.createdAt).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-xs text-zinc-400 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                      Noch keine Execution-Traces vorhanden. Agenten senden Live-Schritte über MCP (`kanso_report_trace`) oder API.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Properties */}
          <div className="w-80 p-6 bg-zinc-50 space-y-4 text-xs overflow-y-auto shrink-0">
            {/* Status */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">
                Status
              </label>
              {canEdit ? (
                <select
                  value={issue.status}
                  onChange={(e) => onUpdate(issue.id, { status: e.target.value })}
                  className="w-full bg-white border border-zinc-300 rounded-lg p-2 text-zinc-900 font-medium focus:outline-none focus:border-teal-600"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 font-medium">
                  {columns.find((c) => c.id === issue.status)?.title || issue.status}
                </div>
              )}
            </div>

            {/* Sprint Assignment */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">
                Sprint / Cycle
              </label>
              {canEdit ? (
                <select
                  value={issue.sprintId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdate(issue.id, { sprintId: val ? val : null });
                  }}
                  className="w-full bg-white border border-zinc-300 rounded-lg p-2 text-zinc-900 font-medium focus:outline-none focus:border-teal-600"
                >
                  <option value="">📁 Product Backlog (kein Sprint)</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.status === 'ACTIVE' ? '🏃 ' : ''}{s.name} ({s.status})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-800">
                  {issue.sprint?.name || 'Product Backlog'}
                </div>
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">
                Priority
              </label>
              {canEdit ? (
                <select
                  value={issue.priority}
                  onChange={(e: any) => onUpdate(issue.id, { priority: e.target.value })}
                  className="w-full bg-white border border-zinc-300 rounded-lg p-2 text-zinc-900 font-medium focus:outline-none focus:border-teal-600"
                >
                  <option value="URGENT">Urgent</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              ) : (
                <div className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 font-medium">
                  {issue.priority}
                </div>
              )}
            </div>

            {/* Issue Type */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">
                Typ
              </label>
              {canEdit ? (
                <select
                  value={issue.type || 'TASK'}
                  onChange={(e) => onUpdate(issue.id, { type: e.target.value })}
                  className="w-full bg-white border border-zinc-300 rounded-lg p-2 text-zinc-900 font-medium focus:outline-none focus:border-teal-600"
                >
                  <option value="TASK">Task</option>
                  <option value="BUG">Bug</option>
                  <option value="FEATURE">Feature</option>
                  <option value="STORY">Story</option>
                  <option value="EPIC">Epic</option>
                </select>
              ) : (
                <div className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 font-medium">
                  {issue.type || 'TASK'}
                </div>
              )}
            </div>

            {/* Assignee Target */}
            <div className="relative">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">
                Assignee
              </label>
              {canEdit ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setAssigneeDropdownOpen(!assigneeDropdownOpen)}
                    className="w-full bg-white border border-zinc-300 hover:border-zinc-400 rounded-xl px-3 py-2 text-zinc-900 font-medium focus:outline-none focus:border-teal-600 flex items-center justify-between text-xs transition cursor-pointer shadow-2xs"
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
                                className="w-5 h-5 rounded-full object-cover border border-zinc-200 shrink-0"
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-[10px] shrink-0 border border-teal-200">
                                {(issue.assigneeName || 'U').charAt(0)}
                              </div>
                            )}
                            <span className="font-semibold text-zinc-800 truncate">
                              {issue.assigneeName}
                            </span>
                            {assignedUser?.role && (
                              <span
                                className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                                  assignedUser.role === 'ADMIN'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : assignedUser.role === 'MEMBER'
                                    ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                    : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                                }`}
                              >
                                {assignedUser.role}
                              </span>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex items-center gap-2 text-zinc-400">
                        <div className="w-5 h-5 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 shrink-0">
                          <User className="w-3 h-3" />
                        </div>
                        <span className="text-zinc-500">Unassigned</span>
                      </div>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0 ml-1.5" />
                  </button>

                  {/* Dropdown Popover */}
                  {assigneeDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-72 overflow-y-auto">
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
                            ? 'bg-zinc-100 text-zinc-900 font-semibold'
                            : 'hover:bg-zinc-50 text-zinc-600'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400">
                            <User className="w-3 h-3" />
                          </div>
                          <span>Unassigned</span>
                        </div>
                        {issue.assigneeType === 'UNASSIGNED' && <Check className="w-3.5 h-3.5 text-teal-700" />}
                      </button>

                      <div className="my-1.5 border-t border-zinc-100" />

                      {/* Autonomous AI Agents */}
                      <div className="text-[10px] font-semibold text-zinc-400 px-2.5 py-1 uppercase tracking-wider flex items-center gap-1">
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
                              : 'hover:bg-zinc-50 text-zinc-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5 h-5 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                              <Bot className="w-3.5 h-3.5 text-emerald-700" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-mono text-[11px] truncate">{agent.id}</div>
                              <div className="text-[10px] text-zinc-400 truncate">{agent.desc}</div>
                            </div>
                          </div>
                          {issue.assigneeType === 'AGENT' && issue.assigneeName === agent.id && (
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />
                          )}
                        </button>
                      ))}

                      <div className="my-1.5 border-t border-zinc-100" />

                      {/* Team Members */}
                      <div className="text-[10px] font-semibold text-zinc-400 px-2.5 py-1 uppercase tracking-wider">
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
                                ? 'bg-teal-50/80 text-teal-950 font-semibold'
                                : 'hover:bg-zinc-50 text-zinc-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-teal-100 border border-zinc-200 overflow-hidden shrink-0 flex items-center justify-center font-bold text-[10px] text-teal-800">
                                {u.avatarUrl ? (
                                  <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                                ) : (
                                  u.name.charAt(0)
                                )}
                              </div>
                              <div className="text-left min-w-0">
                                <div className="truncate font-medium">{u.name}</div>
                                <div className="text-[10px] text-zinc-400 font-mono truncate">
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
                                    ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                    : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                                }`}
                              >
                                {u.role}
                              </span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-teal-700" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 flex items-center gap-2 text-xs">
                  {issue.assigneeName || 'Unassigned'}
                </div>
              )}
            </div>

            {/* Labels */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">
                Labels
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {issue.labels?.map((label) => (
                  <span
                    key={label}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-zinc-700 border border-zinc-200 font-medium"
                  >
                    #{label}
                  </span>
                ))}
              </div>
            </div>

            {/* Target Files (moved from Readiness Header) */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                <FileCode2 className="w-3 h-3 text-zinc-400" />
                <span>Ziel-Dateien</span>
              </label>
              {canEdit ? (
                <input
                  type="text"
                  value={targetFilesInput}
                  onChange={(e) => setTargetFilesInput(e.target.value)}
                  onBlur={handleSaveTargetFiles}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTargetFiles()}
                  placeholder="z. B. src/auth.ts, App.tsx"
                  className="w-full text-[11px] font-mono px-2.5 py-2 rounded-lg border border-zinc-300 bg-white focus:outline-none focus:border-teal-600"
                />
              ) : (
                <div className="text-[11px] font-mono text-zinc-600">
                  {targetFilesInput || 'Keine Ziel-Dateien angegeben'}
                </div>
              )}
            </div>

            {/* Timestamps */}
            {(issue.createdAt || issue.updatedAt) && (
              <div className="pt-3 border-t border-zinc-200 space-y-1 text-[11px] text-zinc-400">
                {issue.createdAt && (
                  <div className="flex justify-between">
                    <span>Erstellt</span>
                    <span className="font-mono">{new Date(issue.createdAt).toLocaleDateString('de-DE')}</span>
                  </div>
                )}
                {issue.updatedAt && (
                  <div className="flex justify-between">
                    <span>Aktualisiert</span>
                    <span className="font-mono">{new Date(issue.updatedAt).toLocaleDateString('de-DE')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Agent execution details if any */}
            {issue.agentRuns && issue.agentRuns.length > 0 && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Agent Execution</span>
                </div>
                <div className="text-zinc-600">
                  Agent: <span className="font-mono text-zinc-900 font-medium">{issue.agentRuns[0].agentName}</span>
                </div>
                <div className="text-zinc-600">
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
