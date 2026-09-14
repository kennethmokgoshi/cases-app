import { describe, expect, it, vi } from 'vitest';

// extraction.ts only needs `delay` from the browser module — stub it so the test
// never pulls in the Puppeteer singleton or DHS credential lookup.
vi.mock('./browser', () => ({
    delay: vi.fn().mockResolvedValue(undefined),
}));

import { parseDeclineTransactionFooter } from './extraction';

describe('parseDeclineTransactionFooter', () => {
    it('reads the real decline date from a DHS transaction footer', () => {
        const { performedBy, declinedAt } = parseDeclineTransactionFooter(
            'Transaction performed by Benay Sager  @ 2026-09-04 14:02:07 PM'
        );

        expect(performedBy).toBe('Benay Sager');
        // DHS renders SAST (UTC+2), so 14:02:07 local is 12:02:07Z.
        expect(declinedAt?.toISOString()).toBe('2026-09-04T12:02:07.000Z');
    });

    it('does not double-shift a 24-hour clock that still carries a PM suffix', () => {
        const { declinedAt } = parseDeclineTransactionFooter(
            'Transaction performed by Someone @ 2026-09-04 18:30:00 PM'
        );

        expect(declinedAt?.toISOString()).toBe('2026-09-04T16:30:00.000Z');
    });

    it('honours a genuine 12-hour PM reading', () => {
        const { declinedAt } = parseDeclineTransactionFooter(
            'Transaction performed by Someone @ 2026-09-04 01:05:00 PM'
        );

        expect(declinedAt?.toISOString()).toBe('2026-09-04T11:05:00.000Z');
    });

    it('maps 12 AM to midnight', () => {
        const { declinedAt } = parseDeclineTransactionFooter(
            'Transaction performed by Someone @ 2026-09-04 12:15:00 AM'
        );

        expect(declinedAt?.toISOString()).toBe('2026-09-03T22:15:00.000Z');
    });

    it('parses a footer with no seconds and no meridiem', () => {
        const { declinedAt } = parseDeclineTransactionFooter(
            'Transaction performed by A. Nkosi @ 2026-06-24 09:00'
        );

        expect(declinedAt?.toISOString()).toBe('2026-06-24T07:00:00.000Z');
    });

    it('returns nothing usable when the footer is missing or unrecognised', () => {
        expect(parseDeclineTransactionFooter(null)).toEqual({});
        expect(parseDeclineTransactionFooter('')).toEqual({});
        expect(parseDeclineTransactionFooter('Some unrelated page text')).toEqual({});
    });

    it('rejects a future timestamp rather than poisoning the case record', () => {
        const nextYear = new Date().getUTCFullYear() + 1;
        const { performedBy, declinedAt } = parseDeclineTransactionFooter(
            `Transaction performed by Someone @ ${nextYear}-01-01 10:00:00 AM`
        );

        expect(performedBy).toBe('Someone');
        expect(declinedAt).toBeUndefined();
    });
});
