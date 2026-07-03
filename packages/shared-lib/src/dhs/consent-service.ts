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

const logger = createLogger('dhs/consent-service');

/** Default link validity. */
export const CONSENT_EXPIRY_DAYS = 30;

/** The exact wording the consumer agrees to — snapshotted onto each consent record. */
export const DRR_CONSENT_TEXT =
    'I confirm that I am the consumer named above and I give Zenowethu Debt Management ' +
    '(NCRDC3693) my consent to proceed with the removal of the debt review flag from my ' +
    'credit profile. I authorise Zenowethu to act on my behalf and to communicate with the ' +
    'relevant credit bureaus and the National Credit Regulator for this purpose. I understand ' +
    'this is a regulated process and that timelines depend on the bureaus and authorities. ' +
    'My personal information will be handled in accordance with the Protection of Personal ' +
    'Information Act (POPIA).';

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
    fileNumber: string | null;
    consentText: string;
    consentedAt: Date | null;
}

/** Resolve a token for the public consent page (read-only, no PII beyond first name + file number). */
export async function getDrrConsentByToken(token: string): Promise<ConsentView | null> {
    const c = await prisma.debtReviewRemovalConsent.findUnique({
        where: { token },
        include: { case: { select: { fileNumber: true } }, client: { select: { firstName: true } } },
    });
    if (!c) return null;
    return {
        token: c.token,
        status: c.status,
        expired: c.expiresAt < new Date(),
        consumerFirstName: c.client?.firstName ?? null,
        fileNumber: c.case?.fileNumber ?? null,
        consentText: c.consentText ?? DRR_CONSENT_TEXT,
        consentedAt: c.consentedAt,
    };
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
}): Promise<RecordConsentResult> {
    const { token, ipAddress, userAgent, consumerId } = params;
    const c = await prisma.debtReviewRemovalConsent.findUnique({ where: { token } });

    if (!c) return { ok: false, error: 'This consent link is not valid.', status: 404 };
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
