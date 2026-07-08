export type ProjectDirectoryProject = {
    id: string;
    parentId: string | null;
};

export function findProjectById<T extends ProjectDirectoryProject>(
    projects: T[],
    projectId: string | null
): T | null {
    if (!projectId) return null;
    return projects.find((project) => project.id === projectId) ?? null;
}

export function getProjectAncestorIds(
    projects: ProjectDirectoryProject[],
    projectId: string | null
): string[] {
    if (!projectId) return [];

    const projectsById = new Map(projects.map((project) => [project.id, project]));
    const ancestors: string[] = [];
    const visited = new Set<string>();
    let current = projectsById.get(projectId);

    while (current?.parentId) {
        if (visited.has(current.parentId)) break;
        visited.add(current.parentId);

        const parent = projectsById.get(current.parentId);
        if (!parent) break;

        ancestors.unshift(parent.id);
        current = parent;
    }

    return ancestors;
}
