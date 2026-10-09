/**
 * Automatic legal fee invoice for files Accepted via DHS (server-only).
 *
 * Node-only (imports `prisma`). Import directly — do NOT re-export from the
 * package index.
 *
 * Fired from `handleDhsAccepted`, i.e. when "Check Request Status" (or the
 * workflow cron) finds a file accepted. A D3/D4 consumer must go to court, which
 * costs the consumer the legal fee (R1,700 by default), so we:
 *
 *   1. create the invoice PDF and file it on the case,
 *   2. publish it to the consumer's Crediva vault,
 *   3. email it to the consumer,
 *   4. record "No Arrangement yet" until staff arrange how it will be paid.
 *
 * Rules (see `legal-fee-rules.ts`):
 *   - only ever for accepted files — callers must not invoke this otherwise;
 *   - A / C files have no legal fee ("No Legal Fees");
 *   - never when Legal Fees Status shows a person has dealt with it (payroll
 *     consent, arrangement, paying, refused, …);
 *   - idempotent: one invoice per case. An automatic invoice that failed to
 *     send (no email on file, provider down) is re-sent on the next check;
 *   - the case's workflow status is NOT changed — it stays at "Ready to
 *     Consent" while the consumer consents. The timeline records every step.
 *
 * Never throws: failures are returned in `errors` and the DHS check carries on.
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { getAutomationUserId } from '../automation/automation-user';
import { sendFeeDocument } from './fee-document-service';
import { feeDocumentLogTag } from './fee-document-status';
import { generateLegalFeeInvoiceDocument } from './legal-fee-document';
import {
    decideLegalFeeAction,
    describeLegalFeeSkip,
    LEGAL_FEES_STATUS,
} from './legal-fee-rules';

const logger = createLogger('finance/legal-fee-auto');

export interface AutoLegalFeeResult {
    action: 'INVOICED' | 'RESENT' | 'NO_LEGAL_FEES' | 'SKIPPED';
    invoiceNumber?: string;
    emailSent: boolean;
    portalPublished: boolean;
    /** One line for the staff toast / logs. */
    message: string;
    errors: string[];
}

const skipped = (message: string, errors: string[] = []): AutoLegalFeeResult => ({
    action: 'SKIPPED', emailSent: false, portalPublished: false, message, errors,
});

export async function autoIssueLegalFeeInvoice(params: {
    caseId: string;
    userId?: string | null;
}): Promise<AutoLegalFeeResult> {
    const { caseId } = params;
    try {
        const actor = params.userId ?? (await getAutomationUserId()) ?? null;

        const found = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                id: true,
                consumerDhsStatus: true,
                dhsStatus: true,
                legalFeesStatus: true,
                client: { select: { email: true } },
            },
        });
        if (!found) return skipped('Case not found', ['Case not found']);

        // One invoice per case — but an automatic one that never went out is retried.
        const existingDoc = await prisma.document.findFirst({
            where: { caseId, type: 'LEGAL_FEE_INVOICE' },
            orderBy: { uploadedAt: 'desc' },
            select: { id: true, extractedData: true },
        });
        if (existingDoc) {
            return await resendIfAutoAndUnsent({ caseId, actor, document: existingDoc, hasEmail: !!found.client.email });
        }

        const decision = decideLegalFeeAction({
            consumerDhsStatus: found.consumerDhsStatus || found.dhsStatus,
            legalFeesStatus: found.legalFeesStatus,
        });

        if (decision.action === 'NO_LEGAL_FEES') {
            if (decision.setStatus && found.legalFeesStatus !== LEGAL_FEES_STATUS.NO_LEGAL_FEES) {
                await prisma.case.update({ where: { id: caseId }, data: { legalFeesStatus: LEGAL_FEES_STATUS.NO_LEGAL_FEES } });
            }
            return { action: 'NO_LEGAL_FEES', emailSent: false, portalPublished: false, message: 'No legal fees — consumer status A/C', errors: [] };
        }
        if (decision.action === 'SKIP') {
            return skipped(describeLegalFeeSkip(decision.reason, found.legalFeesStatus));
        }

        // ── D3 / D4, nothing handled yet: raise the invoice ─────────────────
        const generated = await generateLegalFeeInvoiceDocument({
            caseId,
            userId: actor,
            input: { description: 'Legal fees', dueInDays: 7 },
            moveStatus: false,
            autoIssued: true,
        });
        if ('error' in generated) {
            await addComment(caseId, actor, `[SYSTEM] Legal fees: could not create the legal fee invoice automatically — ${generated.error}. Please create it manually from the Documents tab.`);
            return skipped('Legal fee invoice could not be created', [generated.error]);
        }

        if (found.legalFeesStatus !== LEGAL_FEES_STATUS.NO_ARRANGEMENT) {
            await prisma.case.update({ where: { id: caseId }, data: { legalFeesStatus: LEGAL_FEES_STATUS.NO_ARRANGEMENT } })
                .catch((error) => logger.error({ error, caseId }, 'Could not set Legal Fees Status'));
        }

        const send = await sendInvoice({ caseId, actor, documentId: generated.documentId, hasEmail: !!found.client.email });
        await addComment(
            caseId,
            actor,
            send.emailSent
                ? `[SYSTEM] Legal fees: file is Accepted via DHS (${found.consumerDhsStatus || found.dhsStatus}) — legal fee invoice ${generated.invoiceNumber} (R${generated.total.toFixed(2)}) emailed to the consumer${generated.portalPublished ? ' and added to their Crediva portal' : ''}. Legal Fees Status → No Arrangement yet.`
                : `[SYSTEM] Legal fees: invoice ${generated.invoiceNumber} (R${generated.total.toFixed(2)}) was created${generated.portalPublished ? ' and added to the Crediva portal' : ''} but NOT emailed — ${send.errors.join('; ') || 'no reason given'}. It will be sent on the next status check, or send it from the Documents tab.`,
        );

        return {
            action: 'INVOICED',
            invoiceNumber: generated.invoiceNumber,
            emailSent: send.emailSent,
            portalPublished: generated.portalPublished,
            message: send.emailSent
                ? `Legal fee invoice ${generated.invoiceNumber} (R${generated.total.toFixed(2)}) created and emailed to the consumer.`
                : `Legal fee invoice ${generated.invoiceNumber} created but not emailed: ${send.errors.join('; ')}`,
            errors: send.errors,
        };
    } catch (error) {
        logger.error({ error, caseId }, 'Automatic legal fee invoice failed');
        const message = error instanceof Error ? error.message : String(error);
        return skipped('Legal fee invoice failed — see logs', [message]);
    }
}

async function sendInvoice(params: {
    caseId: string;
    actor: string | null;
    documentId: string;
    hasEmail: boolean;
}): Promise<{ emailSent: boolean; errors: string[] }> {
    if (!params.hasEmail) return { emailSent: false, errors: ['no consumer email on file'] };
    const sent = await sendFeeDocument({
        caseId: params.caseId,
        documentId: params.documentId,
        userId: params.actor,
        moveStatus: false,
    });
    return 'error' in sent ? { emailSent: false, errors: [sent.error] } : { emailSent: true, errors: [] };
}

/**
 * An invoice already exists. Only an invoice the automation raised, and that has
 * never been sent, is sent now — staff-created invoices are never auto-sent.
 */
async function resendIfAutoAndUnsent(params: {
    caseId: string;
    actor: string | null;
    document: { id: string; extractedData: string | null };
    hasEmail: boolean;
}): Promise<AutoLegalFeeResult> {
    const { caseId, actor, document, hasEmail } = params;

    let auto = false;
    try {
        auto = (JSON.parse(document.extractedData ?? '{}') as { autoIssued?: unknown }).autoIssued === true;
    } catch { /* not ours */ }
    if (!auto) return skipped('A legal fee invoice already exists for this case');

    const alreadySent = await prisma.workflowLog.findFirst({
        where: { caseId, action: 'FEE_DOCUMENT_SENT', notes: { startsWith: feeDocumentLogTag(document.id) } },
        select: { id: true },
    });
    if (alreadySent) return skipped('Legal fee invoice already sent');

    const send = await sendInvoice({ caseId, actor, documentId: document.id, hasEmail });
    if (send.emailSent) {
        await addComment(caseId, actor, '[SYSTEM] Legal fees: the automatically created legal fee invoice has now been emailed to the consumer.');
    }
    return {
        action: send.emailSent ? 'RESENT' : 'SKIPPED',
        emailSent: send.emailSent,
        portalPublished: false,
        message: send.emailSent ? 'Legal fee invoice emailed to the consumer.' : `Legal fee invoice still not emailed: ${send.errors.join('; ')}`,
        errors: send.errors,
    };
}

async function addComment(caseId: string, userId: string | null, content: string): Promise<void> {
    if (!userId) return;
    await prisma.caseComment.create({ data: { caseId, userId, content } }).catch(() => null);
}
