/**
 * DHS decline idempotency guard.
 *
 * A declined file is re-checked on the DHS on a schedule, and the same decline
 * reason (e.g. "please send POA + ID") is re-observed every time. Without a
 * guard, each observation would re-send the SEND_DOCS / SEND_DOCS_WITH_NCR
 * document email to the debt counsellor — spamming them with duplicates.
 *
 * This module answers one question: "have we ALREADY emailed the documents to
 * the DC for the current decline?" using our own outbound record
 * (NotificationLog) as the authoritative signal. The inbox fallback ("if the
 * sent log shows nothing, look in the mailboxes") is performed by the app layer
 * (the Handle Decline route), which holds the mailbox credentials — this helper
 * covers the deterministic, credential-free stage that also protects the
 * automatic DHS-check path.
 *
 * Never throws: a lookup failure returns `found: false` so the caller proceeds
 * as if nothing was sent rather than blocking a legitimate response.
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';

const logger = createLogger('dhs/decline-dedup');

export interface PriorDocsEmail {
    found: boolean;
    /** When the earlier document email was sent, if found */
    sentAt: Date | null;
    /** Who it went to, if found */
    recipient: string | null;
}

/**
 * Look for a successful document email already sent to the debt counsellor for
 * the current decline — i.e. a successful outbound EMAIL on this case, on or
 * after the decline was detected (`since`).
 *
 * When a DC email is known we match on it exactly (the only thing we email the
 * DC after a decline is the documents), which keeps the check precise. When no
 * DC email is known we fall back to any successful case email after `since`,
 * erring toward NOT re-sending.
 */
export async function findPriorDocsEmail(params: {
    caseId: string;
    dcEmail: string | null;
    since: Date;
}): Promise<PriorDocsEmail> {
    const { caseId, dcEmail, since } = params;
    try {
        const prior = await prisma.notificationLog.findFirst({
            where: {
                caseId,
                channel: 'EMAIL',
                success: true,
                sentAt: { gte: since },
                ...(dcEmail ? { recipient: dcEmail } : {}),
            },
            orderBy: { sentAt: 'desc' },
            select: { sentAt: true, recipient: true },
        });

        if (!prior) {
            return { found: false, sentAt: null, recipient: null };
        }
        return { found: true, sentAt: prior.sentAt, recipient: prior.recipient };
    } catch (error) {
        // Guard failures must never block a legitimate decline response.
        logger.error('findPriorDocsEmail failed — treating as not-yet-sent', {
            caseId,
            error: error instanceof Error ? error.message : String(error),
        });
        return { found: false, sentAt: null, recipient: null };
    }
}

/**
 * Decide whether a SEND_DOCS document email should be (re)sent.
 *
 * Rules (per product):
 *   • Not sent before                     → send.
 *   • Already sent AND file NOT overdue    → skip (alert staff, offer resend).
 *   • Already sent AND file overdue        → send (a chase is warranted).
 *   • forceResend                          → send (staff clicked "Resend anyway").
 *
 * "Overdue" means the case's next-update date has passed.
 */
export function decideDocsResend(params: {
    prior: PriorDocsEmail;
    nextUpdate: Date | null;
    forceResend?: boolean;
    now?: Date;
}): { send: boolean; skippedAsDuplicate: boolean; overdue: boolean } {
    const { prior, nextUpdate, forceResend } = params;
    const now = params.now ?? new Date();
    const overdue = nextUpdate ? nextUpdate.getTime() < now.getTime() : false;

    if (forceResend) return { send: true, skippedAsDuplicate: false, overdue };
    if (!prior.found) return { send: true, skippedAsDuplicate: false, overdue };
    if (overdue) return { send: true, skippedAsDuplicate: false, overdue };
    return { send: false, skippedAsDuplicate: true, overdue };
}
