import React, { useState } from 'react';
import { X, ShieldAlert, HelpCircle, FileCheck2, CheckCircle2, XCircle, Send, ExternalLink } from 'lucide-react';

interface HitlIssue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  assigneeName?: string | null;
  hitlState?: string | null;
  hitlPrompt?: string | null;
  updatedAt: string;
  project?: { id: string; key: string; name: string };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  issues: HitlIssue[];
  onResolve: (issueId: string, action: 'APPROVE' | 'REJECT' | 'ANSWER', response?: string) => Promise<void>;
  onOpenIssue: (issueId: string) => void;
}

const HITL_META: Record<string, { label: string; icon: React.ReactNode; badgeClass: string }> = {
  NEEDS_CLARIFICATION: {
    label: 'Klärung nötig',
    icon: <HelpCircle className="w-4 h-4 text-amber-600" />,
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  PLAN_APPROVAL: {
    label: 'Plan-Freigabe',
    icon: <FileCheck2 className="w-4 h-4 text-teal-700" />,
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  RISK_APPROVAL: {
    label: 'Risiko-Freigabe',
    icon: <ShieldAlert className="w-4 h-4 text-rose-600" />,
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

export const HitlInboxModal: React.FC<Props> = ({
  isOpen,
  onClose,
  issues,
  onResolve,
  onOpenIssue,
}) => {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAction = async (issueId: string, action: 'APPROVE' | 'REJECT' | 'ANSWER') => {
    setBusyId(issueId);
    try {
      await onResolve(issueId, action, responses[issueId]?.trim() || undefined);
      setResponses((prev) => {
        const next = { ...prev };
        delete next[issueId];
        return next;
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/35 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-zinc-200/80 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Entscheidungs-Inbox (Human-in-the-Loop)
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Agenten warten bei diesen Tickets auf deine Freigabe oder Rückmeldung.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {issues.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/80 mx-auto mb-3" />
              <p className="text-sm font-medium text-zinc-700">Alles geklärt</p>
              <p className="text-xs text-zinc-400 mt-1">
                Aktuell wartet kein Agent auf eine menschliche Entscheidung.
              </p>
            </div>
          ) : (
            issues.map((issue) => {
              const meta = HITL_META[issue.hitlState || 'NEEDS_CLARIFICATION'] || HITL_META.NEEDS_CLARIFICATION;
              const isClarification = issue.hitlState === 'NEEDS_CLARIFICATION';
              const isBusy = busyId === issue.id;

              return (
                <div
                  key={issue.id}
                  className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono font-semibold text-zinc-500">
                          {issue.identifier}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${meta.badgeClass}`}
                        >
                          {meta.icon}
                          {meta.label}
                        </span>
                        {issue.assigneeName && (
                          <span className="text-[11px] text-zinc-500">
                            Agent: <span className="font-medium text-zinc-700">{issue.assigneeName}</span>
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-zinc-900 mt-1 truncate">
                        {issue.title}
                      </h3>
                    </div>
                    <button
                      onClick={() => {
                        onClose();
                        onOpenIssue(issue.id);
                      }}
                      className="text-xs text-zinc-500 hover:text-teal-700 inline-flex items-center gap-1 shrink-0"
                    >
                      Öffnen <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>

                  {issue.hitlPrompt && (
                    <div className="p-3 rounded-lg bg-white border border-zinc-200/80 text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed">
                      {issue.hitlPrompt}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={responses[issue.id] || ''}
                      onChange={(e) => setResponses((prev) => ({ ...prev, [issue.id]: e.target.value }))}
                      placeholder={
                        isClarification
                          ? 'Antwort für den Agenten eingeben...'
                          : 'Optionale Notiz zur Entscheidung...'
                      }
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-500"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isClarification ? (
                        <button
                          disabled={isBusy || !responses[issue.id]?.trim()}
                          onClick={() => handleAction(issue.id, 'ANSWER')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Antworten
                        </button>
                      ) : (
                        <>
                          <button
                            disabled={isBusy}
                            onClick={() => handleAction(issue.id, 'REJECT')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Ablehnen
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => handleAction(issue.id, 'APPROVE')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Freigeben
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
