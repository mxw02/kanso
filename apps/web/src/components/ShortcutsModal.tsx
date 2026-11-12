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
    { key: 'L', desc: 'Switch to Compact List/Table View' },
    { key: '?', desc: 'Show this shortcuts reference' },
    { key: 'ESC', desc: 'Close open dialogs or clear selection' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121624] border border-zinc-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-bold text-white">Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-zinc-800/40"
            >
              <span className="text-zinc-300">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-indigo-300 font-mono text-[11px]">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
