/**
 * POST /api/cases/[id]/dc-email-bounce
 *
 * Called when an email sent to a debt counsellor bounces or receives no response.
 * This endpoint:
 *   1. Adds the email to a global bad-email blacklist (SystemSettings)
 *   2. Clears the bad email from the case so it will not be reused
 *   3. Flags the address as bounced on the DC's priority email list so sending
 *      falls through to the next priority (1 → 2 → 3…)
 *   4. Logs a case comment alerting staff that the email failed
 *   5. Returns the next-priority email when one exists, otherwise asks staff
 *      to call the DC for a new address
 */

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { recordDcEmailBounce } from '@zenowethu/shared-lib/src/dc/email-priority';

const logger = createLogger('api/cases/dc-email-bounce');

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { email, reason } = await request.json() as { email?: string; reason?: string };

        if (!email || !email.trim()) {
            return NextResponse.json({ error: 'Email address is required' }, { status: 400 });
        }

        const badEmail = email.toLowerCase().trim();

        const currentCase = await prisma.case.findUnique({
            where: { id },
            select: {
                id: true,
                fileNumber: true,
                dcEmail: true,
                lastKnownEmail: true,
                debtCounsellorName: true,
                ncrdcNo: true,
                debtCounsellordId: true,
                client: { select: { firstName: true, lastName: true } }
            }
        });

        if (!currentCase) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // 1. Add to global bad-email blacklist in SystemSettings
        //    Key format: "bad_dc_email_<email>" to allow easy listing and lookup
        const settingsKey = `bad_dc_email_${badEmail.replace(/[^a-z0-9@._-]/g, '_')}`;
        await prisma.systemSettings.upsert({
            where: { key: settingsKey },
            update: {
                value: badEmail,
                description: `Bad DC email flagged on ${new Date().toISOString()}. Reason: ${reason || 'Bounced / No response'}. Case: ${currentCase.fileNumber}`
            },
            create: {
                key: settingsKey,
                category: 'bad_dc_email',
                value: badEmail,
                description: `Bad DC email flagged on ${new Date().toISOString()}. Reason: ${reason || 'Bounced / No response'}. Case: ${currentCase.fileNumber}`
            }
        });

        // 2. Clear the bad email from the case so it won't be reused
        const caseUpdateData: Record<string, string | null> = {};
        if (currentCase.dcEmail?.toLowerCase() === badEmail) {
            caseUpdateData.dcEmail = null;
        }
        if (currentCase.lastKnownEmail?.toLowerCase() === badEmail) {
            caseUpdateData.lastKnownEmail = null;
        }
        if (Object.keys(caseUpdateData).length > 0) {
            await prisma.case.update({
                where: { id },
                data: {
                    ...caseUpdateData,
                    updatedBy: { connect: { id: session.user.id } }
                }
            });
        }

        // 3. Flag the address on the DC's priority email list so future sends
        //    fall through to the next priority automatically
        let nextBest: { email: string; priority: number } | null = null;
        if (currentCase.debtCounsellordId) {
            const bounce = await recordDcEmailBounce({
                debtCounsellordId: currentCase.debtCounsellordId,
                email: badEmail,
                reason: reason || 'Bounced / No response',
            });
            nextBest = bounce.nextBest;
        }

        // 4. Log a comment on the case alerting staff
        const dcName = currentCase.debtCounsellorName || 'Debt Counsellor';
        const clientName = `${currentCase.client.firstName} ${currentCase.client.lastName}`;
        const commentText = nextBest
            ? `[ALERT] Email to debt counsellor ${dcName} (${badEmail}) failed — ${reason || 'bounced or no response received'}. ` +
              `This email has been blacklisted. The next priority address on record is ${nextBest.email} (priority ${nextBest.priority}) — it will be used for future sends.`
            : `[ALERT] Email to debt counsellor ${dcName} (${badEmail}) failed — ${reason || 'bounced or no response received'}. ` +
              `This email has been blacklisted and will not be used again. No other working address is on record. ` +
              `Please call ${dcName} directly to obtain a valid email address for ${clientName} and update the case.`;

        await prisma.caseComment.create({
            data: {
                caseId: id,
                userId: session.user.id,
                content: commentText,
                type: 'SYSTEM',
                isInternal: true
            }
        });

        logger.info('DC email flagged as bad', {
            email: badEmail,
            fileNumber: currentCase.fileNumber,
            ncrdcNo: currentCase.ncrdcNo || 'unknown',
            nextBest: nextBest?.email ?? null,
        });

        return NextResponse.json({
            success: true,
            message: nextBest
                ? `The email address ${badEmail} has been flagged as invalid. ` +
                  `Future emails will use the next priority address on record: ${nextBest.email}.`
                : `The email address ${badEmail} has been flagged as invalid and will not be used again. ` +
                  `Please call ${dcName} to get a working email address and update the case manually.`,
            action: nextBest ? 'next_priority_email_available' : 'call_dc_for_email',
            nextEmail: nextBest?.email ?? null,
            nextEmailPriority: nextBest?.priority ?? null,
            dcName,
            ncrdcNo: currentCase.ncrdcNo
        });

    } catch (error) {
        logger.error('Error flagging DC email as bad', { error });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
