import React from 'react';
import { FileText, X } from 'lucide-react';
import { extractUploadedAttachments } from '../utils/uploadFile';

interface AttachmentPreviewStripProps {
  markdown: string;
  onRemove: (rawSnippet: string) => void;
}

export const AttachmentPreviewStrip: React.FC<AttachmentPreviewStripProps> = ({
  markdown,
  onRemove,
}) => {
  const attachments = extractUploadedAttachments(markdown);
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-1.5">
      {attachments.map((att, idx) => (
        <div
          key={`${att.url}-${idx}`}
          className="group relative flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-1 pr-6 text-[11px] text-zinc-700 shadow-2xs"
        >
          {att.isImage ? (
            <a
              href={att.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 hover:opacity-90"
              title={att.label}
            >
              <img
                src={att.url}
                alt={att.label}
                className="h-10 w-10 rounded object-cover border border-zinc-200 bg-white"
              />
              <span className="max-w-[140px] truncate font-medium">{att.label}</span>
            </a>
          ) : (
            <a
              href={att.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-1 py-0.5 hover:text-teal-700"
              title={att.label}
            >
              <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="max-w-[160px] truncate font-medium">{att.label.replace(/^📎\s*/, '')}</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => onRemove(att.raw)}
            title="Anhang entfernen"
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 transition"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
};
