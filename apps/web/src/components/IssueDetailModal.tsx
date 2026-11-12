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
  comments?: any[];
  activities?: any[];
  subIssues?: any[];
  agentRuns?: any[];
  createdAt: string;
  updatedAt: string;
}

interface UserItem {
  id: string;
  name: string;
  role: string;
}

interface Props {
  issue: Issue | null;
  columns: { id: string; title: string }[];
  users: UserItem[];
  currentUser: { name: string; role: string };
  canEdit: boolean;
  onClose: () => void;
  onUpdate: (issueId: string, payload: any) => Promise<void>;
  onDelete: (issueId: string) => Promise<void>;
  onAddComment: (issueId: string, content: string) => Promise<void>;
  onCreateSubIssue: (parentId: string, title: string) => Promise<void>;
}

export const IssueDetailModal: React.FC<Props> = ({
  issue,
  columns,
  users,
  currentUser,
  canEdit,
  onClose,
  onUpdate,
  onDelete,
  onAddComment,
  onCreateSubIssue,
}) => {
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descText, setDescText] = useState('');
  const [titleText, setTitleText] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    if (issue) {
      setDescText(issue.description || '');
      setTitleText(issue.title || '');
      setIsEditingDesc(false);
      setIsEditingTitle(false);
    }
  }, [issue]);

  if (!issue) return null;

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
          <div className="flex-1 p-6 overflow-y-auto space-y-6 border-r border-slate-200">
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
                  {issue.subIssues.map((sub: any) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-indigo-600 font-semibold text-[11px]">{sub.identifier}</span>
                        <span className="text-slate-800 font-medium">{sub.title}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                        {sub.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                <form onSubmit={handleCreateSubtaskSubmit} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add sub-task..."
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

            {/* Tabs: Comments vs Activity Log */}
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
              </div>

              {/* Comments Tab */}
              {activeTab === 'comments' && (
                <div className="space-y-4">
                  {/* Comments list */}
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

                  {/* Add comment input */}
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
            </div>
          </div>

          {/* Sidebar Properties */}
          <div className="w-72 p-6 bg-slate-50 space-y-5 text-xs overflow-y-auto">
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
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Assignee
              </label>
              {canEdit ? (
                <div className="space-y-2">
                  <select
                    value={issue.assigneeType === 'AGENT' ? 'AGENT' : issue.assigneeId || 'UNASSIGNED'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'AGENT') {
                        onUpdate(issue.id, {
                          assigneeType: 'AGENT',
                          assigneeName: 'agent-coder-v1',
                          assigneeId: null,
                        });
                      } else if (val === 'UNASSIGNED') {
                        onUpdate(issue.id, {
                          assigneeType: 'UNASSIGNED',
                          assigneeName: null,
                          assigneeId: null,
                        });
                      } else {
                        const user = users.find((u) => u.id === val);
                        onUpdate(issue.id, {
                          assigneeType: 'HUMAN',
                          assigneeName: user?.name || 'User',
                          assigneeId: user?.id || null,
                        });
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-medium focus:outline-none focus:border-indigo-500"
                  >
                    <option value="UNASSIGNED">Unassigned</option>
                    <option value="AGENT">🤖 AI Agent (Autonomous)</option>
                    <optgroup label="Team Members">
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          👤 {u.name} ({u.role})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              ) : (
                <div className="p-2 bg-white border border-slate-200 rounded-lg text-slate-800">
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
