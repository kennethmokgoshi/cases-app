/**
 * DHS "Accepted via DHS" — Consumer Acceptance + Consent Trigger
 *
 * Fired when a DHS "Check Request Status" run finds a consumer's debt review file
 * transfer has been ACCEPTED (consumer status codes A / C / D3 / D4, or our own
 * NCRDC override). The file is now formally with Zenowethu Debt Management, so we:
 *
 *   1. Create a unique debt-review-removal CONSENT request (token + secure link).
 *   2. Email the consumer to confirm the acceptance and ask them to click the link
 *      and consent before we begin the debt review flag removal.
 *
 * Idempotent: a consent request is created at most once per case. On repeat status
 * checks (the file stays "Accepted via DHS"), the email is NOT re-sent. If the email
 * fails to send, the just-created consent request is rolled back (CANCELLED) so a
 * later check retries the notification rather than leaving the consumer un-emailed.
 *
 * Compliance: the email is phrased as a process we are *starting* — no guaranteed
 * outcome and no fixed timeline — per Zenowethu's debt-review-removal disclaimer rules.
 */

import { prisma } from '@zenowethu/database';
import { sendManualMessage } from '../notifications/service';
import { createLogger } from '../logger';
import { getAutomationUserId } from '../automation/automation-user';
import { addWorkingDays } from '../statuses/workingDays';
import { buildAcceptedViaDhsEmail, ACCEPTED_VIA_DHS_SUBJECT, type CredoLoginDetails } from './accepted-email';
import { buildConsentReminderEmail, CONSENT_REMINDER_SUBJECT } from './consent-reminder-email';
import { createDrrConsentRequest, buildConsentLink, buildCredoConsentLink } from './consent-service';
import {
    provisionConsumerForClient,
    createPasswordResetTokenForConsumer,
} from '../credo/consumer-provisioning';

const logger = createLogger('dhs/accepted-handler');

/** Workflow status a case is parked at while awaiting the consumer's consent. */
export const READY_TO_CONSENT_STATUS = 'READY_TO_CONSENT';
/** Working-day follow-up window while waiting on consent. */
const CONSENT_FOLLOWUP_DAYS = 3;

/**
 * Workflow/DHS status values (normalised — no spaces/underscores, upper-case)
 * that mean a file is "Accepted via DHS" and therefore eligible for the
 * Manage Consumers post-acceptance follow-on.
 *   • ACCEPTED_VIA_DHS / READY_TO_CONSENT — our workflow statuses
 *   • CONSENT_RECEIVED / AWAITING_DRR_DOCS — post-consent statuses; the button
 *     re-runs the document readiness + clearance check
 *   • Accepted / Auto Transferred         — the DHS request-status labels
 *   • ZDM_CLIENT / ZDM Client             — the file is already under our own
 *     NCRDC, so no transfer is needed and the follow-on is available immediately
 */
const MANAGE_CONSUMERS_ELIGIBLE = new Set<string>([
    'ACCEPTEDVIADHS',
    'READYTOCONSENT',
    'CONSENTRECEIVED',
    'AWAITINGDRRDOCS',
    'ACCEPTED',
    'AUTOTRANSFERRED',
    'ZDMCLIENT',
]);

const normaliseStatus = (value?: string | null): string =>
    (value ?? '').replace(/[\s_]+/g, '').toUpperCase();

/**
 * True when a case is in an "Accepted via DHS" state and is therefore eligible
 * for the Manage Consumers post-acceptance follow-on (the consumer acceptance +
 * debt-review-removal consent email, and later the Search & Manage Consumer
 * clearance status-history check).
 *
 * Accepts either the workflow `status` or the DHS `dhsStatus` label; matching is
 * whitespace/underscore/case-insensitive so 'ACCEPTED_VIA_DHS', 'Accepted', and
 * 'Auto Transferred' all qualify. Pure — safe to reuse on the server and client.
 *
 * `manuallyAcceptedViaDhs` is the staff override: DHS sometimes transfers a file
 * into our DC profile without ever showing a formal Accepted/Auto Transferred
 * status, so a human can tick the "Accepted via DHS" box to unlock this follow-on.
 */
export function isManageConsumersEligible(input: {
    status?: string | null;
    dhsStatus?: string | null;
    manuallyAcceptedViaDhs?: boolean | null;
}): boolean {
    return (
        input.manuallyAcceptedViaDhs === true ||
        MANAGE_CONSUMERS_ELIGIBLE.has(normaliseStatus(input.status)) ||
        MANAGE_CONSUMERS_ELIGIBLE.has(normaliseStatus(input.dhsStatus))
    );
}

export interface AcceptedHandlerResult {
    /** True when the acceptance + consent email was delivered on this run. */
    emailSent: boolean;
    /** True when no action was taken because the consumer was already notified. */
    skipped: boolean;
    /** Human-readable reason for a skip / no-op. */
    reason?: string;
    /** The secure consent link (when one was created or already exists). */
    consentLink: string | null;
    /** Workflow status the case was moved to, if any. */
    statusUpdatedTo: string | null;
    actionsPerformed: string[];
    errors: string[];
}

/**
 * Handle an "Accepted via DHS" transition by creating a consent request and
 * emailing the consumer. Safe to call on every status check — it self-dedupes.
 *
 * Never throws: all failures are captured in `errors` so the caller (the DHS
 * status-check route / cron) can continue regardless.
 */
export async function handleDhsAccepted(params: {
    caseId: string;
    triggeredByUserId?: string;
    /**
     * Re-send the acceptance + consent email even when a PENDING consent already
     * exists (the "Resend Confirmation Link" button). The existing token/link is
     * reused so earlier emails stay valid. A CONSENTED case is never re-emailed.
     */
    forceResend?: boolean;
}): Promise<AcceptedHandlerResult> {
    const { caseId } = params;
    const forceResend = params.forceResend === true;
    // Attribute to the staff member who ran the check, else the system automation user.
    const triggeredByUserId =
        params.triggeredByUserId ?? (await getAutomationUserId()) ?? undefined;

    const result: AcceptedHandlerResult = {
        emailSent: false,
        skipped: false,
        consentLink: null,
        statusUpdatedTo: null,
        actionsPerformed: [],
        errors: [],
    };

    try {
        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: true },
        });

        if (!caseData) {
            result.errors.push('Case not found');
            return result;
        }

        // ── Idempotency ──────────────────────────────────────────────────────
        // A live PENDING/CONSENTED consent request means the consumer has already
        // been emailed the acceptance + consent link. Don't spam them on re-checks.
        const existing = await prisma.debtReviewRemovalConsent.findFirst({
            where: {
                caseId,
                status: { in: ['PENDING', 'CONSENTED'] },
                expiresAt: { gt: new Date() },
            },
        });
        if (existing && existing.status === 'CONSENTED') {
            // Already CONSENTED — never re-email; leave the workflow for the
            // post-consent flow to advance.
            result.skipped = true;
            result.consentLink =
                existing.channel === 'CREDO'
                    ? buildCredoConsentLink(existing.token)
                    : buildConsentLink(existing.token);
            result.reason = 'Consumer has already consented';
            logger.info(`[DHS Accepted] Skipping email for case ${caseId} — consent CONSENTED.`);
            return result;
        }
        if (existing && !forceResend) {
            // Still waiting on the consumer — keep (or restore) the case parked at
            // "Ready to Consent" so a re-check doesn't downgrade it, and refresh the
            // +3 working-day follow-up. Don't re-send the email.
            result.skipped = true;
            result.consentLink =
                existing.channel === 'CREDO'
                    ? buildCredoConsentLink(existing.token)
                    : buildConsentLink(existing.token);
            result.reason = 'Consumer already notified; consent still pending';
            await setReadyToConsent(caseId, triggeredByUserId);
            result.statusUpdatedTo = READY_TO_CONSENT_STATUS;
            logger.info(`[DHS Accepted] Skipping email for case ${caseId} — consent PENDING.`);
            return result;
        }
        // From here: no live consent yet, OR forceResend on a PENDING one (the
        // consent request below reuses the existing token, so old links stay valid).

        // ── No email on file → escalate to staff, do not create a dead link ──
        if (!caseData.client.email) {
            result.errors.push(
                'No consumer email on file — acceptance/consent email not sent. Add the consumer email and resend.'
            );
            await addComment(
                caseId,
                triggeredByUserId,
                `[SYSTEM] DHS Accepted: File is Accepted via DHS but no consumer email is on file — the acceptance + consent email was NOT sent. Please add the consumer's email address and resend.`
            );
            return result;
        }

        // ── Provision the Credo profile (username = 13-digit ID number) ──────
        // The consent is approved INSIDE Credo, so the consumer needs a portal
        // profile. Auto-provision is idempotent and returns null when the client
        // has no valid 13-digit ID number — in that case we fall back to the
        // public token link so the consumer can still consent.
        let credoConsumerId: string | null = null;
        let credoSetPasswordLink: string | null = null;
        try {
            const provision = await provisionConsumerForClient(caseData.clientId);
            if (provision) {
                credoConsumerId = provision.consumerId;
                let activationToken = provision.activationToken;
                if (!activationToken) {
                    // Existing profile — if it has never been activated (no password),
                    // issue a fresh set-password token so the login instructions work.
                    const account = await prisma.consumerAccount.findUnique({
                        where: { id: provision.consumerId },
                        select: { password: true },
                    });
                    if (account && !account.password) {
                        activationToken = await createPasswordResetTokenForConsumer(provision.consumerId);
                    }
                }
                if (activationToken) {
                    const credoUrl = (process.env.CREDO_URL || 'https://crediva.zenowethu.co.za').replace(/\/+$/, '');
                    credoSetPasswordLink = `${credoUrl}/reset-password?token=${activationToken}`;
                }
            }
        } catch (err) {
            logger.error(`[DHS Accepted] Credo provisioning failed for case ${caseId} (falling back to public consent link):`, err);
        }

        // ── Create the consent request (token + secure link) ─────────────────
        const consent = await createDrrConsentRequest({
            caseId,
            clientId: caseData.clientId,
            consumerId: credoConsumerId,
            channel: credoConsumerId ? 'CREDO' : 'EMAIL',
        });
        result.consentLink = credoConsumerId
            ? buildCredoConsentLink(consent.token)
            : consent.link;

        // Resend of a pre-existing consent: keep the row in step with the link we
        // are about to email — the Credo profile may only have been provisioned
        // after the original send (when the first email used the public link).
        if (existing && credoConsumerId && (existing.consumerId !== credoConsumerId || existing.channel !== 'CREDO')) {
            await prisma.debtReviewRemovalConsent
                .update({ where: { id: consent.id }, data: { consumerId: credoConsumerId, channel: 'CREDO' } })
                .catch((err) => logger.error(`[DHS Accepted] Failed to sync consent channel for ${caseId}:`, err));
        }

        const credoDetails: CredoLoginDetails | null =
            credoConsumerId && caseData.client.idNumber
                ? { idNumber: caseData.client.idNumber, setPasswordLink: credoSetPasswordLink }
                : null;

        let subject: string;
        let body: string;
        if (forceResend) {
            // Resend / Manage Consumers nudge: the consumer already received the
            // acceptance news — send the consent REMINDER instead, which tells
            // them plainly that flag removal cannot continue without consent.
            subject = CONSENT_REMINDER_SUBJECT(caseData.fileNumber);
            body = buildConsentReminderEmail({
                clientFirstName: caseData.client.firstName,
                fileNumber: caseData.fileNumber,
                consentLink: result.consentLink,
                credo: credoDetails,
            });
        } else {
            // First send: the "Good News – transfer accepted" email.
            // Resolve the previous DC name (the firm the file transferred FROM):
            // prefer the values on the case, else the DebtCounsellor master
            // table keyed by the case's NCRDC number.
            let previousDcName = (caseData.debtCounsellorName || caseData.previousDebtCounsellor || '').trim();
            let previousDcTradingName = (caseData.dcTradingName || '').trim();
            if (!previousDcName && !previousDcTradingName && caseData.ncrdcNo) {
                const dc = await prisma.debtCounsellor.findUnique({
                    where: { ncrdcNo: caseData.ncrdcNo },
                    select: { fullName: true, tradingName: true },
                });
                if (dc) {
                    previousDcName = (dc.fullName || '').trim();
                    previousDcTradingName = (dc.tradingName || '').trim();
                }
            }

            subject = ACCEPTED_VIA_DHS_SUBJECT(caseData.fileNumber);
            body = buildAcceptedViaDhsEmail({
                clientFirstName: caseData.client.firstName,
                fileNumber: caseData.fileNumber,
                consentLink: result.consentLink,
                previousDcName,
                previousDcTradingName,
                credo: credoDetails,
            });
        }

        const emailResult = await sendManualMessage(
            caseId,
            'EMAIL',
            caseData.client.email,
            body,
            subject
        );

        if (emailResult.emailSuccess) {
            result.emailSent = true;
            result.actionsPerformed.push(
                forceResend
                    ? `Consent REMINDER email ${existing ? 'RE-SENT' : 'sent'} to consumer (${caseData.client.email})`
                    : `Acceptance + consent email sent to consumer (${caseData.client.email})`
            );
            // Park the workflow at "Ready to Consent" with a +3 working-day follow-up.
            await setReadyToConsent(caseId, triggeredByUserId);
            result.statusUpdatedTo = READY_TO_CONSENT_STATUS;
            await addComment(
                caseId,
                triggeredByUserId,
                forceResend
                    ? `[SYSTEM] Consent REMINDER ${existing ? 'RE-SENT' : 'sent'} to consumer (${caseData.client.email}) — the email reminds them that the debt review flag removal cannot continue until they consent. ${existing ? 'The existing secure link remains valid.' : 'A new secure consent link was issued.'} Still awaiting consumer consent before flag removal proceeds.`
                    : `[SYSTEM] DHS Accepted: Transfer accepted — file is now with Zenowethu Debt Management. Acceptance + debt-review-removal consent email sent to consumer (${caseData.client.email}). Status → Ready to Consent. Next update +${CONSENT_FOLLOWUP_DAYS} working days. Awaiting consumer consent via the secure link before flag removal proceeds.`
            );
        } else {
            // Roll back a NEWLY created consent request so the next status check
            // retries the send, rather than treating the consumer as "already
            // notified". A reused (resend) token is left untouched — cancelling it
            // would kill the link already in the consumer's inbox.
            if (!existing) {
                await prisma.debtReviewRemovalConsent
                    .update({ where: { id: consent.id }, data: { status: 'CANCELLED' } })
                    .catch(() => null);
            }
            result.errors.push(...emailResult.errors);
            await addComment(
                caseId,
                triggeredByUserId,
                `[SYSTEM] DHS Accepted: Transfer accepted via DHS but the consent email FAILED to send to consumer (${caseData.client.email}). Reason: ${emailResult.errors.join(', ') || 'unknown'}. It will be retried on the next status check — please verify the consumer's email address.`
            );
        }

        logger.info({ result }, `[DHS Accepted] Completed for case ${caseId}`);
        return result;
    } catch (error) {
        logger.error(`[DHS Accepted] Unexpected error for case ${caseId}:`, error);
        result.errors.push(
            `Internal error: ${error instanceof Error ? error.message : String(error)}`
        );
        return result;
    }
}

/**
 * Move the case to the "Ready to Consent" parking status and set the +3
 * working-day follow-up. Best-effort — a failure here must not undo the email.
 */
async function setReadyToConsent(caseId: string, userId: string | undefined): Promise<void> {
    await prisma.case
        .update({
            where: { id: caseId },
            data: {
                status: READY_TO_CONSENT_STATUS,
                nextUpdate: addWorkingDays(new Date(), CONSENT_FOLLOWUP_DAYS),
                ...(userId ? { updatedBy: { connect: { id: userId } } } : {}),
            },
        })
        .catch((err) => logger.error(`[DHS Accepted] Failed to set Ready to Consent for ${caseId}:`, err));
}

async function addComment(
    caseId: string,
    userId: string | undefined,
    content: string
): Promise<void> {
    if (!userId) return;
    await prisma.caseComment.create({ data: { caseId, userId, content } }).catch(() => null);
}
