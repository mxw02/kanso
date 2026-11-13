import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  CheckCircle2,
  Calendar,
  Flag,
  Plus,
  Trash2,
  Clock,
  ArrowRight,
  ChevronRight,
  Layers,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

export interface SprintItem {
  id: string;
  name: string;
  goal?: string | null;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  startDate?: string | null;
  endDate?: string | null;
  issues?: { id: string; identifier: string; title: string; status: string; priority: string }[];
  _count?: { issues: number };
  createdAt?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectKey: string;
  canEdit: boolean;
  onSprintUpdated: () => void;
}

export const SprintModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projectId,
  projectKey,
  canEdit,
  onSprintUpdated,
}) => {
  const [sprints, setSprints] = useState<SprintItem[]>([]);
  const [loading, setLoading] = useState(false);

  // New Sprint Form
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [durationWeeks, setDurationWeeks] = useState(2);

  // Complete Sprint Form
  const [completingSprint, setCompletingSprint] = useState<SprintItem | null>(null);
  const [rolloverTarget, setRolloverTarget] = useState<'BACKLOG' | string>('BACKLOG');
  const [submittingAction, setSubmittingAction] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || '';

  const fetchSprints = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/sprints?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setSprints(data);
      }
    } catch (err) {
      console.error('Failed to load sprints', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectId) {
      fetchSprints();
      setShowCreate(false);
      setCompletingSprint(null);
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  const activeSprint = sprints.find((s) => s.status === 'ACTIVE');
  const plannedSprints = sprints.filter((s) => s.status === 'PLANNED');
  const completedSprints = sprints.filter((s) => s.status === 'COMPLETED');

  // Handle Create Sprint
  const handleCreateSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSubmittingAction(true);
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + durationWeeks * 7 * 24 * 60 * 60 * 1000);

      const res = await fetch(`${API_URL}/api/sprints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name: name.trim(),
          goal: goal.trim() || undefined,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
      });

      if (res.ok) {
        setName('');
        setGoal('');
        setShowCreate(false);
        await fetchSprints();
        onSprintUpdated();
      }
    } catch (err) {
      console.error('Failed to create sprint', err);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Start Sprint
  const handleStartSprint = async (sprintId: string) => {
    if (!canEdit) return;
    try {
      setSubmittingAction(true);
      const res = await fetch(`${API_URL}/api/sprints/${sprintId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationDays: 14 }),
      });
      if (res.ok) {
        await fetchSprints();
        onSprintUpdated();
      }
    } catch (err) {
      console.error('Failed to start sprint', err);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Complete Sprint
  const handleCompleteSprint = async () => {
    if (!completingSprint || !canEdit) return;
    try {
      setSubmittingAction(true);
      const res = await fetch(`${API_URL}/api/sprints/${completingSprint.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rolloverToSprintId: rolloverTarget === 'BACKLOG' ? undefined : rolloverTarget,
        }),
      });
      if (res.ok) {
        setCompletingSprint(null);
        await fetchSprints();
        onSprintUpdated();
      }
    } catch (err) {
      console.error('Failed to complete sprint', err);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Delete Sprint
  const handleDeleteSprint = async (sprintId: string) => {
    if (!canEdit) return;
    if (!confirm('Sprint wirklich löschen? Enthaltene Tickets werden ins Backlog verschoben.')) return;
    try {
      await fetch(`${API_URL}/api/sprints/${sprintId}`, { method: 'DELETE' });
      await fetchSprints();
      onSprintUpdated();
    } catch (err) {
      console.error('Failed to delete sprint', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs">
      <div
        className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 font-bold">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-900">Sprint & Cycle Management</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-semibold border border-teal-100">
                  {projectKey}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Plane zeitlich begrenzte Arbeitsphasen und führe automatische Rollovers durch.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && !showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Neuer Sprint</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* New Sprint Drawer Form */}
          {showCreate && (
            <form
              onSubmit={handleCreateSprint}
              className="p-4 rounded-xl border border-teal-100 bg-teal-50/40 space-y-3 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                  <span>Neuen Sprint planen</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                  Abbrechen
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Sprint Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={`z. B. Sprint ${sprints.length + 1} - MVP Release`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white focus:outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Dauer
                  </label>
                  <select
                    value={durationWeeks}
                    onChange={(e) => setDurationWeeks(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white focus:outline-none focus:border-teal-600"
                  >
                    <option value={1}>1 Woche</option>
                    <option value={2}>2 Wochen (Standard)</option>
                    <option value={3}>3 Wochen</option>
                    <option value={4}>4 Wochen</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Sprint-Ziel (Goal)
                </label>
                <input
                  type="text"
                  placeholder="Was soll in diesem Sprint erreicht werden? (z. B. Release MVP & Onboarding)"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white focus:outline-none focus:border-teal-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-lg transition"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || !name.trim()}
                  className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                >
                  {submittingAction ? 'Erstelle...' : 'Sprint anlegen'}
                </button>
              </div>
            </form>
          )}

          {/* Complete Sprint Modal Prompt */}
          {completingSprint && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Sprint abschließen: {completingSprint.name}</span>
              </div>

              {(() => {
                const total = completingSprint.issues?.length || 0;
                const done = completingSprint.issues?.filter((i) => i.status === 'DONE').length || 0;
                const unfinished = total - done;

                return (
                  <div className="space-y-3 text-xs text-zinc-700">
                    <p>
                      In diesem Sprint wurden <strong>{done} von {total} Tickets</strong> abgeschlossen.{' '}
                      {unfinished > 0 && (
                        <span className="text-amber-800 font-medium">
                          {unfinished} {unfinished === 1 ? 'Aufgabe ist' : 'Aufgaben sind'} noch unerledigt.
                        </span>
                      )}
                    </p>

                    {unfinished > 0 && (
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                          Wohin sollen unerledigte Aufgaben verschoben werden?
                        </label>
                        <select
                          value={rolloverTarget}
                          onChange={(e) => setRolloverTarget(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white focus:outline-none focus:border-teal-600 font-medium"
                        >
                          <option value="BACKLOG">📁 Product Backlog (kein Sprint)</option>
                          {plannedSprints
                            .filter((s) => s.id !== completingSprint.id)
                            .map((ps) => (
                              <option key={ps.id} value={ps.id}>
                                🏃 Nächster Sprint: {ps.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setCompletingSprint(null)}
                        className="px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-lg transition"
                      >
                        Abbrechen
                      </button>
                      <button
                        onClick={handleCompleteSprint}
                        disabled={submittingAction}
                        className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                      >
                        {submittingAction ? 'Schließe ab...' : 'Sprint abschließen & Aufgaben übergeben'}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 1. Active Sprint */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Aktiver Sprint</span>
              </h3>
            </div>

            {activeSprint ? (
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-zinc-900">{activeSprint.name}</h4>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        AKTIV
                      </span>
                    </div>
                    {activeSprint.goal && (
                      <p className="text-xs text-zinc-600 mt-1 flex items-center gap-1">
                        <Flag className="w-3 h-3 text-teal-700 shrink-0" />
                        <span>{activeSprint.goal}</span>
                      </p>
                    )}
                  </div>

                  {canEdit && (
                    <button
                      onClick={() => setCompletingSprint(activeSprint)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Sprint abschließen</span>
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                {(() => {
                  const total = activeSprint.issues?.length || 0;
                  const done = activeSprint.issues?.filter((i) => i.status === 'DONE').length || 0;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-zinc-600 font-medium">
                        <span>
                          {done} von {total} Tickets erledigt
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Dates & Issue list preview */}
                <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-emerald-100">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      {activeSprint.startDate ? new Date(activeSprint.startDate).toLocaleDateString('de-DE') : 'Start'} –{' '}
                      {activeSprint.endDate ? new Date(activeSprint.endDate).toLocaleDateString('de-DE') : 'Ende'}
                    </span>
                  </div>
                  <span>{activeSprint.issues?.length || 0} Tickets im Scope</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-zinc-300 text-center text-xs text-zinc-400">
                Aktuell läuft kein aktiver Sprint in diesem Projekt. Wähle unten einen geplanten Sprint aus oder erstelle einen neuen.
              </div>
            )}
          </div>

          {/* 2. Planned Sprints */}
          <div>
            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider mb-2.5">
              Geplante Sprints ({plannedSprints.length})
            </h3>

            <div className="space-y-2">
              {plannedSprints.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 flex items-center justify-between transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-900">{s.name}</span>
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.2 rounded">
                        {s.issues?.length || 0} Tickets
                      </span>
                    </div>
                    {s.goal && <p className="text-[11px] text-zinc-500">{s.goal}</p>}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartSprint(s.id)}
                        disabled={submittingAction}
                        className="flex items-center gap-1 px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-md text-xs font-semibold transition"
                      >
                        <Play className="w-3 h-3 fill-teal-700 text-teal-700" />
                        <span>Sprint starten</span>
                      </button>
                      <button
                        onClick={() => handleDeleteSprint(s.id)}
                        title="Sprint löschen"
                        className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {plannedSprints.length === 0 && (
                <div className="p-3 text-center text-xs text-zinc-400">
                  Keine weiteren Sprints geplant.
                </div>
              )}
            </div>
          </div>

          {/* 3. Completed Sprints History */}
          {completedSprints.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                Abgeschlossene Sprints ({completedSprints.length})
              </h3>
              <div className="space-y-1.5">
                {completedSprints.map((s) => (
                  <div
                    key={s.id}
                    className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50 flex items-center justify-between text-xs text-zinc-600"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-semibold text-zinc-800">{s.name}</span>
                      {s.goal && <span className="text-zinc-400 truncate max-w-xs">· {s.goal}</span>}
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {s.issues?.length || 0} Tickets abgeschlossen
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-200 bg-zinc-50/70 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-800 rounded-lg hover:bg-zinc-200/60 transition"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
