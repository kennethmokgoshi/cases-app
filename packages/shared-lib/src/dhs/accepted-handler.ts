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
import { buildAcceptedViaDhsEmail, ACCEPTED_VIA_DHS_SUBJECT } from './accepted-email';
import { createDrrConsentRequest, buildConsentLink } from './consent-service';

const logger = createLogger('dhs/accepted-handler');

export interface AcceptedHandlerResult {
    /** True when the acceptance + consent email was delivered on this run. */
    emailSent: boolean;
    /** True when no action was taken because the consumer was already notified. */
    skipped: boolean;
    /** Human-readable reason for a skip / no-op. */
    reason?: string;
    /** The secure consent link (when one was created or already exists). */
    consentLink: string | null;
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
}): Promise<AcceptedHandlerResult> {
    const { caseId } = params;
    // Attribute to the staff member who ran the check, else the system automation user.
    const triggeredByUserId =
        params.triggeredByUserId ?? (await getAutomationUserId()) ?? undefined;

    const result: AcceptedHandlerResult = {
        emailSent: false,
        skipped: false,
        consentLink: null,
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
        if (existing) {
            result.skipped = true;
            result.reason = 'Consumer already notified (a consent request already exists for this case)';
            result.consentLink = buildConsentLink(existing.token);
            logger.info(`[DHS Accepted] Skipping email for case ${caseId} — consent request already exists.`);
            return result;
        }

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

        // ── Create the consent request (token + secure link) ─────────────────
        const consent = await createDrrConsentRequest({
            caseId,
            clientId: caseData.clientId,
            channel: 'EMAIL',
        });
        result.consentLink = consent.link;

        const subject = ACCEPTED_VIA_DHS_SUBJECT(caseData.fileNumber);
        const body = buildAcceptedViaDhsEmail({
            clientFirstName: caseData.client.firstName,
            fileNumber: caseData.fileNumber,
            consentLink: consent.link,
        });

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
                `Acceptance + consent email sent to consumer (${caseData.client.email})`
            );
            await addComment(
                caseId,
                triggeredByUserId,
                `[SYSTEM] DHS Accepted: Transfer accepted via DHS — file is now with Zenowethu Debt Management. Acceptance + debt-review-removal consent email sent to consumer (${caseData.client.email}). Awaiting consumer consent via the secure link before flag removal proceeds.`
            );
        } else {
            // Roll back the consent request so the next status check retries the send,
            // rather than treating the consumer as "already notified".
            await prisma.debtReviewRemovalConsent
                .update({ where: { id: consent.id }, data: { status: 'CANCELLED' } })
                .catch(() => null);
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

async function addComment(
    caseId: string,
    userId: string | undefined,
    content: string
): Promise<void> {
    if (!userId) return;
    await prisma.caseComment.create({ data: { caseId, userId, content } }).catch(() => null);
}
