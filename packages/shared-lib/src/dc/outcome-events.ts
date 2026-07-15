/**
 * DHS outcome event recording.
 *
 * Case.declineReason only stores the LATEST decline message, so acceptance and
 * decline rates computed from Case rows undercount repeat declines. Every
 * accept/decline observed on the DHS is recorded here as a durable event —
 * one row per distinct (case, outcome, message) — giving the Debt Counsellor
 * admin page real rates and message-pattern stats.
 *
 * Writers must never break their caller: recordDhsOutcome catches everything
 * and reports failures in its result.
 */

import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';

const logger = createLogger('dc/outcome-events');

export type DhsOutcome = 'ACCEPTED' | 'DECLINED';

export interface RecordOutcomeResult {
    recorded: boolean;
    /** True when an identical event already existed (rechecks are expected). */
    duplicate: boolean;
    eventId: string | null;
    reason?: string;
}

// Loose cast until all generated clients include the new delegates — matches
// the existing debtCounsellor access pattern across the app.
const db = prisma as any;

/**
 * Record a DHS accept/decline outcome against a debt counsellor.
 *
 * Dedupe: DHS status checks re-run on a schedule and will re-observe the same
 * outcome many times. An event is skipped when the same case already has an
 * event with the same outcome and message — so a re-check records nothing,
 * but a NEW decline message on the same case records a fresh event.
 *
 * The DC is resolved from `debtCounsellordId` when given, else looked up by
 * `ncrdcNo`. When neither resolves, the event is skipped (not an error — many
 * legacy cases predate the DebtCounsellor master table).
 */
export async function recordDhsOutcome(params: {
    debtCounsellordId?: string | null;
    ncrdcNo?: string | null;
    caseId?: string | null;
    outcome: DhsOutcome;
    message?: string | null;
    category?: string | null;
    extractedEmail?: string | null;
    source?: 'DHS_SYNC' | 'BACKFILL';
    occurredAt?: Date;
}): Promise<RecordOutcomeResult> {
    try {
        let dcId = params.debtCounsellordId ?? null;
        if (!dcId && params.ncrdcNo) {
            const dc = await db.debtCounsellor.findUnique({
                where: { ncrdcNo: params.ncrdcNo },
                select: { id: true },
            });
            dcId = dc?.id ?? null;
        }
        if (!dcId) {
            return {
                recorded: false,
                duplicate: false,
                eventId: null,
                reason: 'No DebtCounsellor record for this case',
            };
        }

        const message = params.message?.trim() || null;

        if (params.caseId) {
            const existing = await db.dhsOutcomeEvent.findFirst({
                where: { caseId: params.caseId, outcome: params.outcome, message },
                select: { id: true },
            });
            if (existing) {
                return { recorded: false, duplicate: true, eventId: existing.id };
            }
        }

        const event = await db.dhsOutcomeEvent.create({
            data: {
                debtCounsellordId: dcId,
                caseId: params.caseId ?? null,
                outcome: params.outcome,
                message,
                category: params.category ?? null,
                extractedEmail: params.extractedEmail ?? null,
                source: params.source ?? 'DHS_SYNC',
                ...(params.occurredAt ? { occurredAt: params.occurredAt } : {}),
            },
        });

        logger.info('DHS outcome recorded', {
            debtCounsellordId: dcId,
            caseId: params.caseId ?? null,
            outcome: params.outcome,
            category: params.category ?? null,
        });

        return { recorded: true, duplicate: false, eventId: event.id };
    } catch (error) {
        logger.error('Failed to record DHS outcome', { params: { ...params, message: undefined }, error });
        return {
            recorded: false,
            duplicate: false,
            eventId: null,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}
