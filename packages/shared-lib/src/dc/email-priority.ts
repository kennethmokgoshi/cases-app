/**
 * Debt Counsellor priority email list (max 5 slots).
 *
 * Business rules (agreed with operations, Jul 2026):
 *   • Priority 1 is the address the DC has instructed us to use. An email a DC
 *     mentions in a DHS decline message is auto-promoted to priority 1, pushing
 *     every other address down one slot.
 *   • The list holds at most MAX_PRIORITY_EMAILS addresses. When a new address
 *     arrives on a full list, the priority-5 entry is dropped (it remains in
 *     DebtCounsellorEmailHistory for audit).
 *   • A bounced address keeps its slot but is skipped when picking the best
 *     send address, so sending falls through priority 1 → 2 → 3…
 *   • DebtCounsellor.preferredEmail is kept in sync with the effective best
 *     address so legacy code paths keep working.
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';

const logger = createLogger('dc/email-priority');

export const MAX_PRIORITY_EMAILS = 5;

export type DcEmailSource = 'DHS' | 'DECLINE_EXTRACTED' | 'STAFF' | 'BACKFILL';

export interface DcPriorityEmail {
    id: string;
    email: string;
    priority: number;
    source: string;
    lastBouncedAt: Date | null;
    bounceReason: string | null;
    notes: string | null;
}

export interface PromoteResult {
    promoted: boolean;
    /** True when the address was already sitting at priority 1. */
    alreadyPriorityOne: boolean;
    /** Address dropped off the end of a full list, if any. */
    droppedEmail: string | null;
    reason?: string;
}

const EMAIL_RX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export function normalizeDcEmail(email: string): string {
    return email.trim().toLowerCase();
}

// The DebtCounsellorEmail/DhsOutcomeEvent delegates are newer than some consumers'
// generated client typings; the loose cast matches the existing pattern used for
// debtCounsellor access across the app until all clients are regenerated.
const db = prisma as any;

/**
 * Promote an email address to priority 1 on a DC's list, shifting existing
 * addresses down and dropping the last entry when the list is full.
 * Also records the address in DebtCounsellorEmailHistory (once) and syncs
 * DebtCounsellor.preferredEmail. Never throws — failures are logged and
 * reported in the result so callers (the decline handler) are never broken
 * by contact-book maintenance.
 */
export async function promoteDcEmail(params: {
    debtCounsellordId: string;
    email: string;
    source: DcEmailSource;
    notes?: string;
}): Promise<PromoteResult> {
    const { debtCounsellordId, source, notes } = params;
    const email = normalizeDcEmail(params.email);

    if (!EMAIL_RX.test(email)) {
        return { promoted: false, alreadyPriorityOne: false, droppedEmail: null, reason: `Invalid email: ${params.email}` };
    }

    try {
        const rows: DcPriorityEmail[] = await db.debtCounsellorEmail.findMany({
            where: { debtCounsellordId },
            orderBy: { priority: 'asc' },
        });

        const existing = rows.find((r) => normalizeDcEmail(r.email) === email);

        if (existing && existing.priority === 1 && !existing.lastBouncedAt) {
            return { promoted: false, alreadyPriorityOne: true, droppedEmail: null };
        }

        // New order: promoted email first, everyone else keeps relative order.
        const others = rows.filter((r) => r.id !== existing?.id);
        const keep = others.slice(0, MAX_PRIORITY_EMAILS - 1);
        const dropped = others.slice(MAX_PRIORITY_EMAILS - 1);

        await db.$transaction(async (tx: any) => {
            for (const row of dropped) {
                await tx.debtCounsellorEmail.delete({ where: { id: row.id } });
            }
            if (existing) {
                // Re-instructed by the DC — treat as fresh, clear any bounce flag.
                await tx.debtCounsellorEmail.update({
                    where: { id: existing.id },
                    data: { priority: 1, source, lastBouncedAt: null, bounceReason: null, ...(notes ? { notes } : {}) },
                });
            } else {
                await tx.debtCounsellorEmail.create({
                    data: { debtCounsellordId, email, priority: 1, source, notes: notes ?? null },
                });
            }
            for (let i = 0; i < keep.length; i++) {
                await tx.debtCounsellorEmail.update({
                    where: { id: keep[i].id },
                    data: { priority: i + 2 },
                });
            }
            await tx.debtCounsellor.update({
                where: { id: debtCounsellordId },
                data: { preferredEmail: email },
            });
        });

        // Audit-log the address once (outside the transaction — best effort).
        const seen = await db.debtCounsellorEmailHistory.findFirst({
            where: { debtCounsellordId, email },
        });
        if (!seen) {
            await db.debtCounsellorEmailHistory
                .create({ data: { debtCounsellordId, email, source, notes: notes ?? null } })
                .catch(() => null);
        }

        logger.info('DC email promoted to priority 1', {
            debtCounsellordId,
            email,
            source,
            dropped: dropped.map((d) => d.email),
        });

        return {
            promoted: true,
            alreadyPriorityOne: false,
            droppedEmail: dropped[0]?.email ?? null,
        };
    } catch (error) {
        logger.error('Failed to promote DC email', { debtCounsellordId, email, error });
        return {
            promoted: false,
            alreadyPriorityOne: false,
            droppedEmail: null,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}

/** All priority emails for a DC, ordered priority 1 → 5. */
export async function getDcPriorityEmails(debtCounsellordId: string): Promise<DcPriorityEmail[]> {
    return db.debtCounsellorEmail.findMany({
        where: { debtCounsellordId },
        orderBy: { priority: 'asc' },
    });
}

/**
 * The best address to send to right now: the highest-priority entry that has
 * not bounced. Returns null when the list is empty or every entry has bounced.
 */
export async function getBestDcEmail(
    debtCounsellordId: string
): Promise<{ email: string; priority: number } | null> {
    const rows = await getDcPriorityEmails(debtCounsellordId);
    const best = rows.find((r) => !r.lastBouncedAt);
    return best ? { email: best.email, priority: best.priority } : null;
}

/**
 * Flag an address as bounced so sending falls through to the next priority.
 * Syncs DebtCounsellor.preferredEmail to the next usable address (or null).
 */
export async function recordDcEmailBounce(params: {
    debtCounsellordId: string;
    email: string;
    reason?: string;
}): Promise<{ flagged: boolean; nextBest: { email: string; priority: number } | null }> {
    const { debtCounsellordId } = params;
    const email = normalizeDcEmail(params.email);
    try {
        const row = await db.debtCounsellorEmail.findFirst({
            where: { debtCounsellordId, email },
        });
        if (row) {
            await db.debtCounsellorEmail.update({
                where: { id: row.id },
                data: { lastBouncedAt: new Date(), bounceReason: params.reason ?? 'Bounced / no response' },
            });
        }
        const nextBest = await getBestDcEmail(debtCounsellordId);
        await db.debtCounsellor
            .update({
                where: { id: debtCounsellordId },
                data: { preferredEmail: nextBest?.email ?? null },
            })
            .catch(() => null);
        if (row) {
            logger.info('DC email flagged as bounced', { debtCounsellordId, email, nextBest: nextBest?.email ?? null });
        }
        return { flagged: Boolean(row), nextBest };
    } catch (error) {
        logger.error('Failed to record DC email bounce', { debtCounsellordId, email, error });
        return { flagged: false, nextBest: null };
    }
}

/**
 * Seed a DC's priority list from the legacy single-value fields
 * (preferredEmail → P1, lastKnownEmail → P2, email → P3). No-op when the DC
 * already has priority entries. Used by the admin backfill.
 */
export async function seedDcPriorityEmails(dc: {
    id: string;
    preferredEmail: string | null;
    lastKnownEmail: string | null;
    email: string | null;
}): Promise<number> {
    const existing = await db.debtCounsellorEmail.count({ where: { debtCounsellordId: dc.id } });
    if (existing > 0) return 0;

    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const candidate of [dc.preferredEmail, dc.lastKnownEmail, dc.email]) {
        if (!candidate) continue;
        const email = normalizeDcEmail(candidate);
        if (!EMAIL_RX.test(email) || seen.has(email)) continue;
        seen.add(email);
        ordered.push(email);
    }

    for (let i = 0; i < ordered.length; i++) {
        await db.debtCounsellorEmail.create({
            data: {
                debtCounsellordId: dc.id,
                email: ordered[i],
                priority: i + 1,
                source: 'BACKFILL',
                notes: 'Seeded from legacy preferred/lastKnown/DHS email fields',
            },
        });
    }
    return ordered.length;
}
