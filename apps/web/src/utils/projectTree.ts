export interface TreeProjectInput {
  id: string;
  key: string;
  name: string;
  parentId?: string | null;
  workspaceId?: string | null;
  _count?: { issues?: number };
}

export interface ProjectTreeNode<T extends TreeProjectInput = TreeProjectInput> {
  project: T;
  depth: number;
  indentLabel: string;
  pathLabel: string;
}

/**
 * Builds a depth-first flattened tree of projects & nested sub-projects
 * supporting arbitrary nesting depth (n projects with m sub-projects).
 */
export function buildProjectTree<T extends TreeProjectInput>(
  projects: T[],
  workspaceId?: string | null
): ProjectTreeNode<T>[] {
  const filtered = workspaceId
    ? projects.filter((p) => p.workspaceId === workspaceId)
    : projects;

  const byId = new Map(filtered.map((p) => [p.id, p]));
  const childrenMap = new Map<string | null, T[]>();

  for (const proj of filtered) {
    const parentKey = proj.parentId && byId.has(proj.parentId) ? proj.parentId : null;
    const list = childrenMap.get(parentKey) || [];
    list.push(proj);
    childrenMap.set(parentKey, list);
  }

  for (const list of childrenMap.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const result: ProjectTreeNode<T>[] = [];
  const visited = new Set<string>();

  const visit = (parentId: string | null, depth: number, ancestorNames: string[]) => {
    const list = childrenMap.get(parentId) || [];
    for (const proj of list) {
      if (visited.has(proj.id)) continue;
      visited.add(proj.id);
      const prefix = depth === 0 ? '' : `${'  '.repeat(depth - 1)}↳ `;
      const pathParts = [...ancestorNames, proj.name];
      result.push({
        project: proj,
        depth,
        indentLabel: `${prefix}${proj.name} [${proj.key}]`,
        pathLabel: pathParts.join(' / '),
      });
      visit(proj.id, depth + 1, pathParts);
    }
  };

  visit(null, 0, []);
  return result;
}
