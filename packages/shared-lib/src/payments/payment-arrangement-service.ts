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
 * was created.
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
        where: { ...where, status: 'COMPLETED', date: { gte: arrangement.createdAt } },
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
        include: { instalments: { orderBy: { sequence: 'asc' } } },
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

/** Manually mark an instalment honoured (PAID) or missed. */
export async function setInstalmentHonoured(
    instalmentId: string,
    honoured: boolean,
    userId?: string | null
) {
    const updated = await prisma.paymentArrangementInstalment.update({
        where: { id: instalmentId },
        data: {
            status: honoured ? 'PAID' : 'MISSED',
            honouredById: userId ?? null,
            honouredAt: new Date(),
            paidAt: honoured ? new Date() : null,
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
