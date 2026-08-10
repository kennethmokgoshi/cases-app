// Pure search/filter helpers for the B2B sidebar's Sources and Timeline trees.
// Kept dependency-free (no 'use client' / Next.js imports) so they can be unit
// tested without pulling in next-auth via the sidebar component.

export type MonthNode = {
    name: string;
    projectId: string;
    cases: number;
};

export type YearNode = {
    name: string;
    projectId: string;
    totalCases: number;
    months: MonthNode[];
};

export type BranchNode = {
    name: string;
    projectId: string;
    totalCases: number;
    years: YearNode[];
};

/**
 * Filters the Sources tree (Branch → Year → Month) by a search query.
 * A branch is kept if its own name matches, or if any of its subprojects
 * (years/months) match. When the branch itself matches, its subprojects are
 * returned unfiltered; otherwise only the matching years/months are kept.
 */
export function filterBranchHierarchy(branches: BranchNode[], query: string): BranchNode[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return branches;

    return branches.reduce<BranchNode[]>((acc, branch) => {
        const branchMatches = branch.name.toLowerCase().includes(normalized);

        if (branchMatches) {
            acc.push(branch);
            return acc;
        }

        const filteredYears = branch.years.reduce<YearNode[]>((yearAcc, year) => {
            const yearMatches = year.name.toLowerCase().includes(normalized);
            const filteredMonths = yearMatches
                ? year.months
                : year.months.filter(m => m.name.toLowerCase().includes(normalized));

            if (yearMatches || filteredMonths.length > 0) {
                yearAcc.push({ ...year, months: filteredMonths });
            }
            return yearAcc;
        }, []);

        if (filteredYears.length > 0) {
            acc.push({ ...branch, years: filteredYears });
        }
        return acc;
    }, []);
}

/**
 * Filters the Timeline tree (Year → Month) by a search query. A year is kept
 * if its own name matches, or if any of its subprojects (months) match.
 */
export function filterTimelineYears(timelineData: Record<string, { months: Record<string, number> }>, query: string): string[] {
    const years = Object.keys(timelineData).sort((a, b) => b.localeCompare(a));
    const normalized = query.trim().toLowerCase();
    if (!normalized) return years;

    return years.filter(year => {
        if (year.toLowerCase().includes(normalized)) return true;
        return Object.keys(timelineData[year].months).some(m => m.toLowerCase().includes(normalized));
    });
}

/**
 * Returns the months to render for a given Timeline year, narrowed to
 * matches when the year itself doesn't match the search query.
 */
export function getDisplayMonthsForYear(timelineData: Record<string, { months: Record<string, number> }>, year: string, query: string): string[] {
    const months = Object.keys(timelineData[year]?.months || {});
    const normalized = query.trim().toLowerCase();
    if (!normalized) return months;
    if (year.toLowerCase().includes(normalized)) return months;
    return months.filter(m => m.toLowerCase().includes(normalized));
}
