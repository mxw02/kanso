import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface ColumnItem {
  id: string;
  title: string;
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  columns: ColumnItem[];
  onImported: () => Promise<void> | void;
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (cur.trim().length > 0) lines.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim().length > 0) lines.push(cur);
  if (lines.length === 0) return { headers: [], rows: [] };

  const first = lines[0];
  const delimiter = (first.match(/;/g)?.length || 0) > (first.match(/,/g)?.length || 0) ? ';' : ',';

  const splitRow = (line: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === delimiter && !quoted) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    return cells;
  };

  const headers = splitRow(lines[0]);
  const rows = lines.slice(1).map(splitRow);
  return { headers, rows };
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  columns,
  onImported,
}) => {
  const API_URL = import.meta.env.VITE_API_URL || '';
  const [tab, setTab] = useState<'jira' | 'csv'>('jira');

  // Jira state
  const [baseUrl, setBaseUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [jql, setJql] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [statusMapping, setStatusMapping] = useState<Record<string, string>>({});
  const [jiraStatuses, setJiraStatuses] = useState<string[]>([]);
  const [previewIssues, setPreviewIssues] = useState<any[]>([]);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; total: number } | null>(null);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraBusy, setJiraBusy] = useState<'load' | 'preview' | 'save' | 'sync' | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // CSV state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvMap, setCsvMap] = useState({
    title: '',
    description: '',
    status: '',
    priority: '',
    type: '',
    externalKey: '',
    labels: '',
    dueDate: '',
  });
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvResult, setCsvResult] = useState<{ created: number; updated: number; total: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    setJiraError(null);
    setSyncResult(null);
    setPreviewIssues([]);
    setPreviewTotal(null);
    setJiraBusy('load');

    fetch(`${API_URL}/api/projects/${projectId}/jira-integration`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.configured) {
          setBaseUrl(data.baseUrl || '');
          setEmail(data.email || '');
          setHasSavedToken(Boolean(data.hasApiToken));
          setJql(data.jql || '');
          setWebhookSecret(data.webhookSecret || '');
          setStatusMapping(data.statusMapping || {});
          setLastSyncedAt(data.lastSyncedAt || null);
          setJiraStatuses(Object.keys(data.statusMapping || {}));
        } else {
          setBaseUrl('');
          setEmail('');
          setHasSavedToken(false);
          setJql('');
          setWebhookSecret('');
          setStatusMapping({});
          setLastSyncedAt(null);
          setJiraStatuses([]);
        }
      })
      .catch(() => {})
      .finally(() => setJiraBusy(null));
  }, [isOpen, projectId, API_URL]);

  if (!isOpen) return null;

  const webhookUrl = `${window.location.origin}/api/integrations/jira/webhook/${projectId}${
    webhookSecret ? `?secret=${encodeURIComponent(webhookSecret)}` : ''
  }`;

  const handlePreviewJira = async () => {
    setJiraError(null);
    setSyncResult(null);
    setJiraBusy('preview');
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/jira-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl,
          email,
          apiToken: apiToken || undefined,
          jql,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Vorschau fehlgeschlagen');
      setPreviewIssues(data.issues || []);
      setPreviewTotal(data.total ?? 0);
      const statuses: string[] = Array.from(
        new Set([...Object.keys(statusMapping), ...(data.jiraStatuses || [])])
      );
      setJiraStatuses(statuses);
    } catch (err: any) {
      setJiraError(err.message || 'Jira-Verbindung fehlgeschlagen');
    } finally {
      setJiraBusy(null);
    }
  };

  const handleSaveJira = async () => {
    setJiraError(null);
    setJiraBusy('save');
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/jira-integration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl,
          email,
          apiToken: apiToken || undefined,
          jql,
          statusMapping,
          webhookSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
      setHasSavedToken(true);
      setApiToken('');
    } catch (err: any) {
      setJiraError(err.message || 'Konnte Konfiguration nicht speichern');
    } finally {
      setJiraBusy(null);
    }
  };

  const handleSyncJira = async () => {
    setJiraError(null);
    setSyncResult(null);
    setJiraBusy('sync');
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/jira-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: baseUrl || undefined,
          email: email || undefined,
          apiToken: apiToken || undefined,
          jql: jql || undefined,
          statusMapping,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Synchronisation fehlgeschlagen');
      setSyncResult(data);
      setLastSyncedAt(new Date().toISOString());
      await onImported();
    } catch (err: any) {
      setJiraError(err.message || 'Synchronisation fehlgeschlagen');
    } finally {
      setJiraBusy(null);
    }
  };

  const handleDeleteJira = async () => {
    await fetch(`${API_URL}/api/projects/${projectId}/jira-integration`, { method: 'DELETE' });
    setBaseUrl('');
    setEmail('');
    setApiToken('');
    setHasSavedToken(false);
    setJql('');
    setWebhookSecret('');
    setStatusMapping({});
    setJiraStatuses([]);
    setPreviewIssues([]);
    setLastSyncedAt(null);
  };

  const handleCsvFile = (file: File) => {
    setCsvError(null);
    setCsvResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ''));
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setCsvError('Die CSV-Datei enthält keine gültigen Zeilen.');
        return;
      }
      setCsvHeaders(parsed.headers);
      setCsvRows(parsed.rows);

      const findCol = (patterns: string[]) =>
        parsed.headers.find((h) => patterns.some((p) => h.toLowerCase().includes(p))) || '';

      setCsvMap({
        title: findCol(['summary', 'titel', 'title', 'name']),
        description: findCol(['description', 'beschreibung', 'desc', 'body']),
        status: findCol(['status', 'state', 'spalte']),
        priority: findCol(['priority', 'priorität', 'prio']),
        type: findCol(['issue type', 'issuetype', 'type', 'typ']),
        externalKey: findCol(['issue key', 'key', 'id']),
        labels: findCol(['labels', 'tags']),
        dueDate: findCol(['due date', 'duedate', 'fällig', 'deadline']),
      });
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImportCsv = async () => {
    if (!csvMap.title) {
      setCsvError('Bitte wähle mindestens eine Spalte für den Ticket-Titel aus.');
      return;
    }
    setCsvError(null);
    setCsvBusy(true);
    try {
      const idx = (colName: string) => (colName ? csvHeaders.indexOf(colName) : -1);
      const issues = csvRows
        .map((row) => {
          const title = idx(csvMap.title) >= 0 ? row[idx(csvMap.title)] : '';
          if (!title?.trim()) return null;
          const labelsRaw = idx(csvMap.labels) >= 0 ? row[idx(csvMap.labels)] : '';
          return {
            title: title.trim(),
            description: idx(csvMap.description) >= 0 ? row[idx(csvMap.description)] : undefined,
            status: idx(csvMap.status) >= 0 ? row[idx(csvMap.status)] : undefined,
            priority: idx(csvMap.priority) >= 0 ? row[idx(csvMap.priority)] : undefined,
            type: idx(csvMap.type) >= 0 ? row[idx(csvMap.type)] : undefined,
            externalKey: idx(csvMap.externalKey) >= 0 ? row[idx(csvMap.externalKey)] : undefined,
            dueDate: idx(csvMap.dueDate) >= 0 ? row[idx(csvMap.dueDate)] : undefined,
            labels: labelsRaw
              ? labelsRaw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
              : [],
          };
        })
        .filter(Boolean);

      const res = await fetch(`${API_URL}/api/projects/${projectId}/import-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issues }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'CSV-Import fehlgeschlagen');
      setCsvResult(data);
      await onImported();
    } catch (err: any) {
      setCsvError(err.message || 'CSV-Import fehlgeschlagen');
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200/70 flex items-center justify-center text-teal-700">
              <ArrowDownToLine className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                Tickets importieren & synchronisieren ({projectName})
              </h2>
              <p className="text-[11px] text-zinc-500">
                Einfacher Umstieg aus Jira (inkl. Echtzeit-Webhook) oder beliebigen CSV-Exporten.
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

        {/* Tabs */}
        <div className="px-6 pt-3 border-b border-zinc-200 flex items-center gap-2 bg-zinc-50/60">
          <button
            type="button"
            onClick={() => setTab('jira')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
              tab === 'jira'
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Jira Cloud / Server Sync
          </button>
          <button
            type="button"
            onClick={() => setTab('csv')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
              tab === 'csv'
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            CSV-Import (Trello, Linear, Asana, Jira)
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {tab === 'jira' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    Jira-URL
                  </label>
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://dein-team.atlassian.net"
                    className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    Jira E-Mail / Benutzername
                  </label>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@firma.de"
                    className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    API-Token {hasSavedToken && <span className="text-emerald-700">(gespeichert)</span>}
                  </label>
                  <input
                    type="password"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder={hasSavedToken ? '•••••••• (leer lassen zum Behalten)' : 'Atlassian API-Token eingeben'}
                    className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    JQL-Filter (optional)
                  </label>
                  <input
                    type="text"
                    value={jql}
                    onChange={(e) => setJql(e.target.value)}
                    placeholder="project = PROJ AND status != Closed"
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(jiraBusy)}
                    onClick={handlePreviewJira}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {jiraBusy === 'preview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                    <span>Vorschau laden</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(jiraBusy)}
                    onClick={handleSaveJira}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {jiraBusy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Konfiguration speichern</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(jiraBusy)}
                    onClick={handleSyncJira}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {jiraBusy === 'sync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    <span>Jetzt synchronisieren</span>
                  </button>
                </div>

                {hasSavedToken && (
                  <button
                    type="button"
                    onClick={handleDeleteJira}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Verbindung trennen</span>
                  </button>
                )}
              </div>

              {jiraError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{jiraError}</span>
                </div>
              )}

              {syncResult && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Sync abgeschlossen: <strong>{syncResult.created}</strong> neu erstellt,{' '}
                    <strong>{syncResult.updated}</strong> aktualisiert (Duplikate automatisch vermieden).
                  </span>
                </div>
              )}

              {/* Status Mapping */}
              {jiraStatuses.length > 0 && (
                <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-2.5">
                  <h3 className="text-xs font-semibold text-zinc-800">
                    Status-Mapping (Jira → Kanso)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {jiraStatuses.map((js) => (
                      <div key={js} className="flex items-center justify-between gap-2 bg-white p-2 rounded-lg border border-zinc-200">
                        <span className="text-xs font-medium text-zinc-700 truncate">{js}</span>
                        <select
                          value={statusMapping[js] || ''}
                          onChange={(e) =>
                            setStatusMapping((prev) => ({ ...prev, [js]: e.target.value }))
                          }
                          className="text-xs border border-zinc-200 rounded-md px-2 py-1 bg-white text-zinc-800 focus:outline-none focus:border-teal-600"
                        >
                          <option value="">Automatisch</option>
                          {columns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Issues */}
              {previewIssues.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-700">
                      Vorschau ({previewIssues.length} von {previewTotal} gefundenen Tickets)
                    </span>
                  </div>
                  <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-100 max-h-56 overflow-y-auto">
                    {previewIssues.map((item) => (
                      <div key={item.key} className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-semibold text-teal-700 shrink-0">{item.key}</span>
                          <span className="text-zinc-800 truncate">{item.summary}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-[11px] text-zinc-500">
                          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200">{item.status}</span>
                          <span>{item.priority}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Webhook Box */}
              <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                    <Link2 className="w-3.5 h-3.5 text-teal-700" />
                    <span>Automatischer Jira-Webhook (Echtzeit-Sync)</span>
                  </div>
                  {lastSyncedAt && (
                    <span className="text-[11px] text-zinc-400">
                      Letzter Sync: {new Date(lastSyncedAt).toLocaleString('de-DE')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500">
                  Hinterlege diese URL in Jira unter <em>System → WebHooks</em> (Events: Issue Created & Issue Updated), um Änderungen während der Übergangsphase automatisch zu übertragen.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-2.5 py-1.5 text-[11px] font-mono bg-white border border-zinc-200 rounded-lg text-zinc-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-700"
                  >
                    {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedWebhook ? 'Kopiert' : 'Kopieren'}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-zinc-300 rounded-xl bg-zinc-50/50 hover:bg-zinc-50 hover:border-teal-500 transition cursor-pointer">
                <Upload className="w-6 h-6 text-teal-700 mb-2" />
                <span className="text-xs font-semibold text-zinc-800">
                  CSV-Datei auswählen oder hierher ziehen
                </span>
                <span className="text-[11px] text-zinc-400 mt-0.5">
                  Unterstützt Komma- und Semikolon-getrennte Exporte (UTF-8)
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCsvFile(file);
                  }}
                />
              </label>

              {csvHeaders.length > 0 && (
                <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-zinc-800">
                      Spalten zuordnen ({csvRows.length} Zeilen erkannt)
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {(
                      [
                        ['title', 'Titel *'],
                        ['description', 'Beschreibung'],
                        ['status', 'Status'],
                        ['priority', 'Priorität'],
                        ['type', 'Typ'],
                        ['externalKey', 'Externe ID / Key'],
                        ['labels', 'Labels'],
                        ['dueDate', 'Fälligkeitsdatum'],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field}>
                        <label className="block text-[10px] font-semibold text-zinc-500 uppercase mb-1">
                          {label}
                        </label>
                        <select
                          value={csvMap[field]}
                          onChange={(e) => setCsvMap((m) => ({ ...m, [field]: e.target.value }))}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg"
                        >
                          <option value="">– Ignorieren –</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={csvBusy || !csvMap.title}
                      onClick={handleImportCsv}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                    >
                      {csvBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownToLine className="w-3.5 h-3.5" />}
                      <span>{csvRows.length} Tickets importieren</span>
                    </button>
                  </div>
                </div>
              )}

              {csvError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{csvError}</span>
                </div>
              )}

              {csvResult && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    CSV-Import abgeschlossen: <strong>{csvResult.created}</strong> neu erstellt,{' '}
                    <strong>{csvResult.updated}</strong> aktualisiert.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
