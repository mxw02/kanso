import React, { useState } from 'react';
import {
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
  environment: string;
  attachmentsMarkdown: string;
  extraNotes: string;
}

export function detectBrowserContext(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return '';
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
  return `${browser} · Viewport ${viewport} · ${activeUrl}`;
}

export function createDefaultBugIntakeState(): BugIntakeState {
  return {
    area: '',
    severity: 'MEDIUM',
    steps: ['', ''],
    expectedBehavior: '',
    actualBehavior: '',
    environment: '',
    attachmentsMarkdown: '',
    extraNotes: '',
  };
}

const SEVERITY_LABEL: Record<BugSeverity, string> = {
  BLOCKER: 'Blocker (Kernfunktion nicht nutzbar)',
  HIGH: 'Hoch (Stark beeinträchtigt)',
  MEDIUM: 'Mittel (Workaround vorhanden)',
  LOW: 'Niedrig (Kosmetisch / Minor)',
};

const SEVERITY_OPTIONS: Array<{ id: BugSeverity; label: string; activeClass: string }> = [
  { id: 'BLOCKER', label: 'Blocker', activeClass: 'bg-rose-600 text-white border-rose-600' },
  { id: 'HIGH', label: 'Hoch', activeClass: 'bg-orange-500 text-white border-orange-500' },
  { id: 'MEDIUM', label: 'Mittel', activeClass: 'bg-teal-700 text-white border-teal-700' },
  { id: 'LOW', label: 'Niedrig', activeClass: 'bg-zinc-700 text-white border-zinc-700' },
];

export function buildStructuredBugMarkdown(state: BugIntakeState): string {
  const cleanSteps = state.steps.map((s) => s.trim()).filter(Boolean);
  const stepsBlock =
    cleanSteps.length > 0
      ? cleanSteps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')
      : '1. ';

  const lines: string[] = [
    '### Betroffener Bereich & Auswirkung',
    ...(state.area.trim() ? [`- **Bereich / Komponente:** ${state.area.trim()}`] : []),
    `- **Severity:** ${SEVERITY_LABEL[state.severity] || state.severity}`,
    '',
    '### Schritte zur Reproduktion',
    stepsBlock,
    '',
    '### Erwartetes vs. aktuelles Verhalten',
    `- **Erwartet:** ${state.expectedBehavior.trim() || '_nicht angegeben_'}`,
    `- **Aktuell:** ${state.actualBehavior.trim() || '_nicht angegeben_'}`,
  ];

  if (state.environment.trim()) {
    lines.push('', '### Umgebung & Kontext', state.environment.trim());
  }

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

  const handleInsertBrowserContext = () => {
    const ctx = detectBrowserContext();
    if (!ctx) return;
    onChange({
      ...value,
      environment: value.environment.trim() ? `${value.environment.trim()}\n${ctx}` : ctx,
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
      className={`space-y-4 transition rounded-xl ${
        dragOver ? 'ring-2 ring-teal-500/30 bg-teal-50/20 p-1' : ''
      }`}
    >
      {/* Section 1: Area & Severity */}
      <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          1. Einordnung
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700">
              Betroffener Bereich / Komponente <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <input
              type="text"
              value={value.area}
              onChange={(e) => onChange({ ...value, area: e.target.value })}
              placeholder="z. B. Screen, Modul, Workflow oder Funktion..."
              className="w-full px-3 py-1.5 text-xs bg-zinc-50/70 border border-zinc-200 rounded-lg focus:outline-none focus:bg-white focus:border-teal-600"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700">
              Severity / Auswirkung
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {SEVERITY_OPTIONS.map((opt) => {
                const active = value.severity === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ ...value, severity: opt.id })}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      active
                        ? opt.activeClass
                        : 'bg-zinc-50/70 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-400">
              {SEVERITY_LABEL[value.severity]}
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Reproduction & Expected vs Actual */}
      <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          2. Reproduktion &amp; Verhalten
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-zinc-700">
              Schritte zur Reproduktion
            </label>
            <button
              type="button"
              onClick={addStep}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schritt hinzufügen</span>
            </button>
          </div>
          <div className="space-y-2">
            {value.steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-zinc-100 border border-zinc-200/80 text-[11px] font-mono font-semibold text-zinc-500 flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={step}
                  onChange={(e) => updateStep(idx, e.target.value)}
                  placeholder={
                    idx === 0
                      ? 'z. B. Seite / Ansicht öffnen...'
                      : idx === 1
                      ? 'z. B. Aktion ausführen...'
                      : 'Weiterer Schritt...'
                  }
                  className="flex-1 px-3 py-1.5 text-xs bg-zinc-50/70 border border-zinc-200 rounded-lg focus:outline-none focus:bg-white focus:border-teal-600"
                />
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  title="Schritt entfernen"
                  className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-emerald-800">
              Erwartetes Verhalten
            </label>
            <textarea
              rows={3}
              value={value.expectedBehavior}
              onChange={(e) => onChange({ ...value, expectedBehavior: e.target.value })}
              placeholder="Was sollte passieren?"
              className="w-full px-3 py-2 text-xs bg-emerald-50/30 border border-emerald-200/80 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-500 resize-y"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-rose-800">
              Aktuelles Verhalten
            </label>
            <textarea
              rows={3}
              value={value.actualBehavior}
              onChange={(e) => onChange({ ...value, actualBehavior: e.target.value })}
              placeholder="Was passiert stattdessen?"
              className="w-full px-3 py-2 text-xs bg-rose-50/30 border border-rose-200/80 rounded-lg focus:outline-none focus:bg-white focus:border-rose-400 resize-y"
            />
          </div>
        </div>
      </div>

      {/* Section 3: Environment & Screenshots */}
      <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            <Monitor className="w-3.5 h-3.5 text-teal-700" />
            <span>3. Umgebung &amp; Screenshots <span className="font-normal normal-case">(optional)</span></span>
          </span>
          <button
            type="button"
            onClick={handleInsertBrowserContext}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:text-teal-900 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Browser-Kontext einfügen</span>
          </button>
        </div>

        <input
          type="text"
          value={value.environment}
          onChange={(e) => onChange({ ...value, environment: e.target.value })}
          placeholder="z. B. iOS 18, Prod API v2.1, Staging, Docker, Chrome..."
          className="w-full px-3 py-1.5 text-xs bg-zinc-50/70 border border-zinc-200 rounded-lg focus:outline-none focus:bg-white focus:border-teal-600"
        />

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

        <div className="pt-1 flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/70 hover:bg-zinc-50 hover:border-teal-500 text-xs text-zinc-600 hover:text-teal-700 cursor-pointer font-medium transition">
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
            ) : (
              <Paperclip className="w-3.5 h-3.5" />
            )}
            <span>{uploading ? 'Wird hochgeladen...' : 'Screenshot / Datei anhängen (⌘V oder Drag & Drop)'}</span>
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
          {uploadError && <span className="text-[11px] text-rose-600">{uploadError}</span>}
        </div>
      </div>
    </div>
  );
};
