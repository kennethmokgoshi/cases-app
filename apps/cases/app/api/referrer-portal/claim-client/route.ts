import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';

const logger = createLogger('api/referrer-portal/claim-client');

const ClaimClientSchema = z.object({
    clientName: z.string().trim().min(2, 'Name is too short').max(200),
    idNumber: z.string().trim().length(13, 'SA ID number must be 13 digits').regex(/^\d+$/, 'SA ID number must contain only digits').optional().or(z.literal('')),
    cellNumber: z.string().trim().min(9, 'Cell number is too short').max(15, 'Cell number is too long').optional().or(z.literal('')),
    notes: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const parsed = ClaimClientSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 422 });
        }

        const { clientName, idNumber, cellNumber, notes } = parsed.data;

        // Try to find a matching client or case in the database
        let matchedCaseId: string | null = null;
        let matchedFileNumber: string | null = null;
        let alreadyHasReferrer = false;
        
        if (idNumber) {
            const matchedCase = await prisma.case.findFirst({
                where: { client: { idNumber }, deletedAt: null },
                select: { id: true, fileNumber: true, referrerId: true },
            });
            if (matchedCase) {
                matchedCaseId = matchedCase.id;
                matchedFileNumber = matchedCase.fileNumber;
                alreadyHasReferrer = matchedCase.referrerId !== null;
            }
        }

        if (!matchedCaseId && cellNumber) {
            const matchedCase = await prisma.case.findFirst({
                where: { client: { phone: cellNumber }, deletedAt: null },
                select: { id: true, fileNumber: true, referrerId: true },
            });
            if (matchedCase) {
                matchedCaseId = matchedCase.id;
                matchedFileNumber = matchedCase.fileNumber;
                alreadyHasReferrer = matchedCase.referrerId !== null;
            }
        }

        // Notify Zenowethu staff members (active Admin or STAFF users)
        const staffToNotify = await prisma.user.findMany({
            where: {
                userType: 'STAFF',
                isLocked: false,
                OR: [
                    { isAdmin: true },
                    { role: 'ADMIN' }
                ]
            },
            select: { id: true },
        });

        const referrerName = `${access.referrer.firstName} ${access.referrer.lastName}`;
        const notificationTitle = `Client Claim: ${clientName}`;
        const disputeFlag = alreadyHasReferrer ? ' [ATTENTION: ALREADY LINKED TO ANOTHER REFERRER]' : '';
        const notificationMessage = `Referrer ${referrerName} is claiming client "${clientName}". ID: ${idNumber || 'Not provided'}. Cell: ${cellNumber || 'Not provided'}.${disputeFlag} Notes: ${notes || 'None'}`;
        const linkUrl = matchedCaseId ? `/cases/${matchedCaseId}` : `/admin/referrers/${access.referrer.id}/clients`;

        if (staffToNotify.length > 0) {
            await prisma.inAppNotification.createMany({
                data: staffToNotify.map((staff) => ({
                    userId: staff.id,
                    type: 'CLAIM_CLIENT_REQUEST',
                    title: notificationTitle,
                    message: notificationMessage.slice(0, 500),
                    caseId: matchedCaseId,
                    linkUrl,
                })),
            }).catch((err: unknown) => logger.error('Failed to create claim notifications for staff', err));
        }

        // Return a POPIA-compliant response (mask matching info)
        return NextResponse.json({
            success: true,
            message: 'Claim request submitted successfully. Zenowethu staff will review and link the client.',
            matchedCase: matchedCaseId ? { id: matchedCaseId, fileNumber: matchedFileNumber } : null
        }, { status: 201 });
    } catch (error) {
        logger.error('Failed to claim client', error);
        return NextResponse.json({ error: 'Failed to submit claim' }, { status: 500 });
    }
}
