import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  HardDrive,
  Loader2,
  Play,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

interface BackupSettingsData {
  enabled: boolean;
  schedule: 'MANUAL' | 'HOURLY' | 'DAILY' | 'WEEKLY';
  runAtHour: number;
  runAtWeekday: number;
  retentionCount: number;
  includeUploads: boolean;
  targetPath: string;
  lastRunAt?: string | null;
  defaultTargetPath?: string;
}

interface BackupRunItem {
  id: string;
  filename: string;
  filePath: string;
  sizeBytes: number;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  trigger: 'MANUAL' | 'SCHEDULED';
  includeDb: boolean;
  includeUploads: boolean;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
  fileExists?: boolean;
}

interface BackupSettingsPanelProps {
  apiBaseUrl: string;
}

const WEEKDAYS = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export const BackupSettingsPanel: React.FC<BackupSettingsPanelProps> = ({ apiBaseUrl }) => {
  const [settings, setSettings] = useState<BackupSettingsData | null>(null);
  const [runs, setRuns] = useState<BackupRunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/backups/settings`),
        fetch(`${apiBaseUrl}/api/backups`),
      ]);
      if (sRes.ok) setSettings(await sRes.json());
      if (rRes.ok) setRuns(await rRes.json());
    } catch (err: any) {
      setErrorMsg(err?.message || 'Backup-Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [apiBaseUrl]);

  const persistSettings = async (next: BackupSettingsData) => {
    setSettings(next);
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/backups/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Einstellungen konnten nicht gespeichert werden.');
      setSettings(data);
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Fehler beim Speichern der Backup-Strategie.');
    } finally {
      setSaving(false);
    }
  };

  const handleRunBackup = async () => {
    setRunningBackup(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/backups/run`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.status === 'FAILED') {
        throw new Error(data.errorMessage || data.error || 'Backup fehlgeschlagen.');
      }
      setSuccessMsg(`Backup "${data.filename}" (${formatBytes(data.sizeBytes)}) erfolgreich erstellt.`);
      await fetchAll();
    } catch (err: any) {
      setErrorMsg(err.message || 'Backup konnte nicht ausgeführt werden.');
      await fetchAll();
    } finally {
      setRunningBackup(false);
    }
  };

  const handleDeleteRun = async (run: BackupRunItem) => {
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/backups/${run.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Backup konnte nicht gelöscht werden.');
      setRuns((prev) => prev.filter((r) => r.id !== run.id));
    } catch (err: any) {
      setErrorMsg(err.message || 'Fehler beim Löschen des Backups.');
    }
  };

  if (loading || !settings) {
    return (
      <main className="flex-1 overflow-y-auto p-6 bg-white min-w-0">
        <div className="max-w-5xl mx-auto flex items-center gap-2 text-xs text-zinc-500 py-8">
          <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
          <span>Lade Backup-Konfiguration...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-white min-w-0">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Backup-Strategie &amp; Sicherungen</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Lege fest, wann PostgreSQL-Datenbank und Uploads automatisch gesichert und wie lange sie aufbewahrt werden.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saving && <span className="text-xs text-zinc-400">Speichert...</span>}
            {savedFlag && !saving && (
              <span className="text-xs text-emerald-600 font-semibold inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Gespeichert
              </span>
            )}
            <button
              type="button"
              disabled={runningBackup}
              onClick={handleRunBackup}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {runningBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{runningBackup ? 'Backup läuft...' : 'Backup jetzt erstellen'}</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Strategy Configuration Card */}
        <div className="p-5 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-4">
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-zinc-200/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-zinc-900">Automatischer Zeitplan</div>
                <div className="text-[11px] text-zinc-500">
                  {settings.lastRunAt
                    ? `Letzte Sicherung: ${new Date(settings.lastRunAt).toLocaleString('de-DE')}`
                    : 'Noch kein geplantes Backup ausgeführt'}
                </div>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => persistSettings({ ...settings, enabled: e.target.checked })}
                className="rounded border-zinc-300 text-teal-700 focus:ring-teal-600"
              />
              <span>Auto-Backup aktiv</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                Intervall
              </label>
              <select
                value={settings.schedule}
                onChange={(e) =>
                  persistSettings({
                    ...settings,
                    schedule: e.target.value as BackupSettingsData['schedule'],
                  })
                }
                className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
              >
                <option value="MANUAL">Nur manuell</option>
                <option value="HOURLY">Stündlich</option>
                <option value="DAILY">Täglich</option>
                <option value="WEEKLY">Wöchentlich</option>
              </select>
            </div>

            {(settings.schedule === 'DAILY' || settings.schedule === 'WEEKLY') && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                  Uhrzeit (UTC)
                </label>
                <select
                  value={settings.runAtHour}
                  onChange={(e) => persistSettings({ ...settings, runAtHour: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00 Uhr
                    </option>
                  ))}
                </select>
              </div>
            )}

            {settings.schedule === 'WEEKLY' && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                  Wochentag
                </label>
                <select
                  value={settings.runAtWeekday}
                  onChange={(e) => persistSettings({ ...settings, runAtWeekday: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
                >
                  {WEEKDAYS.map((day, idx) => (
                    <option key={day} value={idx}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                Aufbewahrung (Retention)
              </label>
              <select
                value={settings.retentionCount}
                onChange={(e) => persistSettings({ ...settings, retentionCount: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
              >
                <option value={3}>Letzte 3 Backups</option>
                <option value={7}>Letzte 7 Backups</option>
                <option value={14}>Letzte 14 Backups</option>
                <option value={30}>Letzte 30 Backups</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                Zielverzeichnis im Container (Host-Mount ./backups)
              </label>
              <input
                type="text"
                value={settings.targetPath}
                onChange={(e) => setSettings({ ...settings, targetPath: e.target.value })}
                onBlur={() => persistSettings(settings)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.includeUploads}
                  onChange={(e) => persistSettings({ ...settings, includeUploads: e.target.checked })}
                  className="rounded border-zinc-300 text-teal-700 focus:ring-teal-600"
                />
                <span>Uploads &amp; Ticket-Anhänge mit sichern (empfohlen)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Encryption Key Reminder */}
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Wichtig für Restore:</strong> Jedes Archiv enthält <code className="font-mono">database.sql</code>,{' '}
            <code className="font-mono">uploads/</code> und <code className="font-mono">manifest.json</code>. Bewahre{' '}
            <code className="font-mono">ENCRYPTION_KEY</code> und <code className="font-mono">JWT_SECRET</code> aus deiner{' '}
            <code className="font-mono">.env</code> separat sicher auf, damit verschlüsselte Git-/Jira-/OIDC-Tokens wiederhergestellt werden können (siehe{' '}
            <code className="font-mono">docs/BACKUP.md</code>).
          </div>
        </div>

        {/* Backup History Table */}
        <div className="border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 text-[11px] font-semibold text-zinc-600">
            Backup-Verlauf ({runs.length})
          </div>
          {runs.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              Noch keine Backups vorhanden. Klicke auf „Backup jetzt erstellen“, um die erste Sicherung anzulegen.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {runs.map((run) => (
                <div key={run.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-zinc-800">{run.filename}</span>
                      {run.status === 'SUCCESS' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                          Erfolgreich
                        </span>
                      ) : run.status === 'FAILED' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                          Fehlgeschlagen
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                          Läuft
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 font-medium">
                        {run.trigger === 'SCHEDULED' ? 'Zeitplan' : 'Manuell'}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        {run.includeUploads ? 'DB + Uploads' : 'Nur DB'} · {formatBytes(run.sizeBytes)}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {new Date(run.createdAt).toLocaleString('de-DE')}
                      {run.errorMessage && (
                        <span className="text-rose-600 ml-2">— {run.errorMessage}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {run.status === 'SUCCESS' && run.fileExists && (
                      <a
                        href={`${apiBaseUrl}/api/backups/${run.id}/download`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-[11px] font-semibold transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteRun(run)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-semibold transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Löschen</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
