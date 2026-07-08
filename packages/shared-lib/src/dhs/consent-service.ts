/**
 * Debt Review Removal — Consumer Consent Service
 *
 * After a file is Accepted via DHS (consumer status codes A / C / D3 / D4) we send
 * the consumer a unique link asking them to consent to us proceeding with debt
 * review removal. When they click and confirm, we record the consent (with a
 * POPIA / ECTA audit trail) and fire onDebtReviewRemovalConsent() — the extension
 * point for "what consent triggers" (to be defined later).
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { getAutomationUserId } from '../automation/automation-user';
import { addWorkingDays } from '../statuses/workingDays';

const logger = createLogger('dhs/consent-service');

/** Default link validity. */
export const CONSENT_EXPIRY_DAYS = 30;

/** Workflow status a case moves to the moment the consumer approves. */
export const CONSENT_RECEIVED_STATUS = 'CONSENT_RECEIVED';
/** Working-day follow-up window while the document readiness check runs. */
const CONSENT_RECEIVED_FOLLOWUP_DAYS = 2;

/**
 * Statuses a case may legitimately be parked at while waiting on consent.
 * The consent hook only advances the workflow from one of these — if staff have
 * manually moved the case elsewhere, the consent is still recorded but the
 * workflow status is left alone.
 */
const CONSENT_ADVANCE_FROM_STATUSES = new Set([
    'READY_TO_CONSENT',
    'ACCEPTED_VIA_DHS',
    'ZDM_CLIENT',
]);

/** The exact wording the consumer agrees to — snapshotted onto each consent record. */
export const DRR_CONSENT_TEXT =
    'I confirm that I am the consumer named above and I acknowledge that my debt review file ' +
    'has been transferred to Zenowethu Debt Management (NCRDC3693). I confirm that Zenowethu ' +
    'Debt Management is the debt counsellor authorised to work on my file from this point ' +
    'and to continue with the debt review removal process. I authorise Zenowethu to act on ' +
    'my behalf, manage and communicate about my file, and communicate with the relevant ' +
    'credit bureaus, the National Credit Regulator, and any relevant debt counsellor where ' +
    'needed. I understand that this approval creates a clear record that Zenowethu Debt ' +
    'Management is handling my file. My personal information will be handled in accordance ' +
    'with the Protection of Personal Information Act (POPIA).';

export function getConsentBaseUrl(): string {
    return (
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        'https://cases.zenowethu.co.za'
    ).replace(/\/+$/, '');
}

/** Build the public consent link for a token. */
export function buildConsentLink(token: string): string {
    return `${getConsentBaseUrl()}/consent/debt-review-removal/${token}`;
}

/** Base URL of the Credo consumer portal. */
export function getCredoBaseUrl(): string {
    return (process.env.CREDO_URL || 'https://credo.zenowethu.co.za').replace(/\/+$/, '');
}

/**
 * Build the login-gated Credo consent link for a token. The consumer signs in to
 * Credo (username = 13-digit SA ID number) and approves the consent there — this
 * is the preferred channel because the approval is tied to an authenticated
 * consumer profile, not just possession of the emailed link.
 */
export function buildCredoConsentLink(token: string): string {
    return `${getCredoBaseUrl()}/consent/${token}`;
}

export interface CreateConsentResult {
    id: string;
    token: string;
    link: string;
    expiresAt: Date;
}

/**
 * Create (or reuse) a pending consent request for a case and return the link.
 * If an un-expired PENDING request already exists for the case, it is reused so
 * the consumer isn't sent conflicting links.
 */
export async function createDrrConsentRequest(params: {
    caseId: string;
    clientId?: string | null;
    consumerId?: string | null;
    channel?: 'EMAIL' | 'WHATSAPP' | 'CREDO';
    expiryDays?: number;
}): Promise<CreateConsentResult> {
    const { caseId, clientId, consumerId } = params;
    const channel = params.channel ?? 'EMAIL';
    const expiryDays = params.expiryDays ?? CONSENT_EXPIRY_DAYS;

    const existing = await prisma.debtReviewRemovalConsent.findFirst({
        where: { caseId, status: 'PENDING', expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
    });
    if (existing) {
        return { id: existing.id, token: existing.token, link: buildConsentLink(existing.token), expiresAt: existing.expiresAt };
    }

    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    const created = await prisma.debtReviewRemovalConsent.create({
        data: { caseId, clientId: clientId ?? null, consumerId: consumerId ?? null, channel, expiresAt, consentText: DRR_CONSENT_TEXT },
    });
    logger.info(`[DRR_CONSENT] Created consent request for case ${caseId} (token ${created.token.slice(0, 8)}…)`);
    return { id: created.id, token: created.token, link: buildConsentLink(created.token), expiresAt };
}

export interface ConsentView {
    token: string;
    status: string;
    expired: boolean;
    consumerFirstName: string | null;
    consumerDisplayName: string | null;
    fileNumber: string | null;
    consentText: string;
    consentedAt: Date | null;
}

export interface ConsentVerificationState {
    requiresVerification: true;
    token: string;
}

export interface VerifyConsentIdentityResult {
    ok: boolean;
    view?: ConsentView;
    error?: string;
    status?: number;
}

export const DRR_CONSENT_VERIFY_ERROR =
    'We could not verify this consent link. Please check the ID number and try again.';

export function formatConsentConsumerDisplayName(
    client: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string | null {
    const firstGivenName = client?.firstName?.trim().split(/\s+/)[0] ?? '';
    const surname = client?.lastName?.trim() ?? '';
    return [firstGivenName, surname].filter(Boolean).join(' ') || null;
}

type ConsentRecordForView = {
    token: string;
    status: string;
    expiresAt: Date;
    consentText: string | null;
    consentedAt: Date | null;
    case?: { fileNumber: string | null } | null;
    client?: { firstName?: string | null; lastName?: string | null; idNumber?: string | null } | null;
};

function buildConsentView(c: ConsentRecordForView): ConsentView {
    const consumerDisplayName = formatConsentConsumerDisplayName(c.client);
    return {
        token: c.token,
        status: c.status,
        expired: c.expiresAt < new Date(),
        consumerFirstName: consumerDisplayName,
        consumerDisplayName,
        fileNumber: c.case?.fileNumber ?? null,
        consentText: c.status === 'PENDING' ? DRR_CONSENT_TEXT : c.consentText ?? DRR_CONSENT_TEXT,
        consentedAt: c.consentedAt,
    };
}

/** Resolve whether a consent token exists without exposing consumer details. */
export async function getDrrConsentVerificationState(token: string): Promise<ConsentVerificationState | null> {
    const c = await prisma.debtReviewRemovalConsent.findUnique({
        where: { token },
        select: { token: true },
    });
    return c ? { requiresVerification: true, token: c.token } : null;
}

/** Resolve a token for the public consent page (read-only, no PII beyond display name + file number). */
export async function getDrrConsentByToken(token: string): Promise<ConsentView | null> {
    const c = await prisma.debtReviewRemovalConsent.findUnique({
        where: { token },
        include: { case: { select: { fileNumber: true } }, client: { select: { firstName: true, lastName: true } } },
    });
    if (!c) return null;
    return buildConsentView(c);
}

/** Verify that a public token and typed SA ID number belong to the same consumer. */
export async function verifyDrrConsentIdentity(params: {
    token: string;
    idNumber: string;
}): Promise<VerifyConsentIdentityResult> {
    const c = await prisma.debtReviewRemovalConsent.findUnique({
        where: { token: params.token },
        include: {
            case: { select: { fileNumber: true } },
            client: { select: { firstName: true, lastName: true, idNumber: true } },
        },
    });

    if (!c) return { ok: false, error: 'This consent link is not valid.', status: 404 };
    if (c.client?.idNumber !== params.idNumber) {
        return { ok: false, error: DRR_CONSENT_VERIFY_ERROR, status: 403 };
    }
    if (c.status === 'CANCELLED') {
        return { ok: false, error: 'This consent request has been cancelled.', status: 410 };
    }
    if (c.status === 'EXPIRED' || (c.status !== 'CONSENTED' && c.expiresAt < new Date())) {
        return { ok: false, error: 'This consent link has expired. Please contact us for a new link.', status: 410 };
    }

    return { ok: true, view: buildConsentView(c) };
}

export interface RecordConsentResult {
    ok: boolean;
    /** Set when ok: true — whether the token had already been consented (idempotent re-submit). */
    alreadyConsented?: boolean;
    /** Set when ok: true. */
    caseId?: string;
    /** Set when ok: false. */
    error?: string;
    /** HTTP status to return when ok: false. */
    status?: number;
}

/**
 * Record the consumer's consent against a token, capturing IP + user-agent for the
 * audit trail, then fire the post-consent trigger hook. Idempotent: a second submit
 * on an already-consented token returns success without re-firing the hook.
 */
export async function recordDrrConsent(params: {
    token: string;
    ipAddress?: string;
    userAgent?: string;
    /** Credo consumer id when the consent is approved from inside the portal. */
    consumerId?: string;
    /** SA ID number already verified against the token for public, signed-out approvals. */
    verifiedIdNumber?: string;
}): Promise<RecordConsentResult> {
    const { token, ipAddress, userAgent, consumerId, verifiedIdNumber } = params;
    const c = await prisma.debtReviewRemovalConsent.findUnique({
        where: { token },
        include: { client: { select: { idNumber: true } } },
    });

    if (!c) return { ok: false, error: 'This consent link is not valid.', status: 404 };
    if (!consumerId) {
        if (!verifiedIdNumber) return { ok: false, error: DRR_CONSENT_VERIFY_ERROR, status: 400 };
        if (c.client?.idNumber !== verifiedIdNumber) {
            return { ok: false, error: DRR_CONSENT_VERIFY_ERROR, status: 403 };
        }
    }
    if (c.status === 'CANCELLED') return { ok: false, error: 'This consent request has been cancelled.', status: 410 };
    if (c.status === 'CONSENTED') return { ok: true, alreadyConsented: true, caseId: c.caseId };
    if (c.expiresAt < new Date()) {
        if (c.status !== 'EXPIRED') {
            await prisma.debtReviewRemovalConsent.update({ where: { id: c.id }, data: { status: 'EXPIRED' } });
        }
        return { ok: false, error: 'This consent link has expired. Please contact us for a new link.', status: 410 };
    }

    const updated = await prisma.debtReviewRemovalConsent.update({
        where: { id: c.id },
        data: {
            status: 'CONSENTED',
            consentText: DRR_CONSENT_TEXT,
            consentedAt: new Date(),
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            ...(consumerId ? { consumerId } : {}),
        },
    });
    logger.info(`[DRR_CONSENT] Consent GRANTED for case ${updated.caseId} (token ${token.slice(0, 8)}…)`);

    // Fire-and-record the post-consent trigger. Never let a hook failure undo the consent.
    try {
        await onDebtReviewRemovalConsent(updated.id);
    } catch (err) {
        logger.error('[DRR_CONSENT] Post-consent hook failed (consent still recorded):', err);
    }

    return { ok: true, alreadyConsented: false, caseId: updated.caseId };
}

/**
 * Fired exactly once when a consumer grants debt review removal consent
 * (PENDING → CONSENTED transition only). Records the consent on the case
 * timeline and stamps triggeredAt.
 *
 * The document-readiness pipeline (check credit report / payslip / bank
 * statement, split the combined document, chase the referrer) is deliberately
 * NOT run here: it needs the case files on disk, which only the Cases app can
 * reach. The consent API routes invoke it — the Cases route directly, the Credo
 * route via the Cases internal endpoint (see dhs/drr-readiness.ts).
 */
export async function onDebtReviewRemovalConsent(consentId: string): Promise<void> {
    const consent = await prisma.debtReviewRemovalConsent.findUnique({
        where: { id: consentId },
        include: { case: true, client: true, consumer: true },
    });
    if (!consent) return;

    logger.info(
        `[DRR_CONSENT] Consent granted for case ${consent.caseId} ` +
        `(file ${consent.case?.fileNumber ?? '?'}, channel ${consent.channel}) — recording on case timeline.`
    );

    // Advance the workflow off "Ready to Consent" so the case header reflects
    // reality the moment the consumer approves. Only advance from the expected
    // parking statuses — never clobber a manual staff move.
    if (consent.case && CONSENT_ADVANCE_FROM_STATUSES.has(consent.case.status ?? '')) {
        await prisma.case
            .update({
                where: { id: consent.caseId },
                data: {
                    status: CONSENT_RECEIVED_STATUS,
                    nextUpdate: addWorkingDays(new Date(), CONSENT_RECEIVED_FOLLOWUP_DAYS),
                },
            })
            .then(() =>
                logger.info(`[DRR_CONSENT] Case ${consent.caseId} status → ${CONSENT_RECEIVED_STATUS}`)
            )
            .catch((err) =>
                logger.error(`[DRR_CONSENT] Failed to set Consent Received status for ${consent.caseId}:`, err)
            );
    }

    const automationUserId = await getAutomationUserId().catch(() => null);
    if (automationUserId) {
        const who = consent.consumer
            ? `via their Credo profile (ID ${consent.consumer.idNumber ? consent.consumer.idNumber.slice(0, 6) + '***' : 'on file'})`
            : 'via the secure emailed link';
        await prisma.caseComment
            .create({
                data: {
                    caseId: consent.caseId,
                    userId: automationUserId,
                    content:
                        `[SYSTEM] Debt review removal CONSENT RECEIVED — the consumer approved ${who}. ` +
                        `The document readiness check (credit report, payslip, bank statement) is now running; ` +
                        `its outcome will be posted here.`,
                    activityType: 'DRR_CONSENT_RECEIVED',
                },
            })
            .catch((err) => logger.error('[DRR_CONSENT] Failed to add consent comment:', err));
    }

    await prisma.debtReviewRemovalConsent.update({
        where: { id: consentId },
        data: { triggeredAt: new Date() },
    });
}
