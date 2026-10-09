/**
 * Fee documents — send/forward, record payment, and read back history
 * (server-only).
 *
 * Node-only (imports `prisma`). Import directly from this file in server route
 * handlers — do NOT re-export from the package index.
 *
 * Rules
 * -----
 * - A "sent" status is only set once the email provider accepted the message
 *   AND every attachment was delivered. A failed send leaves the status alone;
 *   `sendManualMessage` already queues the failure for retry and the case
 *   timeline shows it.
 * - Anything sent to a debt counsellor on the consumer's behalf carries the
 *   signed POA and ID copy (see documents/mandate-attachments).
 * - Payment can only be recorded against our own invoices (to a DC, or the legal
 *   fee to the consumer) — never against a DC's invoice or a proof of payment.
 */

import { prisma, Prisma } from '@zenowethu/database';
import { z } from 'zod';
import { createLogger } from '../logger';
import { sendManualMessage } from '../notifications/service';
import { pickDebtCounsellorEmail } from '../dc/dc-request-notification';
import {
    resolveMandateAttachments,
    mandateAttachedLabel,
    mandateBaseUrl,
    withAuthorityLine,
} from '../documents/mandate-attachments';
import { getCompanyProfile } from '../company/company-profile-service';
import { formatSignatureBlock } from '../company/profile';
import {
    buildFeeDocumentEmail,
    feePaymentCategory,
    getFeeDocumentInfo,
    isFeeDocumentType,
    type FeeDocumentType,
} from './fee-document-workflow';
import { applyFeeDocumentStatus, feeDocumentLogTag, type FeeStatusChangeResult } from './fee-document-status';
import { syncLegalFeesStatusAfterPayment } from './legal-fees-status-sync';

const logger = createLogger('finance/fee-document-service');

export type FeeDocumentFailure =
    | 'DOCUMENT_NOT_FOUND'
    | 'NOT_FEE_DOCUMENT'
    | 'DOCUMENT_UNTRUSTED'
    | 'NO_RECIPIENT'
    | 'SEND_FAILED'
    | 'ATTACHMENT_FAILED'
    | 'NOT_PAYABLE';

export type FeeDocumentActionResult =
    | { ok: true; recipient?: string; statusChange: FeeStatusChangeResult; mandateSummary?: string; paymentId?: string }
    | { ok: false; failure: FeeDocumentFailure; error: string };

/** Stored on Document.extractedData when the PDF was generated from an Invoice row. */
export interface FeeDocumentMeta {
    feeInvoiceId?: string;
}

export function readFeeDocumentMeta(extractedData: string | null | undefined): FeeDocumentMeta {
    if (!extractedData) return {};
    try {
        const parsed: unknown = JSON.parse(extractedData);
        if (parsed && typeof parsed === 'object' && 'feeInvoiceId' in parsed) {
            const id = (parsed as { feeInvoiceId: unknown }).feeInvoiceId;
            return typeof id === 'string' ? { feeInvoiceId: id } : {};
        }
    } catch { /* not ours */ }
    return {};
}

function absoluteUrl(fileUrl: string): string {
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    return `${mandateBaseUrl()}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
}

async function loadFeeDocument(caseId: string, documentId: string) {
    const document = await prisma.document.findFirst({
        where: { id: documentId, caseId },
        select: { id: true, type: true, fileName: true, fileUrl: true, verificationStatus: true, extractedData: true },
    });
    if (!document) return { error: { ok: false, failure: 'DOCUMENT_NOT_FOUND', error: 'Document not found on this case' } as const };
    if (!isFeeDocumentType(document.type)) {
        return { error: { ok: false, failure: 'NOT_FEE_DOCUMENT', error: 'Only invoices and proof of payment can be sent from here' } as const };
    }
    return { document: { ...document, type: document.type as FeeDocumentType } };
}

// ---------------------------------------------------------------------------
// Send / forward
// ---------------------------------------------------------------------------

export async function sendFeeDocument(params: {
    caseId: string;
    documentId: string;
    note?: string | null;
    /** The staff member, or null when sent by the automation. */
    userId: string | null;
    /** `false` logs the send but leaves the case's workflow status alone (automatic sends). */
    moveStatus?: boolean;
}): Promise<FeeDocumentActionResult> {
    const { caseId, documentId, note, userId } = params;
    const moveStatus = params.moveStatus !== false;

    const loaded = await loadFeeDocument(caseId, documentId);
    if ('error' in loaded) return loaded.error;
    const { document } = loaded;

    // A document the ingest gate tied to a DIFFERENT consumer must never leave the building.
    if (document.verificationStatus === 'MISMATCH') {
        return {
            ok: false,
            failure: 'DOCUMENT_UNTRUSTED',
            error: 'This document appears to belong to a different consumer — check it before sending',
        };
    }

    const info = getFeeDocumentInfo(document.type)!;
    const currentCase = await prisma.case.findUnique({
        where: { id: caseId },
        include: { client: true, debtCounsellor: true },
    });
    if (!currentCase) return { ok: false, failure: 'DOCUMENT_NOT_FOUND', error: 'Case not found' };

    const toDc = info.sendTo === 'DC';
    const recipient = toDc ? pickDebtCounsellorEmail(currentCase) : currentCase.client.email?.trim() || null;
    if (!recipient) {
        return {
            ok: false,
            failure: 'NO_RECIPIENT',
            error: toDc
                ? 'No email address on file for the debt counsellor on this case'
                : 'This consumer has no email address on file',
        };
    }

    const company = await getCompanyProfile();
    const consumerName = `${currentCase.client.firstName} ${currentCase.client.lastName}`.trim();
    const dcName = currentCase.debtCounsellorName || currentCase.debtCounsellor?.tradingName || currentCase.debtCounsellor?.fullName || null;
    const email = buildFeeDocumentEmail(document.type, {
        consumerName,
        consumerIdNumber: currentCase.client.idNumber,
        fileNumber: currentCase.fileNumber,
        dcName,
        signature: formatSignatureBlock(company),
        note,
    });

    const attachments = [absoluteUrl(document.fileUrl)];
    let body = email.body;
    let mandateSummary: string | undefined;
    if (toDc) {
        // Acting on the consumer's behalf — the mandate travels with the document.
        const mandate = await resolveMandateAttachments(caseId);
        attachments.push(...mandate.attachments);
        body = withAuthorityLine(body, mandateAttachedLabel(mandate));
        mandateSummary = mandate.summary;
    }

    const result = await sendManualMessage(caseId, 'EMAIL', recipient, body, email.subject, {
        attachments,
        senderId: userId ?? undefined,
        // Lets a queued retry move the status once it finally goes out.
        feeDocument: { documentId: document.id, docType: document.type, ...(moveStatus ? {} : { moveStatus: false }) },
    });

    if (!result.emailSuccess) {
        logger.warn({ caseId, documentId, errors: result.errors }, 'Fee document send failed');
        return {
            ok: false,
            failure: 'SEND_FAILED',
            error: `Email could not be sent: ${result.errors.join(', ') || 'provider reported a failure'}. It has been queued for retry — the case status was not changed.`,
        };
    }

    if (result.attachmentErrors?.length) {
        logger.warn({ caseId, documentId, attachmentErrors: result.attachmentErrors }, 'Fee document attachment failed');
        // Timeline entry only — an incomplete send must not move the status.
        await prisma.workflowLog.create({
            data: {
                caseId,
                fromStatus: currentCase.status,
                toStatus: currentCase.status,
                action: 'FEE_DOCUMENT_SEND_INCOMPLETE',
                userId,
                notes: `${feeDocumentLogTag(documentId)} ⚠ Email to ${recipient} went out WITHOUT all attachments: ${result.attachmentErrors.join('; ')}`,
            },
        }).catch(error => logger.error({ error, caseId }, 'Could not record attachment failure'));
        return {
            ok: false,
            failure: 'ATTACHMENT_FAILED',
            error: `The email reached ${recipient} but an attachment failed (${result.attachmentErrors.join('; ')}). Please send it again — the case status was not changed.`,
        };
    }

    const statusChange = await applyFeeDocumentStatus({
        caseId,
        docType: document.type,
        event: 'SENT',
        userId,
        documentId,
        notes: `${info.sendLabel}: emailed ${document.fileName} to ${recipient}${mandateSummary ? `. ${mandateSummary}` : ''}`,
        recordWhenUnchanged: true,
        moveStatus,
    });

    return { ok: true, recipient, statusChange, mandateSummary };
}

// ---------------------------------------------------------------------------
// Record payment against our own invoice
// ---------------------------------------------------------------------------

export const MarkFeePaidSchema = z.object({
    amount: z.coerce.number().positive('Amount must be more than zero').max(10_000_000),
    paidAt: z.coerce.date(),
    method: z.enum(['EFT', 'CASH', 'DEBIT_ORDER', 'CARD', 'OTHER']).default('EFT'),
    reference: z.string().trim().max(200).optional().nullable(),
});
export type MarkFeePaidInput = z.infer<typeof MarkFeePaidSchema>;

export async function markFeeDocumentPaid(params: {
    caseId: string;
    documentId: string;
    input: MarkFeePaidInput;
    userId: string;
}): Promise<FeeDocumentActionResult> {
    const { caseId, documentId, input, userId } = params;

    const loaded = await loadFeeDocument(caseId, documentId);
    if ('error' in loaded) return loaded.error;
    const { document } = loaded;

    if (!getFeeDocumentInfo(document.type)!.payable) {
        return { ok: false, failure: 'NOT_PAYABLE', error: 'Payment can only be recorded against our own invoices' };
    }

    const currentCase = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
    if (!currentCase) return { ok: false, failure: 'DOCUMENT_NOT_FOUND', error: 'Case not found' };

    const { feeInvoiceId } = readFeeDocumentMeta(document.extractedData);
    const payer = document.type === 'INVOICE_TO_DC' ? 'requesting debt counsellor' : 'consumer';

    const payment = await prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
            data: {
                amount: new Prisma.Decimal(input.amount),
                date: input.paidAt,
                method: input.method,
                reference: input.reference || null,
                category: feePaymentCategory(document.type),
                status: 'COMPLETED',
                notes: `${feeDocumentLogTag(document.id)} Paid by ${payer} against ${document.fileName}`,
                caseId,
                clientId: currentCase.clientId,
                invoiceId: feeInvoiceId ?? null,
                recordedById: userId,
            },
        });
        if (feeInvoiceId) {
            const invoice = await tx.invoice.findUnique({
                where: { id: feeInvoiceId },
                select: { total: true, payments: { where: { status: 'COMPLETED' }, select: { amount: true } } },
            });
            if (invoice) {
                const paid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
                await tx.invoice.update({
                    where: { id: feeInvoiceId },
                    data: { status: paid >= Number(invoice.total) ? 'PAID' : 'PARTIALLY_PAID' },
                });
            }
        }
        return created;
    });

    const statusChange = await applyFeeDocumentStatus({
        caseId,
        docType: document.type,
        event: 'PAID',
        userId,
        documentId,
        notes: `Payment of R${input.amount.toFixed(2)} recorded (${input.method}${input.reference ? `, ref ${input.reference}` : ''})`,
        recordWhenUnchanged: true,
    });

    // Legal fee paid → Legal Fees Status: Paying / Fees Paid Cash / Debited.
    if (document.type === 'LEGAL_FEE_INVOICE') {
        await syncLegalFeesStatusAfterPayment({ caseId, invoiceId: feeInvoiceId });
    }

    return { ok: true, statusChange, paymentId: payment.id };
}

// ---------------------------------------------------------------------------
// History for the Documents tab panel
// ---------------------------------------------------------------------------

export interface FeeDocumentHistory {
    documentId: string;
    lastSentAt: string | null;
    lastSentNote: string | null;
    paidAmount: number;
    lastPaidAt: string | null;
}

export async function getFeeDocumentHistory(caseId: string): Promise<FeeDocumentHistory[]> {
    const [documents, logs, payments] = await Promise.all([
        prisma.document.findMany({
            where: { caseId, type: { in: ['INVOICE_TO_DC', 'LEGAL_FEE_INVOICE', 'DC_INVOICE_RECEIVED', 'PROOF_OF_PAYMENT'] } },
            select: { id: true },
        }),
        prisma.workflowLog.findMany({
            where: { caseId, action: 'FEE_DOCUMENT_SENT' },
            orderBy: { timestamp: 'desc' },
            select: { notes: true, timestamp: true },
        }),
        prisma.payment.findMany({
            where: { caseId, status: 'COMPLETED', notes: { startsWith: '[doc:' } },
            select: { notes: true, amount: true, date: true },
        }),
    ]);

    return documents.map(({ id }) => {
        const tag = feeDocumentLogTag(id);
        const sent = logs.find(l => l.notes?.startsWith(tag));
        const docPayments = payments.filter(p => p.notes?.startsWith(tag));
        const lastPaid = docPayments.reduce<Date | null>((max, p) => (!max || p.date > max ? p.date : max), null);
        return {
            documentId: id,
            lastSentAt: sent ? sent.timestamp.toISOString() : null,
            lastSentNote: sent?.notes?.slice(tag.length).trim() ?? null,
            paidAmount: docPayments.reduce((sum, p) => sum + Number(p.amount), 0),
            lastPaidAt: lastPaid ? lastPaid.toISOString() : null,
        };
    });
}
