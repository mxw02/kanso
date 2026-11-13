import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Eye,
  FolderKanban,
  Inbox,
  RefreshCw,
  UserCheck,
} from 'lucide-react';

interface MyTasksViewProps {
  apiUrl: string;
  currentUser: { id: string; name: string; role?: string };
  refreshKey?: number;
  onSelectIssue: (issue: any) => void;
}

type MyTaskTab = 'ALL' | 'ASSIGNED' | 'OVERDUE' | 'REVIEW_HITL';

const PRIORITY_BADGE: Record<string, string> = {
  URGENT: 'bg-rose-50 text-rose-700 border-rose-200',
  HIGH: 'bg-amber-50 text-amber-700 border-amber-200',
  MEDIUM: 'bg-sky-50 text-sky-700 border-sky-200',
  LOW: 'bg-zinc-100 text-zinc-600 border-zinc-200',
};

export const MyTasksView: React.FC<MyTasksViewProps> = ({
  apiUrl,
  currentUser,
  refreshKey = 0,
  onSelectIssue,
}) => {
  const [allIssues, setAllIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MyTaskTab>('ALL');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');

  const fetchAllIssues = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/issues`);
      if (res.ok) {
        const data = await res.json();
        setAllIssues(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load cross-project tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllIssues();
  }, [apiUrl, refreshKey]);

  const now = Date.now();

  const isAssignedToMe = (issue: any) => {
    if (issue.status === 'DONE') return false;
    return (
      (issue.assigneeId && issue.assigneeId === currentUser.id) ||
      (issue.assigneeName &&
        issue.assigneeName.toLowerCase() === currentUser.name.toLowerCase())
    );
  };

  const isOverdue = (issue: any) => {
    if (issue.status === 'DONE' || !issue.dueDate) return false;
    return new Date(issue.dueDate).getTime() < now;
  };

  const isReviewOrHitl = (issue: any) => {
    if (issue.status === 'DONE') return false;
    return (
      issue.status === 'REVIEW' ||
      Boolean(issue.hitlState) ||
      issue.agentStatus === 'AWAITING_HUMAN'
    );
  };

  const categorized = useMemo(() => {
    const projectScoped =
      projectFilter === 'ALL'
        ? allIssues
        : allIssues.filter((i) => i.project?.id === projectFilter || i.projectId === projectFilter);

    const assigned = projectScoped.filter(isAssignedToMe);
    const overdue = projectScoped.filter(isOverdue);
    const reviewHitl = projectScoped.filter(isReviewOrHitl);

    const relevantIds = new Set<string>();
    const allRelevant: any[] = [];
    for (const issue of [...reviewHitl, ...overdue, ...assigned]) {
      if (!relevantIds.has(issue.id)) {
        relevantIds.add(issue.id);
        allRelevant.push(issue);
      }
    }

    return {
      ALL: allRelevant,
      ASSIGNED: assigned,
      OVERDUE: overdue,
      REVIEW_HITL: reviewHitl,
    };
  }, [allIssues, projectFilter, currentUser.id, currentUser.name]);

  const projects = useMemo(() => {
    const map = new Map<string, { id: string; key: string; name: string }>();
    for (const issue of allIssues) {
      const p = issue.project;
      if (p?.id && !map.has(p.id)) {
        map.set(p.id, { id: p.id, key: p.key, name: p.name });
      }
    }
    return Array.from(map.values());
  }, [allIssues]);

  const visibleIssues = categorized[activeTab];

  const tabs: Array<{ id: MyTaskTab; label: string; count: number; icon: React.ReactNode }> = [
    { id: 'ALL', label: 'Alle relevanten', count: categorized.ALL.length, icon: <Inbox className="w-3.5 h-3.5" /> },
    { id: 'ASSIGNED', label: 'Mir zugewiesen', count: categorized.ASSIGNED.length, icon: <UserCheck className="w-3.5 h-3.5 text-teal-700" /> },
    { id: 'OVERDUE', label: 'Überfällig', count: categorized.OVERDUE.length, icon: <Clock className="w-3.5 h-3.5 text-rose-600" /> },
    { id: 'REVIEW_HITL', label: 'Review / HITL', count: categorized.REVIEW_HITL.length, icon: <Eye className="w-3.5 h-3.5 text-amber-600" /> },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <span>Meine Aufgaben</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
              Projektübergreifend
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Alle dir zugewiesenen Tickets, überfälligen Aufgaben und offenen Review-/HITL-Rückfragen über alle Projekte hinweg.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {projects.length > 1 && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-700 font-medium focus:outline-none focus:border-teal-600"
            >
              <option value="ALL">Alle Projekte ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} [{p.key}]
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={fetchAllIssues}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-700' : ''}`} />
            <span>Aktualisieren</span>
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                active
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  active ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Issue List */}
      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xs">
        {loading && allIssues.length === 0 ? (
          <div className="p-10 text-center text-xs text-zinc-400">Lade Aufgaben aus allen Projekten...</div>
        ) : visibleIssues.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <div className="text-sm font-semibold text-zinc-800">Alles erledigt!</div>
            <div className="text-xs text-zinc-500">
              Keine offenen Aufgaben in dieser Kategorie gefunden.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {visibleIssues.map((issue) => {
              const overdue = isOverdue(issue);
              const hitlOrReview = isReviewOrHitl(issue);
              const assigned = isAssignedToMe(issue);

              return (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => onSelectIssue(issue)}
                  className="w-full px-4 py-3 text-left hover:bg-zinc-50/90 transition flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {issue.project && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 text-[10px] font-semibold">
                          <FolderKanban className="w-2.5 h-2.5" />
                          {issue.project.name}
                        </span>
                      )}
                      <span className="font-mono text-[11px] font-semibold text-zinc-500">
                        {issue.identifier}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 text-[10px] font-medium">
                        {issue.status}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                          PRIORITY_BADGE[issue.priority] || PRIORITY_BADGE.MEDIUM
                        }`}
                      >
                        {issue.priority}
                      </span>
                      {issue.hitlState && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          HITL: {issue.hitlState}
                        </span>
                      )}
                      {overdue && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold">
                          <Clock className="w-2.5 h-2.5" />
                          Überfällig ({new Date(issue.dueDate).toLocaleDateString('de-DE')})
                        </span>
                      )}
                      {assigned && (
                        <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-medium">
                          Dir zugewiesen
                        </span>
                      )}
                      {!issue.hitlState && hitlOrReview && issue.status === 'REVIEW' && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-medium">
                          Wartet auf Review
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-semibold text-zinc-900 truncate">
                      {issue.title}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-xs text-zinc-500">
                    {issue.assigneeType === 'AGENT' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[11px] font-medium">
                        <Bot className="w-3 h-3" />
                        {issue.assigneeName || 'Agent'}
                      </span>
                    ) : issue.assigneeName ? (
                      <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 text-[11px] font-medium">
                        {issue.assigneeName}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
