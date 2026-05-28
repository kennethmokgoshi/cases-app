import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { runOverdueScan } from '@zenowethu/shared-lib/src/automation/overdue-scan';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';

const logger = createLogger('cron/overdue-scan');

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
    logger.info('[CRON] Overdue scan starting...');

    try {
        const result = await runOverdueScan();

        await logAutomationRun({
            type: 'OVERDUE_SCAN',
            status: result.errors > 0 && result.actioned === 0 ? 'FAILED' : 'SUCCESS',
            startedAt,
            logs: {
                scanned: result.scanned,
                overdueFound: result.overdueFound,
                actioned: result.actioned,
                dcFollowups: result.dcFollowups,
                consumerFollowups: result.consumerFollowups,
                staffAlerts: result.staffAlerts,
                errors: result.errors,
            },
        });

        logger.info('[CRON] Overdue scan complete:', result);
        return NextResponse.json({ success: true, result, ranAt: new Date().toISOString() });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[CRON] Overdue scan failed:', error);
        await logAutomationRun({ type: 'OVERDUE_SCAN', status: 'FAILED', startedAt, errorMessage: msg });
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
