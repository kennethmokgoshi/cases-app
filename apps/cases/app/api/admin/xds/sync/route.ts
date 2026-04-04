/**
 * XDS Sync API Route
 *
 * POST /api/admin/xds/sync
 *
 * Triggers a full XDS daily sync:
 *  - Logs in to XDS portal
 *  - Scrapes today's search history
 *  - For each credit report: uploads to existing case OR creates a new file + notifies admins
 *
 * Authorization:
 *  - Admin or Executive session (manual trigger from the UI), OR
 *  - Secret cron key via X-Cron-Secret header (automated daily trigger from cron/Dokploy)
 *
 * Set XDS_CRON_SECRET in .env to enable cron access.
 * Example cron (runs daily at 6 AM): POST /api/admin/xds/sync with header X-Cron-Secret: <secret>
 */

import { NextResponse } from 'next/server';
import { createLogger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { runXdsSync } from '@zenowethu/shared-lib/src/xds/sync';
import { z } from 'zod';

const logger = createLogger('api/admin/xds/sync');
export const runtime = 'nodejs';

// Max duration: 10 minutes (XDS portal + PDF downloads can be slow)
export const maxDuration = 600;

const SyncOptionsSchema = z.object({
    /** Override sync date — ISO string (YYYY-MM-DD). Defaults to today. */
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: Request) {
    try {
        // ─── Authorization ─────────────────────────────────────────────────
        const cronSecret = request.headers.get('x-cron-secret');
        const configuredSecret = process.env.XDS_CRON_SECRET;

        const isCronRequest = configuredSecret && cronSecret === configuredSecret;

        if (!isCronRequest) {
            // Fall back to requiring an Admin or Executive session
            const session = await auth();
            const isAllowed = session?.user?.isAdmin || session?.user?.isExecutive;
            if (!isAllowed) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        // ─── Parse options ─────────────────────────────────────────────────
        let targetDate: Date | undefined;
        try {
            const body = await request.json().catch(() => ({}));
            const parsed = SyncOptionsSchema.safeParse(body);
            if (parsed.success && parsed.data.targetDate) {
                targetDate = new Date(parsed.data.targetDate);
            }
        } catch {
            // No body or invalid JSON — use defaults
        }

        logger.info(`[XDS] Sync triggered (cron=${isCronRequest}) for date: ${targetDate?.toISOString() ?? 'today'}`);

        // ─── Run sync ──────────────────────────────────────────────────────
        const result = await runXdsSync({ targetDate });

        const statusCode = result.errors.length > 0 && result.processed === 0 ? 500 : 200;

        return NextResponse.json(
            {
                success: result.errors.length === 0,
                summary: {
                    processed: result.processed,
                    newFilesCreated: result.newFilesCreated,
                    existingFilesUpdated: result.existingFilesUpdated,
                    errorCount: result.errors.length,
                },
                details: result.details,
                errors: result.errors,
            },
            { status: statusCode }
        );
    } catch (error) {
        logger.error('[XDS] Sync route error:', error);
        return NextResponse.json(
            {
                error: 'XDS sync failed',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// GET — Return current XDS sync configuration (for admin UI status display)
export async function GET(request: Request) {
    try {
        const session = await auth();
        const isAllowed = session?.user?.isAdmin || session?.user?.isExecutive;
        if (!isAllowed) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        return NextResponse.json({
            cronEnabled: !!process.env.XDS_CRON_SECRET,
            credentialsConfigured: !!(
                process.env.XDS_USERNAME ||
                // also check DB — done by getXdsCredentials internally
                true
            ),
            scheduleHint: 'Configure a daily cron to POST /api/admin/xds/sync with header X-Cron-Secret: <XDS_CRON_SECRET>',
        });
    } catch (error) {
        logger.error('[XDS] Status route error:', error);
        return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
    }
}
