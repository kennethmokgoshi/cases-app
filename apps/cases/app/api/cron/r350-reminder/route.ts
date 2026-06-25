import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger, sendInternalNotification, findManagersForCase } from '@zenowethu/shared-lib';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';

const logger = createLogger('cron/r350-reminder');
const PENDING_DAYS_THRESHOLD = 30;

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
    logger.info('[CRON] R350 reminder scan starting...');

    const stats = { scanned: 0, remindersTriggered: 0, errors: 0 };

    try {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - PENDING_DAYS_THRESHOLD);

        // R350 is Zenowethu's admin fee for direct (B2C) clients only.
        // Exclude: B2B clients (partner did the intake), NOT_LINKED / incomplete / terminal statuses.
        const EXCLUDE_STATUSES = ['NOT_LINKED', 'NEW_LEAD', 'DUPLICATE', 'COMPLETED', 'CASE_WON', 'CASE_LOST', 'WITHDRAWN'];

        const pendingR350Cases = await prisma.case.findMany({
            where: {
                deletedAt: { equals: null },
                r350Status: 'PENDING',
                acquisitionType: { not: 'B2B' },
                createdAt: { lt: threshold },
                status: { notIn: EXCLUDE_STATUSES },
            },
            include: { client: true },
            take: 100,
        });

        stats.scanned = pendingR350Cases.length;

        for (const c of pendingR350Cases) {
            try {
                const daysPending = Math.floor((Date.now() - c.createdAt.getTime()) / 86400000);
                const managers = await findManagersForCase(c.id);

                if (managers.length === 0) continue;

                for (const managerId of managers) {
                    await sendInternalNotification({
                        caseId: c.id,
                        userId: managerId,
                        statusCode: 'R350_REMINDER',
                        variables: {
                            clientName: `${c.client.firstName} ${c.client.lastName}`,
                            fileNumber: c.fileNumber,
                            r350Status: c.r350Status,
                            daysPending: String(daysPending),
                            caseUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cases/${c.id}`,
                        },
                    });
                    await prisma.inAppNotification.create({
                        data: {
                            userId: managerId,
                            type: 'SYSTEM_ALERT',
                            title: `R350 Overdue: ${c.fileNumber}`,
                            message: `R350 payment for ${c.client.firstName} ${c.client.lastName} has been pending for ${daysPending} days.`,
                            caseId: c.id,
                            linkUrl: `/cases/${c.id}`,
                        },
                    });
                }

                stats.remindersTriggered++;
            } catch (err) {
                stats.errors++;
                logger.error(`[CRON] R350 reminder error for ${c.fileNumber}:`, err);
            }
        }

        await logAutomationRun({
            type: 'R350_REMINDER',
            status: 'SUCCESS',
            startedAt,
            logs: stats,
        });

        logger.info('[CRON] R350 reminder scan complete:', stats);
        return NextResponse.json({ success: true, stats, ranAt: new Date().toISOString() });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[CRON] R350 reminder scan failed:', error);
        await logAutomationRun({ type: 'R350_REMINDER', status: 'FAILED', startedAt, errorMessage: msg, logs: stats });
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
