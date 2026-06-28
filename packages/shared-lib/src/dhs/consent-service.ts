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

export type RecordConsentResult =
    | { ok: true; alreadyConsented: boolean; caseId: string }
    | { ok: false; error: string; status: number };

/**
 * Record the consumer's consent against a token, capturing IP + user-agent for the
 * audit trail, then fire the post-consent trigger hook. Idempotent: a second submit
 * on an already-consented token returns success without re-firing the hook.
 */
export async function recordDrrConsent(params: {
    token: string;
    ipAddress?: string;
    userAgent?: string;
}): Promise<RecordConsentResult> {
    const { token, ipAddress, userAgent } = params;
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
        data: { status: 'CONSENTED', consentedAt: new Date(), ipAddress: ipAddress ?? null, userAgent: userAgent ?? null },
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
 * ───────────────────────────── EXTENSION POINT ─────────────────────────────
 * Fired exactly once when a consumer grants debt review removal consent.
 *
 * TODO (per business): wire up what consent should TRIGGER. Examples that may go
 * here later: kick off the debt-review-removal trigger, generate Form 17.W, queue
 * bureau dispute letters, advance the case status, notify staff, etc.
 *
 * The consent row id is passed so the handler can load full context. Keep this
 * idempotent — it only fires on the PENDING→CONSENTED transition. Stamps
 * triggeredAt for traceability.
 */
export async function onDebtReviewRemovalConsent(consentId: string): Promise<void> {
    const consent = await prisma.debtReviewRemovalConsent.findUnique({
        where: { id: consentId },
        include: { case: true, client: true, consumer: true },
    });
    if (!consent) return;

    logger.info(
        `[DRR_CONSENT] onDebtReviewRemovalConsent fired for case ${consent.caseId} ` +
        `(file ${consent.case?.fileNumber ?? '?'}) — no downstream action wired yet (awaiting business definition).`
    );

    // ↓↓↓ Add the triggered action(s) here once defined. ↓↓↓

    await prisma.debtReviewRemovalConsent.update({
        where: { id: consentId },
        data: { triggeredAt: new Date() },
    });
}
