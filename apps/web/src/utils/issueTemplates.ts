export interface IssueTemplate {
  id: string;
  name: string;
  description?: string;
  titlePrefix?: string;
  body: string;
  type: 'TASK' | 'BUG' | 'FEATURE' | 'EPIC';
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  labels: string[];
  proofOfWorkChecks: string[];
}

export const DEFAULT_ISSUE_TEMPLATES: IssueTemplate[] = [
  {
    id: 'tpl-bug-report',
    name: 'Bug-Report',
    description: 'Fehlerbericht mit Reproduktionsschritten & Verifikation',
    titlePrefix: '[Bug] ',
    type: 'BUG',
    priority: 'HIGH',
    labels: ['bug', 'triage'],
    body: `### Problembeschreibung\nKurzbeschreibung des Fehlers.\n\n### Schritte zur Reproduktion\n1. \n2. \n\n### Erwartetes vs. aktuelles Verhalten\n- **Erwartet:** \n- **Aktuell:** `,
    proofOfWorkChecks: [
      'Reproduktionsfall nachgestellt',
      'Fix verifiziert & Build grün',
    ],
  },
  {
    id: 'tpl-feature-spec',
    name: 'Feature-Spec',
    description: 'Funktionale Spezifikation mit Akzeptanzkriterien',
    titlePrefix: '',
    type: 'FEATURE',
    priority: 'MEDIUM',
    labels: ['feature', 'ui'],
    body: `### Ziel & Nutzen\nWelches Problem wird gelöst?\n\n### Akzeptanzkriterien\n- [ ] \n- [ ] `,
    proofOfWorkChecks: [
      'TypeScript / Build fehlerfrei',
      'UI & API End-to-End geprüft',
    ],
  },
  {
    id: 'tpl-agent-task',
    name: 'Agent-Task',
    description: 'Strukturierte Aufgabe für Coding-Agenten inkl. PoW-Checks',
    titlePrefix: '',
    type: 'TASK',
    priority: 'MEDIUM',
    labels: ['agent-task', 'mcp'],
    body: `### Aufgabe\nPräzise Beschreibung der gewünschten Änderung.\n\n### Kontext & Ziel-Dateien\n- \`apps/...\`\n\n### Akzeptanzkriterien\n- [ ] `,
    proofOfWorkChecks: [
      'Build & Tests bestanden',
      'PR gegen develop erstellt',
    ],
  },
];

export function resolveProjectTemplates(raw?: IssueTemplate[] | null): IssueTemplate[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw;
  }
  return DEFAULT_ISSUE_TEMPLATES;
}
