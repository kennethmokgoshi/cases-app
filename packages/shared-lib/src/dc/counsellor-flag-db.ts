/**
 * Database operations for flagged Debt Counsellors.
 * This file is Node-only and imports Prisma.
 */

import { prisma } from '@zenowethu/database';
import { checkCaseFlaggedDC } from './counsellor-flag';

/**
 * Automatically creates a case comment warning if the case is under a flagged DC,
 * provided such a warning comment hasn't already been created.
 */
export async function flagCaseIfFlaggedDC(caseId: string, tx: any = prisma): Promise<void> {
    const caseRecord = await tx.case.findUnique({
        where: { id: caseId },
        select: {
            id: true,
            debtCounsellorName: true,
            dcTradingName: true,
            cb_debtCounsellor: true,
            comments: {
                where: {
                    content: {
                        startsWith: '[SYSTEM] 🚩 Flagged Debt Counsellor Alert:'
                    }
                },
                take: 1
            }
        }
    });

    if (!caseRecord) return;

    const check = checkCaseFlaggedDC(caseRecord);
    if (check.flagged) {
        if (caseRecord.comments.length === 0) {
            const admin = await tx.user.findFirst({
                where: { isAdmin: true },
                select: { id: true }
            });
            const userId = admin?.id;
            if (!userId) {
                // If there are no admins in the DB, we cannot create the comment (non-nullable relation)
                return;
            }

            await tx.caseComment.create({
                data: {
                    caseId,
                    userId,
                    content: `[SYSTEM] 🚩 Flagged Debt Counsellor Alert: This client is registered under ${check.provider} (${check.matchedName}). Special protocols apply; notify staff/management before proceeding with any DHS requests.`,
                    activityType: 'SYSTEM',
                    type: 'NOTE',
                    isInternal: true
                }
            });
        }
    }
}
