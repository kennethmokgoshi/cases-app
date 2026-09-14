import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { sendDcRequestNotification } from '@zenowethu/shared-lib/src/dc';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/dc-notification');

const DcNotificationSchema = z.object({
    type: z.enum(['FILE_REQUEST', 'INVOICE_REQUEST']),
});

const FAILURE_STATUS = {
    CASE_NOT_FOUND: 404,
    NO_DC_EMAIL: 400,
    SEND_FAILED: 500,
} as const;

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

        const result = await sendDcRequestNotification({
            caseId: id,
            type: parsed.data.type,
            actorUserId: session.user.id,
        });

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error, details: result.error },
                { status: FAILURE_STATUS[result.failure ?? 'SEND_FAILED'] }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Notification sent successfully',
            dcEmail: result.dcEmail,
            // Staff need to see when a request went out without the consumer's
            // mandate so they can chase the missing document.
            mandateSummary: result.mandateSummary,
            missingMandate: result.missingMandate,
        });
    } catch (error) {
        logger.error('Error sending DC notification:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
