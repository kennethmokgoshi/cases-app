import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { RetentionService } from '@zenowethu/shared-lib/src/integrations';

const logger = createLogger('api/admin/retention/letsatsi-sync');

/**
 * Trigger the 9-month follow-up sync for Letsatsi clients.
 * This should be called by a daily cron job.
 */
export async function POST(request: Request) {
    try {
        // Allow bypass via CRON_SECRET header for automated tasks
        const cronSecret = request.headers.get('x-cron-secret');
        const isCron = cronSecret === process.env.CRON_SECRET;

        if (!isCron) {
            const session = await auth();
            if (!session?.user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const user = session.user as any;
            if (!user.isAdmin && !user.isExecutive) {
                return NextResponse.json({ error: 'Forbidden — Admins only' }, { status: 403 });
            }
            logger.info(`[Retention API] Triggered by user ${user.email}`);
        } else {
            logger.info('[Retention API] Triggered by system cron');
        }

        const result = await RetentionService.syncLetsatsiFollowups();

        return NextResponse.json({ 
            success: true, 
            message: `Processed ${result.found} clients for date ${result.date}`,
            details: result 
        });

    } catch (error: any) {
        logger.error('[Retention API Error]', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Support for manual testing or checking status
 */
export async function GET() {
    return NextResponse.json({ 
        status: 'active', 
        service: 'Letsatsi Retention Sync',
        description: 'Syncs clients settled 9 months ago to GHL follow-up campaigns'
    });
}
