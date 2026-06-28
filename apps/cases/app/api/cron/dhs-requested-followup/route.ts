/**
 * Requested-via-DHS Follow-up Cron — /api/cron/dhs-requested-followup
 *
 * Scans OVERDUE Debt Review Flag Removal files in status REQUESTED_VIA_DHS
 * (deliberately NOT DHS_REQUESTED — a separate automation covers that), re-checks
 * the DHS transfer status and routes accepted / declined / pending outcomes.
 *
 * Auth: x-cron-secret header (cron) OR an authenticated admin session (manual run).
 *
 * Query / body params:
 *   ?dryRun=true   — no DHS check, no sends, no DB writes; returns a full preview
 *                    of the decline-handling messages per file.
 *   ?limit=N       — cap the number of files processed.
 *
 * Recommended schedule: 0 9 * * 1-5  (weekdays 9am)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';
import { runRequestedViaDhsFollowup } from '@zenowethu/shared-lib/src/dhs-requested-followup/trigger';

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
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || 0) || undefined : undefined;

    const startedAt = new Date();
    logger.info(`[CRON] Requested-via-DHS follow-up starting (dryRun=${dryRun})...`);

    try {
        const result = await runRequestedViaDhsFollowup({ dryRun, limit });

        // A dry run is a read-only preview — don't pollute the AutomationRun history with it.
        if (!dryRun) {
            await logAutomationRun({
                type: 'DHS_REQUESTED_FOLLOWUP',
                status: result.stats.errors > 0 && result.stats.accepted === 0 && result.stats.declined === 0 && result.stats.stillPending === 0
                    ? 'FAILED'
                    : 'SUCCESS',
                startedAt,
                logs: { cohortCount: result.cohortCount, ...result.stats },
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

export const maxDuration = 300; // DHS Puppeteer checks are slow
