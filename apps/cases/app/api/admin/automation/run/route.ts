/**
 * POST /api/admin/automation/run
 *
 * Server-side proxy that triggers any cron endpoint on behalf of an admin.
 * Adds the CRON_SECRET header so the browser never needs to hold the secret.
 *
 * Body: { type: 'WORKFLOW_AUTOMATION' | 'DHS_RECHECK' | 'STALE_CASE_SCAN' | ... }
 */

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/admin/automation/run');

const TYPE_TO_ENDPOINT: Record<string, string> = {
    WORKFLOW_AUTOMATION:   '/api/cron/workflow-automation',
    DHS_RECHECK:           '/api/cron/dhs-recheck',
    CHECK_NOT_REQUESTED:   '/api/cron/check-not-requested',
    STALE_CASE_SCAN:       '/api/cron/stale-cases',
    DOCUMENT_EXPIRY_SCAN:  '/api/cron/document-expiry',
    R350_REMINDER:         '/api/cron/r350-reminder',
    OVERDUE_SCAN:          '/api/cron/overdue-scan',
    DRR_TRIGGER:           '/api/cron/drr-trigger',
    DHS_REQUESTED_FOLLOWUP: '/api/cron/dhs-requested-followup',
};

export async function POST(request: Request): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { type } = await request.json();
        const endpoint = TYPE_TO_ENDPOINT[type];

        if (!endpoint) {
            return NextResponse.json({ error: `Unknown automation type: ${type}` }, { status: 400 });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret) {
            return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
        }

        logger.info(`[AdminRun] ${session.user.email} triggered ${type} → ${endpoint}`);

        const res = await fetch(`${appUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'x-cron-secret': cronSecret,
                'Content-Type': 'application/json',
            },
        });

        const data = await res.json();

        if (!res.ok) {
            logger.warn(`[AdminRun] ${type} returned ${res.status}:`, data);
            return NextResponse.json({ error: data.error || 'Cron failed', details: data }, { status: res.status });
        }

        logger.info(`[AdminRun] ${type} completed successfully`);
        return NextResponse.json({ success: true, type, result: data });

    } catch (error) {
        logger.error('[AdminRun] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}
