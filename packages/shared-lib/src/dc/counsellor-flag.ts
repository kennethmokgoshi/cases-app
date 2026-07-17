/**
 * Utility to identify flagged Debt Counsellors (Debt Busters, Octogen, NDC).
 * This file is browser-safe and does NOT import Prisma or Node-only APIs.
 */

export interface FlaggedDcResult {
    flagged: boolean;
    provider?: 'Debt Busters' | 'Octogen' | 'NDC';
    matchedName?: string;
}

/**
 * Checks if a given debt counsellor name or trading name belongs to flagged debt counsellors:
 * Debt Busters, Octogen, or NDC.
 */
export function checkFlaggedDebtCounsellor(name?: string | null): FlaggedDcResult {
    if (!name) {
        return { flagged: false };
    }

    const normalized = name.toLowerCase().trim();

    // Check for Debt Busters (includes "debt busters", "debtbusters")
    if (normalized.includes('debt busters') || normalized.includes('debtbusters')) {
        return { flagged: true, provider: 'Debt Busters', matchedName: name };
    }

    // Check for Octogen
    if (normalized.includes('octogen')) {
        return { flagged: true, provider: 'Octogen', matchedName: name };
    }

    // Check for NDC (using word boundary check to avoid false positives)
    const ndcRegex = /\bndc\b/i;
    if (
        ndcRegex.test(normalized) ||
        normalized.includes('national debt counsellors') ||
        normalized.includes('national debt counsel') ||
        normalized.includes('national debt advisors') ||
        normalized.includes('national debt advisor')
    ) {
        return { flagged: true, provider: 'NDC', matchedName: name };
    }

    return { flagged: false };
}

/**
 * Checks multiple name fields associated with a case/client to see if any are flagged.
 */
export function checkCaseFlaggedDC(caseData: {
    debtCounsellorName?: string | null;
    dcTradingName?: string | null;
    cb_debtCounsellor?: string | null;
}): FlaggedDcResult {
    const fields = [
        caseData.debtCounsellorName,
        caseData.dcTradingName,
        caseData.cb_debtCounsellor
    ];

    for (const val of fields) {
        const result = checkFlaggedDebtCounsellor(val);
        if (result.flagged) {
            return result;
        }
    }

    return { flagged: false };
}
