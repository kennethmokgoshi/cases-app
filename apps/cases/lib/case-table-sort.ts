export type SortableCase = {
    id: string;
    fileNumber: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    services?: string | string[] | null;
    nextUpdate?: string | null;
    updatedBy?: {
        firstName: string;
        lastName: string;
    } | null;
    client: {
        firstName: string;
        lastName: string;
        idNumber?: string | null;
    };
    projects?: Array<{
        isPrimary: boolean;
        project: {
            name: string;
            fullPath?: string | null;
        };
    }>;
};

export type SortColumn =
    | 'fileNumber'
    | 'client'
    | 'status'
    | 'project'
    | 'type'
    | 'created'
    | 'updated'
    | 'updatedBy'
    | 'nextUpdate';

export type SortDirection = 'asc' | 'desc';

export type SortState = {
    column: SortColumn;
    direction: SortDirection;
} | null;

export function formatCaseDate(iso: string): string {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date} ${time}`;
}

export function parseServices(services: SortableCase['services']): string[] {
    if (!services) return [];
    if (Array.isArray(services)) return services;
    try {
        const parsed = JSON.parse(services);
        return Array.isArray(parsed) ? parsed : [services];
    } catch {
        return [services];
    }
}

export function formatServiceLabel(service: string): string {
    return service.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export function getPrimaryProjectLabel(c: SortableCase): string {
    const primary = c.projects?.find((p) => p.isPrimary) || c.projects?.[0];
    if (!primary) return '';
    return primary.project.fullPath || primary.project.name;
}

export function searchCases<T extends SortableCase>(cases: T[], searchTerm: string): T[] {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return cases;
    return cases.filter(
        (c) =>
            c.fileNumber.toLowerCase().includes(term) ||
            `${c.client.firstName} ${c.client.lastName}`.toLowerCase().includes(term) ||
            (c.client.idNumber ?? '').toLowerCase().includes(term)
    );
}

/**
 * Click cycle per header: unsorted → ascending → descending → unsorted.
 * Clicking a different header starts that column at ascending.
 */
export function nextSortState(current: SortState, clicked: SortColumn): SortState {
    if (!current || current.column !== clicked) return { column: clicked, direction: 'asc' };
    if (current.direction === 'asc') return { column: clicked, direction: 'desc' };
    return null;
}

function sortValue(c: SortableCase, column: SortColumn): string | number | null {
    switch (column) {
        case 'fileNumber':
            return c.fileNumber;
        case 'client':
            return `${c.client.firstName} ${c.client.lastName}`;
        case 'status':
            return c.status;
        case 'project':
            return getPrimaryProjectLabel(c);
        case 'type':
            return parseServices(c.services).map(formatServiceLabel).join(', ');
        case 'created':
            return new Date(c.createdAt).getTime();
        case 'updated':
            return new Date(c.updatedAt).getTime();
        case 'updatedBy':
            return c.updatedBy ? `${c.updatedBy.firstName} ${c.updatedBy.lastName}` : '';
        case 'nextUpdate':
            return c.nextUpdate ? new Date(c.nextUpdate).getTime() : null;
    }
}

export function sortCases<T extends SortableCase>(cases: T[], sort: SortState): T[] {
    if (!sort) return cases;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...cases].sort((a, b) => {
        const av = sortValue(a, sort.column);
        const bv = sortValue(b, sort.column);
        // Empty values (no project, no services, no next update) always sort last regardless of direction
        const aEmpty = av === '' || av === null;
        const bEmpty = bv === '' || bv === null;
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
            return (av - bv) * factor;
        }
        return String(av).localeCompare(String(bv), 'en', { numeric: true, sensitivity: 'base' }) * factor;
    });
}
