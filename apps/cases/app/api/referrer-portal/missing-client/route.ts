import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';

const logger = createLogger('api/referrer-portal/missing-client');

const MissingClientSchema = z.object({
    clientName: z.string().trim().min(2, 'Name is too short').max(200),
    idNumber: z.string().trim().length(13, 'SA ID number must be 13 digits').regex(/^\d+$/, 'SA ID number must contain only digits').optional().or(z.literal('')),
    notes: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const parsed = MissingClientSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 422 });
        }

        const { clientName, idNumber, notes } = parsed.data;

        // Try to find a matching client or case in the database
        let matchedCaseId: string | null = null;
        let matchedFileNumber: string | null = null;
        
        if (idNumber) {
            const matchedCase = await prisma.case.findFirst({
                where: { client: { idNumber }, deletedAt: null },
                select: { id: true, fileNumber: true },
            });
            if (matchedCase) {
                matchedCaseId = matchedCase.id;
                matchedFileNumber = matchedCase.fileNumber;
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
        const notificationTitle = `Missing Client: ${clientName}`;
        const notificationMessage = `Referrer ${referrerName} reported a missing client. ID: ${idNumber || 'Not provided'}. Notes: ${notes || 'None'}`;
        const linkUrl = matchedCaseId ? `/cases/${matchedCaseId}` : `/admin/referrers/${access.referrer.id}/clients`;

        // Persist the missing client report so it can be displayed on the referrer's dashboard
        const missingClientReport = await prisma.referrerMissingClientReport.create({
            data: {
                referrerId: access.referrer.id,
                clientName,
                idNumber: idNumber || null,
                notes: notes || null,
                status: 'PENDING',
                linkedCaseId: matchedCaseId,
            },
        });

        if (staffToNotify.length > 0) {
            await prisma.inAppNotification.createMany({
                data: staffToNotify.map((staff) => ({
                    userId: staff.id,
                    type: 'MISSING_CLIENT_REPORT',
                    title: notificationTitle,
                    message: notificationMessage.slice(0, 500),
                    caseId: matchedCaseId,
                    linkUrl,
                })),
            }).catch((err: unknown) => logger.error('Failed to create in-app notifications for staff', err));
        }

        return NextResponse.json({
            success: true,
            reportId: missingClientReport.id,
            matchedCase: matchedCaseId ? { id: matchedCaseId, fileNumber: matchedFileNumber } : null
        }, { status: 201 });
    } catch (error) {
        logger.error('Failed to report missing client', error);
        return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
    }
}
