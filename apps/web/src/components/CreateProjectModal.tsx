import React, { useState } from 'react';
import { Layers, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: { key: string; name: string; description: string }) => Promise<void>;
}

export const CreateProjectModal: React.FC<Props> = ({ isOpen, onClose, onCreate }) => {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !name.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreate({
        key: key.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim(),
      });
      setKey('');
      setName('');
      setDescription('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-[#121624] border border-zinc-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-bold text-white">Create Project</h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Project Key * (2-5 letters)</label>
            <input
              type="text"
              required
              maxLength={6}
              placeholder="e.g. AI, DEV, API"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              className="w-full bg-[#090b14] border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Project Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Customer Portal & Billing"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#090b14] border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Description</label>
            <textarea
              rows={3}
              placeholder="Brief description of purpose and scope..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#090b14] border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !key.trim() || !name.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/30 transition"
          >
            Create Project
          </button>
        </div>
      </form>
    </div>
  );
};
