import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger, sendInternalNotification, findManagersForCase } from '@zenowethu/shared-lib';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';

const logger = createLogger('cron/stale-cases');
const STALE_DAYS = 14;

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
    logger.info(`[CRON] Stale case scan starting (threshold: ${STALE_DAYS} days)...`);

    const stats = { scanned: 0, staleFound: 0, alerted: 0, errors: 0 };

    try {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - STALE_DAYS);

        // Terminal statuses to exclude
        const excludeStatuses = ['COMPLETED', 'CASE_WON', 'CASE_LOST', 'DUPLICATE', 'WITHDRAWN'];

        const staleCases = await prisma.case.findMany({
            where: {
                deletedAt: null,
                updatedAt: { lt: threshold },
                status: { notIn: excludeStatuses },
            },
            include: { client: true },
            take: 100,
        });

        stats.scanned = staleCases.length;

        for (const c of staleCases) {
            try {
                const daysStale = Math.floor((Date.now() - c.updatedAt.getTime()) / 86400000);
                const managers = await findManagersForCase(c.id);

                if (managers.length === 0) continue;

                for (const managerId of managers) {
                    await sendInternalNotification({
                        caseId: c.id,
                        userId: managerId,
                        statusCode: 'STALE_CASE',
                        variables: {
                            clientName: `${c.client.firstName} ${c.client.lastName}`,
                            fileNumber: c.fileNumber,
                            daysStale: String(daysStale),
                            lastUpdate: c.updatedAt.toLocaleDateString('en-ZA'),
                            status: c.status,
                            caseUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cases/${c.id}`,
                        },
                    });
                    await prisma.inAppNotification.create({
                        data: {
                            userId: managerId,
                            type: 'SYSTEM_ALERT',
                            title: `Stale Case: ${c.fileNumber}`,
                            message: `No activity for ${daysStale} days on ${c.client.firstName} ${c.client.lastName}'s file.`,
                            caseId: c.id,
                            linkUrl: `/cases/${c.id}`,
                        },
                    });
                }

                stats.staleFound++;
                stats.alerted += managers.length;
            } catch (err) {
                stats.errors++;
                logger.error(`[CRON] Stale case alert error for ${c.fileNumber}:`, err);
            }
        }

        await logAutomationRun({
            type: 'STALE_CASE_SCAN',
            status: 'SUCCESS',
            startedAt,
            logs: stats,
        });

        logger.info('[CRON] Stale case scan complete:', stats);
        return NextResponse.json({ success: true, stats, ranAt: new Date().toISOString() });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[CRON] Stale case scan failed:', error);
        await logAutomationRun({ type: 'STALE_CASE_SCAN', status: 'FAILED', startedAt, errorMessage: msg, logs: stats });
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
