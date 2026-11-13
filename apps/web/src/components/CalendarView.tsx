import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
} from 'lucide-react';

interface CalendarViewProps {
  issues: any[];
  canEdit: boolean;
  onSelectIssue: (issue: any) => void;
  onUpdateDueDate: (issueId: string, dueDate: string | null) => Promise<void> | void;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIssueDateKey(dueDate?: string | null): string | null {
  if (!dueDate) return null;
  const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(dueDate);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateKey(parsed);
}

function getMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = Sun, 1 = Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  issues,
  canEdit,
  onSelectIssue,
  onUpdateDueDate,
}) => {
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date());
  const [draggedIssueId, setDraggedIssueId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const days = useMemo(() => {
    if (mode === 'week') {
      const start = getMonday(cursorDate);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }

    const firstOfMonth = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
    const lastOfMonth = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0);
    const gridStart = getMonday(firstOfMonth);
    const lastMonday = getMonday(lastOfMonth);
    const gridEnd = new Date(lastMonday);
    gridEnd.setDate(lastMonday.getDate() + 6);

    const list: Date[] = [];
    const cur = new Date(gridStart);
    while (cur <= gridEnd) {
      list.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }, [cursorDate, mode]);

  const { issuesByDay, unscheduledIssues } = useMemo(() => {
    const byDay = new Map<string, any[]>();
    const unscheduled: any[] = [];

    for (const issue of issues) {
      const key = parseIssueDateKey(issue.dueDate);
      if (!key) {
        if (issue.status !== 'DONE') {
          unscheduled.push(issue);
        }
        continue;
      }
      const list = byDay.get(key) || [];
      list.push(issue);
      byDay.set(key, list);
    }

    return { issuesByDay: byDay, unscheduledIssues: unscheduled };
  }, [issues]);

  const handleNavigate = (direction: -1 | 1) => {
    const next = new Date(cursorDate);
    if (mode === 'month') {
      next.setMonth(next.getMonth() + direction);
    } else {
      next.setDate(next.getDate() + direction * 7);
    }
    setCursorDate(next);
  };

  const headerLabel = useMemo(() => {
    if (mode === 'month') {
      return cursorDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    }
    const start = days[0];
    const end = days[days.length - 1];
    return `${start.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }, [cursorDate, mode, days]);

  const handleDropOnDay = async (dayKey: string) => {
    setDragOverDay(null);
    if (!canEdit || !draggedIssueId) return;
    const id = draggedIssueId;
    setDraggedIssueId(null);
    await onUpdateDueDate(id, `${dayKey}T12:00:00.000Z`);
  };

  return (
    <div className="w-full h-full flex-1 min-h-0 flex flex-col lg:flex-row gap-5">
      {/* Main Calendar Area */}
      <div className="flex-1 min-w-0 min-h-0 bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col">
        {/* Calendar Header */}
        <div className="px-5 py-3.5 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-bold text-zinc-900 capitalize">{headerLabel}</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleNavigate(-1)}
                className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-600 transition"
                title="Zurück"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCursorDate(new Date())}
                className="px-2.5 py-1 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition"
              >
                Heute
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(1)}
                className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-600 transition"
                title="Weiter"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Month / Week Toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-100 border border-zinc-200/80 text-xs">
            <button
              type="button"
              onClick={() => setMode('month')}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                mode === 'month'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Monat
            </button>
            <button
              type="button"
              onClick={() => setMode('week')}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                mode === 'week'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Woche
            </button>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50/80">
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border-r last:border-r-0 border-zinc-200/70"
            >
              {wd}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 auto-rows-[minmax(110px,1fr)] flex-1 min-h-0 overflow-y-auto">
          {days.map((day) => {
            const key = toDateKey(day);
            const isToday = key === todayKey;
            const isCurrentMonth = day.getMonth() === cursorDate.getMonth();
            const dayIssues = issuesByDay.get(key) || [];
            const isDragTarget = dragOverDay === key;

            return (
              <div
                key={key}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  if (dragOverDay !== key) setDragOverDay(key);
                }}
                onDragLeave={() => {
                  if (dragOverDay === key) setDragOverDay(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropOnDay(key);
                }}
                className={`border-r border-b border-zinc-200/70 p-2 flex flex-col gap-1.5 transition ${
                  mode === 'week' ? 'min-h-[380px]' : 'min-h-[120px]'
                } ${
                  isDragTarget
                    ? 'bg-teal-50/70 ring-1 ring-inset ring-teal-400'
                    : !isCurrentMonth && mode === 'month'
                      ? 'bg-zinc-50/60'
                      : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-semibold w-6 h-6 rounded-full flex items-center justify-center ${
                      isToday
                        ? 'bg-teal-700 text-white'
                        : isCurrentMonth || mode === 'week'
                          ? 'text-zinc-700'
                          : 'text-zinc-400'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayIssues.length > 0 && (
                    <span className="text-[10px] font-mono text-zinc-400">{dayIssues.length}</span>
                  )}
                </div>

                <div className="space-y-1 overflow-y-auto">
                  {dayIssues.map((issue) => {
                    const isDone = issue.status === 'DONE';
                    const isOverdue = !isDone && key < todayKey;
                    return (
                      <div
                        key={issue.id}
                        draggable={canEdit}
                        onDragStart={() => setDraggedIssueId(issue.id)}
                        onDragEnd={() => {
                          setDraggedIssueId(null);
                          setDragOverDay(null);
                        }}
                        onClick={() => onSelectIssue(issue)}
                        className={`group px-2 py-1.5 rounded-lg border text-[11px] cursor-pointer transition flex items-start justify-between gap-1.5 ${
                          isDone
                            ? 'bg-zinc-50 border-zinc-200 text-zinc-400 opacity-75'
                            : isOverdue
                              ? 'bg-rose-50/80 border-rose-200 text-rose-900 hover:border-rose-300'
                              : 'bg-white border-zinc-200 text-zinc-800 hover:border-teal-400 hover:shadow-2xs'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            {isOverdue && (
                              <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                            )}
                            <span
                              className={`font-mono text-[10px] font-semibold shrink-0 ${
                                isOverdue ? 'text-rose-700' : 'text-teal-700'
                              }`}
                            >
                              {issue.identifier}
                            </span>
                          </div>
                          <div
                            className={`truncate font-medium mt-0.5 ${
                              isDone ? 'line-through' : ''
                            }`}
                          >
                            {issue.title}
                          </div>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateDueDate(issue.id, null);
                            }}
                            title="Fälligkeitsdatum entfernen"
                            className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-600 p-0.5 transition"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unscheduled Sidebar */}
      <aside className="w-full lg:w-80 shrink-0 bg-white border border-zinc-200 rounded-xl p-4 flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Ohne Termin ({unscheduledIssues.length})
            </h3>
          </div>
        </div>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          {canEdit
            ? 'Ziehe ein Ticket auf einen Kalendertag, um ein Fälligkeitsdatum zu setzen.'
            : 'Offene Tickets ohne Fälligkeitsdatum.'}
        </p>

        <div className="space-y-1.5 overflow-y-auto pr-1 flex-1">
          {unscheduledIssues.length === 0 ? (
            <div className="text-xs text-zinc-400 py-8 text-center">
              Alle offenen Tickets sind terminiert.
            </div>
          ) : (
            unscheduledIssues.map((issue) => (
              <div
                key={issue.id}
                draggable={canEdit}
                onDragStart={() => setDraggedIssueId(issue.id)}
                onDragEnd={() => {
                  setDraggedIssueId(null);
                  setDragOverDay(null);
                }}
                onClick={() => onSelectIssue(issue)}
                className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50/50 hover:bg-white hover:border-teal-400 cursor-pointer transition text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold text-teal-700">
                    {issue.identifier}
                  </span>
                  <span className="text-[10px] text-zinc-400">{issue.priority}</span>
                </div>
                <div className="font-medium text-zinc-800 line-clamp-2">{issue.title}</div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
};
