/**
 * POST /api/admin/automation/overdue-scan
 *
 * Triggers the overdue case scan and follow-up service manually.
 * Admin-only. Scans all active cases, emails DCs / consumers as needed,
 * and creates in-app alerts for stuck cases.
 *
 * Returns a full summary of what was found and actioned.
 */

import { NextResponse } from 'next/server';
import { auth } from '@zenowethu/shared-lib';
import { createLogger } from '@zenowethu/shared-lib';
import { runOverdueScan } from '@zenowethu/shared-lib/src/automation/overdue-scan';

const logger = createLogger('api/admin/automation/overdue-scan');

export async function POST(): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin) {
            return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
        }

        logger.info(`[OVERDUE_SCAN_API] Triggered by user ${session.user.id} (${session.user.email})`);

        const result = await runOverdueScan();

        logger.info(
            `[OVERDUE_SCAN_API] Done. Scanned: ${result.scanned}, Overdue: ${result.overdueFound}, ` +
            `Actioned: ${result.actioned}, Errors: ${result.errors}`
        );

        return NextResponse.json({ success: true, result });
    } catch (error) {
        logger.error('[OVERDUE_SCAN_API] Unexpected error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}
