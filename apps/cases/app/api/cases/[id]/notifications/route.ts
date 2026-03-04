import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { sendStatusChangeNotification, sendManualMessage  } from '@zenowethu/shared-lib';
import { CaseNotificationSendSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

// GET - Get notification history for a case
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const notifications = await prisma.notificationLog.findMany({
            where: { caseId: id },
            orderBy: { sentAt: 'desc' },
            include: {
                sender: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });

        return NextResponse.json(notifications);
    } catch (error) {
        logger.error('Error fetching notifications:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Manually send a notification or custom message
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const parsed = parseBody(CaseNotificationSendSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data as z.infer<typeof CaseNotificationSendSchema>;
        const { statusCode, channel, message, recipient } = body;

        // Get case with client info
        const caseData = await prisma.case.findUnique({
            where: { id },
            include: { client: true }
        });

        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // If a custom message is provided, use specialized manual sender
        if (message) {
            const finalRecipient = recipient || (channel === 'EMAIL' ? caseData.client.email : caseData.client.phone);

            if (!finalRecipient) {
                return NextResponse.json({ error: 'Recipient address missing' }, { status: 400 });
            }

            const result = await sendManualMessage(
                id,
                channel || 'WHATSAPP',
                finalRecipient,
                message
            );

            return NextResponse.json({
                success: result.smsSuccess || result.emailSuccess || result.whatsappSuccess,
                result: {
                    ...result,
                    sentAt: new Date().toISOString()
                }
            });
        }

        // Standard status change notification
        const result = await sendStatusChangeNotification({
            caseId: id,
            clientName: `${caseData.client.firstName} ${caseData.client.lastName}`,
            clientPhone: caseData.client.phone,
            clientEmail: caseData.client.email,
            fileNumber: caseData.fileNumber,
            statusCode: statusCode || caseData.status,
            partnerName: caseData.partnerName,
            isB2B: caseData.acquisitionType === 'B2B' });

        return NextResponse.json({
            success: result.smsSuccess || result.emailSuccess || result.whatsappSuccess,
            smsSuccess: result.smsSuccess,
            emailSuccess: result.emailSuccess,
            whatsappSuccess: result.whatsappSuccess,
            errors: result.errors });
    } catch (error) {
        logger.error('Error sending notification:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

