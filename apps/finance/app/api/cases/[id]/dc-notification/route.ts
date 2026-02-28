import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { sendStatusChangeNotification } logger, from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib';

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
        const { type } = await request.json(); // 'FILE_REQUEST' or 'INVOICE_REQUEST'

        if (!type || !['FILE_REQUEST', 'INVOICE_REQUEST'].includes(type)) {
            return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
        }

        const currentCase = await prisma.case.findUnique({
            where: { id },
            include: { client: true }
        });

        if (!currentCase) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        if (!currentCase.dcEmail) {
            return NextResponse.json({ error: 'Debt counsellor email not found' }, { status: 400 });
        }

        const statusCode = type === 'FILE_REQUEST' ? 'REQUEST_FILE_DC' : 'REQUEST_INVOICE_DC';

        const result = await sendStatusChangeNotification({
            caseId: id,
            clientName: `${currentCase.client.firstName} ${currentCase.client.lastName}`,
            fileNumber: currentCase.fileNumber,
            statusCode: statusCode,
            dcName: currentCase.debtCounsellorName || 'Debt Counsellor',
            dcEmail: currentCase.dcEmail,
            idNumber: currentCase.client.idNumber,
            isB2B: currentCase.acquisitionType === 'B2B' });

        if (result.emailSuccess) {
            // Log as a comment/activity
            await prisma.caseComment.create({
                data: {
                    caseId: id,
                    userId: session.user.id,
                    content: `Sent ${type.replace('_', ' ').toLowerCase()} to DC (${currentCase.dcEmail})`,
                    type: 'SYSTEM',
                    isInternal: true
                }
            });

            return NextResponse.json({ success: true, message: 'Notification sent successfully' });
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
