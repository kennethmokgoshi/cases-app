import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger, getSMTPCredentials } from '@zenowethu/shared-lib';

const logger = createLogger('api/cases/[id]/dhs-decline/check-fee-emails/verify-request');

function pickDebtCounsellorEmail(caseData: any): string | null {
    return (
        caseData?.preferredDcEmail?.trim() ||
        caseData?.debtCounsellor?.preferredEmail?.trim() ||
        caseData?.lastKnownEmail?.trim() ||
        caseData?.debtCounsellor?.lastKnownEmail?.trim() ||
        caseData?.dcEmail?.trim() ||
        caseData?.debtCounsellor?.email?.trim() ||
        null
    );
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;

        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                id: true,
                fileNumber: true,
                preferredDcEmail: true,
                lastKnownEmail: true,
                dcEmail: true,
                client: {
                    select: {
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                    },
                },
                debtCounsellor: {
                    select: {
                        preferredEmail: true,
                        lastKnownEmail: true,
                        email: true,
                    },
                },
            },
        });

        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const activeDcEmail = pickDebtCounsellorEmail(caseData);
        const smtp = await getSMTPCredentials().catch(() => null);
        const systemFromEmail = smtp?.fromEmail || 'transfers@zenowethu.co.za';

        // 1. Get Notification Logs
        const emailLogs = await prisma.notificationLog.findMany({
            where: {
                caseId,
                channel: 'EMAIL',
                success: true,
                OR: [
                    { statusCode: 'REQUEST_INVOICE_DC' },
                    { message: { contains: 'Invoice Request', mode: 'insensitive' } },
                    { message: { contains: 'request invoice', mode: 'insensitive' } },
                    { message: { contains: 'invoice/statement', mode: 'insensitive' } },
                ],
            },
            orderBy: { sentAt: 'asc' },
            select: {
                id: true,
                sentAt: true,
                recipient: true,
                message: true,
            },
        });

        // 2. Get Case Comments representing requests
        const comments = await prisma.caseComment.findMany({
            where: {
                caseId,
                OR: [
                    { content: { contains: 'invoice requested', mode: 'insensitive' } },
                    { content: { contains: 'invoice re-requested', mode: 'insensitive' } },
                    { content: { contains: 'sent invoice request', mode: 'insensitive' } },
                ],
            },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                createdAt: true,
                content: true,
            },
        });

        // Combine them into a list of events
        const events: { date: Date; type: string; recipient?: string; details: string }[] = [];

        emailLogs.forEach(l => {
            events.push({
                date: l.sentAt,
                type: 'EMAIL',
                recipient: l.recipient,
                details: l.message,
            });
        });

        comments.forEach(c => {
            // Avoid adding double entries if a comment was logged for an email at the exact same minute
            const dateStr = c.createdAt.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
            const hasDuplicateEmail = emailLogs.some(l => l.sentAt.toISOString().slice(0, 16) === dateStr);
            if (!hasDuplicateEmail) {
                // Try to extract recipient email if present in comment content (e.g. "Sent invoice request to DC (email@address.com)")
                const emailMatch = c.content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                events.push({
                    date: c.createdAt,
                    type: 'COMMENT',
                    recipient: emailMatch ? emailMatch[1] : (activeDcEmail || undefined),
                    details: c.content,
                });
            }
        });

        // Sort events by date ascending
        events.sort((a, b) => a.date.getTime() - b.date.getTime());

        const count = events.length;
        const hasRequested = count > 0;
        const firstSentAt = hasRequested ? events[0].date : null;
        const lastSentAt = hasRequested ? events[count - 1].date : null;

        const eventsWithMetadata = events.map(ev => {
            const recipient = ev.recipient || '';
            const hasEmail = Boolean(recipient && recipient.includes('@'));
            const dhsPreferredEmail = caseData?.debtCounsellor?.preferredEmail || caseData?.preferredDcEmail || '';
            const isPreferred = Boolean(hasEmail && dhsPreferredEmail && recipient.toLowerCase().trim() === dhsPreferredEmail.toLowerCase().trim());

            let source = 'No configuration found';
            if (hasEmail) {
                const cleanRecip = recipient.toLowerCase().trim();
                if (caseData?.preferredDcEmail && cleanRecip === caseData.preferredDcEmail.toLowerCase().trim()) {
                    source = 'Preferred email override manually saved on case';
                } else if (caseData?.debtCounsellor?.preferredEmail && cleanRecip === caseData.debtCounsellor.preferredEmail.toLowerCase().trim()) {
                    source = 'Debt Counsellor master record preferred email (DHS)';
                } else if (caseData?.lastKnownEmail && cleanRecip === caseData.lastKnownEmail.toLowerCase().trim()) {
                    source = 'Last known email address saved on case';
                } else if (caseData?.debtCounsellor?.lastKnownEmail && cleanRecip === caseData.debtCounsellor.lastKnownEmail.toLowerCase().trim()) {
                    source = 'Last known email address on Debt Counsellor master record';
                } else if (caseData?.dcEmail && cleanRecip === caseData.dcEmail.toLowerCase().trim()) {
                    source = 'Default Debt Counsellor email saved on case';
                } else if (caseData?.debtCounsellor?.email && cleanRecip === caseData.debtCounsellor.email.toLowerCase().trim()) {
                    source = 'Default email on Debt Counsellor master record';
                } else {
                    source = 'Case activity records / comments';
                }
            }

            // Construct expected subject line if the event was an automated comment
            let subjectLine = ev.details;
            if (ev.type === 'COMMENT' && (ev.details.includes('requested') || ev.details.includes('request'))) {
                const clientName = `${caseData.client.firstName} ${caseData.client.lastName}`.trim();
                subjectLine = `Invoice Request — ${clientName} (${caseData.client.idNumber}) — ${caseData.fileNumber}`;
            }

            return {
                sentAt: ev.date,
                sender: systemFromEmail,
                recipient: hasEmail ? recipient : 'No email address configured (No email was sent)',
                subject: subjectLine,
                isPreferred,
                source,
            };
        });

        const senders = eventsWithMetadata.map(e => e.sender);
        const recipients = eventsWithMetadata.map(e => e.recipient);

        const allSentFromSameSender = senders.every(s => s === senders[0]);
        const allSentToSameRecipient = recipients.every(r => r === recipients[0]);

        return NextResponse.json({
            success: true,
            hasRequested,
            count,
            firstSentAt,
            lastSentAt,
            allSentFromSameSender,
            allSentToSameRecipient,
            commonSender: allSentFromSameSender && count > 0 ? senders[0] : null,
            commonRecipient: allSentToSameRecipient && count > 0 ? recipients[0] : null,
            isPreferred: allSentToSameRecipient && count > 0 ? eventsWithMetadata[0].isPreferred : false,
            source: allSentToSameRecipient && count > 0 ? eventsWithMetadata[0].source : 'Mixed / Multiple sources',
            emails: eventsWithMetadata,
        });
    } catch (error) {
        logger.error('Error verifying invoice request emails:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
