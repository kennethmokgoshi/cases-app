/**
 * Quote ↔ Case workflow synchronisation (server-only).
 *
 * Node-only (imports `prisma`). Import directly from this file in server route
 * handlers — do NOT re-export from the package index, and never import it into
 * a client component.
 *
 * Two automations live here, shared by the Cases and Finance apps:
 *
 * 1. `recordQuoteDecision` — records the consumer's accept/reject decision on a
 *    quotation (Invoice of type QUOTE). On acceptance the linked case advances
 *    to the QUOTE_ACCEPTED workflow status — but only when that is a *forward*
 *    move on the workflow board; a case already further along never moves back.
 *
 * 2. `checkQuoteFulfilment` — after any payment is captured against a case,
 *    compares the total captured (non-cancelled payments) with the most
 *    recently accepted quote's total. Once captured ≥ quoted, the case advances
 *    to SETTLED_SUCCESS (again, forward-only).
 */

import { prisma } from '@zenowethu/database';
import { WORKFLOW_STATUSES } from '../statuses/statuses';
import {
    getCommissionStageForCaseStatus,
    isCommissionEligible,
    calculateCommissionAmount,
} from '../referrer-commission';
import { createLogger } from '../logger';

const logger = createLogger('finance/quote-case-sync');

// ---------------------------------------------------------------------------
// Forward-only transition rule
// ---------------------------------------------------------------------------

/**
 * Position of a status on the workflow board. WORKFLOW_STATUSES is ordered by
 * stage (1. Beginning … 11. Lost), so the array index doubles as progression
 * rank. Unknown codes return -1.
 */
export function getWorkflowStatusRank(code: string): number {
    return WORKFLOW_STATUSES.findIndex(s => s.code === code);
}

/**
 * A transition is "forward" when the target sits later on the board than the
 * current status. Unknown targets are never forward; an unknown/legacy current
 * status does not block the move.
 */
export function isForwardStatusTransition(fromCode: string, toCode: string): boolean {
    const to = getWorkflowStatusRank(toCode);
    if (to === -1) return false;
    const from = getWorkflowStatusRank(fromCode);
    if (from === -1) return true;
    return to > from;
}

// ---------------------------------------------------------------------------
// Forward-only case status advance
// ---------------------------------------------------------------------------

export interface AdvanceCaseStatusParams {
    caseId: string;
    toStatus: string;
    /** Staff user attributed in the workflow log (omit for automated moves). */
    userId?: string | null;
    /** Human-readable reason recorded on the workflow log entry. */
    notes?: string;
}

export interface AdvanceCaseStatusResult {
    moved: boolean;
    fromStatus?: string;
    toStatus?: string;
    reason?: 'CASE_NOT_FOUND' | 'ALREADY_THERE' | 'NOT_FORWARD';
}

/**
 * Move a case to `toStatus` only when that is a forward move on the workflow
 * board. Resets SLA counters, writes a WorkflowLog entry, and syncs the
 * referrer commission stage (mirrors /api/cases/[id]/status). Never moves a
 * case backwards.
 */
export async function advanceCaseStatusIfForward(
    params: AdvanceCaseStatusParams,
): Promise<AdvanceCaseStatusResult> {
    const { caseId, toStatus, userId, notes } = params;

    const current = await prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, status: true, referrerId: true },
    });
    if (!current) return { moved: false, reason: 'CASE_NOT_FOUND' };
    if (current.status === toStatus) {
        return { moved: false, fromStatus: current.status, toStatus, reason: 'ALREADY_THERE' };
    }
    if (!isForwardStatusTransition(current.status, toStatus)) {
        return { moved: false, fromStatus: current.status, toStatus, reason: 'NOT_FORWARD' };
    }

    await prisma.case.update({
        where: { id: caseId },
        data: {
            status: toStatus,
            statusEntryDate: new Date(),
            isOverdue: false,
            daysInStatus: 0,
            ...(userId ? { updatedBy: { connect: { id: userId } } } : {}),
            workflowLogs: {
                create: {
                    fromStatus: current.status,
                    toStatus,
                    timestamp: new Date(),
                    userId: userId ?? null,
                    notes: notes ?? null,
                },
            },
        },
    });

    // Referrer commission stage sync — same behaviour as the manual status route
    if (current.referrerId) {
        const stage = getCommissionStageForCaseStatus(toStatus);
        if (stage) {
            const eligible = isCommissionEligible(stage);

            let autoAmount: number | undefined;
            if (eligible) {
                const [referrer, existingCommission, totalReferralCount] = await Promise.all([
                    prisma.referrer.findUnique({
                        where: { id: current.referrerId },
                        select: { commissionType: true, fixedCommissionAmount: true },
                    }),
                    prisma.referrerCommission.findUnique({
                        where: { caseId },
                        select: { isPaid: true },
                    }),
                    prisma.case.count({ where: { referrerId: current.referrerId } }),
                ]);
                const alreadyPaid = existingCommission?.isPaid ?? false;
                if (!alreadyPaid && referrer) {
                    autoAmount = calculateCommissionAmount(
                        referrer.commissionType,
                        referrer.fixedCommissionAmount,
                        totalReferralCount,
                    );
                }
            }

            await prisma.referrerCommission.upsert({
                where: { caseId },
                create: {
                    referrerId: current.referrerId,
                    caseId,
                    stage,
                    isEligible: eligible,
                    ...(autoAmount !== undefined && { commissionAmount: autoAmount }),
                },
                update: {
                    stage,
                    isEligible: eligible,
                    ...(autoAmount !== undefined && { commissionAmount: autoAmount }),
                },
            });
        }
    }

    logger.info(`Case ${caseId} advanced ${current.status} → ${toStatus}${notes ? ` (${notes})` : ''}`);
    return { moved: true, fromStatus: current.status, toStatus };
}

// ---------------------------------------------------------------------------
// Quote decision (accept / reject) — shared by Cases and Finance routes
// ---------------------------------------------------------------------------

export type QuoteDecision = 'ACCEPTED' | 'REJECTED';

export interface RecordQuoteDecisionParams {
    quoteId: string;
    decision: QuoteDecision;
    note?: string;
    userId: string;
}

export interface RecordQuoteDecisionResult {
    ok: boolean;
    /** HTTP status for the failure — only set when ok is false */
    status?: 404 | 409;
    /** Failure reason — only set when ok is false */
    error?: string;
    /** The updated quote — only set when ok is true */
    quote?: unknown;
    /** Case workflow sync outcome — only set when ok is true */
    caseSync?: AdvanceCaseStatusResult | null;
}

/**
 * Record the client's decision on a quotation. Accepted quotes advance the
 * linked case to QUOTE_ACCEPTED when that is a forward move; a failed case
 * sync never fails the decision itself.
 */
export async function recordQuoteDecision(
    params: RecordQuoteDecisionParams,
): Promise<RecordQuoteDecisionResult> {
    const { quoteId, decision, note, userId } = params;

    const quote = await prisma.invoice.findUnique({
        where: { id: quoteId },
        select: { id: true, type: true, status: true, caseId: true, invoiceNumber: true },
    });
    if (!quote) return { ok: false, status: 404, error: 'Not found' };

    if (quote.type !== 'QUOTE') {
        return { ok: false, status: 409, error: 'Only quotations can be accepted or rejected' };
    }
    if (quote.status === 'CONVERTED') {
        return { ok: false, status: 409, error: 'This quote has already been converted to an invoice' };
    }
    if (quote.status === 'CANCELLED') {
        return { ok: false, status: 409, error: 'Cannot record a decision on a cancelled quote' };
    }

    const now = new Date();
    const updated = await prisma.invoice.update({
        where: { id: quoteId },
        data: {
            status:       decision,
            acceptedAt:   decision === 'ACCEPTED' ? now : null,
            rejectedAt:   decision === 'REJECTED' ? now : null,
            decisionNote: note ?? null,
            decidedById:  userId,
        },
        include: {
            decidedBy: { select: { firstName: true, lastName: true } },
        },
    });

    let caseSync: AdvanceCaseStatusResult | null = null;
    if (decision === 'ACCEPTED' && quote.caseId) {
        try {
            caseSync = await advanceCaseStatusIfForward({
                caseId: quote.caseId,
                toStatus: 'QUOTE_ACCEPTED',
                userId,
                notes: `Quote ${quote.invoiceNumber} accepted by client`,
            });
        } catch (err) {
            logger.error(`Quote ${quoteId} accepted but case ${quote.caseId} workflow sync failed:`, err);
        }
    }

    return { ok: true, quote: updated, caseSync };
}

// ---------------------------------------------------------------------------
// Quote fulfilment — captured payments vs accepted quote total
// ---------------------------------------------------------------------------

export interface QuoteFulfilmentResult {
    /** false when the case has no accepted quote to measure against */
    checked: boolean;
    quoteTotal?: number;
    captured?: number;
    fulfilled?: boolean;
    /** Amount captured above the quote total — 0 unless the client overpaid. */
    overpaidBy?: number;
    caseSync?: AdvanceCaseStatusResult;
}

/**
 * Compare the total captured against a case (all non-cancelled payments) with
 * its most recently accepted quote. When captured ≥ quoted the case advances
 * to SETTLED_SUCCESS (forward-only). An invoice converted from the quote and
 * marked PAID without allocated payments also counts as fully captured.
 */
export async function checkQuoteFulfilment(
    caseId: string,
    userId?: string | null,
): Promise<QuoteFulfilmentResult> {
    const quote = await prisma.invoice.findFirst({
        where: {
            caseId,
            type: 'QUOTE',
            OR: [
                { status: 'ACCEPTED' },
                { status: 'CONVERTED', acceptedAt: { not: null } },
            ],
        },
        orderBy: { acceptedAt: 'desc' },
        select: {
            id: true,
            invoiceNumber: true,
            total: true,
            convertedToInvoice: { select: { status: true, total: true } },
        },
    });
    if (!quote) return { checked: false };

    const agg = await prisma.payment.aggregate({
        where: { caseId, status: { not: 'CANCELLED' } },
        _sum: { amount: true },
    });
    let captured = Number(agg._sum.amount ?? 0);

    // Legacy path: invoices marked PAID before payment allocation existed carry
    // no Payment rows — treat the converted invoice's total as captured.
    if (quote.convertedToInvoice?.status === 'PAID') {
        captured = Math.max(captured, Number(quote.convertedToInvoice.total));
    }

    const quoteTotal = Number(quote.total);
    const fulfilled = quoteTotal > 0 && captured >= quoteTotal;
    if (!fulfilled) return { checked: true, quoteTotal, captured, fulfilled: false, overpaidBy: 0 };

    const overpaidBy = Math.round((captured - quoteTotal) * 100) / 100;
    const caseSync = await advanceCaseStatusIfForward({
        caseId,
        toStatus: 'SETTLED_SUCCESS',
        userId,
        notes: `Captured payments R${captured.toFixed(2)} cover accepted quote ${quote.invoiceNumber} (R${quoteTotal.toFixed(2)})${
            overpaidBy > 0 ? ` — client overpaid by R${overpaidBy.toFixed(2)}` : ''
        }`,
    });

    return { checked: true, quoteTotal, captured, fulfilled: true, overpaidBy, caseSync };
}

/**
 * Fire-safe wrapper for payment-capture routes: a fulfilment/sync failure must
 * never fail the payment that triggered it. Logs and returns null on error.
 */
export async function checkQuoteFulfilmentSafe(
    caseId: string | null | undefined,
    userId?: string | null,
): Promise<QuoteFulfilmentResult | null> {
    if (!caseId) return null;
    try {
        return await checkQuoteFulfilment(caseId, userId);
    } catch (err) {
        logger.error(`Quote fulfilment check failed for case ${caseId}:`, err);
        return null;
    }
}
