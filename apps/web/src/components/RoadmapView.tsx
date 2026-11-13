import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Edit3,
  FolderKanban,
  Target,
  Zap,
  Check,
  X,
} from 'lucide-react';
import { GoalItem } from './GoalsModal';

type ZoomLevel = 'WEEKS' | 'MONTHS' | 'QUARTERS';

interface RoadmapViewProps {
  goals: GoalItem[];
  sprints: any[];
  issues: any[];
  canEdit: boolean;
  onSelectIssue: (issue: any) => void;
  onUpdateGoal: (
    goalId: string,
    data: { startDate?: string | null; targetDate?: string | null }
  ) => Promise<void>;
  onUpdateIssueDueDate: (issueId: string, dueDate: string | null) => Promise<void>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function toInputDate(iso?: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function getZoomConfig(zoom: ZoomLevel): { pxPerDay: number; label: string } {
  switch (zoom) {
    case 'WEEKS':
      return { pxPerDay: 22, label: 'Wochen' };
    case 'MONTHS':
      return { pxPerDay: 9, label: 'Monate' };
    case 'QUARTERS':
      return { pxPerDay: 3.6, label: 'Quartale' };
  }
}

export const RoadmapView: React.FC<RoadmapViewProps> = ({
  goals,
  sprints,
  issues,
  canEdit,
  onSelectIssue,
  onUpdateGoal,
  onUpdateIssueDueDate,
}) => {
  const [zoom, setZoom] = useState<ZoomLevel>('MONTHS');
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});
  const [showSprints, setShowSprints] = useState(true);

  // Quick date editor state
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalStartInput, setGoalStartInput] = useState('');
  const [goalTargetInput, setGoalTargetInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [issueDueInput, setIssueDueInput] = useState('');

  const { pxPerDay } = getZoomConfig(zoom);

  // Compute timeline range from all dated goals, sprints, and issues
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const today = startOfDay(new Date());
    let minTime = addDays(today, -14).getTime();
    let maxTime = addDays(today, 60).getTime();

    const consider = (iso?: string | null) => {
      if (!iso) return;
      const t = startOfDay(new Date(iso)).getTime();
      if (!Number.isNaN(t)) {
        if (t < minTime) minTime = t;
        if (t > maxTime) maxTime = t;
      }
    };

    goals.forEach((g) => {
      consider(g.startDate);
      consider(g.targetDate);
    });
    sprints.forEach((s) => {
      consider(s.startDate);
      consider(s.endDate);
    });
    issues.forEach((i) => {
      consider(i.dueDate);
    });

    const start = addDays(new Date(minTime), -7);
    const end = addDays(new Date(maxTime), 14);
    const days = Math.max(30, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
    return { timelineStart: start, timelineEnd: end, totalDays: days };
  }, [goals, sprints, issues]);

  const timelineWidth = Math.round(totalDays * pxPerDay);

  // Build time axis ticks depending on zoom level
  const ticks = useMemo(() => {
    const result: Array<{ label: string; left: number; width: number }> = [];
    const cur = new Date(timelineStart);

    if (zoom === 'WEEKS') {
      // Align to Monday
      const day = cur.getDay();
      const diffToMon = (day + 6) % 7;
      cur.setDate(cur.getDate() - diffToMon);
      while (cur < timelineEnd) {
        const next = addDays(cur, 7);
        const startOffset = Math.max(0, (cur.getTime() - timelineStart.getTime()) / DAY_MS);
        const endOffset = Math.min(totalDays, (next.getTime() - timelineStart.getTime()) / DAY_MS);
        if (endOffset > startOffset) {
          result.push({
            label: `${cur.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`,
            left: startOffset * pxPerDay,
            width: (endOffset - startOffset) * pxPerDay,
          });
        }
        cur.setTime(next.getTime());
      }
    } else if (zoom === 'MONTHS') {
      cur.setDate(1);
      while (cur < timelineEnd) {
        const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        const startOffset = Math.max(0, (cur.getTime() - timelineStart.getTime()) / DAY_MS);
        const endOffset = Math.min(totalDays, (next.getTime() - timelineStart.getTime()) / DAY_MS);
        if (endOffset > startOffset) {
          result.push({
            label: cur.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
            left: startOffset * pxPerDay,
            width: (endOffset - startOffset) * pxPerDay,
          });
        }
        cur.setTime(next.getTime());
      }
    } else {
      // QUARTERS
      const qMonth = Math.floor(cur.getMonth() / 3) * 3;
      cur.setMonth(qMonth, 1);
      while (cur < timelineEnd) {
        const next = new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
        const q = Math.floor(cur.getMonth() / 3) + 1;
        const startOffset = Math.max(0, (cur.getTime() - timelineStart.getTime()) / DAY_MS);
        const endOffset = Math.min(totalDays, (next.getTime() - timelineStart.getTime()) / DAY_MS);
        if (endOffset > startOffset) {
          result.push({
            label: `Q${q} ${cur.getFullYear()}`,
            left: startOffset * pxPerDay,
            width: (endOffset - startOffset) * pxPerDay,
          });
        }
        cur.setTime(next.getTime());
      }
    }

    return result;
  }, [timelineStart, timelineEnd, totalDays, zoom, pxPerDay]);

  const todayLeft = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    const offset = (today - timelineStart.getTime()) / DAY_MS;
    if (offset < 0 || offset > totalDays) return null;
    return offset * pxPerDay;
  }, [timelineStart, totalDays, pxPerDay]);

  const calcSpan = (startIso?: string | null, endIso?: string | null) => {
    if (!startIso && !endIso) return null;
    const s = startOfDay(new Date(startIso || endIso!));
    const e = startOfDay(new Date(endIso || startIso!));
    const leftDays = (s.getTime() - timelineStart.getTime()) / DAY_MS;
    const spanDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / DAY_MS) + 1);
    return {
      left: Math.max(0, leftDays * pxPerDay),
      width: Math.max(16, spanDays * pxPerDay),
    };
  };

  const toggleGoalExpand = (goalId: string) => {
    setExpandedGoals((prev) => ({
      ...prev,
      [goalId]: !prev[goalId],
    }));
  };

  const startEditGoal = (g: GoalItem) => {
    setEditingGoalId(g.id);
    setGoalStartInput(toInputDate(g.startDate));
    setGoalTargetInput(toInputDate(g.targetDate));
  };

  const saveGoalDates = async (goalId: string) => {
    setSavingGoal(true);
    try {
      await onUpdateGoal(goalId, {
        startDate: goalStartInput ? new Date(`${goalStartInput}T00:00:00.000Z`).toISOString() : null,
        targetDate: goalTargetInput ? new Date(`${goalTargetInput}T23:59:59.000Z`).toISOString() : null,
      });
      setEditingGoalId(null);
    } finally {
      setSavingGoal(false);
    }
  };

  const saveIssueDue = async (issueId: string) => {
    await onUpdateIssueDueDate(
      issueId,
      issueDueInput ? new Date(`${issueDueInput}T12:00:00.000Z`).toISOString() : null
    );
    setEditingIssueId(null);
  };

  const issuesWithoutGoalDated = useMemo(
    () => issues.filter((i) => !i.goalId && i.dueDate),
    [issues]
  );

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
      {/* Top Roadmap Controls */}
      <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-900">
            <Target className="w-4 h-4 text-teal-700" />
            <span>Projekt-Roadmap</span>
          </div>
          <span className="text-xs text-zinc-500">
            {goals.length} {goals.length === 1 ? 'Ziel' : 'Ziele'} · {sprints.length} Sprints · {issues.filter((i) => i.dueDate).length} terminierte Tickets
          </span>
        </div>

        <div className="flex items-center gap-2">
          {sprints.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSprints((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                showSprints
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Sprints</span>
            </button>
          )}

          <div className="flex items-center p-0.5 rounded-lg bg-zinc-200/70 border border-zinc-200">
            {(['WEEKS', 'MONTHS', 'QUARTERS'] as ZoomLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setZoom(lvl)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                  zoom === lvl
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {getZoomConfig(lvl).label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gantt Scroll Area */}
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Header Row */}
          <div className="flex border-b border-zinc-200 bg-zinc-50 sticky top-0 z-10">
            <div className="w-80 shrink-0 px-4 py-2 border-r border-zinc-200 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Ziele, Sprints & Tickets
            </div>
            <div className="relative h-9" style={{ width: `${timelineWidth}px` }}>
              {ticks.map((t, idx) => (
                <div
                  key={idx}
                  style={{ left: `${t.left}px`, width: `${t.width}px` }}
                  className="absolute top-0 bottom-0 border-r border-zinc-200/80 px-2 flex items-center text-[11px] font-medium text-zinc-500 truncate"
                >
                  {t.label}
                </div>
              ))}
              {todayLeft !== null && (
                <div
                  style={{ left: `${todayLeft}px` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-20"
                  title="Heute"
                >
                  <span className="absolute -top-0.5 left-1 px-1 rounded bg-rose-500 text-white text-[9px] font-bold">
                    Heute
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sprints Section */}
          {showSprints && sprints.length > 0 && (
            <>
              <div className="flex border-b border-zinc-100 bg-emerald-50/30">
                <div className="w-80 shrink-0 px-4 py-1.5 border-r border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <Zap className="w-3 h-3" />
                  <span>Sprints</span>
                </div>
                <div className="relative" style={{ width: `${timelineWidth}px` }} />
              </div>
              {sprints.map((sprint) => {
                const span = calcSpan(sprint.startDate, sprint.endDate);
                return (
                  <div key={sprint.id} className="flex border-b border-zinc-100 hover:bg-zinc-50/70">
                    <div className="w-80 shrink-0 px-4 py-2 border-r border-zinc-200 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-800 truncate">{sprint.name}</div>
                        <div className="text-[10px] text-zinc-400">
                          {sprint.startDate && sprint.endDate
                            ? `${new Date(sprint.startDate).toLocaleDateString('de-DE')} – ${new Date(sprint.endDate).toLocaleDateString('de-DE')}`
                            : 'Kein Sprint-Zeitraum'}
                        </div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                        {sprint.status}
                      </span>
                    </div>
                    <div className="relative h-11 flex items-center" style={{ width: `${timelineWidth}px` }}>
                      {todayLeft !== null && (
                        <div style={{ left: `${todayLeft}px` }} className="absolute top-0 bottom-0 w-px bg-rose-300/80" />
                      )}
                      {span && (
                        <div
                          style={{ left: `${span.left}px`, width: `${span.width}px` }}
                          className="absolute h-6 rounded-md bg-emerald-100/90 border border-emerald-300 px-2 flex items-center text-[11px] font-semibold text-emerald-900 truncate"
                          title={`${sprint.name}`}
                        >
                          {sprint.name}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Goals + Nested Issues */}
          {goals.length === 0 && issuesWithoutGoalDated.length === 0 ? (
            <div className="p-10 text-center text-xs text-zinc-400">
              Noch keine Ziele oder terminierten Tickets vorhanden. Lege über „Ziele“ einen Zeitraum fest oder setze ein Fälligkeitsdatum auf Tickets.
            </div>
          ) : (
            goals.map((goal) => {
              const goalIssues = issues.filter((i) => i.goalId === goal.id);
              const doneCount = goalIssues.filter((i) => i.status === 'DONE').length;
              const progressPct = goalIssues.length > 0 ? Math.round((doneCount / goalIssues.length) * 100) : 0;
              const isExpanded = Boolean(expandedGoals[goal.id]);
              const span = calcSpan(goal.startDate, goal.targetDate);
              const isEditingThisGoal = editingGoalId === goal.id;

              return (
                <React.Fragment key={goal.id}>
                  {/* Goal Row */}
                  <div className="flex border-b border-zinc-200/80 bg-zinc-50/40 hover:bg-zinc-50">
                    <div className="w-80 shrink-0 px-3 py-2.5 border-r border-zinc-200 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleGoalExpand(goal.id)}
                          className="flex items-center gap-1.5 min-w-0 text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          )}
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: goal.color || '#0f766e' }}
                          />
                          <span className="text-xs font-bold text-zinc-900 truncate">{goal.title}</span>
                        </button>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => (isEditingThisGoal ? setEditingGoalId(null) : startEditGoal(goal))}
                            title="Zeitraum anpassen"
                            className="p-1 rounded hover:bg-zinc-200/70 text-zinc-400 hover:text-zinc-700 shrink-0"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Goal progress + dates */}
                      <div className="pl-5 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                        <span>
                          {goal.startDate || goal.targetDate
                            ? `${goal.startDate ? new Date(goal.startDate).toLocaleDateString('de-DE') : '?'} – ${goal.targetDate ? new Date(goal.targetDate).toLocaleDateString('de-DE') : '?'}`
                            : 'Kein Zeitraum'}
                        </span>
                        <span className="font-mono font-semibold text-zinc-600">
                          {doneCount}/{goalIssues.length} ({progressPct}%)
                        </span>
                      </div>

                      {isEditingThisGoal && (
                        <div className="pl-5 pt-1 flex flex-wrap items-center gap-1.5">
                          <input
                            type="date"
                            value={goalStartInput}
                            onChange={(e) => setGoalStartInput(e.target.value)}
                            className="border border-zinc-300 rounded px-1.5 py-0.5 text-[10px] bg-white"
                          />
                          <span className="text-[10px] text-zinc-400">–</span>
                          <input
                            type="date"
                            value={goalTargetInput}
                            onChange={(e) => setGoalTargetInput(e.target.value)}
                            className="border border-zinc-300 rounded px-1.5 py-0.5 text-[10px] bg-white"
                          />
                          <button
                            type="button"
                            disabled={savingGoal}
                            onClick={() => saveGoalDates(goal.id)}
                            className="p-1 rounded bg-teal-700 text-white hover:bg-teal-800"
                            title="Speichern"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingGoalId(null)}
                            className="p-1 rounded bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                            title="Abbrechen"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Goal Bar */}
                    <div className="relative min-h-[54px] flex items-center" style={{ width: `${timelineWidth}px` }}>
                      {todayLeft !== null && (
                        <div style={{ left: `${todayLeft}px` }} className="absolute top-0 bottom-0 w-px bg-rose-300/80" />
                      )}
                      {span ? (
                        <div
                          onClick={() => canEdit && startEditGoal(goal)}
                          style={{
                            left: `${span.left}px`,
                            width: `${span.width}px`,
                            borderColor: goal.color || '#0f766e',
                          }}
                          className={`relative h-7 rounded-lg border-2 bg-white overflow-hidden shadow-2xs flex items-center ${
                            canEdit ? 'cursor-pointer hover:brightness-95' : ''
                          }`}
                          title={`${goal.title}: ${progressPct}% (${doneCount}/${goalIssues.length})`}
                        >
                          <div
                            style={{
                              width: `${progressPct}%`,
                              backgroundColor: goal.color || '#0f766e',
                              opacity: 0.25,
                            }}
                            className="absolute inset-y-0 left-0 transition-all"
                          />
                          <span className="relative z-10 px-2 text-[11px] font-bold text-zinc-900 truncate">
                            {goal.title} · {progressPct}%
                          </span>
                        </div>
                      ) : (
                        canEdit && (
                          <button
                            type="button"
                            onClick={() => startEditGoal(goal)}
                            className="ml-3 text-[11px] text-zinc-400 hover:text-teal-700 flex items-center gap-1"
                          >
                            <Calendar className="w-3 h-3" />
                            <span>+ Zeitraum festlegen</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Nested Goal Issues */}
                  {isExpanded &&
                    goalIssues.map((issue) => {
                      const issueSpan = calcSpan(issue.createdAt, issue.dueDate);
                      const dueOnlySpan = issue.dueDate ? calcSpan(issue.dueDate, issue.dueDate) : null;
                      const barSpan = issue.dueDate ? issueSpan : null;
                      const isEditingDue = editingIssueId === issue.id;

                      return (
                        <div key={issue.id} className="flex border-b border-zinc-100 hover:bg-zinc-50/70">
                          <div className="w-80 shrink-0 pl-8 pr-3 py-1.5 border-r border-zinc-200 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectIssue(issue)}
                              className="min-w-0 flex-1 text-left flex items-center gap-1.5 hover:text-teal-700"
                            >
                              <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                                {issue.identifier}
                              </span>
                              <span className="text-xs text-zinc-700 truncate">{issue.title}</span>
                            </button>

                            {isEditingDue ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="date"
                                  value={issueDueInput}
                                  onChange={(e) => setIssueDueInput(e.target.value)}
                                  className="border border-zinc-300 rounded px-1 py-0.5 text-[10px] bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => saveIssueDue(issue.id)}
                                  className="p-0.5 rounded bg-teal-700 text-white"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingIssueId(null)}
                                  className="p-0.5 rounded bg-zinc-200 text-zinc-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              canEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingIssueId(issue.id);
                                    setIssueDueInput(toInputDate(issue.dueDate));
                                  }}
                                  title="Fälligkeitsdatum setzen"
                                  className="text-[10px] text-zinc-400 hover:text-teal-700 shrink-0"
                                >
                                  {issue.dueDate
                                    ? new Date(issue.dueDate).toLocaleDateString('de-DE')
                                    : '+ Datum'}
                                </button>
                              )
                            )}
                          </div>

                          <div className="relative h-9 flex items-center" style={{ width: `${timelineWidth}px` }}>
                            {todayLeft !== null && (
                              <div style={{ left: `${todayLeft}px` }} className="absolute top-0 bottom-0 w-px bg-rose-300/80" />
                            )}
                            {barSpan && (
                              <button
                                type="button"
                                onClick={() => onSelectIssue(issue)}
                                style={{
                                  left: `${barSpan.left}px`,
                                  width: `${Math.max(barSpan.width, dueOnlySpan?.width || 20)}px`,
                                }}
                                className={`absolute h-5 rounded px-2 text-left text-[10px] font-medium truncate border transition ${
                                  issue.status === 'DONE'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-teal-50 text-teal-900 border-teal-200 hover:border-teal-400'
                                }`}
                                title={`${issue.identifier}: ${issue.title}`}
                              >
                                {issue.identifier} · {issue.title}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </React.Fragment>
              );
            })
          )}

          {/* Unlinked dated issues */}
          {issuesWithoutGoalDated.length > 0 && (
            <>
              <div className="flex border-b border-zinc-200 bg-zinc-50/70">
                <div className="w-80 shrink-0 px-4 py-1.5 border-r border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <FolderKanban className="w-3 h-3" />
                  <span>Tickets ohne Ziel (mit Datum)</span>
                </div>
                <div className="relative" style={{ width: `${timelineWidth}px` }} />
              </div>
              {issuesWithoutGoalDated.map((issue) => {
                const span = calcSpan(issue.createdAt, issue.dueDate);
                return (
                  <div key={issue.id} className="flex border-b border-zinc-100 hover:bg-zinc-50/70">
                    <div className="w-80 shrink-0 px-4 py-1.5 border-r border-zinc-200 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectIssue(issue)}
                        className="min-w-0 flex-1 text-left flex items-center gap-1.5 hover:text-teal-700"
                      >
                        <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                          {issue.identifier}
                        </span>
                        <span className="text-xs text-zinc-700 truncate">{issue.title}</span>
                      </button>
                      <span className="text-[10px] text-zinc-400 shrink-0">
                        {new Date(issue.dueDate).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                    <div className="relative h-9 flex items-center" style={{ width: `${timelineWidth}px` }}>
                      {todayLeft !== null && (
                        <div style={{ left: `${todayLeft}px` }} className="absolute top-0 bottom-0 w-px bg-rose-300/80" />
                      )}
                      {span && (
                        <button
                          type="button"
                          onClick={() => onSelectIssue(issue)}
                          style={{ left: `${span.left}px`, width: `${span.width}px` }}
                          className={`absolute h-5 rounded px-2 text-left text-[10px] font-medium truncate border transition ${
                            issue.status === 'DONE'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-zinc-100 text-zinc-800 border-zinc-300 hover:border-teal-400'
                          }`}
                          title={`${issue.identifier}: ${issue.title}`}
                        >
                          {issue.identifier} · {issue.title}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
