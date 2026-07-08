import { describe, it, expect } from 'vitest';
import { buildProjectDisplayName, type ProjectNode } from './project-path';

// Hierarchy: ROOT › Letsatsi (source) › Mbombela (branch) › 2026 (year) › June (month)
const tree: ProjectNode[] = [
    { id: 'root', name: 'Zenowethu', parentId: null, type: 'ROOT' },
    { id: 'src', name: 'Letsatsi Referrals', parentId: 'root', type: 'ACQUISITION_SOURCE' },
    { id: 'branch', name: 'Mbombela', parentId: 'src', type: 'BRANCH' },
    { id: 'year', name: '2026', parentId: 'branch', type: 'YEAR' },
    { id: 'month', name: 'June', parentId: 'year', type: 'MONTH' },
];

describe('buildProjectDisplayName', () => {
    it('builds the full hierarchical name from the leaf project id', () => {
        // The leaf node is "June" — the bug was showing only this instead of the full path.
        expect(buildProjectDisplayName('month', tree)).toBe('Letsatsi Mbombela June 2026');
    });

    it('orders parts as source, branch, month, year regardless of tree depth order', () => {
        expect(buildProjectDisplayName('year', tree)).toBe('Letsatsi Mbombela 2026');
    });

    it('normalises Letsatsi variants and strips "My Cases" noise', () => {
        const t: ProjectNode[] = [
            { id: 'src', name: 'Letsatsi Finance', parentId: null, type: 'ACQUISITION_SOURCE' },
            { id: 'b', name: 'My Cases - Tembisa', parentId: 'src', type: 'BRANCH' },
        ];
        expect(buildProjectDisplayName('b', t)).toBe('Letsatsi Tembisa');
    });

    it('includes REFERRER sub-projects between source and month', () => {
        // Hierarchy: ROOT › Referrals (source) › William Maesela (referrer) › 2025 (year) › May (month)
        const t: ProjectNode[] = [
            { id: 'root', name: 'Zenowethu', parentId: null, type: 'ROOT' },
            { id: 'src', name: 'Referrals', parentId: 'root', type: 'ACQUISITION_SOURCE' },
            { id: 'ref', name: 'William Maesela', parentId: 'src', type: 'REFERRER' },
            { id: 'year', name: '2025', parentId: 'ref', type: 'YEAR' },
            { id: 'month', name: 'May', parentId: 'year', type: 'MONTH' },
        ];
        expect(buildProjectDisplayName('month', t)).toBe('Referrals William Maesela May 2025');
    });

    it('returns empty string when the project id is missing or not found', () => {
        expect(buildProjectDisplayName(null, tree)).toBe('');
        expect(buildProjectDisplayName(undefined, tree)).toBe('');
        expect(buildProjectDisplayName('does-not-exist', tree)).toBe('');
    });

    it('does not loop forever on a cyclic parent chain', () => {
        const cyclic: ProjectNode[] = [
            { id: 'a', name: 'A', parentId: 'b', type: 'BRANCH' },
            { id: 'b', name: 'B', parentId: 'a', type: 'BRANCH' },
        ];
        expect(() => buildProjectDisplayName('a', cyclic)).not.toThrow();
    });
});
