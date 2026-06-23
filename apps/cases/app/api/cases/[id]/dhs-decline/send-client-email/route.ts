import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { sendManualMessage } from '@zenowethu/shared-lib/src/notifications/service';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/dhs-decline/send-client-email');

const BodySchema = z.object({
    emailContent: z.string().min(1, 'Email content is required'),
    clientId: z.string().min(1, 'Client ID is required'),
});

/**
 * POST /api/cases/[id]/dhs-decline/send-client-email
 *
 * Staff-triggered endpoint to send the drafted email to the client via WhatsApp.
 *
 * Body: { emailContent: string, clientId: string }
 * Returns: { success: boolean, whatsappSent: boolean, errors: string[] }
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;

        const body = await request.json();
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { emailContent, clientId } = parsed.data;

        // Verify case and client exist
        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                id: true,
                fileNumber: true,
                clientId: true,
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        whatsappNumber: true,
                    },
                },
            },
        });

        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        if (clientId !== caseData.clientId) {
            return NextResponse.json(
                { error: 'Client ID does not match case client' },
                { status: 400 }
            );
        }

        if (!caseData.client?.whatsappNumber) {
            return NextResponse.json(
                { error: 'Client does not have a WhatsApp number on file' },
                { status: 400 }
            );
        }

        const errors: string[] = [];
        let whatsappSent = false;

        try {
            // Send via WhatsApp
            const result = await sendManualMessage(
                caseId,
                'WHATSAPP',
                caseData.client.whatsappNumber,
                emailContent
            );

            whatsappSent = result.whatsappSuccess;
            if (!whatsappSent) {
                errors.push(`WhatsApp send failed: ${result.errors?.[0] || 'Unknown error'}`);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`WhatsApp error: ${errorMsg}`);
            logger.error('Error sending WhatsApp:', error);
        }

        return NextResponse.json({
            success: errors.length === 0,
            whatsappSent,
            errors,
            message: whatsappSent
                ? `Message sent to ${caseData.client.firstName} via WhatsApp`
                : 'Failed to send message',
        });
    } catch (error) {
        logger.error('Error sending client email:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
