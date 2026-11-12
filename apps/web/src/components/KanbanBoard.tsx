import React, { useState } from 'react';
import { Bot, User, Radio, MessageSquare, CheckSquare, Plus } from 'lucide-react';

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
}

interface Props {
  columns: Column[];
  issues: Issue[];
  onSelectIssue: (issue: Issue) => void;
  onUpdateStatus: (issueId: string, newStatus: string) => void;
  onOpenCreateInColumn: (status: string) => void;
  canEdit: boolean;
}

export const KanbanBoard: React.FC<Props> = ({
  columns,
  issues,
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
    <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-220px)] min-w-full">
      {columns.map((col) => {
        const colIssues = issues.filter((i) => i.status.toUpperCase() === col.id.toUpperCase());
        const isDragOver = dragOverColId === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`flex flex-col w-80 shrink-0 bg-[#10131e]/70 rounded-xl border transition duration-150 overflow-hidden ${
              isDragOver
                ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/10'
                : 'border-zinc-800/80'
            }`}
          >
            {/* Column Header */}
            <div className="p-3 border-b border-zinc-800/80 bg-[#131726]/90 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs tracking-wider uppercase text-zinc-300">
                  {col.title}
                </span>
                <span className="text-[11px] px-2 py-0.2 rounded-full bg-zinc-800 text-zinc-400 font-mono">
                  {colIssues.length}
                </span>
              </div>

              {canEdit && (
                <button
                  onClick={() => onOpenCreateInColumn(col.id)}
                  title={`Add issue to ${col.title}`}
                  className="w-5 h-5 rounded hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition"
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
                  className={`group rounded-lg bg-[#161a29] hover:bg-[#1c2236] border border-zinc-800/90 hover:border-indigo-500/50 p-3 transition duration-150 shadow-sm hover:shadow-md cursor-pointer select-none active:scale-[0.99] ${
                    draggedIssueId === issue.id ? 'opacity-40 border-dashed border-indigo-400' : ''
                  }`}
                >
                  {/* Top Bar: Key & Priority */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono text-zinc-400 group-hover:text-indigo-300 transition">
                      {issue.identifier}
                    </span>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                        issue.priority === 'URGENT'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : issue.priority === 'HIGH'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : issue.priority === 'LOW'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {issue.priority}
                    </span>
                  </div>

                  {/* Title */}
                  <h4 className="text-xs font-medium text-zinc-100 group-hover:text-white mb-2 leading-snug line-clamp-2">
                    {issue.title}
                  </h4>

                  {/* Active Agent Run Indicator */}
                  {issue.agentRuns && issue.agentRuns.length > 0 && issue.agentRuns[0].status === 'RUNNING' && (
                    <div className="mb-2 p-1.5 rounded bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-1.5 text-[11px] text-emerald-300">
                      <Radio className="w-3 h-3 animate-pulse text-emerald-400 shrink-0" />
                      <span className="truncate">
                        Agent working: <span className="font-mono">{issue.agentRuns[0].agentName}</span>
                      </span>
                    </div>
                  )}

                  {/* Footer: Tags, Counts, Assignee */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 mt-2 text-[10px]">
                    <div className="flex items-center gap-2 text-zinc-400">
                      {issue.labels?.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono">
                          #{issue.labels[0]}
                          {issue.labels.length > 1 ? ` +${issue.labels.length - 1}` : ''}
                        </span>
                      )}

                      {issue.comments && issue.comments.length > 0 && (
                        <div className="flex items-center gap-0.5 text-zinc-400">
                          <MessageSquare className="w-3 h-3" />
                          <span>{issue.comments.length}</span>
                        </div>
                      )}

                      {issue.subIssues && issue.subIssues.length > 0 && (
                        <div className="flex items-center gap-0.5 text-zinc-400">
                          <CheckSquare className="w-3 h-3" />
                          <span>{issue.subIssues.length}</span>
                        </div>
                      )}
                    </div>

                    {/* Assignee Avatar */}
                    <div>
                      {issue.assigneeType === 'AGENT' ? (
                        <div
                          title={`Assigned to Agent: ${issue.assigneeName}`}
                          className="flex items-center gap-1 text-emerald-400 bg-emerald-950/80 border border-emerald-700/60 px-1.5 py-0.5 rounded text-[10px] font-mono"
                        >
                          <Bot className="w-3 h-3" />
                          <span className="max-w-[70px] truncate">{issue.assigneeName}</span>
                        </div>
                      ) : issue.assigneeType === 'HUMAN' ? (
                        <div
                          title={`Assigned to Human: ${issue.assigneeName}`}
                          className="flex items-center gap-1 text-blue-400 bg-blue-950/80 border border-blue-700/60 px-1.5 py-0.5 rounded text-[10px]"
                        >
                          <User className="w-3 h-3" />
                          <span className="max-w-[70px] truncate">{issue.assigneeName}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-600 font-mono">--</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {colIssues.length === 0 && (
                <div className="h-28 border border-dashed border-zinc-800/80 rounded-lg flex items-center justify-center text-xs text-zinc-600">
                  Drop tickets here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
