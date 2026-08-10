import { describe, expect, it } from 'vitest';
import { filterBranchHierarchy, filterTimelineYears, getDisplayMonthsForYear } from './b2b-sidebar-filters';

const branchHierarchy = [
    {
        name: 'Alberton 1',
        projectId: 'branch-alberton-1',
        totalCases: 10,
        years: [
            {
                name: '2026',
                projectId: 'year-alberton-1-2026',
                totalCases: 10,
                months: [
                    { name: 'March', projectId: 'month-alberton-1-2026-march', cases: 6 },
                    { name: 'June', projectId: 'month-alberton-1-2026-june', cases: 4 },
                ],
            },
        ],
    },
    {
        name: 'Athlone',
        projectId: 'branch-athlone',
        totalCases: 10,
        years: [
            {
                name: '2025',
                projectId: 'year-athlone-2025',
                totalCases: 10,
                months: [
                    { name: 'March', projectId: 'month-athlone-2025-march', cases: 10 },
                ],
            },
        ],
    },
];

const timelineData = {
    '2026': { months: { March: 1, June: 4 } },
    '2025': { months: { March: 10 } },
};

describe('filterBranchHierarchy', () => {
    it('returns every branch unfiltered when the query is empty', () => {
        expect(filterBranchHierarchy(branchHierarchy, '')).toEqual(branchHierarchy);
    });

    it('matches a branch (project) by name and keeps its subprojects unfiltered', () => {
        const result = filterBranchHierarchy(branchHierarchy, 'alberton');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Alberton 1');
        expect(result[0].years[0].months).toHaveLength(2);
    });

    it('matches a subproject (month) and narrows down to only that subproject', () => {
        const result = filterBranchHierarchy(branchHierarchy, 'june');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Alberton 1');
        expect(result[0].years[0].months).toEqual([
            { name: 'June', projectId: 'month-alberton-1-2026-june', cases: 4 },
        ]);
    });

    it('is case-insensitive', () => {
        expect(filterBranchHierarchy(branchHierarchy, 'ATHLONE')).toHaveLength(1);
    });

    it('returns no branches when nothing matches', () => {
        expect(filterBranchHierarchy(branchHierarchy, 'nonexistent-source')).toEqual([]);
    });
});

describe('filterTimelineYears', () => {
    it('returns every year unfiltered when the query is empty', () => {
        expect(filterTimelineYears(timelineData, '')).toEqual(['2026', '2025']);
    });

    it('matches a year (project) directly', () => {
        expect(filterTimelineYears(timelineData, '2025')).toEqual(['2025']);
    });

    it('matches a year via one of its subprojects (months)', () => {
        expect(filterTimelineYears(timelineData, 'june')).toEqual(['2026']);
    });

    it('returns no years when nothing matches', () => {
        expect(filterTimelineYears(timelineData, 'december')).toEqual([]);
    });
});

describe('getDisplayMonthsForYear', () => {
    it('returns all months for a year when the query is empty', () => {
        expect(getDisplayMonthsForYear(timelineData, '2026', '')).toEqual(['March', 'June']);
    });

    it('returns all months when the year itself matches the query', () => {
        expect(getDisplayMonthsForYear(timelineData, '2026', '2026')).toEqual(['March', 'June']);
    });

    it('narrows down to matching months when the year does not match', () => {
        expect(getDisplayMonthsForYear(timelineData, '2026', 'june')).toEqual(['June']);
    });
});
