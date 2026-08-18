// Payment arrangement logic — pure, Prisma-free, fully unit-testable.
//
// A payment arrangement is a promise-to-pay made up of one or more dated
// instalments. It can be typed manually or derived from an approved debit-order
// mandate. These helpers build the schedule, reconcile recorded payments against
// instalments, and summarise the arrangement to drive the Finance "Next Payment
// Date" display and the per-app overdue trigger.

export type ArrangementFrequency = 'MONTHLY' | 'WEEKLY' | 'ONCE';

export type InstalmentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'MISSED' | 'WAIVED';

export interface ScheduleInput {
    /** Total amount of the whole arrangement. Ignored when perInstalmentAmount is given. */
    totalAmount?: number | string;
    /** Fixed amount per instalment (e.g. from a debit-order mandate). */
    perInstalmentAmount?: number | string;
    numInstalments: number;
    frequency: ArrangementFrequency;
    /** Date the first instalment is due. */
    firstDueDate: Date | string;
    /** Optional day-of-month to pin monthly instalments to (1–31, clamped). */
    dayOfMonth?: number | null;
}

export interface ScheduledInstalment {
    sequence: number;
    dueDate: Date;
    amountDue: number;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return Math.min(Math.max(1, day), lastDay);
}

/** Add whole months, optionally pinning to a specific day-of-month (clamped to month length). */
function addMonths(base: Date, months: number, dayOfMonth?: number | null): Date {
    const d = new Date(base);
    const targetMonth = d.getMonth() + months;
    const year = d.getFullYear() + Math.floor(targetMonth / 12);
    const monthIndex = ((targetMonth % 12) + 12) % 12;
    const day = clampDayOfMonth(year, monthIndex, dayOfMonth ?? d.getDate());
    return new Date(year, monthIndex, day, d.getHours(), d.getMinutes(), d.getSeconds());
}

function addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
}

/**
 * Build a dated instalment schedule.
 *
 * - If `perInstalmentAmount` is given, every instalment is that fixed amount.
 * - Otherwise `totalAmount` is split evenly across instalments, with the final
 *   instalment absorbing any rounding remainder so the lines sum exactly to total.
 */
export function buildInstalmentSchedule(input: ScheduleInput): ScheduledInstalment[] {
    const n = Math.max(1, Math.floor(input.numInstalments));
    const first = new Date(input.firstDueDate);
    if (Number.isNaN(first.getTime())) {
        throw new Error('buildInstalmentSchedule: invalid firstDueDate');
    }

    const amounts: number[] = [];
    if (input.perInstalmentAmount !== undefined && input.perInstalmentAmount !== null) {
        const per = round2(Number(input.perInstalmentAmount));
        for (let i = 0; i < n; i++) amounts.push(per);
    } else {
        const total = round2(Number(input.totalAmount ?? 0));
        const per = round2(total / n);
        let allocated = 0;
        for (let i = 0; i < n - 1; i++) {
            amounts.push(per);
            allocated = round2(allocated + per);
        }
        amounts.push(round2(total - allocated)); // last absorbs the remainder
    }

    const schedule: ScheduledInstalment[] = [];
    for (let i = 0; i < n; i++) {
        let dueDate: Date;
        if (i === 0) {
            dueDate = first;
        } else if (input.frequency === 'WEEKLY') {
            dueDate = addDays(first, 7 * i);
        } else if (input.frequency === 'ONCE') {
            dueDate = first; // ONCE collapses to a single line (n is forced to 1 below)
        } else {
            dueDate = addMonths(first, i, input.dayOfMonth);
        }
        schedule.push({ sequence: i + 1, dueDate, amountDue: amounts[i] });
    }

    // ONCE means a single lump-sum line regardless of numInstalments.
    if (input.frequency === 'ONCE') {
        const totalDue = round2(amounts.reduce((s, a) => s + a, 0));
        return [{ sequence: 1, dueDate: first, amountDue: totalDue }];
    }

    return schedule;
}

export interface MandateLikeTerms {
    amount?: number | string | null;
    frequency?: string | null; // MONTHLY | WEEKLY
    numInstalments?: number | null;
    debitOrderDay?: number | null;
    firstCollectionDate?: Date | string | null;
}

/**
 * Derive an instalment schedule from an approved debit-order mandate.
 * Uses the mandate's fixed amount per collection, its frequency, count, day and
 * first collection date. Returns null when the mandate lacks the terms needed.
 */
export function deriveScheduleFromMandate(mandate: MandateLikeTerms): ScheduledInstalment[] | null {
    const amount = mandate.amount === null || mandate.amount === undefined ? NaN : Number(mandate.amount);
    const num = mandate.numInstalments ?? 0;
    if (!amount || amount <= 0 || !num || num < 1) return null;
    if (!mandate.firstCollectionDate) return null;

    const frequency: ArrangementFrequency = mandate.frequency === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY';
    return buildInstalmentSchedule({
        perInstalmentAmount: amount,
        numInstalments: num,
        frequency,
        firstDueDate: mandate.firstCollectionDate,
        dayOfMonth: frequency === 'MONTHLY' ? mandate.debitOrderDay ?? null : null,
    });
}

export interface ReconcileInstalment {
    /** Optional DB id, carried through so callers can act on the line. */
    id?: string;
    sequence: number;
    dueDate: Date | string;
    amountDue: number | string;
    /** Manual override — when WAIVED the instalment is excluded from the balance. */
    status?: InstalmentStatus;
    /** Already-recorded paid amount for this line (manual confirmation). */
    amountPaid?: number | string;
    /** Payments staff explicitly pinned to this instalment (month). */
    allocations?: InstalmentAllocation[];
}

/** One recorded payment deliberately applied to a specific instalment. */
export interface InstalmentAllocation {
    paymentId?: string;
    amount: number | string;
    /** Date the consumer paid (the payment's own date). */
    paidOn?: Date | string;
    /** When staff captured it. Drives brought-forward detection. */
    recordedAt?: Date | string;
    reference?: string | null;
}

export interface ReconciledInstalment {
    id?: string;
    sequence: number;
    dueDate: Date;
    amountDue: number;
    amountPaid: number;
    balance: number;
    status: InstalmentStatus;
    isOverdue: boolean;
    /** Paid above what this month asked for — e.g. two payments in one month. */
    overpaid: number;
    /** How many separate payments landed on this month. */
    paymentCount: number;
    /**
     * True when this month's proof was captured only after a LATER month had
     * already been captured — i.e. staff back-dated it. Surfaces the "proof
     * brought forward" case in the UI.
     */
    broughtForward: boolean;
    allocations: InstalmentAllocation[];
}

/**
 * Compute the effective status of one instalment from its due/paid amounts.
 * An unpaid/partly-paid instalment whose due date has passed is MISSED.
 */
export function computeInstalmentStatus(
    amountDue: number,
    amountPaid: number,
    dueDate: Date,
    now: Date
): InstalmentStatus {
    if (amountPaid >= amountDue && amountDue > 0) return 'PAID';
    const past = dueDate.getTime() < now.getTime();
    if (past) return 'MISSED';
    if (amountPaid > 0) return 'PARTIAL';
    return 'PENDING';
}

/** Sum of a line's explicitly allocated payments. */
function allocatedTotal(allocations: InstalmentAllocation[]): number {
    return round2(allocations.reduce((s, a) => s + Math.max(0, Number(a.amount) || 0), 0));
}

function earliestRecordedAt(allocations: InstalmentAllocation[]): number | null {
    const times = allocations
        .map((a) => (a.recordedAt ? new Date(a.recordedAt).getTime() : NaN))
        .filter((t) => !Number.isNaN(t));
    return times.length > 0 ? Math.min(...times) : null;
}

/**
 * Reconcile recorded payments against an arrangement's instalments.
 *
 * Two layers, in this order:
 *  1. Payments staff pinned to a specific month (`allocations`) settle exactly
 *     that month — never any other. This is what lets month 3 sit MISSED while
 *     months 4 and 5 read PAID, and lets two payments land on month 7.
 *  2. Whatever is left unpinned (`paidPool`) fills the remaining open months in
 *     due order (FIFO), which is the old behaviour for files nobody allocates
 *     by hand.
 *
 * WAIVED lines are skipped. A line manually confirmed honoured counts as fully
 * paid and never draws from the pool.
 */
export function reconcileInstalments(
    instalments: ReconcileInstalment[],
    paidPool: number,
    now: Date = new Date()
): ReconciledInstalment[] {
    const ordered = [...instalments].sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );

    let pool = round2(Math.max(0, paidPool));
    const result: ReconciledInstalment[] = [];

    for (const inst of ordered) {
        const dueDate = new Date(inst.dueDate);
        const amountDue = round2(Number(inst.amountDue));
        const allocations = inst.allocations ?? [];
        const allocated = allocatedTotal(allocations);

        if (inst.status === 'WAIVED') {
            result.push({
                id: inst.id,
                sequence: inst.sequence,
                dueDate,
                amountDue,
                amountPaid: 0,
                balance: 0,
                status: 'WAIVED',
                isOverdue: false,
                overpaid: 0,
                paymentCount: allocations.length,
                broughtForward: false,
                allocations,
            });
            continue;
        }

        // Manually confirmed honoured — fully paid, never draws from the auto pool.
        if (inst.status === 'PAID') {
            const paid = Math.max(amountDue, allocated);
            result.push({
                id: inst.id,
                sequence: inst.sequence,
                dueDate,
                amountDue,
                amountPaid: paid,
                balance: 0,
                status: 'PAID',
                isOverdue: false,
                overpaid: round2(Math.max(0, paid - amountDue)),
                paymentCount: allocations.length,
                broughtForward: false,
                allocations,
            });
            continue;
        }

        const manualPaid = round2(Math.max(0, Number(inst.amountPaid ?? 0)));
        const pinned = round2(manualPaid + allocated);
        // Take from the shared pool up to what this line still needs after pinned money.
        const stillNeeded = Math.max(0, amountDue - pinned);
        const fromPool = Math.min(pool, stillNeeded);
        pool = round2(pool - fromPool);

        const amountPaid = round2(pinned + fromPool);
        const balance = round2(Math.max(0, amountDue - amountPaid));
        let status = computeInstalmentStatus(amountDue, amountPaid, dueDate, now);
        // Staff explicitly flagged this month as missed — keep it missed until
        // money actually lands on it, even if it is not yet past due.
        if (inst.status === 'MISSED' && amountPaid < amountDue) status = 'MISSED';

        result.push({
            id: inst.id,
            sequence: inst.sequence,
            dueDate,
            amountDue,
            amountPaid,
            balance,
            status,
            isOverdue: status === 'MISSED',
            overpaid: round2(Math.max(0, amountPaid - amountDue)),
            paymentCount: allocations.length,
            broughtForward: false,
            allocations,
        });
    }

    // Brought-forward pass: a month whose proof was only captured after a LATER
    // month had already been captured was back-dated by staff.
    const bySequence = result.sort((a, b) => a.sequence - b.sequence);
    for (let i = 0; i < bySequence.length; i++) {
        const mine = earliestRecordedAt(bySequence[i].allocations);
        if (mine === null) continue;
        for (let j = i + 1; j < bySequence.length; j++) {
            const later = earliestRecordedAt(bySequence[j].allocations);
            if (later !== null && later < mine) {
                bySequence[i].broughtForward = true;
                break;
            }
        }
    }

    return bySequence;
}

export interface ArrangementSummary {
    totalDue: number;
    totalPaid: number;
    balance: number;
    /** Number of periods (months, for a MONTHLY arrangement) the consumer pays over. */
    instalmentCount: number;
    paidCount: number;
    missedCount: number;
    partialCount: number;
    pendingCount: number;
    waivedCount: number;
    /** Periods still to settle — missed + partial + pending. */
    outstandingCount: number;
    /** Total paid above what the settled periods asked for. */
    overpaidTotal: number;
    /** Total number of individual payments allocated across all periods. */
    allocatedPaymentCount: number;
    /** Periods whose proof was captured late, after a later period (back-dated). */
    broughtForwardCount: number;
    /** The earliest unsettled instalment — drives Finance "Next Payment Date". */
    nextPaymentDate: Date | null;
    nextPaymentAmount: number | null;
    nextPaymentBalance: number | null;
    nextPaymentStatus: InstalmentStatus | null;
    /** True when any unsettled instalment's due date has passed. */
    isOverdue: boolean;
    /** Effective arrangement status. */
    status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
}

/** Summarise reconciled instalments into headline figures for display. */
export function summariseArrangement(
    instalments: ReconciledInstalment[],
    now: Date = new Date()
): ArrangementSummary {
    const considered = instalments.filter((i) => i.status !== 'WAIVED');
    const totalDue = round2(considered.reduce((s, i) => s + i.amountDue, 0));
    const totalPaid = round2(considered.reduce((s, i) => s + i.amountPaid, 0));
    const balance = round2(Math.max(0, totalDue - totalPaid));
    const paidCount = considered.filter((i) => i.status === 'PAID').length;
    const missedCount = considered.filter((i) => i.status === 'MISSED').length;
    const partialCount = considered.filter((i) => i.status === 'PARTIAL').length;
    const pendingCount = considered.filter((i) => i.status === 'PENDING').length;
    const waivedCount = instalments.filter((i) => i.status === 'WAIVED').length;
    const overpaidTotal = round2(considered.reduce((s, i) => s + (i.overpaid ?? 0), 0));
    const allocatedPaymentCount = instalments.reduce((s, i) => s + (i.paymentCount ?? 0), 0);
    const broughtForwardCount = instalments.filter((i) => i.broughtForward).length;

    const unsettled = considered
        .filter((i) => i.status !== 'PAID')
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const next = unsettled[0] ?? null;

    const allPaid = considered.length > 0 && considered.every((i) => i.status === 'PAID');
    const status: ArrangementSummary['status'] = allPaid
        ? 'COMPLETED'
        : missedCount > 0
          ? 'DEFAULTED'
          : 'ACTIVE';

    return {
        totalDue,
        totalPaid,
        balance,
        instalmentCount: considered.length,
        paidCount,
        missedCount,
        partialCount,
        pendingCount,
        waivedCount,
        outstandingCount: missedCount + partialCount + pendingCount,
        overpaidTotal,
        allocatedPaymentCount,
        broughtForwardCount,
        nextPaymentDate: next?.dueDate ?? null,
        nextPaymentAmount: next?.amountDue ?? null,
        nextPaymentBalance: next?.balance ?? null,
        nextPaymentStatus: next?.status ?? null,
        isOverdue: next ? next.dueDate.getTime() < now.getTime() : false,
        status,
    };
}
