import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/admin/automations/retry');

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    let runId = 'unknown';
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        runId = id;
        if (!runId) {
            return NextResponse.json({ error: 'Missing run ID' }, { status: 400 });
        }

        const run = await prisma.automationRun.findUnique({
            where: { id: runId }
        });

        if (!run) {
            return NextResponse.json({ error: 'Run not found' }, { status: 404 });
        }

        if (run.status !== 'FAILED') {
            return NextResponse.json({ error: 'Only failed runs can be retried' }, { status: 400 });
        }

        // Increment retry count and set to RETRYING
        const updatedRun = await prisma.automationRun.update({
            where: { id: runId },
            data: {
                status: 'RETRYING',
                retryCount: { increment: 1 },
                nextRetryAt: null,
                errorMessage: null, // clear previous error
                updatedAt: new Date()
            }
        });

        // Map type to cron endpoint and fire it
        const typeToEndpoint: Record<string, string> = {
            OVERDUE_SCAN: '/api/cron/overdue-scan',
            DHS_RECHECK: '/api/cron/dhs-recheck',
            STALE_CASE_SCAN: '/api/cron/stale-cases',
            DOCUMENT_EXPIRY_SCAN: '/api/cron/document-expiry',
            R350_REMINDER: '/api/cron/r350-reminder',
        };

        const endpoint = typeToEndpoint[run.type];
        if (endpoint) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            fetch(`${appUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
            }).catch(err => logger.error(`[Retry] Failed to fire ${endpoint}:`, err));
            logger.info(`[Retry] Dispatched retry for run ${runId} → ${endpoint}`);
        } else {
            logger.info(`[Retry] No cron endpoint for type ${run.type} — status updated to RETRYING`);
        }

        return NextResponse.json(updatedRun);
    } catch (error) {
        logger.error(`Error retrying automation run ${runId}:`, error);
        return NextResponse.json({ error: 'Failed to retry automation run' }, { status: 500 });
    }
}
