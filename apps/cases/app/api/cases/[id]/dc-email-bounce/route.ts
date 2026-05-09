/**
 * POST /api/cases/[id]/dc-email-bounce
 *
 * Called when an email sent to a debt counsellor bounces or receives no response.
 * This endpoint:
 *   1. Adds the email to a global bad-email blacklist (SystemSettings)
 *   2. Clears the bad email from the case so it will not be reused
 *   3. Logs a case comment alerting staff that the email failed
 *   4. Returns a user-facing message asking them to call the DC for a new email
 */

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

const logger = {
    info: (...args: unknown[]) => console.log('[INFO]', ...args),
    error: (...args: unknown[]) => console.error('[ERROR]', ...args),
};

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

        // 3. Log a comment on the case alerting staff
        const dcName = currentCase.debtCounsellorName || 'Debt Counsellor';
        const clientName = `${currentCase.client.firstName} ${currentCase.client.lastName}`;
        const commentText =
            `[ALERT] Email to debt counsellor ${dcName} (${badEmail}) failed — ${reason || 'bounced or no response received'}. ` +
            `This email has been blacklisted and will not be used again. ` +
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

        logger.info(`DC email flagged as bad: ${badEmail} (case ${currentCase.fileNumber}, NCRDC ${currentCase.ncrdcNo || 'unknown'})`);

        return NextResponse.json({
            success: true,
            message: `The email address ${badEmail} has been flagged as invalid and will not be used again. ` +
                `Please call ${dcName} to get a working email address and update the case manually.`,
            action: 'call_dc_for_email',
            dcName,
            ncrdcNo: currentCase.ncrdcNo
        });

    } catch (error) {
        logger.error('Error flagging DC email as bad:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
