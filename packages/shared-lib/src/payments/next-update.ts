// Per-app "next update" date — pure, Prisma-free helpers so they are unit-testable
// and safe to import in any runtime (browser/edge/server).
//
// Every app owns its OWN next-update row for a case. A date set in one app must
// NEVER surface in another. These helpers define the valid app keys and the
// overdue computation; the Prisma-backed read/write lives in
// ./case-app-next-update-service (Node-only).

/** The apps that each carry their own independent next-update date for a case. */
export const NEXT_UPDATE_APPS = [
    'CASES',
    'FINANCE',
    'LEGAL',
    'INSURANCE',
    'CREDO',
    'FORENSIC',
] as const;

export type NextUpdateApp = (typeof NEXT_UPDATE_APPS)[number];

/** Human labels per app. Finance presents its date as the "Next Payment Date". */
export const NEXT_UPDATE_LABELS: Record<NextUpdateApp, string> = {
    CASES: 'Next Update Date',
    FINANCE: 'Next Payment Date',
    LEGAL: 'Next Update Date',
    INSURANCE: 'Next Update Date',
    CREDO: 'Next Update Date',
    FORENSIC: 'Next Update Date',
};

export function isValidNextUpdateApp(app: string): app is NextUpdateApp {
    return (NEXT_UPDATE_APPS as readonly string[]).includes(app);
}

export function nextUpdateLabel(app: string): string {
    return isValidNextUpdateApp(app) ? NEXT_UPDATE_LABELS[app] : 'Next Update Date';
}

/**
 * A next-update date is overdue when it is set and falls strictly before `now`.
 * A null/undefined date is never overdue.
 */
export function isNextUpdateOverdue(
    nextUpdateDate: Date | string | null | undefined,
    now: Date = new Date()
): boolean {
    if (!nextUpdateDate) return false;
    const t = new Date(nextUpdateDate).getTime();
    if (Number.isNaN(t)) return false;
    return t < now.getTime();
}

/** Whole days until the next-update date. Negative when overdue, null when unset. */
export function daysUntilNextUpdate(
    nextUpdateDate: Date | string | null | undefined,
    now: Date = new Date()
): number | null {
    if (!nextUpdateDate) return null;
    const t = new Date(nextUpdateDate).getTime();
    if (Number.isNaN(t)) return null;
    return Math.ceil((t - now.getTime()) / (1000 * 60 * 60 * 24));
}
