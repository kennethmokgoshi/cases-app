import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger, sendInternalNotification, findManagersForCase } from '@zenowethu/shared-lib';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';

const logger = createLogger('cron/document-expiry');
const EXPIRY_MONTHS = 3;
const SENSITIVE_TYPES = ['ID', 'PAYSLIP', 'BANK_STATEMENT', 'PROOF_OF_RESIDENCE'];

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
    logger.info(`[CRON] Document expiry scan starting (threshold: ${EXPIRY_MONTHS} months)...`);

    const stats = { scanned: 0, casesWithExpiredDocs: 0, alerted: 0, errors: 0 };

    try {
        const threshold = new Date();
        threshold.setMonth(threshold.getMonth() - EXPIRY_MONTHS);

        const excludeStatuses = ['COMPLETED', 'CASE_WON', 'CASE_LOST', 'DUPLICATE', 'WITHDRAWN'];

        // Find active cases that have at least one document older than threshold
        const casesWithOldDocs = await prisma.case.findMany({
            where: {
                deletedAt: { equals: null },
                status: { notIn: excludeStatuses },
                documents: {
                    some: {
                        type: { in: SENSITIVE_TYPES },
                        uploadedAt: { lt: threshold },
                    },
                },
            },
            include: {
                client: true,
                documents: {
                    where: {
                        type: { in: SENSITIVE_TYPES },
                        uploadedAt: { lt: threshold },
                    },
                    select: { type: true, uploadedAt: true },
                },
            },
            take: 100,
        });

        stats.scanned = casesWithOldDocs.length;

        for (const c of casesWithOldDocs) {
            try {
                const expiredDocNames = [...new Set(c.documents.map(d => d.type))].join(', ');
                const managers = await findManagersForCase(c.id);

                if (managers.length === 0) continue;

                for (const managerId of managers) {
                    await sendInternalNotification({
                        caseId: c.id,
                        userId: managerId,
                        statusCode: 'DOCUMENT_EXPIRY',
                        variables: {
                            clientName: `${c.client.firstName} ${c.client.lastName}`,
                            fileNumber: c.fileNumber,
                            expiredDocs: expiredDocNames,
                            caseUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cases/${c.id}`,
                        },
                    });
                    await prisma.inAppNotification.create({
                        data: {
                            userId: managerId,
                            type: 'SYSTEM_ALERT',
                            title: `Old Documents: ${c.fileNumber}`,
                            message: `${expiredDocNames} on case ${c.fileNumber} (${c.client.firstName} ${c.client.lastName}) may be outdated.`,
                            caseId: c.id,
                            linkUrl: `/cases/${c.id}`,
                        },
                    });
                }

                stats.casesWithExpiredDocs++;
                stats.alerted += managers.length;
            } catch (err) {
                stats.errors++;
                logger.error(`[CRON] Document expiry alert error for ${c.fileNumber}:`, err);
            }
        }

        await logAutomationRun({
            type: 'DOCUMENT_EXPIRY_SCAN',
            status: 'SUCCESS',
            startedAt,
            logs: stats,
        });

        logger.info('[CRON] Document expiry scan complete:', stats);
        return NextResponse.json({ success: true, stats, ranAt: new Date().toISOString() });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[CRON] Document expiry scan failed:', error);
        await logAutomationRun({ type: 'DOCUMENT_EXPIRY_SCAN', status: 'FAILED', startedAt, errorMessage: msg, logs: stats });
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
