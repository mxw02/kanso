import React from 'react';
import { HelpCircle, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Cmd + K / Ctrl + K', desc: 'Open Command Palette & Global Search' },
    { key: '/', desc: 'Quick focus search filter' },
    { key: 'C', desc: 'Create new issue' },
    { key: 'B', desc: 'Switch to Kanban Board View' },
    { key: 'L', desc: 'Switch to Table List View' },
    { key: '?', desc: 'Show this shortcuts reference' },
    { key: 'ESC', desc: 'Close dialogs or clear selection' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50"
            >
              <span className="text-slate-700">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-indigo-700 font-mono text-[11px] font-semibold">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
