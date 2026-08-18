import { describe, it, expect } from 'vitest';
import {
    buildInstalmentSchedule,
    deriveScheduleFromMandate,
    computeInstalmentStatus,
    reconcileInstalments,
    summariseArrangement,
} from './arrangement-logic';

describe('buildInstalmentSchedule', () => {
    it('splits a total evenly with the remainder on the last line', () => {
        const lines = buildInstalmentSchedule({
            totalAmount: 1000,
            numInstalments: 3,
            frequency: 'MONTHLY',
            firstDueDate: '2026-07-01',
        });
        expect(lines).toHaveLength(3);
        expect(lines.map((l) => l.amountDue)).toEqual([333.33, 333.33, 333.34]);
        const sum = lines.reduce((s, l) => s + l.amountDue, 0);
        expect(Math.round(sum * 100) / 100).toBe(1000);
    });

    it('uses a fixed per-instalment amount when provided', () => {
        const lines = buildInstalmentSchedule({
            perInstalmentAmount: 500,
            numInstalments: 4,
            frequency: 'MONTHLY',
            firstDueDate: '2026-07-15',
        });
        expect(lines.map((l) => l.amountDue)).toEqual([500, 500, 500, 500]);
    });

    it('advances monthly dates and pins to day-of-month', () => {
        const lines = buildInstalmentSchedule({
            perInstalmentAmount: 100,
            numInstalments: 3,
            frequency: 'MONTHLY',
            firstDueDate: '2026-01-31',
            dayOfMonth: 31,
        });
        // Feb clamps to 28 (2026 is not a leap year)
        expect(lines[0].dueDate.getMonth()).toBe(0); // Jan
        expect(lines[1].dueDate.getMonth()).toBe(1); // Feb
        expect(lines[1].dueDate.getDate()).toBe(28);
        expect(lines[2].dueDate.getDate()).toBe(31); // Mar
    });

    it('advances weekly dates by 7 days', () => {
        const lines = buildInstalmentSchedule({
            perInstalmentAmount: 100,
            numInstalments: 3,
            frequency: 'WEEKLY',
            firstDueDate: '2026-07-01',
        });
        expect(lines[1].dueDate.getTime() - lines[0].dueDate.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('collapses ONCE to a single lump-sum line', () => {
        const lines = buildInstalmentSchedule({
            totalAmount: 750,
            numInstalments: 3,
            frequency: 'ONCE',
            firstDueDate: '2026-07-01',
        });
        expect(lines).toHaveLength(1);
        expect(lines[0].amountDue).toBe(750);
    });
});

describe('deriveScheduleFromMandate', () => {
    it('builds a schedule from approved mandate terms', () => {
        const schedule = deriveScheduleFromMandate({
            amount: 1200,
            frequency: 'MONTHLY',
            numInstalments: 6,
            debitOrderDay: 25,
            firstCollectionDate: '2026-07-25',
        });
        expect(schedule).not.toBeNull();
        expect(schedule!).toHaveLength(6);
        expect(schedule!.every((l) => l.amountDue === 1200)).toBe(true);
        expect(schedule![1].dueDate.getDate()).toBe(25);
    });

    it('returns null when terms are missing', () => {
        expect(deriveScheduleFromMandate({ amount: null, numInstalments: 6, firstCollectionDate: '2026-07-25' })).toBeNull();
        expect(deriveScheduleFromMandate({ amount: 1200, numInstalments: 0, firstCollectionDate: '2026-07-25' })).toBeNull();
        expect(deriveScheduleFromMandate({ amount: 1200, numInstalments: 6, firstCollectionDate: null })).toBeNull();
    });
});

describe('computeInstalmentStatus', () => {
    const now = new Date('2026-06-26T00:00:00Z');
    it('is PAID when fully covered', () => {
        expect(computeInstalmentStatus(100, 100, new Date('2026-07-01'), now)).toBe('PAID');
    });
    it('is MISSED when past due and unpaid', () => {
        expect(computeInstalmentStatus(100, 0, new Date('2026-06-01'), now)).toBe('MISSED');
    });
    it('is PARTIAL when partly paid and not yet due', () => {
        expect(computeInstalmentStatus(100, 40, new Date('2026-07-01'), now)).toBe('PARTIAL');
    });
    it('is PENDING when unpaid and not yet due', () => {
        expect(computeInstalmentStatus(100, 0, new Date('2026-07-01'), now)).toBe('PENDING');
    });
});

describe('reconcileInstalments', () => {
    const now = new Date('2026-06-26T00:00:00Z');
    const lines = [
        { sequence: 1, dueDate: new Date('2026-05-01'), amountDue: 100 },
        { sequence: 2, dueDate: new Date('2026-06-01'), amountDue: 100 },
        { sequence: 3, dueDate: new Date('2026-07-01'), amountDue: 100 },
    ];

    it('allocates a paid pool FIFO by due date', () => {
        const r = reconcileInstalments(lines, 150, now);
        expect(r[0]).toMatchObject({ amountPaid: 100, balance: 0, status: 'PAID' });
        expect(r[1]).toMatchObject({ amountPaid: 50, balance: 50, status: 'MISSED' }); // past due, partial
        expect(r[2]).toMatchObject({ amountPaid: 0, balance: 100, status: 'PENDING' });
    });

    it('treats a manual PAID override as fully paid without drawing the pool', () => {
        const withManual = [
            { ...lines[0], status: 'PAID' as const },
            lines[1],
            lines[2],
        ];
        const r = reconcileInstalments(withManual, 100, now);
        expect(r[0]).toMatchObject({ amountPaid: 100, status: 'PAID' });
        // pool of 100 flows to line 2 instead
        expect(r[1]).toMatchObject({ amountPaid: 100, status: 'PAID' });
    });

    it('excludes WAIVED lines from the balance', () => {
        const withWaived = [lines[0], { ...lines[1], status: 'WAIVED' as const }, lines[2]];
        const r = reconcileInstalments(withWaived, 0, now);
        expect(r[1]).toMatchObject({ status: 'WAIVED', balance: 0 });
    });
});

describe('summariseArrangement', () => {
    const now = new Date('2026-06-26T00:00:00Z');

    it('reports next payment, balance and DEFAULTED when an instalment is missed', () => {
        const reconciled = reconcileInstalments(
            [
                { sequence: 1, dueDate: new Date('2026-05-01'), amountDue: 100 },
                { sequence: 2, dueDate: new Date('2026-07-01'), amountDue: 100 },
            ],
            0,
            now
        );
        const s = summariseArrangement(reconciled, now);
        expect(s.totalDue).toBe(200);
        expect(s.totalPaid).toBe(0);
        expect(s.balance).toBe(200);
        expect(s.missedCount).toBe(1);
        expect(s.status).toBe('DEFAULTED');
        // next unsettled is the earliest by date = the missed line
        expect(s.nextPaymentDate?.toISOString().slice(0, 10)).toBe('2026-05-01');
        expect(s.isOverdue).toBe(true);
    });

    it('reports COMPLETED when everything is paid', () => {
        const reconciled = reconcileInstalments(
            [
                { sequence: 1, dueDate: new Date('2026-05-01'), amountDue: 100 },
                { sequence: 2, dueDate: new Date('2026-06-01'), amountDue: 100 },
            ],
            200,
            now
        );
        const s = summariseArrangement(reconciled, now);
        expect(s.status).toBe('COMPLETED');
        expect(s.balance).toBe(0);
        expect(s.nextPaymentDate).toBeNull();
        expect(s.isOverdue).toBe(false);
    });
});

describe('reconcileInstalments — explicit per-month allocation', () => {
    const now = new Date('2027-03-01T00:00:00Z');

    // A 7-month schedule of R500. Months are pinned individually so a skipped
    // month stays skipped instead of swallowing later months' money.
    function sevenMonths() {
        return Array.from({ length: 7 }, (_, i) => ({
            id: `inst-${i + 1}`,
            sequence: i + 1,
            dueDate: new Date(Date.UTC(2026, 7 + i, 1)),
            amountDue: 500,
        }));
    }

    it('keeps month 3 unpaid while months 4 and 5 read paid', () => {
        const lines = sevenMonths();
        const allocated = lines.map((l) =>
            [1, 2, 4, 5].includes(l.sequence)
                ? { ...l, allocations: [{ paymentId: `p${l.sequence}`, amount: 500 }] }
                : l
        );
        const r = reconcileInstalments(allocated, 0, now);

        expect(r[0].status).toBe('PAID');
        expect(r[1].status).toBe('PAID');
        expect(r[2]).toMatchObject({ status: 'MISSED', amountPaid: 0, balance: 500 });
        expect(r[3].status).toBe('PAID');
        expect(r[4].status).toBe('PAID');
    });

    it('records two payments in one month and reports the overpayment', () => {
        const lines = sevenMonths();
        const allocated = lines.map((l) =>
            l.sequence === 7
                ? {
                      ...l,
                      allocations: [
                          { paymentId: 'p7a', amount: 500 },
                          { paymentId: 'p7b', amount: 300 },
                      ],
                  }
                : l
        );
        const r = reconcileInstalments(allocated, 0, now);

        expect(r[6]).toMatchObject({ status: 'PAID', amountPaid: 800, paymentCount: 2, overpaid: 300 });
    });

    it('flags a month as brought forward when its proof was captured after a later month', () => {
        const lines = sevenMonths();
        const allocated = lines.map((l) => {
            if (l.sequence === 3) {
                // Month 3's proof only arrived in February — after month 7 was captured.
                return { ...l, allocations: [{ amount: 500, recordedAt: new Date('2027-02-20') }] };
            }
            if (l.sequence === 7) {
                return { ...l, allocations: [{ amount: 500, recordedAt: new Date('2027-02-01') }] };
            }
            return l;
        });
        const r = reconcileInstalments(allocated, 0, now);

        expect(r[2]).toMatchObject({ status: 'PAID', broughtForward: true });
        expect(r[6]).toMatchObject({ status: 'PAID', broughtForward: false });
    });

    it('does not let pinned money leak onto other months', () => {
        // R500 pinned to month 5 must not settle the older, unpaid month 1.
        const lines = sevenMonths();
        const allocated = lines.map((l) =>
            l.sequence === 5 ? { ...l, allocations: [{ amount: 500 }] } : l
        );
        const r = reconcileInstalments(allocated, 0, now);

        expect(r[0]).toMatchObject({ status: 'MISSED', amountPaid: 0 });
        expect(r[4]).toMatchObject({ status: 'PAID', amountPaid: 500 });
    });

    it('still fills the oldest open month from unpinned money', () => {
        const lines = sevenMonths();
        const allocated = lines.map((l) =>
            l.sequence === 4 ? { ...l, allocations: [{ amount: 500 }] } : l
        );
        // R500 captured with no month chosen lands on month 1, the oldest open one.
        const r = reconcileInstalments(allocated, 500, now);

        expect(r[0]).toMatchObject({ status: 'PAID', amountPaid: 500 });
        expect(r[1]).toMatchObject({ status: 'MISSED', amountPaid: 0 });
        expect(r[3]).toMatchObject({ status: 'PAID', amountPaid: 500 });
    });

    it('keeps a month staff marked as not paid even before it falls due', () => {
        const future = [{ id: 'f1', sequence: 1, dueDate: new Date('2027-12-01'), amountDue: 500, status: 'MISSED' as const }];
        const r = reconcileInstalments(future, 0, now);
        expect(r[0]).toMatchObject({ status: 'MISSED', isOverdue: true });
    });
});

describe('summariseArrangement — month counts', () => {
    const now = new Date('2027-03-01T00:00:00Z');

    it('counts how many months are paid, missed and still to come', () => {
        const lines = Array.from({ length: 7 }, (_, i) => ({
            id: `i${i + 1}`,
            sequence: i + 1,
            dueDate: new Date(Date.UTC(2026, 7 + i, 1)),
            amountDue: 500,
            allocations: [1, 2, 4, 5].includes(i + 1) ? [{ amount: 500 }] : [],
        }));
        const s = summariseArrangement(reconcileInstalments(lines, 0, now), now);

        expect(s.instalmentCount).toBe(7);
        expect(s.paidCount).toBe(4);
        expect(s.missedCount).toBe(3); // months 3, 6, 7 — all past due and unpaid
        expect(s.outstandingCount).toBe(3);
        expect(s.allocatedPaymentCount).toBe(4);
    });
});
