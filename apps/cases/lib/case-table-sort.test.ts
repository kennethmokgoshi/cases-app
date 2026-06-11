import { describe, expect, it } from 'vitest';
import {
    SortableCase,
    formatServiceLabel,
    getPrimaryProjectLabel,
    nextSortState,
    parseServices,
    searchCases,
    sortCases,
} from './case-table-sort';

function makeCase(overrides: Partial<SortableCase> = {}): SortableCase {
    return {
        id: 'case-1',
        fileNumber: 'ZDM-2026-209-L79',
        status: 'NOT_LINKED',
        createdAt: '2026-06-10T14:50:00.000Z',
        updatedAt: '2026-06-10T14:51:00.000Z',
        services: JSON.stringify(['debt_review_flag_removal']),
        client: { firstName: 'Vonani', lastName: 'Nkuzana', idNumber: '8001015009087' },
        projects: [
            { isPrimary: true, project: { name: 'June', fullPath: 'Letsatsi › Tembisa › 2026 › June' } },
        ],
        ...overrides,
    };
}

const cases: SortableCase[] = [
    makeCase(),
    makeCase({
        id: 'case-2',
        fileNumber: 'ZDM-2026-208-YM8',
        status: 'DHS_REQUESTED',
        createdAt: '2026-06-09T10:04:00.000Z',
        updatedAt: '2026-06-10T09:33:00.000Z',
        services: JSON.stringify(['credit_profile_enquiry']),
        client: { firstName: 'Samuel', lastName: 'Phala', idNumber: '7505055009081' },
        projects: [{ isPrimary: true, project: { name: 'April', fullPath: 'Letsatsi › De Aar › 2026 › April' } }],
    }),
    makeCase({
        id: 'case-3',
        fileNumber: 'ZDM-2026-207-HKZ',
        status: 'REQUESTED_VIA_DHS',
        createdAt: '2026-06-09T19:53:00.000Z',
        updatedAt: '2026-06-09T21:16:00.000Z',
        services: null,
        client: { firstName: 'Selvyn', lastName: 'Makaleni', idNumber: null },
        projects: [],
    }),
];

describe('parseServices', () => {
    it('parses a JSON array string', () => {
        expect(parseServices('["a","b"]')).toEqual(['a', 'b']);
    });

    it('passes through arrays and wraps plain strings', () => {
        expect(parseServices(['a'])).toEqual(['a']);
        expect(parseServices('debt_review')).toEqual(['debt_review']);
    });

    it('returns empty array for null/undefined/empty', () => {
        expect(parseServices(null)).toEqual([]);
        expect(parseServices(undefined)).toEqual([]);
        expect(parseServices('')).toEqual([]);
    });
});

describe('formatServiceLabel', () => {
    it('converts snake_case to title case', () => {
        expect(formatServiceLabel('debt_review_flag_removal')).toBe('Debt Review Flag Removal');
    });
});

describe('getPrimaryProjectLabel', () => {
    it('prefers the primary project fullPath', () => {
        expect(getPrimaryProjectLabel(cases[0])).toBe('Letsatsi › Tembisa › 2026 › June');
    });

    it('falls back to name when fullPath missing and empty string when no projects', () => {
        const noPath = makeCase({ projects: [{ isPrimary: false, project: { name: 'June' } }] });
        expect(getPrimaryProjectLabel(noPath)).toBe('June');
        expect(getPrimaryProjectLabel(cases[2])).toBe('');
    });
});

describe('searchCases', () => {
    it('returns all cases for an empty term', () => {
        expect(searchCases(cases, '')).toHaveLength(3);
        expect(searchCases(cases, '   ')).toHaveLength(3);
    });

    it('matches file number, client name, and id number case-insensitively', () => {
        expect(searchCases(cases, '208-ym8').map((c) => c.id)).toEqual(['case-2']);
        expect(searchCases(cases, 'samuel ph').map((c) => c.id)).toEqual(['case-2']);
        expect(searchCases(cases, '8001015').map((c) => c.id)).toEqual(['case-1']);
    });

    it('handles missing idNumber safely', () => {
        expect(searchCases(cases, 'makaleni').map((c) => c.id)).toEqual(['case-3']);
    });
});

describe('nextSortState', () => {
    it('cycles unsorted → asc → desc → unsorted on the same column', () => {
        const asc = nextSortState(null, 'client');
        expect(asc).toEqual({ column: 'client', direction: 'asc' });
        const desc = nextSortState(asc, 'client');
        expect(desc).toEqual({ column: 'client', direction: 'desc' });
        expect(nextSortState(desc, 'client')).toBeNull();
    });

    it('starts a different column at ascending', () => {
        expect(nextSortState({ column: 'client', direction: 'desc' }, 'status')).toEqual({
            column: 'status',
            direction: 'asc',
        });
    });
});

describe('sortCases', () => {
    it('returns the original order when no sort is active', () => {
        expect(sortCases(cases, null).map((c) => c.id)).toEqual(['case-1', 'case-2', 'case-3']);
    });

    it('does not mutate the input array', () => {
        const input = [...cases];
        sortCases(input, { column: 'client', direction: 'asc' });
        expect(input.map((c) => c.id)).toEqual(['case-1', 'case-2', 'case-3']);
    });

    it('sorts by file number ascending and descending', () => {
        expect(sortCases(cases, { column: 'fileNumber', direction: 'asc' }).map((c) => c.id)).toEqual([
            'case-3',
            'case-2',
            'case-1',
        ]);
        expect(sortCases(cases, { column: 'fileNumber', direction: 'desc' }).map((c) => c.id)).toEqual([
            'case-1',
            'case-2',
            'case-3',
        ]);
    });

    it('sorts by client name alphabetically', () => {
        expect(sortCases(cases, { column: 'client', direction: 'asc' }).map((c) => c.id)).toEqual([
            'case-2', // Samuel
            'case-3', // Selvyn
            'case-1', // Vonani
        ]);
    });

    it('sorts by status alphabetically', () => {
        expect(sortCases(cases, { column: 'status', direction: 'asc' }).map((c) => c.status)).toEqual([
            'DHS_REQUESTED',
            'NOT_LINKED',
            'REQUESTED_VIA_DHS',
        ]);
    });

    it('sorts by created/updated date chronologically', () => {
        expect(sortCases(cases, { column: 'created', direction: 'asc' }).map((c) => c.id)).toEqual([
            'case-2',
            'case-3',
            'case-1',
        ]);
        expect(sortCases(cases, { column: 'updated', direction: 'desc' }).map((c) => c.id)).toEqual([
            'case-1',
            'case-2',
            'case-3',
        ]);
    });

    it('sorts by last-updated-by name, with missing users last', () => {
        const withUsers: SortableCase[] = [
            makeCase({ id: 'u-none', updatedBy: null }),
            makeCase({ id: 'u-zandi', updatedBy: { firstName: 'Zandi', lastName: 'Mokoena' } }),
            makeCase({ id: 'u-aaron', updatedBy: { firstName: 'Aaron', lastName: 'Nzotho' } }),
        ];
        expect(sortCases(withUsers, { column: 'updatedBy', direction: 'asc' }).map((c) => c.id)).toEqual([
            'u-aaron',
            'u-zandi',
            'u-none',
        ]);
        expect(sortCases(withUsers, { column: 'updatedBy', direction: 'desc' }).map((c) => c.id)).toEqual([
            'u-zandi',
            'u-aaron',
            'u-none',
        ]);
    });

    it('sorts by next update chronologically, with missing dates last in either direction', () => {
        const withNext: SortableCase[] = [
            makeCase({ id: 'n-late', nextUpdate: '2026-06-20T08:00:00.000Z' }),
            makeCase({ id: 'n-none', nextUpdate: null }),
            makeCase({ id: 'n-early', nextUpdate: '2026-06-12T08:00:00.000Z' }),
        ];
        expect(sortCases(withNext, { column: 'nextUpdate', direction: 'asc' }).map((c) => c.id)).toEqual([
            'n-early',
            'n-late',
            'n-none',
        ]);
        expect(sortCases(withNext, { column: 'nextUpdate', direction: 'desc' }).map((c) => c.id)).toEqual([
            'n-late',
            'n-early',
            'n-none',
        ]);
    });

    it('always sorts empty project/type values last, regardless of direction', () => {
        const projAsc = sortCases(cases, { column: 'project', direction: 'asc' }).map((c) => c.id);
        const projDesc = sortCases(cases, { column: 'project', direction: 'desc' }).map((c) => c.id);
        expect(projAsc[projAsc.length - 1]).toBe('case-3');
        expect(projDesc[projDesc.length - 1]).toBe('case-3');

        const typeAsc = sortCases(cases, { column: 'type', direction: 'asc' }).map((c) => c.id);
        expect(typeAsc).toEqual(['case-2', 'case-1', 'case-3']);
    });
});
