import React, { useState } from 'react';
import { Bot, MessageSquare, CheckSquare, Plus, Lock, ExternalLink, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface Column {
  id: string;
  title: string;
  color?: string;
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  status: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  type: string;
  assigneeType: 'HUMAN' | 'AGENT' | 'UNASSIGNED';
  assigneeName?: string | null;
  labels: string[];
  comments?: any[];
  subIssues?: any[];
  agentRuns?: any[];
  hitlState?: string | null;
  agentStatus?: string | null;
  proofOfWork?: { id: string; title: string; status: string }[] | null;
  ciStatus?: string | null;
  previewUrl?: string | null;
  incomingRelations?: { type: string; sourceIssue?: { identifier: string; status: string } }[];
  outgoingRelations?: { type: string; targetIssue?: { identifier: string; status: string } }[];
}

interface Props {
  columns: Column[];
  issues: Issue[];
  users?: { id: string; name: string; avatarUrl?: string }[];
  onSelectIssue: (issue: Issue) => void;
  onUpdateStatus: (issueId: string, newStatus: string) => void;
  onOpenCreateInColumn: (status: string) => void;
  canEdit: boolean;
}

export const KanbanBoard: React.FC<Props> = ({
  columns,
  issues,
  users,
  onSelectIssue,
  onUpdateStatus,
  onOpenCreateInColumn,
  canEdit,
}) => {
  const [draggedIssueId, setDraggedIssueId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    if (!canEdit) return;
    setDraggedIssueId(issueId);
    e.dataTransfer.setData('text/plain', issueId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (!canEdit) return;
    setDragOverColId(colId);
  };

  const handleDragLeave = () => {
    setDragOverColId(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverColId(null);
    const issueId = draggedIssueId || e.dataTransfer.getData('text/plain');
    if (issueId && canEdit) {
      onUpdateStatus(issueId, targetStatus);
    }
    setDraggedIssueId(null);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-170px)] min-w-full">
      {columns.map((col) => {
        const colIssues = issues.filter((i) => i.status.toUpperCase() === col.id.toUpperCase());
        const isDragOver = dragOverColId === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`flex flex-col w-80 shrink-0 bg-zinc-100/70 rounded-xl border transition duration-150 overflow-hidden ${
              isDragOver
                ? 'border-teal-500 bg-teal-50/50 shadow-sm'
                : 'border-zinc-200/90'
            }`}
          >
            {/* Column Header */}
            <div className="p-3 border-b border-zinc-200/80 bg-zinc-100/90 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs tracking-wider uppercase text-zinc-700">
                  {col.title}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-600 font-semibold">
                  {colIssues.length}
                </span>
              </div>

              {canEdit && (
                <button
                  onClick={() => onOpenCreateInColumn(col.id)}
                  title={`Add issue to ${col.title}`}
                  className="w-5 h-5 rounded hover:bg-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Cards Scroll Container */}
            <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5">
              {colIssues.map((issue) => (
                <div
                  key={issue.id}
                  draggable={canEdit}
                  onDragStart={(e) => handleDragStart(e, issue.id)}
                  onClick={() => onSelectIssue(issue)}
                  className={`group rounded-lg bg-white border border-zinc-200 hover:border-teal-300 p-3.5 transition duration-150 shadow-xs hover:shadow-sm cursor-pointer select-none ${
                    draggedIssueId === issue.id ? 'opacity-40 border-dashed border-teal-600' : ''
                  }`}
                >
                  {/* Top Bar: Key & Priority */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono font-semibold text-teal-700 group-hover:text-teal-800 transition">
                      {issue.identifier}
                    </span>
                    <span
                      className={`text-[9px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${
                        issue.priority === 'URGENT'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : issue.priority === 'HIGH'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : issue.priority === 'LOW'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-zinc-50 text-zinc-600 border-zinc-200'
                      }`}
                    >
                      {issue.priority}
                    </span>
                  </div>

                  {/* Title */}
                  <h4 className="text-xs font-semibold text-zinc-900 group-hover:text-teal-950 mb-2 leading-snug line-clamp-2">
                    {issue.title}
                  </h4>

                  {/* Agent-First Micro Badges (HITL, Live Status, Blockers, PoW, Preview) */}
                  {(() => {
                    const closed = new Set(['DONE', 'CANCELLED']);
                    const openBlockers = [
                      ...(issue.incomingRelations || [])
                        .filter((r) => r.type === 'BLOCKS' && r.sourceIssue && !closed.has(r.sourceIssue.status.toUpperCase()))
                        .map((r) => r.sourceIssue!.identifier),
                      ...(issue.outgoingRelations || [])
                        .filter((r) => r.type === 'IS_BLOCKED_BY' && r.targetIssue && !closed.has(r.targetIssue.status.toUpperCase()))
                        .map((r) => r.targetIssue!.identifier),
                    ];
                    const powList = Array.isArray(issue.proofOfWork) ? issue.proofOfWork : [];
                    const powPassed = powList.filter((c) => c.status === 'PASSED').length;
                    const hasActiveAgentStatus =
                      issue.agentStatus && !['IDLE', 'BLOCKED'].includes(issue.agentStatus);

                    if (
                      !issue.hitlState &&
                      !hasActiveAgentStatus &&
                      openBlockers.length === 0 &&
                      powList.length === 0 &&
                      !issue.previewUrl &&
                      (!issue.ciStatus || issue.ciStatus === 'NONE')
                    ) {
                      return null;
                    }

                    return (
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        {issue.hitlState && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-semibold">
                            <ShieldAlert className="w-2.5 h-2.5" />
                            Entscheidung nötig
                          </span>
                        )}
                        {hasActiveAgentStatus && !issue.hitlState && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200/80 text-teal-800 text-[9px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
                            {issue.agentStatus}
                          </span>
                        )}
                        {openBlockers.length > 0 && (
                          <span
                            title={`Blockiert durch: ${openBlockers.join(', ')}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[9px] font-medium"
                          >
                            <Lock className="w-2.5 h-2.5" />
                            {openBlockers[0]}
                            {openBlockers.length > 1 ? ` +${openBlockers.length - 1}` : ''}
                          </span>
                        )}
                        {powList.length > 0 && (
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-mono ${
                              powPassed === powList.length
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                            }`}
                          >
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {powPassed}/{powList.length}
                          </span>
                        )}
                        {issue.ciStatus && issue.ciStatus !== 'NONE' && (
                          <span
                            title={`CI: ${issue.ciStatus}`}
                            className={`w-2 h-2 rounded-full ${
                              issue.ciStatus === 'SUCCESS'
                                ? 'bg-emerald-500'
                                : issue.ciStatus === 'FAILURE'
                                  ? 'bg-rose-500'
                                  : 'bg-amber-400 animate-pulse'
                            }`}
                          />
                        )}
                        {issue.previewUrl && (
                          <a
                            href={issue.previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-[9px] font-medium"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            Preview
                          </a>
                        )}
                      </div>
                    );
                  })()}

                  {/* Footer: Tags, Counts, Assignee */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-zinc-100 mt-2 text-[10px]">
                    <div className="flex items-center gap-2 text-zinc-500">
                      {issue.labels?.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-mono text-[10px] border border-zinc-200/60">
                          #{issue.labels[0]}
                          {issue.labels.length > 1 ? ` +${issue.labels.length - 1}` : ''}
                        </span>
                      )}

                      {issue.comments && issue.comments.length > 0 && (
                        <div className="flex items-center gap-0.5 text-zinc-500">
                          <MessageSquare className="w-3 h-3" />
                          <span>{issue.comments.length}</span>
                        </div>
                      )}

                      {issue.subIssues && issue.subIssues.length > 0 && (
                        <div className="flex items-center gap-0.5 text-zinc-500">
                          <CheckSquare className="w-3 h-3" />
                          <span>{issue.subIssues.length}</span>
                        </div>
                      )}
                    </div>

                    {/* Assignee Pill */}
                    <div>
                      {issue.assigneeType === 'AGENT' ? (
                        <div
                          title={`Assigned to Agent: ${issue.assigneeName}`}
                          className="flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-mono font-medium"
                        >
                          <Bot className="w-3 h-3 text-emerald-600" />
                          <span className="max-w-[75px] truncate">{issue.assigneeName}</span>
                        </div>
                      ) : issue.assigneeType === 'HUMAN' ? (
                        (() => {
                          const assignedUser = users?.find((u) => u.name === issue.assigneeName);
                          return (
                            <div
                              title={`Assigned to: ${issue.assigneeName}`}
                              className="flex items-center gap-1.5 text-zinc-700 bg-zinc-100/90 border border-zinc-200 px-1.5 py-0.5 rounded text-[10px] font-medium"
                            >
                              {assignedUser?.avatarUrl ? (
                                <img
                                  src={assignedUser.avatarUrl}
                                  alt=""
                                  className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full bg-teal-700 text-white flex items-center justify-center text-[8px] font-bold shrink-0">
                                  {(issue.assigneeName || 'U').charAt(0)}
                                </div>
                              )}
                              <span className="max-w-[75px] truncate">{issue.assigneeName}</span>
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-zinc-400 font-mono text-[10px]">--</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {colIssues.length === 0 && (
                <div className="h-24 border border-dashed border-zinc-300 rounded-lg flex items-center justify-center text-xs text-zinc-400 font-medium">
                  No tickets
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
