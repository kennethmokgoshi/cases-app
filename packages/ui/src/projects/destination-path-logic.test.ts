import { describe, it, expect } from 'vitest';
import {
    DestinationProject,
    flattenProjectResponse,
    filterSourcesByClientType,
    getSubprojects,
    resolveProjectSelectionFromPath
} from './destination-path-logic';

const p = (
    id: string,
    type: string,
    extra: Partial<DestinationProject> = {}
): DestinationProject => ({ id, name: id, type, ...extra });

describe('flattenProjectResponse', () => {
    it('flattens a nested admin hierarchy recursively', () => {
        const hierarchy: DestinationProject = p('root', 'ROOT', {
            children: [
                p('letsatsi', 'ACQUISITION_SOURCE', {
                    children: [p('mthata', 'FOLDER'), p('2026', 'YEAR', { children: [p('july', 'MONTH')] })]
                })
            ]
        });
        const flat = flattenProjectResponse(hierarchy, null);
        expect(flat.map(x => x.id)).toEqual(['root', 'letsatsi', 'mthata', '2026', 'july']);
    });

    it('merges independent rows and deduplicates by id (member-scoped response)', () => {
        const independent = [
            p('src', 'ACQUISITION_SOURCE', { children: [p('branch', 'FOLDER')] }),
            p('branch', 'FOLDER', { parentId: 'src' }) // same project as its own flat row
        ];
        const flat = flattenProjectResponse(null, independent);
        expect(flat).toHaveLength(2);
        expect(flat.map(x => x.id).sort()).toEqual(['branch', 'src']);
        expect(flat.find(x => x.id === 'branch')?.parentId).toBe('src');
    });

    it('synthesizes parentId for nested children that omit it (member-scoped nesting)', () => {
        // The member-scoped API nests children one level deep without parentId
        // and without a separate flat row when the child itself isn't a member row.
        const independent = [
            p('src', 'ACQUISITION_SOURCE', { children: [p('branch', 'FOLDER')] })
        ];
        const flat = flattenProjectResponse(null, independent);
        expect(flat.find(x => x.id === 'branch')?.parentId).toBe('src');
    });

    it('walks subtrees of independent top-level projects (admin response — the "Referrals has no subprojects" bug)', () => {
        // "Referrals" (B2C) lives at the top level, outside the ROOT tree, so
        // it arrives in `independent` with its subtree nested by the API.
        const independent = [
            p('referrals', 'ACQUISITION_SOURCE', {
                clientType: 'B2C',
                children: [
                    p('kenneth', 'REFERRER', { parentId: 'referrals' }),
                    p('2026', 'YEAR', { parentId: 'referrals', children: [p('july', 'MONTH', { parentId: '2026' })] })
                ]
            })
        ];
        const flat = flattenProjectResponse(null, independent);
        expect(flat.map(x => x.id).sort()).toEqual(['2026', 'july', 'kenneth', 'referrals']);
        expect(getSubprojects('referrals', flat).map(x => x.id)).toEqual(['kenneth']);
    });

    it('upgrades an earlier parentId-less row when a duplicate with parentId arrives later', () => {
        const independent = [
            p('branch', 'FOLDER'), // flat row missing parentId
            p('src', 'ACQUISITION_SOURCE', { children: [p('branch', 'FOLDER')] })
        ];
        const flat = flattenProjectResponse(null, independent);
        expect(flat).toHaveLength(2);
        expect(flat.find(x => x.id === 'branch')?.parentId).toBe('src');
    });
});

describe('filterSourcesByClientType', () => {
    const sources = [
        p('letsatsi', 'ACQUISITION_SOURCE', { clientType: 'B2B' }),
        p('dealerships', 'ACQUISITION_SOURCE', { clientType: 'B2C' }),
        p('unclassified', 'ACQUISITION_SOURCE', { clientType: null }),
        p('letsatsi-referrals', 'ACQUISITION_SOURCE', { clientType: 'LEGACY' })
    ];

    it('B2B shows only B2B and unclassified sources', () => {
        expect(filterSourcesByClientType(sources, 'B2B').map(x => x.id))
            .toEqual(['letsatsi', 'unclassified']);
    });

    it('B2C shows only B2C and unclassified sources', () => {
        expect(filterSourcesByClientType(sources, 'B2C').map(x => x.id))
            .toEqual(['dealerships', 'unclassified']);
    });

    it('hides LEGACY (or any other marker) sources from both lists', () => {
        expect(filterSourcesByClientType(sources, 'B2B').map(x => x.id)).not.toContain('letsatsi-referrals');
        expect(filterSourcesByClientType(sources, 'B2C').map(x => x.id)).not.toContain('letsatsi-referrals');
    });
});

describe('getSubprojects', () => {
    const all = [
        p('referrals', 'ACQUISITION_SOURCE'),
        p('kenneth', 'REFERRER', { parentId: 'referrals' }),
        p('errol', 'REFERRER', { parentId: 'referrals' }),
        p('2026', 'YEAR', { parentId: 'referrals' }),
        p('july', 'MONTH', { parentId: '2026' }),
        p('letsatsi', 'ACQUISITION_SOURCE'),
        p('mthata', 'FOLDER', { parentId: 'letsatsi' }),
        p('deep-branch', 'BRANCH', { parentId: 'mthata' })
    ];

    it('includes REFERRER subprojects (previously invisible in the Move modal)', () => {
        expect(getSubprojects('referrals', all).map(x => x.id)).toEqual(['errol', 'kenneth']);
    });

    it('includes FOLDER and nested BRANCH descendants, sorted by name', () => {
        expect(getSubprojects('letsatsi', all).map(x => x.id)).toEqual(['deep-branch', 'mthata']);
    });

    it('never offers YEAR/MONTH structural folders', () => {
        const ids = getSubprojects('referrals', all).map(x => x.id);
        expect(ids).not.toContain('2026');
        expect(ids).not.toContain('july');
    });

    it('returns empty for a source with no subprojects', () => {
        expect(getSubprojects('missing', all)).toEqual([]);
    });
});

describe('resolveProjectSelectionFromPath', () => {
    it('preserves a REFERRER sub-project when opening a month project link', () => {
        const path = [
            p('root', 'ROOT'),
            p('referrals', 'ACQUISITION_SOURCE', { name: 'Referrals', clientType: 'B2C' }),
            p('william', 'REFERRER', { name: 'William Maesela', parentId: 'referrals' }),
            p('2025', 'YEAR', { parentId: 'william' }),
            p('may', 'MONTH', { name: 'May', parentId: '2025' }),
        ];

        expect(resolveProjectSelectionFromPath(path)).toEqual({
            parentId: 'referrals',
            subprojectId: 'william',
            acquisitionType: 'B2C',
            year: '2025',
            month: 'May',
        });
    });

    it('supports branch and folder sub-projects without requiring a referrer', () => {
        const path = [
            p('source', 'ACQUISITION_SOURCE', { clientType: 'B2B' }),
            p('folder', 'FOLDER', { parentId: 'source' }),
            p('branch', 'BRANCH', { parentId: 'folder' }),
            p('2026', 'YEAR', { parentId: 'branch' }),
        ];

        expect(resolveProjectSelectionFromPath(path)).toMatchObject({
            parentId: 'source',
            subprojectId: 'branch',
            acquisitionType: 'B2B',
            year: '2026',
        });
    });
});
