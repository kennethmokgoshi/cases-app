import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/dhs-decline/check-fee-emails');

const BodySchema = z.object({
    lookbackDays: z.coerce.number().int().min(1).max(365).default(90),
    receivedAfter: z.coerce.date().optional(),
    reason: z.string().trim().max(1000).optional(),
});

const ACTIVITY_TYPE = 'DHS_FEE_EMAIL_SCAN_REQUESTED';
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function isMailboxIngestionConfigured(): boolean {
    return Boolean(
        process.env.DC_FEE_INBOX_PROVIDER ||
        process.env.DC_FEE_INBOX_IMAP_HOST ||
        process.env.DC_FEE_INBOX_GRAPH_TENANT_ID ||
        process.env.DC_FEE_INBOX_GMAIL_CLIENT_ID
    );
}

function formatDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (session.user.userType === 'B2B_PARTNER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id: caseId } = await params;
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                declineReason: true,
                client: {
                    select: {
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                        email: true,
                    },
                },
            },
        });

        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const duplicateSince = new Date(Date.now() - DUPLICATE_WINDOW_MS);
        const existingRequest = await prisma.caseComment.findFirst({
            where: {
                caseId,
                activityType: ACTIVITY_TYPE,
                createdAt: { gte: duplicateSince },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, createdAt: true },
        });

        if (existingRequest) {
            return NextResponse.json({
                success: true,
                duplicate: true,
                scanQueued: false,
                inboxConfigured: isMailboxIngestionConfigured(),
                activityId: existingRequest.id,
                message: 'A fee-invoice email check was already requested for this case in the last 24 hours.',
            });
        }

        const { lookbackDays, receivedAfter, reason } = parsed.data;
        const searchFrom = receivedAfter ?? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const clientName = `${caseData.client.firstName} ${caseData.client.lastName}`.trim();
        const inboxConfigured = isMailboxIngestionConfigured();
        const activityData = {
            action: 'CHECK_DC_FEE_INVOICE_EMAILS',
            caseId,
            fileNumber: caseData.fileNumber,
            clientName,
            idNumber: caseData.client.idNumber,
            lookbackDays,
            receivedAfter: searchFrom.toISOString(),
            mailboxConfigured: inboxConfigured,
        };

        const content = [
            `Fee-invoice email check requested for ${clientName} (${caseData.client.idNumber}).`,
            `Search from: ${formatDateOnly(searchFrom)}.`,
            inboxConfigured
                ? 'Mailbox ingestion is configured; the inbox worker can match DC invoice replies and proof-of-payment replies to this case.'
                : 'Mailbox ingestion is not configured yet; connect IMAP, Gmail, or Microsoft Graph before this can read the inbox automatically.',
            reason ? `Decline reason: ${reason}` : null,
        ].filter((line): line is string => Boolean(line)).join('\n');

        const [comment] = await Promise.all([
            prisma.caseComment.create({
                data: {
                    caseId,
                    userId: session.user.id,
                    content,
                    type: 'NOTE',
                    isInternal: true,
                    activityType: ACTIVITY_TYPE,
                    activityData: JSON.stringify(activityData),
                },
                select: { id: true },
            }),
            prisma.workflowLog.create({
                data: {
                    caseId,
                    fromStatus: caseData.status,
                    toStatus: caseData.status,
                    action: ACTIVITY_TYPE,
                    userId: session.user.id,
                    notes: content,
                },
            }),
        ]);

        logger.info('[DHS fee email check] Requested', {
            caseId,
            fileNumber: caseData.fileNumber,
            userId: session.user.id,
            inboxConfigured,
        });

        return NextResponse.json({
            success: true,
            duplicate: false,
            scanQueued: inboxConfigured,
            inboxConfigured,
            activityId: comment.id,
            message: inboxConfigured
                ? 'Fee-invoice email check requested. Matching emails will be uploaded to this case by the inbox worker.'
                : 'Fee-invoice email check logged. Configure a mailbox connector before the app can read emails automatically.',
        }, { status: 202 });
    } catch (error) {
        logger.error('Error requesting fee-invoice email check:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
