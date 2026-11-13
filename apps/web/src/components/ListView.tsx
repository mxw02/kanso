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
  users?: { id: string; name: string; avatarUrl?: string }[];
  onSelectIssue: (issue: Issue) => void;
  onUpdateStatus: (issueId: string, newStatus: string) => void;
  canEdit: boolean;
}

export const ListView: React.FC<Props> = ({
  columns,
  issues,
  users,
  onSelectIssue,
  onUpdateStatus,
  canEdit,
}) => {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4 w-28">Key</th>
              <th className="py-3 px-4">Title</th>
              <th className="py-3 px-4 w-36">Status</th>
              <th className="py-3 px-4 w-28">Priority</th>
              <th className="py-3 px-4 w-40">Assignee</th>
              <th className="py-3 px-4 w-44">Labels</th>
              <th className="py-3 px-4 w-28 text-right">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {issues.map((issue) => (
              <tr
                key={issue.id}
                onClick={() => onSelectIssue(issue)}
                className="hover:bg-zinc-50 cursor-pointer transition duration-100 group"
              >
                {/* Identifier */}
                <td className="py-3.5 px-4 font-mono font-semibold text-teal-700 group-hover:text-teal-800">
                  {issue.identifier}
                </td>

                {/* Title */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 group-hover:text-teal-950 line-clamp-1">
                      {issue.title}
                    </span>
                    {issue.comments && issue.comments.length > 0 && (
                      <span className="flex items-center gap-0.5 text-zinc-400 text-[10px]">
                        <MessageSquare className="w-3 h-3" />
                        {issue.comments.length}
                      </span>
                    )}
                  </div>
                </td>

                {/* Status Dropdown */}
                <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                  {canEdit ? (
                    <div className="relative inline-block">
                      <select
                        value={issue.status}
                        onChange={(e) => onUpdateStatus(issue.id, e.target.value)}
                        className="appearance-none bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-medium py-1 pl-2.5 pr-6 rounded border border-zinc-200 focus:outline-none cursor-pointer"
                      >
                        {columns.map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.title}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-1.5 top-2 pointer-events-none" />
                    </div>
                  ) : (
                    <span className="text-[11px] text-zinc-700 px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 font-medium">
                      {columns.find((c) => c.id === issue.status)?.title || issue.status}
                    </span>
                  )}
                </td>

                {/* Priority */}
                <td className="py-3.5 px-4">
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
                </td>

                {/* Assignee */}
                <td className="py-3.5 px-4">
                  {issue.assigneeType === 'AGENT' ? (
                    <div className="flex items-center gap-1.5 text-emerald-700 font-mono text-[11px] font-medium">
                      <Bot className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{issue.assigneeName}</span>
                    </div>
                  ) : issue.assigneeType === 'HUMAN' ? (
                    (() => {
                      const assignedUser = users?.find((u) => u.name === issue.assigneeName);
                      return (
                        <div className="flex items-center gap-2 text-zinc-700 text-[11px] font-medium">
                          {assignedUser?.avatarUrl ? (
                            <img
                              src={assignedUser.avatarUrl}
                              alt=""
                              className="w-4 h-4 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-teal-700 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                              {(issue.assigneeName || 'U').charAt(0)}
                            </div>
                          )}
                          <span className="truncate">{issue.assigneeName || 'Assigned'}</span>
                        </div>
                      );
                    })()
                  ) : (
                    <span className="text-zinc-400 text-[11px]">Unassigned</span>
                  )}
                </td>

                {/* Labels */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-1 flex-wrap">
                    {issue.labels?.map((label) => (
                      <span
                        key={label}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200/80"
                      >
                        #{label}
                      </span>
                    ))}
                  </div>
                </td>

                {/* Date */}
                <td className="py-3.5 px-4 text-right text-zinc-400 text-[11px] font-mono">
                  {new Date(issue.updatedAt || issue.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
              </tr>
            ))}

            {issues.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-400 text-xs">
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
