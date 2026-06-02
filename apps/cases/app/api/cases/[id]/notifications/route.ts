import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { sendStatusChangeNotification, sendManualMessage, createLogger } from '@zenowethu/shared-lib';
import { CaseNotificationSendSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/notifications');

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
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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
                message,
                undefined,
                { senderId: session.user.id }
            );

            const sent = result.smsSuccess || result.emailSuccess || result.whatsappSuccess;

            // Return the saved log entry so the UI can prepend it immediately
            if (result.logId) {
                const logEntry = await prisma.notificationLog.findUnique({
                    where: { id: result.logId },
                    include: {
                        sender: { select: { firstName: true, lastName: true } }
                    }
                });
                if (logEntry) {
                    return NextResponse.json(logEntry, { status: sent ? 200 : 207 });
                }
            }

            // Fallback if logId not available
            return NextResponse.json({
                id: crypto.randomUUID(),
                channel: channel || 'WHATSAPP',
                recipient: finalRecipient,
                message,
                success: sent,
                sentAt: new Date().toISOString(),
                provider: 'unknown',
                error: result.errors[0] ?? null,
                sender: null,
            }, { status: sent ? 200 : 207 });
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

