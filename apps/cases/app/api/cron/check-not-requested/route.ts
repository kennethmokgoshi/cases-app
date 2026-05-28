import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { checkTransferStatus, closeBrowser } from '@zenowethu/shared-lib/src/dhs';
import { addWorkingDays } from '@zenowethu/shared-lib/src/statuses/workingDays';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';

const logger = createLogger('cron/check-not-requested');

export async function POST(request: Request) {
    const cronSecret = request.headers.get('x-cron-secret');
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = new Date();
    logger.info('[CRON] Check-not-requested DHS scan starting...');

    const results: Array<{
        fileNumber: string;
        client: string;
        idNumber: string;
        previousStatus: string;
        dhsResult: string;
        requestStatus: string;
        daysCounter: string;
        newNextUpdate: string | null;
        statusChanged: boolean;
        error?: string;
    }> = [];

    const stats = { total: 0, checked: 0, statusChanged: 0, stillNotRequested: 0, errors: 0 };

    try {
        const now = new Date();
        // Only overdue cases — nextUpdate in the past or null
        const cases = await prisma.case.findMany({
            where: {
                status: 'NOT_REQUESTED_VIA_DHS',
                deletedAt: null,
                OR: [
                    { nextUpdate: { lt: now } },
                    { nextUpdate: null },
                ],
            },
            include: {
                client: { select: { firstName: true, lastName: true, idNumber: true } },
            },
            orderBy: { nextUpdate: 'asc' },
        });

        stats.total = cases.length;
        logger.info(`[CRON] Found ${cases.length} overdue NOT_REQUESTED_VIA_DHS cases`);

        // Get first admin user for attribution
        const adminUser = await prisma.user.findFirst({ where: { isAdmin: true } });

        for (const c of cases) {
            const idNumber = c.client.idNumber;
            const clientName = `${c.client.firstName} ${c.client.lastName}`.trim();

            logger.info(`[CRON] Checking ${c.fileNumber} — ${clientName} (${idNumber})`);

            try {
                const dhsResult = await Promise.race([
                    checkTransferStatus(idNumber),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('DHS check timed out after 90s')), 90000)
                    ),
                ]);

                stats.checked++;

                // Determine new nextUpdate (always +3 working days minimum)
                const newNextUpdate = addWorkingDays(new Date(), 3);
                let statusChanged = false;
                let newStatus = c.status;
                let dhsResultLabel = 'NOT_REQUESTED';

                if (!dhsResult.found && dhsResult.status === 'NOT_LINKED') {
                    newStatus = 'NOT_LINKED';
                    dhsResultLabel = 'NOT_LINKED — not found on DHS';
                    statusChanged = true;
                } else if (!dhsResult.found && dhsResult.status === 'NOT_REQUESTED') {
                    // Still not requested — update nextUpdate to +3 working days
                    dhsResultLabel = 'Confirmed NOT_REQUESTED — no active transfer on DHS';
                    stats.stillNotRequested++;
                } else if (dhsResult.found) {
                    if (dhsResult.status === 'PENDING') {
                        newStatus = 'REQUESTED_VIA_DHS';
                        dhsResultLabel = `PENDING — ${dhsResult.daysCounter || 'New'} on DHS`;
                        statusChanged = true;
                    } else if (dhsResult.status === 'ACCEPTED' || dhsResult.status === 'AUTO_TRANSFERRED') {
                        newStatus = 'ACCEPTED_VIA_DHS';
                        dhsResultLabel = `ACCEPTED — transfer accepted on DHS`;
                        statusChanged = true;
                    } else if (dhsResult.status === 'DECLINED') {
                        newStatus = 'DECLINED_VIA_DHS';
                        dhsResultLabel = `DECLINED — ${dhsResult.declineReason || 'no reason captured'}`;
                        statusChanged = true;
                    } else {
                        dhsResultLabel = `Found on DHS: ${dhsResult.status}`;
                    }
                }

                if (statusChanged) stats.statusChanged++;

                // Update the case: new status + nextUpdate
                await prisma.case.update({
                    where: { id: c.id },
                    data: {
                        status: newStatus,
                        nextUpdate: newNextUpdate,
                        ...(dhsResult.debtCounsellor ? {
                            ncrdcNo: dhsResult.debtCounsellor.ncrRegistrationNo,
                            debtCounsellorName: dhsResult.debtCounsellor.fullName,
                            dcEmail: dhsResult.debtCounsellor.email,
                        } : {}),
                        ...(adminUser ? { updatedById: adminUser.id } : {}),
                    },
                });

                // Add system comment
                if (adminUser) {
                    await prisma.caseComment.create({
                        data: {
                            caseId: c.id,
                            userId: adminUser.id,
                            content: `[SYSTEM] DHS Check (bulk run): ${dhsResultLabel}. Next update set to +3 working days (${newNextUpdate.toLocaleDateString('en-ZA')}).`,
                        },
                    });
                }

                results.push({
                    fileNumber: c.fileNumber,
                    client: clientName,
                    idNumber,
                    previousStatus: c.status,
                    dhsResult: dhsResultLabel,
                    requestStatus: dhsResult.requestStatus || '',
                    daysCounter: dhsResult.daysCounter || '',
                    newNextUpdate: newNextUpdate.toLocaleDateString('en-ZA'),
                    statusChanged,
                });

                logger.info(`[CRON] ${c.fileNumber}: ${dhsResultLabel} | statusChanged=${statusChanged}`);

            } catch (err) {
                stats.errors++;
                const msg = err instanceof Error ? err.message : String(err);
                logger.error(`[CRON] Error checking ${c.fileNumber}:`, err);

                // Still update nextUpdate so it doesn't retry immediately
                await prisma.case.update({
                    where: { id: c.id },
                    data: { nextUpdate: addWorkingDays(new Date(), 3) },
                });

                results.push({
                    fileNumber: c.fileNumber,
                    client: clientName,
                    idNumber,
                    previousStatus: c.status,
                    dhsResult: 'ERROR',
                    requestStatus: '',
                    daysCounter: '',
                    newNextUpdate: addWorkingDays(new Date(), 3).toLocaleDateString('en-ZA'),
                    statusChanged: false,
                    error: msg,
                });
            }
        }

        // Close browser after all checks
        await closeBrowser();

        await logAutomationRun({
            type: 'DHS_CHECK_NOT_REQUESTED',
            status: 'SUCCESS',
            startedAt,
            logs: stats,
        });

        logger.info('[CRON] Check-not-requested scan complete:', stats);
        return NextResponse.json({ success: true, stats, results, ranAt: new Date().toISOString() });

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[CRON] Check-not-requested scan failed:', error);
        await closeBrowser();
        await logAutomationRun({ type: 'DHS_CHECK_NOT_REQUESTED', status: 'FAILED', startedAt, errorMessage: msg, logs: stats });
        return NextResponse.json({ error: msg, results }, { status: 500 });
    }
}
