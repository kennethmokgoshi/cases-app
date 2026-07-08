import { describe, expect, it } from 'vitest';

import { findProjectById, getProjectAncestorIds } from './project-directory';

const projects = [
    { id: 'root', parentId: null, name: 'Root' },
    { id: 'branch', parentId: 'root', name: 'Branch' },
    { id: 'month', parentId: 'branch', name: 'May' },
];

describe('project-directory helpers', () => {
    it('finds the requested project by id', () => {
        expect(findProjectById(projects, 'month')).toEqual({
            id: 'month',
            parentId: 'branch',
            name: 'May',
        });
    });

    it('returns null for a missing project id', () => {
        expect(findProjectById(projects, 'missing')).toBeNull();
        expect(findProjectById(projects, null)).toBeNull();
    });

    it('returns ancestor ids from root to direct parent', () => {
        expect(getProjectAncestorIds(projects, 'month')).toEqual(['root', 'branch']);
    });

    it('returns an empty ancestor list for unknown projects', () => {
        expect(getProjectAncestorIds(projects, 'missing')).toEqual([]);
        expect(getProjectAncestorIds(projects, null)).toEqual([]);
    });
});
