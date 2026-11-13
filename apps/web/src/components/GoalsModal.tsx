import React, { useState } from 'react';
import { Calendar, CheckCircle2, Edit3, Plus, Target, Trash2, X } from 'lucide-react';

export interface GoalItem {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  color: string;
  startDate?: string | null;
  targetDate?: string | null;
  _count?: { issues: number };
  issues?: { id: string; identifier: string; title: string; status: string }[];
}

interface GoalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  goals: GoalItem[];
  canEdit: boolean;
  onCreateGoal: (data: {
    title: string;
    description?: string;
    color: string;
    startDate?: string | null;
    targetDate?: string | null;
  }) => Promise<void>;
  onUpdateGoal: (
    goalId: string,
    data: {
      title?: string;
      description?: string | null;
      status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
      color?: string;
      startDate?: string | null;
      targetDate?: string | null;
    }
  ) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
}

const GOAL_COLORS = [
  { label: 'Teal', value: '#0f766e' },
  { label: 'Blau', value: '#2563eb' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Violett', value: '#7c3aed' },
  { label: 'Stone', value: '#52525b' },
];

function toInputDate(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function formatDateRange(startDate?: string | null, targetDate?: string | null): string {
  if (!startDate && !targetDate) return 'Kein Zeitraum festgelegt';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  if (startDate && targetDate) return `${fmt(startDate)} – ${fmt(targetDate)}`;
  if (startDate) return `Ab ${fmt(startDate)}`;
  return `Bis ${fmt(targetDate!)}`;
}

export const GoalsModal: React.FC<GoalsModalProps> = ({
  isOpen,
  onClose,
  goals,
  canEdit,
  onCreateGoal,
  onUpdateGoal,
  onDeleteGoal,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#0f766e');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setColor('#0f766e');
    setStartDate('');
    setTargetDate('');
  };

  const startEditing = (goal: GoalItem) => {
    setEditingId(goal.id);
    setTitle(goal.title);
    setDescription(goal.description || '');
    setColor(goal.color || '#0f766e');
    setStartDate(toInputDate(goal.startDate));
    setTargetDate(toInputDate(goal.targetDate));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        color,
        startDate: startDate ? `${startDate}T00:00:00.000Z` : null,
        targetDate: targetDate ? `${targetDate}T23:59:59.000Z` : null,
      };
      if (editingId) {
        await onUpdateGoal(editingId, {
          ...payload,
          description: description.trim() || null,
        });
      } else {
        await onCreateGoal(payload);
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200/70 flex items-center justify-center text-teal-700">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Übergeordnete Ziele</h2>
              <p className="text-[11px] text-zinc-500">
                Definiere Ziele mit Zeitraum und ordne Tickets direkt zu.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {canEdit && (
            <form
              onSubmit={handleSubmit}
              className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-800">
                  {editingId ? 'Ziel bearbeiten' : 'Neues übergeordnetes Ziel anlegen'}
                </span>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-[11px] text-zinc-500 hover:text-zinc-800"
                  >
                    Abbrechen
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="z. B. Q4 Release v2.0 oder Performance-Offensive"
                    className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600 text-zinc-900"
                  />
                </div>

                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optionale Beschreibung des Ziels..."
                    className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600 text-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    Startdatum
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600 text-zinc-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    Zieldatum (Ende)
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600 text-zinc-800"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500">Farbe:</span>
                  <div className="flex items-center gap-1.5">
                    {GOAL_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setColor(c.value)}
                        title={c.label}
                        className={`w-5 h-5 rounded-full transition ${
                          color === c.value ? 'ring-2 ring-offset-2 ring-zinc-700 scale-110' : 'opacity-75 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving || !title.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editingId ? 'Änderungen speichern' : 'Ziel erstellen'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Goals List */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Projekt-Ziele ({goals.length})
            </h3>

            {goals.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-zinc-200 rounded-xl text-xs text-zinc-400">
                Noch keine übergeordneten Ziele angelegt.
              </div>
            ) : (
              goals.map((goal) => {
                const total = goal.issues?.length ?? goal._count?.issues ?? 0;
                const done = goal.issues?.filter((i) => i.status === 'DONE').length ?? 0;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                return (
                  <div
                    key={goal.id}
                    className="p-4 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 transition space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full mt-1 shrink-0"
                          style={{ backgroundColor: goal.color || '#0f766e' }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-semibold text-zinc-900">{goal.title}</h4>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                goal.status === 'COMPLETED'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : goal.status === 'ARCHIVED'
                                    ? 'bg-zinc-100 text-zinc-500 border-zinc-200'
                                    : 'bg-teal-50 text-teal-700 border-teal-200'
                              }`}
                            >
                              {goal.status === 'COMPLETED'
                                ? 'Erreicht'
                                : goal.status === 'ARCHIVED'
                                  ? 'Archiviert'
                                  : 'Aktiv'}
                            </span>
                          </div>
                          {goal.description && (
                            <p className="text-xs text-zinc-500 mt-0.5">{goal.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-500">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-zinc-400" />
                              {formatDateRange(goal.startDate, goal.targetDate)}
                            </span>
                            <span>•</span>
                            <span>
                              {done} / {total} Tickets erledigt ({pct}%)
                            </span>
                          </div>
                        </div>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateGoal(goal.id, {
                                status: goal.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED',
                              })
                            }
                            title={
                              goal.status === 'COMPLETED'
                                ? 'Als aktiv markieren'
                                : 'Als erreicht markieren'
                            }
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 transition"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditing(goal)}
                            title="Bearbeiten"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteGoal(goal.id)}
                            title="Löschen"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: goal.color || '#0f766e',
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
