import { NextResponse } from 'next/server';
import { createLogger } from '@zenowethu/shared-lib';
import { runDebtReviewRemovalTrigger } from '@zenowethu/shared-lib/src/debt-review-removal/trigger';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';

const logger = createLogger('api/cron/debt-review-removal');

/**
 * POST /api/cron/debt-review-removal
 *
 * Cron-triggered scan for cases eligible for debt review removal on DHS.
 * Protected by x-cron-secret header (see middleware.ts).
 *
 * Recommended schedule: 0 8 * * 1-5  (weekdays 8am)
 */
export async function POST() {
    const startedAt = new Date();
    logger.info('[Cron] Debt Review Removal trigger started');

    try {
        const result = await runDebtReviewRemovalTrigger();

        await logAutomationRun({
            type: 'DEBT_REVIEW_REMOVAL',
            status: 'SUCCESS',
            startedAt,
            logs: {
                assessed: result.assessed,
                readyForRemoval: result.readyForRemoval,
                needsDocs: result.needsDocs,
                escalated: result.escalated,
                noAction: result.noAction,
                errors: result.errors,
            },
        });

        return NextResponse.json({
            success: true,
            assessed: result.assessed,
            readyForRemoval: result.readyForRemoval,
            needsDocs: result.needsDocs,
            escalated: result.escalated,
            noAction: result.noAction,
            errors: result.errors,
        });
    } catch (error) {
        logger.error('[Cron] Debt Review Removal trigger failed:', error);

        await logAutomationRun({
            type: 'DEBT_REVIEW_REMOVAL',
            status: 'FAILED',
            startedAt,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

        return NextResponse.json({ error: 'Debt review removal trigger failed' }, { status: 500 });
    }
}
