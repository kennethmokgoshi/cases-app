import { describe, it, expect } from 'vitest';
import {
    normalizeStatusCode,
    isClearanceEligibleCode,
    isAcceptedViaDhsCode,
    parseDhsDate,
    daysSinceCalendar,
    classifyClearanceWorkflowStatus,
    parseStatusHistoryRows,
    evaluateConsumerClearance,
    CLEARANCE_ELIGIBLE_CODES,
    CLEARANCE_READY_WINDOW_DAYS,
    ACCEPTED_VIA_DHS_CODES,
    type StatusHistoryEntry,
} from './status-history';

/** Build an entry whose status date is `daysAgo` calendar days before `from`. */
function entryDaysAgo(code: string, daysAgo: number, from: Date = new Date()): StatusHistoryEntry {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - daysAgo);
    const raw = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 12:00:00`;
    return { code: normalizeStatusCode(code), description: `desc-${code}`, rawDate: raw, statusDate: d };
}

describe('normalizeStatusCode', () => {
    it('uppercases and strips whitespace', () => {
        expect(normalizeStatusCode(' g1 ')).toBe('G1');
        expect(normalizeStatusCode('a1')).toBe('A1');
        expect(normalizeStatusCode('G')).toBe('G');
    });

    it('handles empty / nullish input', () => {
        expect(normalizeStatusCode('')).toBe('');
        expect(normalizeStatusCode(undefined as unknown as string)).toBe('');
    });
});

describe('isClearanceEligibleCode', () => {
    it('accepts all six eligible codes (case/space-insensitive)', () => {
        for (const code of CLEARANCE_ELIGIBLE_CODES) {
            expect(isClearanceEligibleCode(code)).toBe(true);
            expect(isClearanceEligibleCode(` ${code.toLowerCase()} `)).toBe(true);
        }
    });

    it('rejects non-eligible codes', () => {
        for (const code of ['A', 'C', 'F', 'D3', 'X', '']) {
            expect(isClearanceEligibleCode(code)).toBe(false);
        }
    });
});

describe('isAcceptedViaDhsCode', () => {
    it('accepts the active-debt-review codes (case/space-insensitive)', () => {
        for (const code of ACCEPTED_VIA_DHS_CODES) {
            expect(isAcceptedViaDhsCode(code)).toBe(true);
            expect(isAcceptedViaDhsCode(` ${code.toLowerCase()} `)).toBe(true);
        }
    });

    it('rejects clearance and unknown codes', () => {
        for (const code of ['A1', 'B', 'G', 'G1', 'F1', 'X', '']) {
            expect(isAcceptedViaDhsCode(code)).toBe(false);
        }
    });

    it('does not overlap with the clearance-eligible set', () => {
        for (const code of ACCEPTED_VIA_DHS_CODES) {
            expect(isClearanceEligibleCode(code)).toBe(false);
        }
        for (const code of CLEARANCE_ELIGIBLE_CODES) {
            expect(isAcceptedViaDhsCode(code)).toBe(false);
        }
    });
});

describe('parseDhsDate', () => {
    it('parses a date with time', () => {
        const d = parseDhsDate('2026-05-07 15:02:06');
        expect(d).not.toBeNull();
        expect(d?.getFullYear()).toBe(2026);
        expect(d?.getMonth()).toBe(4); // May (0-indexed)
        expect(d?.getDate()).toBe(7);
    });

    it('parses a bare date', () => {
        expect(parseDhsDate('2025-11-21')?.getDate()).toBe(21);
    });

    it('returns null for missing / invalid dates', () => {
        expect(parseDhsDate('')).toBeNull();
        expect(parseDhsDate('no date here')).toBeNull();
        expect(parseDhsDate('2026-13-01')).toBeNull(); // invalid month
        expect(parseDhsDate('2026-02-31')).toBeNull(); // rolls over → rejected
    });
});

describe('daysSinceCalendar', () => {
    it('counts whole calendar days regardless of time-of-day', () => {
        const now = new Date(2026, 5, 27, 8, 0, 0);
        const status = new Date(2026, 5, 20, 23, 0, 0); // 7 calendar days earlier
        expect(daysSinceCalendar(status, now)).toBe(7);
    });

    it('returns 0 for same calendar day', () => {
        const now = new Date(2026, 5, 27, 23, 0, 0);
        const status = new Date(2026, 5, 27, 1, 0, 0);
        expect(daysSinceCalendar(status, now)).toBe(0);
    });
});

describe('classifyClearanceWorkflowStatus', () => {
    it('is READY_CLEARANCE below the window', () => {
        expect(classifyClearanceWorkflowStatus(0)).toBe('READY_CLEARANCE');
        expect(classifyClearanceWorkflowStatus(6)).toBe('READY_CLEARANCE');
        expect(classifyClearanceWorkflowStatus(CLEARANCE_READY_WINDOW_DAYS - 1)).toBe('READY_CLEARANCE');
    });

    it('is COMPLETED at or above the window', () => {
        expect(classifyClearanceWorkflowStatus(CLEARANCE_READY_WINDOW_DAYS)).toBe('COMPLETED');
        expect(classifyClearanceWorkflowStatus(8)).toBe('COMPLETED');
        expect(classifyClearanceWorkflowStatus(365)).toBe('COMPLETED');
    });
});

describe('parseStatusHistoryRows', () => {
    it('parses the real-world popup table from the screenshot', () => {
        const rows = [
            ['CODE', 'STATUS DESCRIPTION', 'STATUS DATE'],
            [
                'G',
                'Magistrate rescinded the debt review court order/consumer opposed debt review application and has been declared not over-indebted. (Option C on Form 17.W)',
                '2026-05-07 15:02:06',
            ],
            ['C', 'Assessment has resulted in a decision that the consumer is over-indebted', '2025-11-21 11:12:36'],
            ['A', 'Applied for debt counselling and being assessed', '2025-10-15 15:25:47'],
        ];
        const entries = parseStatusHistoryRows(rows);
        expect(entries).toHaveLength(3); // header skipped
        expect(entries[0].code).toBe('G');
        expect(entries[0].statusDate?.getFullYear()).toBe(2026);
        expect(entries[0].description).toContain('Option C on Form 17.W');
        expect(entries[1].code).toBe('C');
        expect(entries[2].code).toBe('A');
    });

    it('skips blank rows', () => {
        const rows = [['', '', ''], ['G1', 'Some description', '2026-06-01']];
        const entries = parseStatusHistoryRows(rows);
        expect(entries).toHaveLength(1);
        expect(entries[0].code).toBe('G1');
    });

    it('returns empty for no data rows', () => {
        expect(parseStatusHistoryRows([['CODE', 'STATUS DESCRIPTION', 'STATUS DATE']])).toEqual([]);
        expect(parseStatusHistoryRows([])).toEqual([]);
    });
});

describe('evaluateConsumerClearance', () => {
    const now = new Date(2026, 5, 27); // 2026-06-27

    it('flags READY_CLEARANCE when the latest eligible status is < 7 days old', () => {
        const entries = [entryDaysAgo('G', 3, now), entryDaysAgo('C', 200, now)];
        const result = evaluateConsumerClearance(entries, now);
        expect(result.eligible).toBe(true);
        expect(result.currentCode).toBe('G');
        expect(result.daysSinceStatus).toBe(3);
        expect(result.workflowStatus).toBe('READY_CLEARANCE');
    });

    it('flags COMPLETED when the latest eligible status is >= 7 days old', () => {
        const entries = [entryDaysAgo('G', 10, now), entryDaysAgo('C', 200, now)];
        const result = evaluateConsumerClearance(entries, now);
        expect(result.eligible).toBe(true);
        expect(result.workflowStatus).toBe('COMPLETED');
        expect(result.daysSinceStatus).toBe(10);
    });

    it('treats exactly 7 days as COMPLETED (boundary)', () => {
        const result = evaluateConsumerClearance([entryDaysAgo('A1', 7, now)], now);
        expect(result.workflowStatus).toBe('COMPLETED');
    });

    it('recognises all eligible codes when current', () => {
        for (const code of CLEARANCE_ELIGIBLE_CODES) {
            const result = evaluateConsumerClearance([entryDaysAgo(code, 1, now)], now);
            expect(result.eligible).toBe(true);
            expect(result.workflowStatus).toBe('READY_CLEARANCE');
        }
    });

    it('maps active debt-review codes (A/C/D3/D4) to ACCEPTED_VIA_DHS', () => {
        for (const code of ACCEPTED_VIA_DHS_CODES) {
            const result = evaluateConsumerClearance([entryDaysAgo(code, 5, now)], now);
            expect(result.eligible).toBe(false); // not a clearance state
            expect(result.currentCode).toBe(code);
            expect(result.workflowStatus).toBe('ACCEPTED_VIA_DHS');
        }
    });

    it('treats a more recent accepted (C) status as ACCEPTED_VIA_DHS over an older clearance (G)', () => {
        const entries = [entryDaysAgo('C', 1, now), entryDaysAgo('G', 30, now)];
        const result = evaluateConsumerClearance(entries, now);
        expect(result.eligible).toBe(false);
        expect(result.currentCode).toBe('C');
        expect(result.workflowStatus).toBe('ACCEPTED_VIA_DHS');
    });

    it('returns null workflowStatus for an unrecognised current code', () => {
        const entries = [entryDaysAgo('Z9', 1, now), entryDaysAgo('G', 30, now)];
        const result = evaluateConsumerClearance(entries, now);
        expect(result.eligible).toBe(false);
        expect(result.currentCode).toBe('Z9');
        expect(result.workflowStatus).toBeNull();
    });

    it('uses the most recent entry by date, not input order', () => {
        const entries = [entryDaysAgo('C', 30, now), entryDaysAgo('G', 2, now)];
        const result = evaluateConsumerClearance(entries, now);
        expect(result.currentCode).toBe('G');
        expect(result.workflowStatus).toBe('READY_CLEARANCE');
    });

    it('is eligible but unclassified when the eligible status date is unparseable', () => {
        const entries: StatusHistoryEntry[] = [
            { code: 'G', description: 'rescinded', rawDate: 'unknown', statusDate: null },
        ];
        const result = evaluateConsumerClearance(entries, now);
        expect(result.eligible).toBe(true);
        expect(result.workflowStatus).toBeNull();
        expect(result.notes.join(' ')).toMatch(/could not be parsed/i);
    });

    it('returns not-eligible for empty history', () => {
        const result = evaluateConsumerClearance([], now);
        expect(result.eligible).toBe(false);
        expect(result.currentCode).toBeNull();
        expect(result.notes.join(' ')).toMatch(/no status history/i);
    });
});
