import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';
import { addWorkingDays } from '@zenowethu/shared-lib/src/statuses/workingDays';

const logger = createLogger('cron/dhs-recheck');

export async function POST(request: Request) {
    const cronSecret = request.headers.get('x-cron-secret');
    const isValidCron = cronSecret && cronSecret === process.env.CRON_SECRET;

    if (!isValidCron) {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const startedAt = new Date();
    logger.info('[CRON] DHS re-check starting...');

    const stats = { scanned: 0, triggered: 0, skipped: 0, errors: 0 };

    try {
        // Find all cases with PENDING_VIA_DHS whose nextUpdate is today or overdue
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        const pendingCases = await prisma.case.findMany({
            where: {
                status: 'PENDING_VIA_DHS',
                isDeleted: false,
                nextUpdate: { lte: today },
            },
            select: { id: true, fileNumber: true, nextUpdate: true },
            take: 50, // Safety limit per run
        });

        stats.scanned = pendingCases.length;
        logger.info(`[CRON] Found ${pendingCases.length} PENDING_VIA_DHS case(s) due for re-check`);

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        for (const c of pendingCases) {
            try {
                // Trigger a DHS lookup for this case via internal API call
                const res = await fetch(`${appUrl}/api/dhs/lookup`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-cron-secret': process.env.CRON_SECRET || '',
                    },
                    body: JSON.stringify({ caseId: c.id, action: 'check_status' }),
                });

                if (res.ok) {
                    stats.triggered++;
                    logger.info(`[CRON] DHS re-check triggered for case ${c.fileNumber}`);
                } else {
                    // If DHS lookup fails, push nextUpdate forward to avoid hammering
                    await prisma.case.update({
                        where: { id: c.id },
                        data: { nextUpdate: addWorkingDays(new Date(), 2) },
                    });
                    stats.skipped++;
                    logger.warn(`[CRON] DHS lookup call failed for ${c.fileNumber} — rescheduled +2 working days`);
                }
            } catch (err) {
                stats.errors++;
                logger.error(`[CRON] DHS re-check error for case ${c.fileNumber}:`, err);
            }
        }

        await logAutomationRun({
            type: 'DHS_RECHECK',
            status: stats.errors > 0 && stats.triggered === 0 ? 'FAILED' : 'SUCCESS',
            startedAt,
            logs: stats,
        });

        logger.info('[CRON] DHS re-check complete:', stats);
        return NextResponse.json({ success: true, stats, ranAt: new Date().toISOString() });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[CRON] DHS re-check failed:', error);
        await logAutomationRun({ type: 'DHS_RECHECK', status: 'FAILED', startedAt, errorMessage: msg, logs: stats });
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
