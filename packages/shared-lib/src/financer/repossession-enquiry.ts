/**
 * Repossession enquiry — "Repossession Enquiry" button on a case.
 *
 * Lets staff ask a vehicle financer, in one click, whether it has taken
 * enforcement steps (section 129 notice, summons, judgment, warrant) against a
 * consumer who has only approached us to look at their credit profile. The
 * letter itself is built by ./repossession-letter; this module is everything
 * around it:
 *
 *   prepare → what the modal needs (accounts to choose from, mandate status)
 *   send    → preview OR send, with the hard rules enforced server-side
 *
 * Hard rules (not just UI hints):
 *   • No signed POA + ID copy on the case → refuse. A financer will not release
 *     account information to a party that cannot prove its authority (and POPIA
 *     forbids them doing so). Same operating rule as every DC-facing send.
 *   • The account must belong to THIS case — a stray id can never address a
 *     letter about another consumer's account.
 *   • Every send is recorded on the case timeline with what was attached.
 */

import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { createLogger } from '../logger';
import { getCompanyProfile } from '../company/company-profile-service';
import { sendManualMessage } from '../notifications/service';
import { getAutomationUserId } from '../automation/automation-user';
import {
    resolveMandateAttachments,
    mandateAttachedLabel,
    type MandateKind,
} from '../documents/mandate-attachments';
import {
    buildRepossessionEnquiryLetter,
    formatLetterDate,
    isLikelyVehicleAccount,
} from './repossession-letter';

const logger = createLogger('financer/repossession-enquiry');

export const DEFAULT_REPLY_BUSINESS_DAYS = 5;
export const DEFAULT_PAUSE_BUSINESS_DAYS = 10;

export const RepossessionEnquiryInputSchema = z.object({
    action: z.enum(['preview', 'send']),
    creditAccountId: z.string().min(1, 'Choose the vehicle account'),
    vehicleDescription: z.string().trim().max(200).optional(),
    registrationNumber: z.string().trim().max(20).optional(),
    recipientEmail: z.string().trim().email('Enter a valid financer email address'),
    replyWithinBusinessDays: z.number().int().min(1).max(30).default(DEFAULT_REPLY_BUSINESS_DAYS),
    pauseBusinessDays: z.number().int().min(1).max(30).default(DEFAULT_PAUSE_BUSINESS_DAYS),
    /** Remember the typed email on the financer so staff only type it once. */
    saveContact: z.boolean().default(false),
});

export type RepossessionEnquiryInput = z.infer<typeof RepossessionEnquiryInputSchema>;

export interface EnquiryAccountOption {
    id: string;
    creditorName: string;
    accountNumber: string | null;
    accountType: string;
    outstandingBalance: number;
    status: string;
    /** Hint only — the credit report does not reliably label vehicle finance. */
    likelyVehicle: boolean;
    /** Email already stored on the financer (CreditProvider), if any. */
    providerEmail: string | null;
    providerAttorneyEmail: string | null;
}

export interface RepossessionEnquiryContext {
    caseId: string;
    clientName: string;
    idNumber: string;
    mandate: { complete: boolean; missing: MandateKind[]; summary: string };
    accounts: EnquiryAccountOption[];
    /** Set only when exactly one account looks like vehicle finance. */
    preselectedAccountId: string | null;
    defaults: { replyWithinBusinessDays: number; pauseBusinessDays: number };
}

/** Everything the modal needs. Null when the case does not exist. */
export async function prepareRepossessionEnquiry(
    caseId: string
): Promise<RepossessionEnquiryContext | null> {
    const currentCase = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
            client: { select: { firstName: true, lastName: true, idNumber: true } },
            creditAccounts: { include: { creditProvider: true }, orderBy: { creditorName: 'asc' } },
        },
    });
    if (!currentCase) return null;

    const mandate = await resolveMandateAttachments(caseId);

    const accounts: EnquiryAccountOption[] = currentCase.creditAccounts.map(account => ({
        id: account.id,
        creditorName: account.creditorName,
        accountNumber: account.accountNumber,
        accountType: account.accountType,
        outstandingBalance: Number(account.outstandingBalance),
        status: account.status,
        likelyVehicle: isLikelyVehicleAccount(account.accountType, account.creditorName),
        providerEmail: account.creditProvider?.email?.trim() || null,
        providerAttorneyEmail: account.creditProvider?.attorneyEmail?.trim() || null,
    }));

    // Likely-vehicle accounts first so the obvious choice is at the top.
    accounts.sort((a, b) => Number(b.likelyVehicle) - Number(a.likelyVehicle));
    const likely = accounts.filter(a => a.likelyVehicle);

    return {
        caseId,
        clientName: `${currentCase.client.firstName} ${currentCase.client.lastName}`.trim(),
        idNumber: currentCase.client.idNumber,
        mandate: { complete: mandate.complete, missing: mandate.missing, summary: mandate.summary },
        accounts,
        preselectedAccountId: likely.length === 1 ? likely[0].id : null,
        defaults: {
            replyWithinBusinessDays: DEFAULT_REPLY_BUSINESS_DAYS,
            pauseBusinessDays: DEFAULT_PAUSE_BUSINESS_DAYS,
        },
    };
}

export type RepossessionEnquiryFailure =
    | 'CASE_NOT_FOUND'
    | 'ACCOUNT_NOT_FOUND'
    | 'MANDATE_INCOMPLETE'
    | 'SEND_FAILED';

export interface RepossessionEnquiryResult {
    ok: boolean;
    failure?: RepossessionEnquiryFailure;
    error?: string;
    /** Always populated on success — for a preview this is what would be sent. */
    letter?: { subject: string; body: string; to: string; replyBy: string; pauseUntil: string };
    sent: boolean;
    mandateSummary?: string;
    missingMandate?: MandateKind[];
}

/** Preview or send the enquiry. Server-side enforcement of every hard rule. */
export async function processRepossessionEnquiry(params: {
    caseId: string;
    input: RepossessionEnquiryInput;
    actorUserId: string;
}): Promise<RepossessionEnquiryResult> {
    const { caseId, input, actorUserId } = params;

    const currentCase = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
            client: { select: { firstName: true, lastName: true, idNumber: true } },
            creditAccounts: { where: { id: input.creditAccountId }, include: { creditProvider: true } },
        },
    });
    if (!currentCase) {
        return { ok: false, failure: 'CASE_NOT_FOUND', error: 'Case not found', sent: false };
    }

    const account = currentCase.creditAccounts[0];
    if (!account) {
        return {
            ok: false,
            failure: 'ACCOUNT_NOT_FOUND',
            error: 'That account does not belong to this case',
            sent: false,
        };
    }

    const mandate = await resolveMandateAttachments(caseId);
    if (!mandate.complete) {
        const what = mandate.missing.map(m => (m === 'POA' ? 'signed POA' : 'ID copy')).join(' and ');
        return {
            ok: false,
            failure: 'MANDATE_INCOMPLETE',
            error: `Cannot send: the case has no ${what}. The financer will not release account information without proof of our authority.`,
            sent: false,
            mandateSummary: mandate.summary,
            missingMandate: mandate.missing,
        };
    }

    const [company, actor] = await Promise.all([
        getCompanyProfile(),
        prisma.user.findUnique({ where: { id: actorUserId }, select: { firstName: true, lastName: true } }),
    ]);

    const issuedOn = new Date();
    const clientName = `${currentCase.client.firstName} ${currentCase.client.lastName}`.trim();
    const letter = buildRepossessionEnquiryLetter({
        company,
        clientName,
        idNumber: currentCase.client.idNumber,
        financerName: account.creditorName,
        accountNumber: account.accountNumber,
        vehicleDescription: input.vehicleDescription,
        registrationNumber: input.registrationNumber,
        signerName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : company.tradingName,
        issuedOn,
        replyWithinBusinessDays: input.replyWithinBusinessDays,
        pauseBusinessDays: input.pauseBusinessDays,
        // Complete mandate guarantees both documents are attached.
        attachedLabel: mandateAttachedLabel(mandate) ?? 'Power of Attorney and identity document',
    });

    const summary = {
        subject: letter.subject,
        body: letter.body,
        to: input.recipientEmail,
        replyBy: formatLetterDate(letter.replyBy),
        pauseUntil: formatLetterDate(letter.pauseUntil),
    };

    if (input.action === 'preview') {
        return {
            ok: true,
            sent: false,
            letter: summary,
            mandateSummary: mandate.summary,
            missingMandate: mandate.missing,
        };
    }

    const result = await sendManualMessage(caseId, 'EMAIL', input.recipientEmail, letter.body, letter.subject, {
        attachments: mandate.attachments,
        senderId: actorUserId,
    });

    if (!result.emailSuccess) {
        return {
            ok: false,
            failure: 'SEND_FAILED',
            error:
                (result.errors.join(', ') || 'Email provider reported a failure') +
                '. Check Failed Communications before sending again — it may already be queued for retry.',
            sent: false,
            letter: summary,
            mandateSummary: mandate.summary,
            missingMandate: mandate.missing,
        };
    }

    // The email is out. Nothing below may turn that into a reported failure.
    if (input.saveContact && account.creditProvider && !account.creditProvider.email?.trim()) {
        await prisma.creditProvider
            .update({ where: { id: account.creditProvider.id }, data: { email: input.recipientEmail } })
            .catch(error => {
                logger.error({ error, caseId }, '[Repossession enquiry] Could not save financer email');
            });
    }

    const vehicleNote = [input.vehicleDescription, input.registrationNumber].filter(Boolean).join(' / ');
    const attachmentNote = result.attachmentErrors?.length
        ? `. ⚠ Attachment delivery failed: ${result.attachmentErrors.join('; ')}`
        : '';
    const commentContent =
        `Sent repossession enquiry to ${account.creditorName} (${input.recipientEmail}) ` +
        `re account ${account.accountNumber ?? 'number not confirmed'}` +
        `${vehicleNote ? ` — ${vehicleNote}` : ''}. ` +
        `Reply requested by ${summary.replyBy}; pause on enforcement requested until ${summary.pauseUntil}. ` +
        `${mandate.summary}${attachmentNote}`;

    const commentUserId = actorUserId || (await getAutomationUserId().catch(() => null));
    if (commentUserId) {
        await prisma.caseComment
            .create({
                data: { caseId, userId: commentUserId, content: commentContent, type: 'SYSTEM', isInternal: true },
            })
            .catch(error => {
                logger.error({ error, caseId }, '[Repossession enquiry] Could not record case comment');
            });
    } else {
        logger.warn({ caseId }, `[Repossession enquiry] No user to attribute the case comment to: ${commentContent}`);
    }

    return {
        ok: true,
        sent: true,
        letter: summary,
        mandateSummary: mandate.summary,
        missingMandate: mandate.missing,
    };
}
