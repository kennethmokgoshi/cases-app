// Builds a human-readable project display name from the hierarchical project tree,
// e.g. "Letsatsi Mbombela June 2026" rather than just the leaf node name "June".
//
// The case detail view and the duplicate-detection modals must show the same label.
// Project rows store only the leaf name; the readable label is derived by walking up
// the parent chain and re-ordering by node type (source › branch › month › year).

export type ProjectNode = {
    id: string;
    name: string;
    parentId: string | null;
    type: string;
};

const clean = (name: string): string => {
    let s = name;
    if (s.startsWith('Letsatsi') || s === 'Letsatsi Referrals' || s === 'Letsatsi Finance') s = 'Letsatsi';
    return s.replace(/My Cases\s*-?\s*/gi, '').trim();
};

/**
 * Resolve the full display name for a project given the complete set of project nodes.
 * Returns an empty string when the project id is not found in the map.
 */
export function buildProjectDisplayName(
    projectId: string | null | undefined,
    projects: Iterable<ProjectNode>
): string {
    if (!projectId) return '';

    const map = new Map<string, ProjectNode>();
    for (const p of projects) map.set(p.id, p);

    const parts: { name: string; type: string }[] = [];
    const seen = new Set<string>();
    let curr = map.get(projectId);
    while (curr && !seen.has(curr.id)) {
        seen.add(curr.id);
        if (curr.type !== 'ROOT') parts.unshift({ name: curr.name, type: curr.type });
        curr = curr.parentId ? map.get(curr.parentId) : undefined;
    }

    const year = clean(parts.filter(p => p.type === 'YEAR').pop()?.name || '');
    const month = clean(parts.filter(p => p.type === 'MONTH').pop()?.name || '');
    const allSources = parts.filter(p => p.type === 'ACQUISITION_SOURCE');
    const specificSource = allSources.filter(p => p.name !== 'Cases').pop();
    const source = clean(specificSource?.name || allSources[0]?.name || '');
    const branch = parts
        .filter(p => (p.type === 'BRANCH' || p.type === 'FOLDER' || p.type === 'REFERRER') && p.name !== source)
        .map(p => clean(p.name))
        .join(' ');

    if (year || month || source || branch) {
        return [source, branch, month, year].filter(Boolean).join(' ');
    }
    return parts.map(p => clean(p.name)).filter(Boolean).join(' ');
}
