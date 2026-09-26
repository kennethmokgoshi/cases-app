/**
 * Fee documents — invoices and proof of payment that move a case's workflow
 * status (pure, browser + server safe).
 *
 * Business context
 * ----------------
 * Four documents pass between us, the consumer and other debt counsellors (DCs):
 *
 *   A. INVOICE_TO_DC        Our invoice to a DC who asked for our client. They
 *                           must settle it before we release the consumer.
 *   B. LEGAL_FEE_INVOICE    Our legal fee invoice to the consumer (normally R1,700).
 *   C. DC_INVOICE_RECEIVED  An invoice a DC sent us for fees the consumer owes
 *                           them — we forward it to the consumer to settle.
 *   D. PROOF_OF_PAYMENT     The consumer's proof of paying (C) — we forward it
 *                           to that DC so they release the consumer.
 *
 * Each workflow is an ordered list of statuses. Uploading a document sets the
 * "issued/received" step, a successful send sets the "sent" step, and recording
 * payment sets the "paid" step. A case never moves backwards within the same
 * workflow and is never pulled out of a finished (completed/settled/lost) state.
 *
 * NOTE: keep this file free of Node-only imports — the Documents tab imports the
 * type catalogue. The Prisma-backed transition lives in `./fee-document-status.ts`.
 */

import { getStatusByCode } from '../statuses/statuses';

export const FEE_DOCUMENT_TYPES = [
    {
        type: 'INVOICE_TO_DC',
        label: 'Our invoice to requesting DC',
        workflow: 'DC_FEE',
        sendTo: 'DC',
        sendLabel: 'Send to DC',
        payable: true,
    },
    {
        type: 'LEGAL_FEE_INVOICE',
        label: 'Legal fee invoice (consumer)',
        workflow: 'LEGAL_FEE',
        sendTo: 'CONSUMER',
        sendLabel: 'Send to consumer',
        payable: true,
    },
    {
        type: 'DC_INVOICE_RECEIVED',
        label: 'Invoice received from DC',
        workflow: 'DC_INVOICE',
        sendTo: 'CONSUMER',
        sendLabel: 'Forward to consumer',
        payable: false,
    },
    {
        type: 'PROOF_OF_PAYMENT',
        label: 'Proof of payment (consumer)',
        workflow: 'DC_INVOICE',
        sendTo: 'DC',
        sendLabel: 'Forward to DC',
        payable: false,
    },
] as const;

export type FeeDocumentType = (typeof FEE_DOCUMENT_TYPES)[number]['type'];
export type FeeDocumentInfo = (typeof FEE_DOCUMENT_TYPES)[number];
export type FeeDocumentEvent = 'UPLOADED' | 'SENT' | 'PAID';

export function isFeeDocumentType(type: string | null | undefined): type is FeeDocumentType {
    return FEE_DOCUMENT_TYPES.some(d => d.type === type);
}

export function getFeeDocumentInfo(type: string): FeeDocumentInfo | undefined {
    return FEE_DOCUMENT_TYPES.find(d => d.type === type);
}

/**
 * Ordered steps of each workflow. Invoice-to-consumer ageing codes (INVSNT_*)
 * sit after INVOICE_SENT_CONSUMER so a re-upload never drags an aged case back.
 */
export const FEE_WORKFLOW_STEPS: Record<FeeDocumentInfo['workflow'], readonly string[]> = {
    DC_FEE: ['DC_FEE_INVOICE_ISSUED', 'DC_FEE_INVOICE_SENT', 'DC_FEE_PAID_READY_TRANSFER'],
    LEGAL_FEE: ['LEGAL_FEE_INVOICE_ISSUED', 'LEGAL_FEE_INVOICE_SENT', 'LEGAL_FEE_PAID'],
    DC_INVOICE: [
        'INVOICE_REQUESTED_DC',
        'DC_INVOICE_RECEIVED',
        'INVOICE_SENT_CONSUMER',
        'INVSNT_1M',
        'INVSNT_2M',
        'INVSNT_3M',
        'INVSNT_4M_PLUS',
        'POP_RECEIVED',
        'POP_SENT_TO_DC',
        'AWAITING_DC_TRANSFER_CONFIRMATION',
    ],
};

/** Target status for each (document type, event). Missing = event not allowed. */
const TRANSITIONS: Record<FeeDocumentType, Partial<Record<FeeDocumentEvent, string>>> = {
    INVOICE_TO_DC: {
        UPLOADED: 'DC_FEE_INVOICE_ISSUED',
        SENT: 'DC_FEE_INVOICE_SENT',
        PAID: 'DC_FEE_PAID_READY_TRANSFER',
    },
    LEGAL_FEE_INVOICE: {
        UPLOADED: 'LEGAL_FEE_INVOICE_ISSUED',
        SENT: 'LEGAL_FEE_INVOICE_SENT',
        PAID: 'LEGAL_FEE_PAID',
    },
    DC_INVOICE_RECEIVED: {
        UPLOADED: 'DC_INVOICE_RECEIVED',
        SENT: 'INVOICE_SENT_CONSUMER',
    },
    PROOF_OF_PAYMENT: {
        UPLOADED: 'POP_RECEIVED',
        SENT: 'POP_SENT_TO_DC',
    },
};

/** Categories a fee document must never pull a case out of. */
const FINISHED_CATEGORIES = new Set(['COMPLETED', 'SETTLED', 'LOST']);

export type FeeTransitionSkipReason =
    | 'NOT_FEE_DOCUMENT'
    | 'EVENT_NOT_ALLOWED'
    | 'ALREADY_THERE'
    | 'ALREADY_AHEAD'
    | 'CASE_FINISHED';

export type FeeTransitionDecision =
    | { move: true; toStatus: string }
    | { move: false; toStatus?: string; reason: FeeTransitionSkipReason };

export function resolveFeeDocumentTransition(params: {
    docType: string;
    event: FeeDocumentEvent;
    currentStatus: string | null | undefined;
}): FeeTransitionDecision {
    const { docType, event, currentStatus } = params;

    if (!isFeeDocumentType(docType)) return { move: false, reason: 'NOT_FEE_DOCUMENT' };

    const toStatus = TRANSITIONS[docType][event];
    if (!toStatus) return { move: false, reason: 'EVENT_NOT_ALLOWED' };

    const current = currentStatus ?? '';
    if (current === toStatus) return { move: false, toStatus, reason: 'ALREADY_THERE' };

    const category = getStatusByCode(current)?.category;
    if (category && FINISHED_CATEGORIES.has(category)) {
        return { move: false, toStatus, reason: 'CASE_FINISHED' };
    }

    const steps = FEE_WORKFLOW_STEPS[getFeeDocumentInfo(docType)!.workflow];
    const from = steps.indexOf(current);
    if (from !== -1 && from > steps.indexOf(toStatus)) {
        return { move: false, toStatus, reason: 'ALREADY_AHEAD' };
    }

    return { move: true, toStatus };
}

/** One line for a toast/API response explaining why the status did not move. */
export function describeFeeTransitionSkip(reason: FeeTransitionSkipReason): string {
    switch (reason) {
        case 'ALREADY_THERE': return 'Case is already at this status';
        case 'ALREADY_AHEAD': return 'Case is already further along — status left unchanged';
        case 'CASE_FINISHED': return 'Case is completed, settled or lost — status left unchanged';
        case 'EVENT_NOT_ALLOWED': return 'This action does not change the case status';
        case 'NOT_FEE_DOCUMENT': return 'Not an invoice or proof of payment';
    }
}

/** Payment category recorded when a payable fee invoice is marked paid. */
export function feePaymentCategory(docType: FeeDocumentType): string {
    return docType === 'LEGAL_FEE_INVOICE' ? 'LEGAL_FEE' : 'DC_FEE_RECOVERY';
}

/**
 * Fallback legal fee for the UI before the Company Profile's `legalFeeAmount`
 * has loaded. The server always uses the profile value.
 */
export const DEFAULT_LEGAL_FEE_AMOUNT = 1700;

// ---------------------------------------------------------------------------
// Outbound email wording
// ---------------------------------------------------------------------------

export interface FeeEmailContext {
    consumerName: string;
    consumerIdNumber?: string | null;
    fileNumber?: string | null;
    dcName?: string | null;
    /** Plain-text signature block from the company profile. */
    signature: string;
    /** Optional note typed by staff, placed above the standard wording. */
    note?: string | null;
}

export function buildFeeDocumentEmail(
    docType: FeeDocumentType,
    ctx: FeeEmailContext,
): { subject: string; body: string } {
    const ref = [ctx.consumerName, ctx.consumerIdNumber ? `ID ${ctx.consumerIdNumber}` : null]
        .filter(Boolean)
        .join(' — ');
    const fileRef = ctx.fileNumber ? ` (File ${ctx.fileNumber})` : '';
    const dear = docType === 'INVOICE_TO_DC' || docType === 'PROOF_OF_PAYMENT'
        ? `Dear ${ctx.dcName?.trim() || 'Debt Counsellor'},`
        : `Dear ${ctx.consumerName},`;
    const note = ctx.note?.trim() ? `${ctx.note.trim()}\n\n` : '';

    let subject: string;
    let text: string;
    switch (docType) {
        case 'INVOICE_TO_DC':
            subject = `Invoice for outstanding fees — ${ref}`;
            text = `Following your transfer request for our client ${ref}${fileRef}, please find attached our invoice for the fees still owed on this file.\n\nOnce the invoice is settled, please send us proof of payment and we will proceed with the transfer.`;
            break;
        case 'LEGAL_FEE_INVOICE':
            subject = `Legal fee invoice${fileRef}`;
            text = `Please find attached your legal fee invoice${fileRef}.\n\nPlease use your ID number as the payment reference and send us your proof of payment once paid so we can continue with your matter.`;
            break;
        case 'DC_INVOICE_RECEIVED':
            subject = `Invoice from your previous debt counsellor${fileRef}`;
            text = `Your previous debt counsellor${ctx.dcName ? ` (${ctx.dcName})` : ''} has sent the attached invoice for fees owed on your file. They will only release your file to us once it is settled.\n\nPlease pay the invoice using the banking details on it and send us your proof of payment — we will forward it to them.`;
            break;
        case 'PROOF_OF_PAYMENT':
            subject = `Proof of payment — ${ref}`;
            text = `Please find attached proof of payment from our client ${ref}${fileRef} for the invoice you issued.\n\nPlease confirm receipt and release the consumer's file so the transfer can proceed.`;
            break;
    }

    return { subject, body: `${dear}\n\n${note}${text}\n\nKind regards,\n\n${ctx.signature}` };
}
