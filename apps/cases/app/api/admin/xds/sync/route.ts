/**
 * XDS Sync API Route
 *
 * POST /api/admin/xds/sync
 *  - Logs in to the XDS portal
 *  - Reads the last-synced date from DB
 *  - Processes every date from (lastSyncedDate + 1) up to yesterday
 *  - First run: processes all dates available in XDS history
 *
 * Authorization:
 *  - Admin or Executive session (manual trigger), OR
 *  - X-Cron-Secret header matching XDS_CRON_SECRET env var (daily cron)
 *
 * GET /api/admin/xds/sync
 *  - Returns current sync status: credentials configured, last synced date, etc.
 */

import { NextResponse } from 'next/server';
import { createLogger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { runXdsSync } from '@zenowethu/shared-lib/src/xds/sync';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/xds/sync');
export const runtime = 'nodejs';
export const maxDuration = 600; // 10 minutes

async function isAuthorised(request: Request): Promise<boolean> {
    const cronSecret = request.headers.get('x-cron-secret');
    const configuredSecret = process.env.XDS_CRON_SECRET;
    if (configuredSecret && cronSecret === configuredSecret) return true;

    const session = await auth();
    return !!(session?.user?.isAdmin || session?.user?.isExecutive);
}

export async function POST(request: Request) {
    try {
        if (!(await isAuthorised(request))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        logger.info('[XDS] Sync triggered');

        const body = await request.json().catch(() => ({}));
        const mode = body.mode || 'daily';
        
        logger.info(`[XDS] Sync mode: ${mode}`);

        const result = await runXdsSync(mode);

        // Only treat as a hard failure if there were errors AND nothing succeeded at all.
        // Zero reports with no errors = normal "nothing to process" — still 200.
        const hardFailure = result.errors.length > 0 && result.datesProcessed.length === 0;

        // Build a human-readable message for the zero-reports case
        const message = result.processed === 0 && result.errors.length === 0
            ? result.datesProcessed.length === 0
                ? 'Already up to date — no new dates to process.'
                : 'No records or zero records have been found. Zero reports were uploaded and zero XDS_LEADS were created.'
            : undefined;

        return NextResponse.json(
            {
                success: !hardFailure,
                message,
                summary: {
                    processed: result.processed,
                    newFilesCreated: result.newFilesCreated,
                    existingFilesUpdated: result.existingFilesUpdated,
                    errorCount: result.errors.length,
                    datesProcessed: result.datesProcessed,
                    lastSyncedDate: result.lastSyncedDate,
                },
                details: result.details,
                errors: result.errors,
            },
            { status: hardFailure ? 500 : 200 }
        );
    } catch (error) {
        logger.error('[XDS] Sync route error:', error);
        return NextResponse.json(
            { error: 'XDS sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin && !session?.user?.isExecutive) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const lastSyncedSetting = await prisma.systemSettings.findUnique({
            where: { key: 'xds_last_synced_date' },
            select: { value: true, updatedAt: true },
        });

        const credentialsExist = await prisma.systemSettings.findUnique({
            where: { key: 'xds_username' },
            select: { value: true },
        });

        return NextResponse.json({
            credentialsConfigured: !!(credentialsExist?.value || process.env.XDS_USERNAME),
            cronEnabled: !!process.env.XDS_CRON_SECRET,
            lastSyncedDate: lastSyncedSetting?.value || null,
            lastSyncedAt: lastSyncedSetting?.updatedAt || null,
            scheduleHint: 'Set up a daily cron: POST /api/admin/xds/sync with header X-Cron-Secret: <XDS_CRON_SECRET>',
        });
    } catch (error) {
        logger.error('[XDS] Status route error:', error);
        return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
    }
}
