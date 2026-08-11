/**
 * Requested-via-DHS Follow-up Cron — /api/cron/dhs-requested-followup
 *
 * Scans every OVERDUE file awaiting a DHS transfer outcome — statuses
 * REQUESTED_VIA_DHS and DHS_REQUESTED, all services — runs the same
 * "Check Request Status" DHS check the case page button runs, and routes
 * accepted / declined / pending outcomes.
 *
 * Auth: x-cron-secret header (cron) OR an authenticated admin session (manual run).
 *
 * Query / body params:
 *   ?dryRun=true   — no DHS check, no sends, no DB writes; returns a full preview
 *                    of the decline-handling messages per file.
 *   ?limit=N       — cap the number of files processed.
 *   ?statuses=A,B  — override the cohort statuses (default: both of the above).
 *   ?service=slug  — narrow to one service, e.g. debt_review_flag_removal
 *                    (default: no service filter — all files).
 *   ?overdueDays=N — fallback overdue window for statuses with no SLA (default 7).
 *   ?declineMode=  — 'review' (DEFAULT — a DECLINED result is classified and flagged
 *                    for staff, nothing is sent) or 'auto' (runs the full
 *                    handleDHSDecline response, which emails/SMSes the consumer
 *                    and the DC). Only move to 'auto' once the real false-decline
 *                    rate has been measured from review-mode runs.
 *
 * Recommended schedule: 0 6 * * 1-5  (weekdays 6am — deliberately BEFORE the 7am
 * overdue-scan, which rewrites overdue REQUESTED_VIA_DHS cases to
 * TAT_ELAPSED_DC_PENDING and would otherwise drain this cohort before it runs).
 */

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';
import { runRequestedViaDhsFollowup } from '@zenowethu/shared-lib/src/dhs-requested-followup/trigger';
import type { DeclineMode } from '@zenowethu/shared-lib/src/dhs-requested-followup/trigger';

const logger = createLogger('cron/dhs-requested-followup');

export async function POST(request: Request) {
    const cronSecret = request.headers.get('x-cron-secret');
    const isValidCron = cronSecret && cronSecret === process.env.CRON_SECRET;

    if (!isValidCron) {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const limit = positiveInt(url.searchParams.get('limit'));
    const overdueDays = positiveInt(url.searchParams.get('overdueDays'));
    const statusesParam = url.searchParams.get('statuses');
    const statuses = statusesParam
        ? statusesParam.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;
    const service = url.searchParams.get('service') || undefined;

    // Anything other than an explicit 'auto' stays in the safe review mode.
    const declineModeParam = url.searchParams.get('declineMode');
    if (declineModeParam && declineModeParam !== 'auto' && declineModeParam !== 'review') {
        return NextResponse.json(
            { error: `Invalid declineMode "${declineModeParam}" — expected 'review' or 'auto'` },
            { status: 400 },
        );
    }
    const declineMode: DeclineMode = declineModeParam === 'auto' ? 'auto' : 'review';

    const startedAt = new Date();
    logger.info(`[CRON] Requested-via-DHS follow-up starting (dryRun=${dryRun}, declineMode=${declineMode})...`);

    try {
        const result = await runRequestedViaDhsFollowup({ dryRun, limit, overdueDays, statuses, service, declineMode });

        // A dry run is a read-only preview — don't pollute the AutomationRun history with it.
        if (!dryRun) {
            await logAutomationRun({
                type: 'DHS_REQUESTED_FOLLOWUP',
                // Only a run where every file errored counts as FAILED — a review-mode
                // run legitimately produces no accepted/declined/pending outcomes.
                status: result.stats.errors > 0 && productiveOutcomes(result.stats) === 0
                    ? 'FAILED'
                    : 'SUCCESS',
                startedAt,
                logs: {
                    cohortStatuses: result.cohortStatuses,
                    cohortService: result.cohortService,
                    cohortCount: result.cohortCount,
                    declineMode: result.declineMode,
                    ...result.stats,
                },
            });
        }

        logger.info('[CRON] Requested-via-DHS follow-up complete:', result.stats);
        return NextResponse.json({ success: true, ...result, ranAt: new Date().toISOString() });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[CRON] Requested-via-DHS follow-up failed:', error);
        if (!dryRun) {
            await logAutomationRun({ type: 'DHS_REQUESTED_FOLLOWUP', status: 'FAILED', startedAt, errorMessage: msg });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/** Count of files the run actually resolved one way or another (i.e. did real work). */
function productiveOutcomes(stats: {
    accepted: number;
    declined: number;
    declinedForReview: number;
    skippedAwaitingReview: number;
    stillPending: number;
    notOnDhs: number;
}): number {
    return stats.accepted + stats.declined + stats.declinedForReview
        + stats.skippedAwaitingReview + stats.stillPending + stats.notOnDhs;
}

/** Parse a positive integer query param, returning undefined for absent/invalid values. */
function positiveInt(raw: string | null): number | undefined {
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const maxDuration = 300; // DHS Puppeteer checks are slow
