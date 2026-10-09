/**
 * Apply a fee-document status change to a case (server-only).
 *
 * Node-only (imports `prisma`). Import directly from this file in server route
 * handlers — do NOT re-export from the package index.
 *
 * The decision (which status, and whether moving is allowed) is made by the pure
 * `resolveFeeDocumentTransition`; this file only persists it the same way the
 * manual status route does: reset SLA counters, set the next update from the
 * status SLA, and write a WorkflowLog entry for the case timeline.
 */

import { prisma } from '@zenowethu/database';
import { syncLegalFeesStatusAfterPayment } from './legal-fees-status-sync';
import { createLogger } from '../logger';
import { getStatusByCode } from '../statuses/statuses';
import { calculateSlaDeadline } from '../statuses/workflow';
import {
    resolveFeeDocumentTransition,
    describeFeeTransitionSkip,
    type FeeDocumentEvent,
} from './fee-document-workflow';

const logger = createLogger('finance/fee-document-status');

export interface FeeStatusChangeResult {
    moved: boolean;
    fromStatus?: string;
    toStatus?: string;
    /** Human-readable explanation for the UI toast when the status did not move. */
    message?: string;
}

/** Prefix that ties a WorkflowLog entry to the document it was about. */
export function feeDocumentLogTag(documentId: string): string {
    return `[doc:${documentId}]`;
}

export async function applyFeeDocumentStatus(params: {
    caseId: string;
    docType: string;
    event: FeeDocumentEvent;
    userId?: string | null;
    notes?: string;
    /** Tags the timeline entry so the document's sent/paid history can be read back. */
    documentId?: string;
    /**
     * Write a timeline entry even when the status does not move — used for sends
     * and payments, which staff must always be able to see happened.
     */
    recordWhenUnchanged?: boolean;
    /**
     * `false` records the event on the timeline but never moves the workflow
     * status — used by the automatic legal fee invoice, which must not pull a
     * case out of "Ready to Consent". Defaults to true.
     */
    moveStatus?: boolean;
}): Promise<FeeStatusChangeResult> {
    const { caseId, docType, event, userId, documentId, recordWhenUnchanged } = params;
    const moveStatus = params.moveStatus !== false;
    const notes = [documentId ? feeDocumentLogTag(documentId) : null, params.notes ?? null]
        .filter(Boolean)
        .join(' ') || null;

    const current = await prisma.case.findUnique({
        where: { id: caseId },
        select: { status: true },
    });
    if (!current) return { moved: false, message: 'Case not found' };

    const decision = resolveFeeDocumentTransition({ docType, event, currentStatus: current.status });
    // `in` narrowing — this package compiles without strictNullChecks.
    if (!moveStatus || 'reason' in decision) {
        if (recordWhenUnchanged || !moveStatus) {
            await prisma.workflowLog.create({
                data: {
                    caseId,
                    fromStatus: current.status,
                    toStatus: current.status,
                    action: `FEE_DOCUMENT_${event}`,
                    userId: userId ?? null,
                    notes,
                },
            });
        }
        return {
            moved: false,
            fromStatus: current.status,
            toStatus: decision.toStatus,
            message: 'reason' in decision
                ? describeFeeTransitionSkip(decision.reason)
                : 'Recorded on the timeline — workflow status left unchanged',
        };
    }

    const { toStatus } = decision;
    const statusInfo = getStatusByCode(toStatus);
    const now = new Date();
    const nextUpdate = calculateSlaDeadline(now, statusInfo?.slaDays ?? 7);

    await prisma.case.update({
        where: { id: caseId },
        data: {
            status: toStatus,
            statusEntryDate: now,
            nextUpdate,
            isOverdue: false,
            daysInStatus: 0,
            ...(userId ? { updatedBy: { connect: { id: userId } } } : {}),
            workflowLogs: {
                create: {
                    fromStatus: current.status,
                    toStatus,
                    timestamp: now,
                    userId: userId ?? null,
                    action: `FEE_DOCUMENT_${event}`,
                    notes,
                },
            },
        },
    });

    logger.info(`Case ${caseId} ${current.status} → ${toStatus} (${docType} ${event})`);

    if (toStatus === 'DC_FEE_PAID_READY_TRANSFER') {
        await alertStaffToReleaseTransfer(caseId).catch(error =>
            logger.error({ error, caseId }, 'Could not alert staff to accept the DHS transfer'));
    }

    return { moved: true, fromStatus: current.status, toStatus };
}

/**
 * The requesting DC has paid our invoice — someone must now accept the transfer
 * on the NCR Debt Help System. Alerts the case's assignee and project managers
 * in-app (falling back to admins when the case has neither).
 */
async function alertStaffToReleaseTransfer(caseId: string): Promise<void> {
    const found = await prisma.case.findUnique({
        where: { id: caseId },
        select: {
            fileNumber: true,
            assignedToId: true,
            debtCounsellorName: true,
            client: { select: { firstName: true, lastName: true } },
            projects: { select: { project: { select: { members: { where: { role: 'MANAGER' }, select: { userId: true } } } } } },
        },
    });
    if (!found) return;

    const recipients = new Set<string>();
    if (found.assignedToId) recipients.add(found.assignedToId);
    for (const cp of found.projects) for (const m of cp.project.members) recipients.add(m.userId);
    if (recipients.size === 0) {
        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        for (const a of admins) recipients.add(a.id);
    }
    if (recipients.size === 0) return;

    const consumer = `${found.client.firstName} ${found.client.lastName}`.trim();
    const dc = found.debtCounsellorName ? ` by ${found.debtCounsellorName}` : '';
    await prisma.inAppNotification.createMany({
        data: [...recipients].map(userId => ({
            userId,
            type: 'DC_FEE_PAID_TRANSFER',
            title: `✅ DC fee paid: ${found.fileNumber}`,
            message: `${consumer} — our fee invoice was paid${dc}. Accept the transfer on DHS.`,
            caseId,
            linkUrl: `/cases/${caseId}`,
        })),
    });
}

/**
 * After an Invoice row becomes PAID (Finance payments / status change), move the
 * linked case to the matching "paid" status:
 *   DC_FEE_INVOICE                         → DC_FEE_PAID_READY_TRANSFER
 *   INVOICE filed as a legal fee invoice   → LEGAL_FEE_PAID
 * Any other invoice is ignored. Never throws — the payment is already saved.
 */
export async function syncFeeInvoicePaidStatus(params: {
    invoiceId: string;
    userId?: string | null;
}): Promise<FeeStatusChangeResult | null> {
    const { invoiceId, userId } = params;
    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            select: { id: true, type: true, status: true, caseId: true, invoiceNumber: true },
        });
        if (!invoice?.caseId || invoice.status !== 'PAID') return null;

        let docType: string | null = null;
        if (invoice.type === 'DC_FEE_INVOICE') {
            docType = 'INVOICE_TO_DC';
        } else if (invoice.type === 'INVOICE') {
            const legalFeeDoc = await prisma.document.findFirst({
                where: {
                    caseId: invoice.caseId,
                    type: 'LEGAL_FEE_INVOICE',
                    extractedData: { contains: `"feeInvoiceId":"${invoice.id}"` },
                },
                select: { id: true },
            });
            if (legalFeeDoc) docType = 'LEGAL_FEE_INVOICE';
        }
        if (!docType) return null;

        if (docType === 'LEGAL_FEE_INVOICE') {
            await syncLegalFeesStatusAfterPayment({ caseId: invoice.caseId, invoiceId: invoice.id });
        }

        return await applyFeeDocumentStatus({
            caseId: invoice.caseId,
            docType,
            event: 'PAID',
            userId,
            notes: `Invoice ${invoice.invoiceNumber} marked paid in Finance`,
        });
    } catch (error) {
        logger.error({ error, invoiceId }, 'Could not sync case status after invoice payment');
        return null;
    }
}
