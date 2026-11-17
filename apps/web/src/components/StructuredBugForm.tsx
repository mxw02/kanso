import React, { useState } from 'react';
import {
  Bug,
  Loader2,
  Monitor,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { extractFilesFromClipboard, uploadFileToKanso } from '../utils/uploadFile';
import { AttachmentPreviewStrip } from './AttachmentPreviewStrip';

export type BugSeverity = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface BugIntakeState {
  area: string;
  severity: BugSeverity;
  steps: string[];
  expectedBehavior: string;
  actualBehavior: string;
  browser: string;
  viewport: string;
  activeUrl: string;
  attachmentsMarkdown: string;
  extraNotes: string;
}

const BUG_AREAS = [
  'Board',
  'List',
  'Kalender / Roadmap',
  'Einstellungen',
  'Ticket-Details',
  'Import / Sync',
  'API / MCP',
  'Auth / SSO',
  'Sonstiges',
];

export function detectBrowserContext(): { browser: string; viewport: string; activeUrl: string } {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { browser: 'Unbekannt', viewport: '1280×800', activeUrl: '/' };
  }
  const ua = navigator.userAgent;
  let browserName = 'Browser';
  if (ua.includes('Edg/')) browserName = 'Edge';
  else if (ua.includes('Chrome/')) browserName = 'Chrome';
  else if (ua.includes('Firefox/')) browserName = 'Firefox';
  else if (ua.includes('Safari/')) browserName = 'Safari';

  let os = '';
  if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Linux')) os = 'Linux';

  const browser = os ? `${browserName} (${os})` : browserName;
  const viewport = `${window.innerWidth}×${window.innerHeight}`;
  const activeUrl = `${window.location.pathname}${window.location.search}`;
  return { browser, viewport, activeUrl };
}

export function createDefaultBugIntakeState(): BugIntakeState {
  const ctx = detectBrowserContext();
  return {
    area: 'Board',
    severity: 'MEDIUM',
    steps: ['', ''],
    expectedBehavior: '',
    actualBehavior: '',
    browser: ctx.browser,
    viewport: ctx.viewport,
    activeUrl: ctx.activeUrl,
    attachmentsMarkdown: '',
    extraNotes: '',
  };
}

const SEVERITY_LABEL: Record<BugSeverity, string> = {
  BLOCKER: 'Blocker (System / Kernfunktion nicht nutzbar)',
  HIGH: 'Hoch (Wichtige Funktion stark beeinträchtigt)',
  MEDIUM: 'Mittel (Workaround vorhanden)',
  LOW: 'Niedrig (Kosmetisch / Minor)',
};

export function buildStructuredBugMarkdown(state: BugIntakeState): string {
  const cleanSteps = state.steps.map((s) => s.trim()).filter(Boolean);
  const stepsBlock =
    cleanSteps.length > 0
      ? cleanSteps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')
      : '1. ';

  const lines: string[] = [
    '### Betroffener Bereich & Auswirkung',
    `- **Bereich:** ${state.area || 'Sonstiges'}`,
    `- **Severity:** ${SEVERITY_LABEL[state.severity] || state.severity}`,
    '',
    '### Schritte zur Reproduktion',
    stepsBlock,
    '',
    '### Erwartetes vs. aktuelles Verhalten',
    `- **Erwartet:** ${state.expectedBehavior.trim() || '_nicht angegeben_'}`,
    `- **Aktuell:** ${state.actualBehavior.trim() || '_nicht angegeben_'}`,
    '',
    '### Umgebung & Kontext',
    `- **Browser:** ${state.browser.trim() || 'Unbekannt'}`,
    `- **Viewport:** \`${state.viewport.trim() || 'unbekannt'}\``,
    `- **URL / View:** \`${state.activeUrl.trim() || '/'}\``,
  ];

  if (state.extraNotes.trim()) {
    lines.push('', '### Weitere Hinweise', state.extraNotes.trim());
  }

  if (state.attachmentsMarkdown.trim()) {
    lines.push('', '### Anhänge / Screenshots', state.attachmentsMarkdown.trim());
  }

  return lines.join('\n');
}

interface StructuredBugFormProps {
  value: BugIntakeState;
  onChange: (next: BugIntakeState) => void;
  apiUrl: string;
}

export const StructuredBugForm: React.FC<StructuredBugFormProps> = ({
  value,
  onChange,
  apiUrl,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = async (files: FileList | File[] | null | undefined) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      let nextAttachments = value.attachmentsMarkdown;
      for (const file of Array.from(files)) {
        const res = await uploadFileToKanso(file, apiUrl);
        nextAttachments = nextAttachments
          ? `${nextAttachments}\n${res.markdown}`
          : res.markdown;
      }
      onChange({ ...value, attachmentsMarkdown: nextAttachments });
    } catch (err: any) {
      setUploadError(err.message || 'Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
    }
  };

  const handleRefreshContext = () => {
    const ctx = detectBrowserContext();
    onChange({
      ...value,
      browser: ctx.browser,
      viewport: ctx.viewport,
      activeUrl: ctx.activeUrl,
    });
  };

  const updateStep = (index: number, text: string) => {
    const next = [...value.steps];
    next[index] = text;
    onChange({ ...value, steps: next });
  };

  const addStep = () => {
    onChange({ ...value, steps: [...value.steps, ''] });
  };

  const removeStep = (index: number) => {
    if (value.steps.length <= 1) {
      onChange({ ...value, steps: [''] });
      return;
    }
    onChange({ ...value, steps: value.steps.filter((_, i) => i !== index) });
  };

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (e.dataTransfer?.files?.length) {
          e.preventDefault();
          setDragOver(false);
          handleUpload(e.dataTransfer.files);
        }
      }}
      onPaste={(e) => {
        const files = extractFilesFromClipboard(e.clipboardData);
        if (files.length > 0) {
          e.preventDefault();
          handleUpload(files);
        }
      }}
      className={`space-y-3.5 rounded-xl border p-3.5 bg-zinc-50/60 transition ${
        dragOver ? 'border-teal-500 ring-2 ring-teal-500/20 bg-teal-50/30' : 'border-zinc-200/90'
      }`}
    >
      {/* Row 1: Area + Severity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
            Betroffener Bereich
          </label>
          <select
            value={value.area}
            onChange={(e) => onChange({ ...value, area: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
          >
            {BUG_AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
            Severity / Auswirkung
          </label>
          <select
            value={value.severity}
            onChange={(e) => onChange({ ...value, severity: e.target.value as BugSeverity })}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
          >
            <option value="BLOCKER">Blocker (Kernfunktion defekt)</option>
            <option value="HIGH">Hoch (Stark beeinträchtigt)</option>
            <option value="MEDIUM">Mittel (Workaround möglich)</option>
            <option value="LOW">Niedrig (Kosmetisch / Minor)</option>
          </select>
        </div>
      </div>

      {/* Row 2: Reproduction Steps */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Schritte zur Reproduktion
          </label>
          <button
            type="button"
            onClick={addStep}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Schritt hinzufügen</span>
          </button>
        </div>
        <div className="space-y-1.5">
          {value.steps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-5 text-[11px] font-mono font-semibold text-zinc-400 text-right shrink-0">
                {idx + 1}.
              </span>
              <input
                type="text"
                value={step}
                onChange={(e) => updateStep(idx, e.target.value)}
                placeholder={
                  idx === 0
                    ? 'z. B. Einstellungen öffnen'
                    : idx === 1
                    ? 'z. B. Auf "Token kopieren" klicken'
                    : 'Weiterer Schritt...'
                }
                className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600"
              />
              <button
                type="button"
                onClick={() => removeStep(idx)}
                title="Schritt entfernen"
                className="p-1 text-zinc-400 hover:text-rose-600 rounded transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Expected vs Actual */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
            Erwartetes Verhalten
          </label>
          <textarea
            rows={2}
            value={value.expectedBehavior}
            onChange={(e) => onChange({ ...value, expectedBehavior: e.target.value })}
            placeholder="Was sollte passieren?"
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600 resize-y"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
            Aktuelles Verhalten
          </label>
          <textarea
            rows={2}
            value={value.actualBehavior}
            onChange={(e) => onChange({ ...value, actualBehavior: e.target.value })}
            placeholder="Was passiert stattdessen?"
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-teal-600 resize-y"
          />
        </div>
      </div>

      {/* Row 4: Auto-detected Environment Context */}
      <div className="p-2.5 rounded-lg bg-white border border-zinc-200/90 space-y-2">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <Monitor className="w-3.5 h-3.5 text-teal-700" />
            <span>Umgebung &amp; Kontext (automatisch erfasst)</span>
          </span>
          <button
            type="button"
            onClick={handleRefreshContext}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:text-teal-900 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Neu erfassen</span>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="text"
            value={value.browser}
            onChange={(e) => onChange({ ...value, browser: e.target.value })}
            placeholder="Browser"
            title="Browser / OS"
            className="px-2 py-1 text-[11px] bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:border-teal-600"
          />
          <input
            type="text"
            value={value.viewport}
            onChange={(e) => onChange({ ...value, viewport: e.target.value })}
            placeholder="Viewport (z. B. 1280×800)"
            title="Viewport-Größe"
            className="px-2 py-1 text-[11px] font-mono bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:border-teal-600"
          />
          <input
            type="text"
            value={value.activeUrl}
            onChange={(e) => onChange({ ...value, activeUrl: e.target.value })}
            placeholder="URL / View"
            title="Aktive URL / Route"
            className="px-2 py-1 text-[11px] font-mono bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:border-teal-600"
          />
        </div>
      </div>

      {/* Row 5: Attachments & Screenshots */}
      <div className="space-y-1.5">
        <AttachmentPreviewStrip
          markdown={value.attachmentsMarkdown}
          onRemove={(raw) =>
            onChange({
              ...value,
              attachmentsMarkdown: value.attachmentsMarkdown
                .replace(raw, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim(),
            })
          }
        />
        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-teal-700 cursor-pointer font-medium">
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
            ) : (
              <Paperclip className="w-3.5 h-3.5" />
            )}
            <span>{uploading ? 'Wird hochgeladen...' : 'Screenshot / Datei anhängen (oder ⌘V / Drag & Drop)'}</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleUpload(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-medium">
            <Bug className="w-3 h-3" />
            <span>Wird als strukturiertes Markdown gespeichert</span>
          </span>
        </div>
        {uploadError && <span className="text-[11px] text-rose-600 block">{uploadError}</span>}
      </div>
    </div>
  );
};
