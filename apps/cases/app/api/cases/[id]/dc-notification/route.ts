import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { sendStatusChangeNotification  } from '@zenowethu/shared-lib';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/dc-notification');

const DcNotificationSchema = z.object({
    type: z.enum(['FILE_REQUEST', 'INVOICE_REQUEST']),
});

function pickDebtCounsellorEmail(currentCase: {
    preferredDcEmail?: string | null;
    lastKnownEmail?: string | null;
    dcEmail?: string | null;
    debtCounsellor?: {
        preferredEmail?: string | null;
        lastKnownEmail?: string | null;
        email?: string | null;
    } | null;
}): string | null {
    return (
        currentCase.preferredDcEmail?.trim() ||
        currentCase.debtCounsellor?.preferredEmail?.trim() ||
        currentCase.lastKnownEmail?.trim() ||
        currentCase.debtCounsellor?.lastKnownEmail?.trim() ||
        currentCase.dcEmail?.trim() ||
        currentCase.debtCounsellor?.email?.trim() ||
        null
    );
}

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
        const parsed = DcNotificationSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
        }
        const { type } = parsed.data;

        const currentCase = await prisma.case.findUnique({
            where: { id },
            include: { client: true, debtCounsellor: true }
        });

        if (!currentCase) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const dcEmail = pickDebtCounsellorEmail(currentCase);

        if (!dcEmail) {
            return NextResponse.json({ error: 'Debt counsellor email not found' }, { status: 400 });
        }

        const statusCode = type === 'FILE_REQUEST' ? 'REQUEST_FILE_DC' : 'REQUEST_INVOICE_DC';

        const result = await sendStatusChangeNotification({
            caseId: id,
            clientName: `${currentCase.client.firstName} ${currentCase.client.lastName}`,
            fileNumber: currentCase.fileNumber,
            statusCode: statusCode,
            dcName: currentCase.debtCounsellorName || 'Debt Counsellor',
            dcEmail,
            clientEmail: currentCase.client.email,
            dcCcEmails: type === 'FILE_REQUEST' && currentCase.client.email ? [currentCase.client.email] : [],
            idNumber: currentCase.client.idNumber,
            isB2B: currentCase.acquisitionType === 'B2B' });

        if (result.emailSuccess) {
            // Log as a comment/activity
            await prisma.caseComment.create({
                data: {
                    caseId: id,
                    userId: session.user.id,
                    content: `Sent ${type.replace('_', ' ').toLowerCase()} to DC (${dcEmail})${type === 'FILE_REQUEST' && currentCase.client.email ? `, client CC'd (${currentCase.client.email})` : ''}`,
                    type: 'SYSTEM',
                    isInternal: true
                }
            });

            return NextResponse.json({ success: true, message: 'Notification sent successfully', dcEmail });
        } else {
            return NextResponse.json({
                error: 'Failed to send notification',
                details: result.errors.join(', ')
            }, { status: 500 });
        }

    } catch (error) {
        logger.error('Error sending DC notification:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
