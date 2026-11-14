import { PrismaClient } from '@prisma/client';

export interface ResolvedMention {
  handle: string;
  type: 'HUMAN' | 'AGENT';
  userId?: string;
  displayName: string;
}

export interface MentionCandidate {
  id: string;
  handle: string;
  name: string;
  type: 'HUMAN' | 'AGENT';
  subtitle?: string;
  avatarUrl?: string | null;
}

const DEFAULT_AGENTS: Array<{ handle: string; name: string; subtitle: string }> = [
  { handle: 'agent-triage-v1', name: 'agent-triage-v1', subtitle: 'Auto-Triage & Zerlegung' },
  { handle: 'Antigravity', name: 'Antigravity', subtitle: 'Coding & Review Agent' },
  { handle: 'code-generator', name: 'code-generator', subtitle: 'Code-Generierung' },
  { handle: 'pr-reviewer', name: 'pr-reviewer', subtitle: 'PR Review & QA' },
];

/**
 * Extracts unique @mention handles from markdown text while ignoring
 * fenced code blocks, inline code spans and email addresses.
 */
export function extractMentions(text: string): string[] {
  if (!text) return [];

  // Strip fenced code blocks and inline code spans before scanning
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ');

  const seen = new Set<string>();
  const handles: string[] = [];
  const regex = /(^|[^a-zA-Z0-9._-])@([a-zA-Z0-9][a-zA-Z0-9._-]{0,63})/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(stripped)) !== null) {
    const handle = match[2];
    const key = handle.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      handles.push(handle);
    }
  }

  return handles;
}

export async function getMentionCandidates(
  prisma: PrismaClient,
  projectId?: string
): Promise<MentionCandidate[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      gitUsername: true,
      avatarUrl: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const candidates: MentionCandidate[] = users.map((u) => {
    const handle = (u.gitUsername || u.name || u.email.split('@')[0]).replace(/\s+/g, '');
    return {
      id: `user:${u.id}`,
      handle,
      name: u.name,
      type: 'HUMAN',
      subtitle: u.role,
      avatarUrl: u.avatarUrl,
    };
  });

  const seenAgentHandles = new Set<string>();
  for (const agent of DEFAULT_AGENTS) {
    seenAgentHandles.add(agent.handle.toLowerCase());
    candidates.push({
      id: `agent:${agent.handle}`,
      handle: agent.handle,
      name: agent.name,
      type: 'AGENT',
      subtitle: agent.subtitle,
      avatarUrl: null,
    });
  }

  if (projectId) {
    const runs = await prisma.agentRun.findMany({
      where: { issue: { projectId } },
      select: { agentName: true },
      distinct: ['agentName'],
      take: 20,
    });
    for (const run of runs) {
      if (run.agentName && !seenAgentHandles.has(run.agentName.toLowerCase())) {
        seenAgentHandles.add(run.agentName.toLowerCase());
        candidates.push({
          id: `agent:${run.agentName}`,
          handle: run.agentName,
          name: run.agentName,
          type: 'AGENT',
          subtitle: 'Projekt-Agent',
          avatarUrl: null,
        });
      }
    }
  }

  return candidates;
}

export async function resolveMentions(
  prisma: PrismaClient,
  text: string,
  projectId?: string
): Promise<ResolvedMention[]> {
  const handles = extractMentions(text);
  if (handles.length === 0) return [];

  const candidates = await getMentionCandidates(prisma, projectId);
  const byHandle = new Map<string, MentionCandidate>();
  for (const c of candidates) {
    byHandle.set(c.handle.toLowerCase(), c);
    byHandle.set(c.name.toLowerCase().replace(/\s+/g, ''), c);
  }

  const resolved: ResolvedMention[] = [];
  for (const handle of handles) {
    const match = byHandle.get(handle.toLowerCase());
    if (match) {
      resolved.push({
        handle: match.handle,
        type: match.type,
        userId: match.type === 'HUMAN' ? match.id.replace(/^user:/, '') : undefined,
        displayName: match.name,
      });
    }
  }

  return resolved;
}
