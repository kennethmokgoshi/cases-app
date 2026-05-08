import { NextResponse } from 'next/server';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { RetentionService } from '@zenowethu/shared-lib/src/integrations/retention-service';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/admin/retention/letsatsi-sync');

export async function POST(request: Request) {
    try {
        const session = await auth();
        
        // Only allow admins or internal cron triggers (if we add a secret key)
        const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.isAdmin;
        const authHeader = request.headers.get('authorization');
        const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

        if (!isAdmin && !isCron) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        logger.info('🚀 Manually triggering Letsatsi Retention Sync');
        
        const result = await RetentionService.syncLetsatsiFollowups();

        return NextResponse.json({
            success: true,
            message: 'Letsatsi Retention Sync complete',
            data: result
        });

    } catch (error) {
        logger.error('❌ Retention sync failed:', error);
        return NextResponse.json({ 
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
