export interface ProofOfWorkCheck {
  id: string;
  title: string;
  command?: string;
  status: 'PENDING' | 'PASSED' | 'FAILED';
  output?: string;
  updatedAt?: string;
}

export interface ReadinessResult {
  score: number;
  level: 'READY' | 'NEEDS_CONTEXT' | 'VAGUE';
  missing: string[];
}

export function computeReadiness(input: {
  description?: string | null;
  proofOfWork?: ProofOfWorkCheck[] | null;
  targetFiles?: string[] | null;
  hasOpenBlockers?: boolean;
}): ReadinessResult {
  const desc = (input.description || '').trim();
  const hasDescription = desc.length >= 30;
  const hasAcceptanceCriteria =
    (Array.isArray(input.proofOfWork) && input.proofOfWork.length > 0) ||
    /(akzeptanz|acceptance|kriterien|criteria|given|when|then|- \[ \]|test|verify)/i.test(desc);
  const hasTargetFiles = Array.isArray(input.targetFiles) && input.targetFiles.length > 0;
  const hasNoOpenBlockers = !input.hasOpenBlockers;

  let score = 15;
  if (hasDescription) score += 30;
  else if (desc.length > 0) score += 10;
  if (hasAcceptanceCriteria) score += 30;
  if (hasTargetFiles) score += 15;
  if (hasNoOpenBlockers) score += 10;

  const missing: string[] = [];
  if (!hasDescription) missing.push('Ausführliche Beschreibung (mind. 30 Zeichen) fehlt');
  if (!hasAcceptanceCriteria) missing.push('Akzeptanzkriterien / Proof-of-Work Checks fehlen');
  if (!hasTargetFiles) missing.push('Ziel-Dateien oder betroffene Module nicht angegeben');
  if (!hasNoOpenBlockers) missing.push('Offene Blocker verhindern autonomen Start');

  const level: ReadinessResult['level'] =
    score >= 75 && hasNoOpenBlockers ? 'READY' : score >= 45 ? 'NEEDS_CONTEXT' : 'VAGUE';

  return { score: Math.min(100, score), level, missing };
}
