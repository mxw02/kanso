import React from 'react';
import { Bot, User, MessageSquare, ChevronDown } from 'lucide-react';

interface Column {
  id: string;
  title: string;
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  type: string;
  assigneeType: 'HUMAN' | 'AGENT' | 'UNASSIGNED';
  assigneeName?: string | null;
  labels: string[];
  comments?: any[];
  createdAt: string;
  updatedAt: string;
}

interface Props {
  columns: Column[];
  issues: Issue[];
  onSelectIssue: (issue: Issue) => void;
  onUpdateStatus: (issueId: string, newStatus: string) => void;
  canEdit: boolean;
}

export const ListView: React.FC<Props> = ({
  columns,
  issues,
  onSelectIssue,
  onUpdateStatus,
  canEdit,
}) => {
  return (
    <div className="bg-[#10131e]/70 border border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800/80 bg-[#131726]/90 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4 w-28">Key</th>
              <th className="py-3 px-4">Title</th>
              <th className="py-3 px-4 w-36">Status</th>
              <th className="py-3 px-4 w-28">Priority</th>
              <th className="py-3 px-4 w-40">Assignee</th>
              <th className="py-3 px-4 w-44">Labels</th>
              <th className="py-3 px-4 w-28 text-right">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {issues.map((issue) => (
              <tr
                key={issue.id}
                onClick={() => onSelectIssue(issue)}
                className="hover:bg-zinc-800/40 cursor-pointer transition duration-100 group"
              >
                {/* Identifier */}
                <td className="py-3 px-4 font-mono font-medium text-indigo-400 group-hover:text-indigo-300">
                  {issue.identifier}
                </td>

                {/* Title */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200 group-hover:text-white line-clamp-1">
                      {issue.title}
                    </span>
                    {issue.comments && issue.comments.length > 0 && (
                      <span className="flex items-center gap-0.5 text-zinc-500 text-[10px]">
                        <MessageSquare className="w-3 h-3" />
                        {issue.comments.length}
                      </span>
                    )}
                  </div>
                </td>

                {/* Status Dropdown */}
                <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                  {canEdit ? (
                    <div className="relative inline-block">
                      <select
                        value={issue.status}
                        onChange={(e) => onUpdateStatus(issue.id, e.target.value)}
                        className="appearance-none bg-zinc-800 hover:bg-zinc-700/80 text-zinc-200 text-[11px] font-medium py-1 pl-2.5 pr-6 rounded border border-zinc-700/70 focus:outline-none cursor-pointer"
                      >
                        {columns.map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.title}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-1.5 top-2 pointer-events-none" />
                    </div>
                  ) : (
                    <span className="text-[11px] text-zinc-300 px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700">
                      {columns.find((c) => c.id === issue.status)?.title || issue.status}
                    </span>
                  )}
                </td>

                {/* Priority */}
                <td className="py-3 px-4">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${
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
                </td>

                {/* Assignee */}
                <td className="py-3 px-4">
                  {issue.assigneeType === 'AGENT' ? (
                    <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                      <Bot className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{issue.assigneeName}</span>
                    </div>
                  ) : issue.assigneeType === 'HUMAN' ? (
                    <div className="flex items-center gap-1.5 text-blue-400 text-[11px]">
                      <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate">{issue.assigneeName || 'Assigned'}</span>
                    </div>
                  ) : (
                    <span className="text-zinc-600 text-[11px]">Unassigned</span>
                  )}
                </td>

                {/* Labels */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1 flex-wrap">
                    {issue.labels?.map((label) => (
                      <span
                        key={label}
                        className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/60"
                      >
                        #{label}
                      </span>
                    ))}
                  </div>
                </td>

                {/* Date */}
                <td className="py-3 px-4 text-right text-zinc-500 text-[11px] font-mono">
                  {new Date(issue.updatedAt || issue.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
              </tr>
            ))}

            {issues.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-500 text-xs">
                  No issues found matching the criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
