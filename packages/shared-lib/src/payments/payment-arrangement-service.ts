// Prisma-backed payment-arrangement service. Node-only — import directly in
// server routes (NOT from the package root).

import { prisma } from '@zenowethu/database';
import {
    buildInstalmentSchedule,
    deriveScheduleFromMandate,
    reconcileInstalments,
    summariseArrangement,
    type ArrangementFrequency,
    type ArrangementSummary,
    type InstalmentStatus,
    type ReconciledInstalment,
    type ScheduledInstalment,
} from './arrangement-logic';
import { setCaseAppNextUpdate } from './case-app-next-update-service';

export interface CreateArrangementInput {
    clientId: string;
    caseId?: string | null;
    frequency: ArrangementFrequency;
    reason?: string | null;
    notes?: string | null;
    createdById?: string | null;
    /** Either provide explicit instalment lines… */
    instalments?: Array<{ dueDate: Date | string; amountDue: number | string }>;
    /** …or schedule parameters to auto-generate them. */
    schedule?: {
        totalAmount?: number | string;
        perInstalmentAmount?: number | string;
        numInstalments: number;
        firstDueDate: Date | string;
        dayOfMonth?: number | null;
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Create a manual payment arrangement and its instalment lines. */
export async function createArrangement(input: CreateArrangementInput) {
    let lines: ScheduledInstalment[];

    if (input.instalments && input.instalments.length > 0) {
        lines = input.instalments
            .map((l, i) => ({
                sequence: i + 1,
                dueDate: new Date(l.dueDate),
                amountDue: round2(Number(l.amountDue)),
            }))
            .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
            .map((l, i) => ({ ...l, sequence: i + 1 }));
    } else if (input.schedule) {
        lines = buildInstalmentSchedule({ ...input.schedule, frequency: input.frequency });
    } else {
        throw new Error('createArrangement: provide either instalments or schedule');
    }

    if (lines.length === 0) throw new Error('createArrangement: no instalments');

    const totalAmount = round2(lines.reduce((s, l) => s + l.amountDue, 0));

    const arrangement = await prisma.paymentArrangement.create({
        data: {
            clientId: input.clientId,
            caseId: input.caseId ?? null,
            source: 'MANUAL',
            status: 'ACTIVE',
            frequency: input.frequency,
            totalAmount,
            reason: input.reason ?? null,
            notes: input.notes ?? null,
            createdById: input.createdById ?? null,
            instalments: {
                create: lines.map((l) => ({
                    sequence: l.sequence,
                    dueDate: l.dueDate,
                    amountDue: l.amountDue,
                })),
            },
        },
        include: { instalments: { orderBy: { sequence: 'asc' } } },
    });

    await syncNextPaymentDate(arrangement.id);
    return arrangement;
}

/** Create an arrangement derived from an approved debit-order mandate. */
export async function createArrangementFromMandate(
    mandateId: string,
    opts: { createdById?: string | null } = {}
) {
    const mandate = await prisma.debitOrderMandate.findUnique({ where: { id: mandateId } });
    if (!mandate) throw new Error('Mandate not found');

    const schedule = deriveScheduleFromMandate({
        amount: mandate.amount ? Number(mandate.amount) : null,
        frequency: mandate.frequency,
        numInstalments: mandate.numInstalments,
        debitOrderDay: mandate.debitOrderDay,
        firstCollectionDate: mandate.firstCollectionDate,
    });
    if (!schedule) {
        throw new Error('Mandate is missing the terms needed to build a schedule (amount, instalments, first collection date)');
    }

    const totalAmount = round2(schedule.reduce((s, l) => s + l.amountDue, 0));

    const arrangement = await prisma.paymentArrangement.create({
        data: {
            clientId: mandate.clientId,
            caseId: mandate.caseId,
            source: 'MANDATE',
            mandateId: mandate.id,
            status: 'ACTIVE',
            frequency: mandate.frequency === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY',
            totalAmount,
            reason: 'Debit order mandate',
            createdById: opts.createdById ?? null,
            instalments: {
                create: schedule.map((l) => ({
                    sequence: l.sequence,
                    dueDate: l.dueDate,
                    amountDue: l.amountDue,
                })),
            },
        },
        include: { instalments: { orderBy: { sequence: 'asc' } } },
    });

    await syncNextPaymentDate(arrangement.id);
    return arrangement;
}

/**
 * The pool of paid money available to auto-match against an arrangement's
 * instalments: COMPLETED payments on the case dated on/after the arrangement
 * was created, excluding any payment staff pinned to a specific instalment —
 * those are applied to their own month and must not be counted twice.
 */
async function paidPoolForArrangement(arrangement: {
    caseId: string | null;
    clientId: string;
    createdAt: Date;
}): Promise<number> {
    const where = arrangement.caseId
        ? { caseId: arrangement.caseId }
        : { clientId: arrangement.clientId };
    const payments = await prisma.payment.findMany({
        where: {
            ...where,
            status: 'COMPLETED',
            date: { gte: arrangement.createdAt },
            instalmentId: null,
        },
        select: { amount: true },
    });
    return round2(payments.reduce((s, p) => s + Number(p.amount), 0));
}

export interface ArrangementView {
    id: string;
    caseId: string | null;
    clientId: string;
    source: string;
    status: string;
    frequency: string;
    reason: string | null;
    notes: string | null;
    createdAt: Date;
    instalments: ReconciledInstalment[];
    summary: ArrangementSummary;
}

/** Load an arrangement with its instalments reconciled against recorded payments. */
export async function getArrangementView(
    arrangementId: string,
    now: Date = new Date()
): Promise<ArrangementView | null> {
    const arrangement = await prisma.paymentArrangement.findUnique({
        where: { id: arrangementId },
        include: {
            instalments: {
                orderBy: { sequence: 'asc' },
                include: {
                    payments: {
                        where: { status: 'COMPLETED' },
                        orderBy: { date: 'asc' },
                        select: { id: true, amount: true, date: true, createdAt: true, reference: true },
                    },
                },
            },
        },
    });
    if (!arrangement) return null;

    const pool = await paidPoolForArrangement(arrangement);
    const reconciled = reconcileInstalments(
        arrangement.instalments.map((i) => ({
            id: i.id,
            sequence: i.sequence,
            dueDate: i.dueDate,
            amountDue: Number(i.amountDue),
            status: i.status as InstalmentStatus,
            amountPaid: Number(i.amountPaid),
            allocations: i.payments.map((p) => ({
                paymentId: p.id,
                amount: Number(p.amount),
                paidOn: p.date,
                recordedAt: p.createdAt,
                reference: p.reference,
            })),
        })),
        pool,
        now
    );
    const summary = summariseArrangement(reconciled, now);

    return {
        id: arrangement.id,
        caseId: arrangement.caseId,
        clientId: arrangement.clientId,
        source: arrangement.source,
        status: arrangement.status,
        frequency: arrangement.frequency,
        reason: arrangement.reason,
        notes: arrangement.notes,
        createdAt: arrangement.createdAt,
        instalments: reconciled,
        summary,
    };
}

/** List all arrangements for a case, each reconciled and summarised. */
export async function listCaseArrangements(caseId: string, now: Date = new Date()): Promise<ArrangementView[]> {
    const arrangements = await prisma.paymentArrangement.findMany({
        where: { caseId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
    });
    const views = await Promise.all(arrangements.map((a) => getArrangementView(a.id, now)));
    return views.filter((v): v is ArrangementView => v !== null);
}

/**
 * Pin a recorded payment to a specific instalment (month), or unpin it by
 * passing null so it falls back into the FIFO pool.
 *
 * This is what lets staff capture a back-dated month — e.g. enter month 3's
 * proof after month 7 was already recorded — without the money silently
 * sliding onto the wrong month.
 */
export async function allocatePaymentToInstalment(
    paymentId: string,
    instalmentId: string | null
) {
    const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, caseId: true, clientId: true, instalmentId: true },
    });
    if (!payment) throw new Error('Payment not found');

    const arrangementIds = new Set<string>();

    if (instalmentId) {
        const instalment = await prisma.paymentArrangementInstalment.findUnique({
            where: { id: instalmentId },
            select: { id: true, arrangement: { select: { id: true, caseId: true, clientId: true } } },
        });
        if (!instalment) throw new Error('Instalment not found');
        const belongs = payment.caseId
            ? instalment.arrangement.caseId === payment.caseId
            : instalment.arrangement.clientId === payment.clientId;
        if (!belongs) {
            throw new Error('That instalment belongs to a different case');
        }
        arrangementIds.add(instalment.arrangement.id);
    }

    // The previous allocation's arrangement also needs re-summarising.
    if (payment.instalmentId && payment.instalmentId !== instalmentId) {
        const previous = await prisma.paymentArrangementInstalment.findUnique({
            where: { id: payment.instalmentId },
            select: { arrangementId: true },
        });
        if (previous) arrangementIds.add(previous.arrangementId);
    }

    const updated = await prisma.payment.update({
        where: { id: paymentId },
        data: { instalmentId },
    });

    for (const id of arrangementIds) {
        await syncNextPaymentDate(id);
    }

    return updated;
}

/**
 * Recompute every arrangement on a case. Call after recording, editing or
 * deleting a payment so the month-by-month schedule and the Finance
 * "Next Payment Date" stay in step with the money actually captured.
 */
export async function resyncCaseArrangements(caseId: string | null | undefined) {
    if (!caseId) return;
    const arrangements = await prisma.paymentArrangement.findMany({
        where: { caseId },
        select: { id: true },
    });
    for (const a of arrangements) {
        await syncNextPaymentDate(a.id);
    }
}

/**
 * Manually record whether a month's instalment was honoured.
 *
 *  - `PAID`   — staff confirm the consumer paid that month
 *  - `MISSED` — staff confirm they did not
 *  - `AUTO`   — clear the manual call and let recorded payments decide again
 */
export async function setInstalmentHonoured(
    instalmentId: string,
    outcome: 'PAID' | 'MISSED' | 'AUTO',
    userId?: string | null
) {
    const cleared = outcome === 'AUTO';
    const updated = await prisma.paymentArrangementInstalment.update({
        where: { id: instalmentId },
        data: {
            status: cleared ? 'PENDING' : outcome,
            honouredById: cleared ? null : userId ?? null,
            honouredAt: cleared ? null : new Date(),
            paidAt: outcome === 'PAID' ? new Date() : null,
        },
    });
    await syncNextPaymentDate(updated.arrangementId);
    return updated;
}

/**
 * Recompute the arrangement's effective status and push the earliest unsettled
 * instalment date into the Finance per-app next-update row (the "Next Payment
 * Date"). Keeps the overdue trigger in sync with the schedule.
 */
export async function syncNextPaymentDate(arrangementId: string, now: Date = new Date()) {
    const view = await getArrangementView(arrangementId, now);
    if (!view) return;

    await prisma.paymentArrangement.update({
        where: { id: arrangementId },
        data: { status: view.summary.status },
    });

    if (view.caseId) {
        await setCaseAppNextUpdate({
            caseId: view.caseId,
            app: 'FINANCE',
            nextUpdateDate: view.summary.nextPaymentDate,
            note: view.summary.nextPaymentDate
                ? `Next payment ${view.summary.nextPaymentAmount?.toFixed(2)} due`
                : 'Arrangement settled',
        });
    }
}
