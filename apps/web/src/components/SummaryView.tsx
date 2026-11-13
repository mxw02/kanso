import React, { useMemo } from 'react';
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  User,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { computeReadiness } from '../utils/readiness';

interface Column {
  id: string;
  title: string;
}

interface SummaryViewProps {
  project: { id: string; key: string; name: string; description?: string | null };
  columns: Column[];
  issues: any[];
  users: any[];
  onSelectIssue: (issue: any) => void;
  onFilterStatus?: (status: string) => void;
}

const PRIORITY_META: Record<string, { label: string; bar: string; badge: string }> = {
  URGENT: {
    label: 'Urgent',
    bar: 'bg-rose-600',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  HIGH: {
    label: 'High',
    bar: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  MEDIUM: {
    label: 'Medium',
    bar: 'bg-teal-600',
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  LOW: {
    label: 'Low',
    bar: 'bg-zinc-400',
    badge: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  },
};

export const SummaryView: React.FC<SummaryViewProps> = ({
  project,
  columns,
  issues,
  users,
  onSelectIssue,
  onFilterStatus,
}) => {
  const stats = useMemo(() => {
    const total = issues.length;
    const doneCount = issues.filter((i) => i.status === 'DONE').length;
    const inProgressCount = issues.filter((i) => i.status === 'IN_AGENT_DEV' || i.status === 'REVIEW').length;
    const openCount = total - doneCount;
    const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    // Agent readiness average across open issues
    const openIssues = issues.filter((i) => i.status !== 'DONE');
    const readinessScores = openIssues.map((i) => computeReadiness(i).score);
    const avgReadiness =
      readinessScores.length > 0
        ? Math.round(readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length)
        : 100;
    const readyCount = openIssues.filter((i) => computeReadiness(i).level === 'READY').length;

    // Status breakdown following configured workflow columns
    const knownColIds = new Set(columns.map((c) => c.id));
    const statusBreakdown = columns.map((col) => {
      const count = issues.filter((i) => i.status === col.id).length;
      return {
        id: col.id,
        title: col.title,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    });
    const extraStatuses = Array.from(
      new Set(issues.map((i) => i.status).filter((s) => !knownColIds.has(s)))
    );
    for (const s of extraStatuses) {
      const count = issues.filter((i) => i.status === s).length;
      statusBreakdown.push({
        id: s,
        title: s,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      });
    }

    // Priority breakdown
    const priorityBreakdown = (['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => {
      const count = issues.filter((i) => i.priority === p).length;
      return {
        key: p,
        ...PRIORITY_META[p],
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    });

    // Workload per assignee (Humans, Agents, Unassigned)
    const workloadMap = new Map<
      string,
      {
        key: string;
        name: string;
        type: 'HUMAN' | 'AGENT' | 'UNASSIGNED';
        avatarUrl?: string | null;
        total: number;
        open: number;
        done: number;
      }
    >();

    for (const issue of issues) {
      const type: 'HUMAN' | 'AGENT' | 'UNASSIGNED' =
        issue.assigneeType === 'AGENT'
          ? 'AGENT'
          : issue.assigneeType === 'HUMAN' && issue.assigneeName
            ? 'HUMAN'
            : 'UNASSIGNED';
      const name =
        type === 'UNASSIGNED' ? 'Nicht zugewiesen' : issue.assigneeName || 'Agent';
      const mapKey = `${type}:${name}`;
      const matchedUser =
        type === 'HUMAN'
          ? users.find((u) => u.id === issue.assigneeId || u.name === issue.assigneeName)
          : undefined;
      const entry = workloadMap.get(mapKey) || {
        key: mapKey,
        name,
        type,
        avatarUrl: matchedUser?.avatarUrl || null,
        total: 0,
        open: 0,
        done: 0,
      };
      entry.total += 1;
      if (issue.status === 'DONE') entry.done += 1;
      else entry.open += 1;
      workloadMap.set(mapKey, entry);
    }

    const workload = Array.from(workloadMap.values()).sort((a, b) => b.total - a.total);

    // Recent activity feed derived from issue activities or updatedAt/createdAt
    const feedItems: Array<{
      id: string;
      issue: any;
      actorName: string;
      actorType: string;
      details: string;
      timestamp: string;
    }> = [];

    for (const issue of issues) {
      if (Array.isArray(issue.activities) && issue.activities.length > 0) {
        for (const act of issue.activities) {
          feedItems.push({
            id: act.id || `${issue.id}-${act.createdAt}`,
            issue,
            actorName: act.actorName || 'System',
            actorType: act.actorType || 'HUMAN',
            details: act.details || act.action || 'Aktualisiert',
            timestamp: act.createdAt || issue.updatedAt || issue.createdAt,
          });
        }
      } else {
        feedItems.push({
          id: `${issue.id}-updated`,
          issue,
          actorName: issue.assigneeName || 'System',
          actorType: issue.assigneeType || 'HUMAN',
          details: `${issue.identifier}: ${issue.title} (${issue.status})`,
          timestamp: issue.updatedAt || issue.createdAt,
        });
      }
    }

    feedItems.sort(
      (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    );

    return {
      total,
      doneCount,
      openCount,
      inProgressCount,
      completionRate,
      avgReadiness,
      readyCount,
      openTotal: openIssues.length,
      statusBreakdown,
      priorityBreakdown,
      workload,
      recentFeed: feedItems.slice(0, 12),
    };
  }, [issues, columns, users]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
              {project.key}
            </span>
            <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
              {project.name} · Zusammenfassung
            </h1>
          </div>
          {project.description && (
            <p className="text-xs text-zinc-500 mt-1">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <BarChart3 className="w-4 h-4 text-teal-700" />
          <span>{stats.total} Tickets gesamt</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-medium">Offene Tickets</span>
            <Layers className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-zinc-900">{stats.openCount}</span>
            <span className="text-[11px] text-zinc-500">von {stats.total} gesamt</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full bg-zinc-800 rounded-full transition-all"
              style={{ width: `${stats.total > 0 ? (stats.openCount / stats.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-medium">Aktiv (Dev & Review)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-zinc-900">{stats.inProgressCount}</span>
            <span className="text-[11px] text-zinc-500">in Bearbeitung</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{
                width: `${stats.total > 0 ? (stats.inProgressCount / stats.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-medium">Abgeschlossen</span>
            <CheckCircle2 className="w-4 h-4 text-teal-700" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-zinc-900">{stats.doneCount}</span>
            <span className="text-[11px] font-semibold text-teal-700">{stats.completionRate}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full bg-teal-700 rounded-full transition-all"
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-medium">Agent-Readiness</span>
            <Sparkles className="w-4 h-4 text-teal-700" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-zinc-900">{stats.avgReadiness}%</span>
            <span className="text-[11px] text-zinc-500">
              {stats.readyCount}/{stats.openTotal} bereit
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all"
              style={{ width: `${stats.avgReadiness}%` }}
            />
          </div>
        </div>
      </div>

      {/* Middle Grid: Status & Priority */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Distribution */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Status-Verteilung
            </h2>
            <span className="text-[11px] text-zinc-400">{columns.length} Workflow-Stages</span>
          </div>
          <div className="space-y-3">
            {stats.statusBreakdown.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => onFilterStatus && onFilterStatus(col.id)}
                className="w-full text-left group space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-800 group-hover:text-teal-700 transition">
                    {col.title}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {col.count} ({col.pct}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      col.id === 'DONE'
                        ? 'bg-teal-700'
                        : col.id === 'IN_AGENT_DEV' || col.id === 'REVIEW'
                          ? 'bg-amber-500'
                          : 'bg-zinc-700'
                    }`}
                    style={{ width: `${col.pct}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Prioritätsverteilung
            </h2>
            <AlertTriangle className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="space-y-3">
            {stats.priorityBreakdown.map((p) => (
              <div key={p.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${p.badge}`}
                  >
                    {p.label}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {p.count} ({p.pct}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${p.bar}`}
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Grid: Workload & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Workload per Person / Agent */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Workload pro Person & Agent
            </h2>
            <span className="text-[11px] text-zinc-400">{stats.workload.length} Zuweisungen</span>
          </div>

          {stats.workload.length === 0 ? (
            <div className="text-xs text-zinc-400 py-6 text-center">
              Noch keine Tickets in diesem Projekt vorhanden.
            </div>
          ) : (
            <div className="space-y-3">
              {stats.workload.map((w) => {
                const pct = stats.total > 0 ? Math.round((w.total / stats.total) * 100) : 0;
                return (
                  <div key={w.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        {w.type === 'AGENT' ? (
                          <div className="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                            <Bot className="w-3.5 h-3.5 text-emerald-700" />
                          </div>
                        ) : w.type === 'HUMAN' && w.avatarUrl ? (
                          <img
                            src={w.avatarUrl}
                            alt={w.name}
                            className="w-6 h-6 rounded-full object-cover border border-zinc-200 shrink-0"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0">
                            <User className="w-3.5 h-3.5 text-zinc-500" />
                          </div>
                        )}
                        <span className="font-medium text-zinc-800 truncate">{w.name}</span>
                        {w.type === 'AGENT' && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            AGENT
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-zinc-500 shrink-0">
                        {w.open} offen · {w.done} erledigt
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          w.type === 'AGENT'
                            ? 'bg-emerald-600'
                            : w.type === 'UNASSIGNED'
                              ? 'bg-zinc-400'
                              : 'bg-teal-700'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chronological Activity Feed */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Letzte Aktivitäten
            </h2>
            <Activity className="w-3.5 h-3.5 text-zinc-400" />
          </div>

          {stats.recentFeed.length === 0 ? (
            <div className="text-xs text-zinc-400 py-6 text-center">
              Noch keine Aktivitäten protokolliert.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {stats.recentFeed.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectIssue(item.issue)}
                  className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 transition"
                >
                  <div className="mt-0.5 shrink-0">
                    {item.actorType === 'AGENT' ? (
                      <Bot className="w-3.5 h-3.5 text-emerald-700" />
                    ) : (
                      <User className="w-3.5 h-3.5 text-teal-700" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-zinc-800 truncate">
                        {item.actorName}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                        {item.timestamp
                          ? new Date(item.timestamp).toLocaleString('de-DE', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 truncate mt-0.5">{item.details}</p>
                    <span className="inline-block mt-1 text-[10px] font-mono font-semibold text-teal-700">
                      {item.issue.identifier}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
