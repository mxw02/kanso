import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot } from 'lucide-react';

export interface MentionCandidateItem {
  id: string;
  handle: string;
  name: string;
  type: 'HUMAN' | 'AGENT';
  subtitle?: string;
  avatarUrl?: string | null;
}

interface MentionUserLike {
  id: string;
  name: string;
  role?: string;
  avatarUrl?: string;
  gitUsername?: string;
}

interface MentionTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (nextValue: string) => void;
  users?: MentionUserLike[];
  projectId?: string;
  apiUrl?: string;
}

const DEFAULT_AGENT_CANDIDATES: MentionCandidateItem[] = [
  { id: 'agent:agent-triage-v1', handle: 'agent-triage-v1', name: 'agent-triage-v1', type: 'AGENT', subtitle: 'Auto-Triage & Zerlegung' },
  { id: 'agent:Antigravity', handle: 'Antigravity', name: 'Antigravity', type: 'AGENT', subtitle: 'Coding & Review Agent' },
  { id: 'agent:code-generator', handle: 'code-generator', name: 'code-generator', type: 'AGENT', subtitle: 'Code-Generierung' },
  { id: 'agent:pr-reviewer', handle: 'pr-reviewer', name: 'pr-reviewer', type: 'AGENT', subtitle: 'PR Review & QA' },
];

export const MentionTextarea: React.FC<MentionTextareaProps> = ({
  value,
  onChange,
  users = [],
  projectId,
  apiUrl = '',
  onKeyDown,
  onClick,
  onKeyUp,
  ...rest
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [remoteCandidates, setRemoteCandidates] = useState<MentionCandidateItem[] | null>(null);
  const [mentionTrigger, setMentionTrigger] = useState<{ start: number; end: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    fetch(`${apiUrl}/api/mentions/candidates${qs}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setRemoteCandidates(data);
        }
      })
      .catch(() => {
        // Fallback to local users + default agents
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl, projectId]);

  const allCandidates = useMemo<MentionCandidateItem[]>(() => {
    if (remoteCandidates && remoteCandidates.length > 0) {
      return remoteCandidates;
    }
    const humanCandidates: MentionCandidateItem[] = users.map((u) => ({
      id: `user:${u.id}`,
      handle: (u.gitUsername || u.name).replace(/\s+/g, ''),
      name: u.name,
      type: 'HUMAN',
      subtitle: u.role,
      avatarUrl: u.avatarUrl || null,
    }));
    return [...humanCandidates, ...DEFAULT_AGENT_CANDIDATES];
  }, [remoteCandidates, users]);

  const filteredCandidates = useMemo(() => {
    if (!mentionTrigger) return [];
    const q = mentionTrigger.query.toLowerCase();
    return allCandidates
      .filter(
        (c) =>
          c.handle.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allCandidates, mentionTrigger]);

  const detectTrigger = (text: string, cursorPos: number | null) => {
    if (cursorPos === null || cursorPos < 0) {
      setMentionTrigger(null);
      return;
    }
    const beforeCursor = text.slice(0, cursorPos);
    const match = /(^|[^a-zA-Z0-9._-])@([a-zA-Z0-9._-]{0,40})$/.exec(beforeCursor);
    if (!match) {
      setMentionTrigger(null);
      return;
    }
    const query = match[2];
    const atIndex = cursorPos - query.length - 1;
    setMentionTrigger({ start: atIndex, end: cursorPos, query });
    setActiveIndex(0);
  };

  const applyCandidate = (candidate: MentionCandidateItem) => {
    if (!mentionTrigger) return;
    const before = value.slice(0, mentionTrigger.start);
    const after = value.slice(mentionTrigger.end);
    const inserted = `@${candidate.handle} `;
    const next = `${before}${inserted}${after}`;
    onChange(next);
    setMentionTrigger(null);

    const nextCursor = before.length + inserted.length;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionTrigger && filteredCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filteredCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filteredCandidates.length) % filteredCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyCandidate(filteredCandidates[activeIndex] || filteredCandidates[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMentionTrigger(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          detectTrigger(next, e.target.selectionStart);
        }}
        onClick={(e) => {
          detectTrigger(e.currentTarget.value, e.currentTarget.selectionStart);
          onClick?.(e);
        }}
        onKeyUp={(e) => {
          if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
            detectTrigger(e.currentTarget.value, e.currentTarget.selectionStart);
          }
          onKeyUp?.(e);
        }}
        onKeyDown={handleKeyDown}
        {...rest}
      />

      {mentionTrigger && filteredCandidates.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1.5 z-50 w-72 max-h-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl p-1">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Erwähnen (@Mention)
          </div>
          {filteredCandidates.map((c, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyCandidate(c);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition ${
                  isActive ? 'bg-teal-50 text-teal-900' : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {c.type === 'AGENT' ? (
                  <span className="w-6 h-6 rounded-md bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5" />
                  </span>
                ) : c.avatarUrl ? (
                  <img
                    src={c.avatarUrl}
                    alt={c.name}
                    className="w-6 h-6 rounded-full object-cover border border-zinc-200 shrink-0"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-teal-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-[11px] truncate">@{c.handle}</span>
                    {c.type === 'AGENT' && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-violet-100 text-violet-700 font-semibold">
                        AGENT
                      </span>
                    )}
                  </div>
                  {(c.name !== c.handle || c.subtitle) && (
                    <div className="text-[10px] text-zinc-400 truncate">
                      {c.name !== c.handle ? `${c.name}${c.subtitle ? ` · ${c.subtitle}` : ''}` : c.subtitle}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
