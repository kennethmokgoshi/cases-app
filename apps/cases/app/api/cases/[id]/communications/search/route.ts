import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { searchConsumerAcrossMailboxes } from '@/lib/mailbox-search';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/communications/search');

const BodySchema = z.object({
    lookbackDays: z.coerce.number().int().min(1).max(1095).default(365),
    includeInbox: z.boolean().optional().default(true),
});

const SNIPPET_LEN = 160;

/**
 * POST /api/cases/[id]/communications/search
 *
 * Find any communication that references this consumer by ID number OR by
 * first name + last name. Searches our outbound record (NotificationLog) first,
 * then — when configured — the connected IMAP inboxes. Read-only.
 *
 * Body: { lookbackDays?: number, includeInbox?: boolean }
 */
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

        const body = await request.json().catch(() => ({}));
        const parsed = BodySchema.safeParse(body ?? {});
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten() },
                { status: 400 }
            );
        }
        const { lookbackDays, includeInbox } = parsed.data;

        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                id: true,
                fileNumber: true,
                client: { select: { idNumber: true, firstName: true, lastName: true, email: true } },
            },
        });
        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const idNumber = caseData.client.idNumber?.trim() || null;
        const firstName = caseData.client.firstName?.trim() || null;
        const lastName = caseData.client.lastName?.trim() || null;
        const fullName = firstName && lastName ? `${firstName} ${lastName}` : null;

        if (!idNumber && !fullName) {
            return NextResponse.json(
                { error: 'Cannot search: the consumer has neither an ID number nor a first and last name on file.' },
                { status: 422 }
            );
        }

        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

        // ── Stage 1: our outbound record (NotificationLog) ───────────────────
        const orConditions: Record<string, unknown>[] = [];
        if (idNumber) orConditions.push({ message: { contains: idNumber } });
        if (fullName) orConditions.push({ message: { contains: fullName, mode: 'insensitive' } });
        if (caseData.client.email) orConditions.push({ recipient: caseData.client.email });

        const notificationRows = orConditions.length
            ? await prisma.notificationLog.findMany({
                  where: { AND: [{ sentAt: { gte: since } }, { OR: orConditions }] },
                  orderBy: { sentAt: 'desc' },
                  take: 100,
                  select: {
                      id: true,
                      caseId: true,
                      channel: true,
                      recipient: true,
                      recipientType: true,
                      success: true,
                      provider: true,
                      sentAt: true,
                      message: true,
                  },
              })
            : [];

        const notifications = notificationRows.map((row) => ({
            id: row.id,
            caseId: row.caseId,
            onThisCase: row.caseId === caseId,
            channel: row.channel,
            recipient: row.recipient,
            recipientType: row.recipientType,
            success: row.success,
            provider: row.provider,
            sentAt: row.sentAt,
            matchedOn: matchNotification(row.message, row.recipient, idNumber, fullName, caseData.client.email),
            snippet: (row.message || '').slice(0, SNIPPET_LEN),
        }));

        // ── Stage 2: connected inboxes ───────────────────────────────────────
        let inbox: {
            searched: boolean;
            searchedMailboxes: number;
            skippedMailboxes: number;
            matches: unknown[];
            errors: string[];
        } = { searched: false, searchedMailboxes: 0, skippedMailboxes: 0, matches: [], errors: [] };

        if (includeInbox) {
            const sweep = await searchConsumerAcrossMailboxes({
                userId: session.user.id,
                idNumber,
                firstName,
                lastName,
                since,
                limitPerMailbox: 50,
            });
            inbox = {
                searched: true,
                searchedMailboxes: sweep.searchedMailboxes,
                skippedMailboxes: sweep.skippedMailboxes,
                matches: sweep.matches,
                errors: sweep.errors,
            };
        }

        logger.info('[Communications search] Completed', {
            caseId,
            fileNumber: caseData.fileNumber,
            userId: session.user.id,
            lookbackDays,
            notifications: notifications.length,
            inboxMatches: inbox.matches.length,
            searchedMailboxes: inbox.searchedMailboxes,
        });

        return NextResponse.json({
            success: true,
            searchedFor: { idNumber, fullName },
            since: since.toISOString(),
            notifications,
            inbox,
            summary: {
                notificationCount: notifications.length,
                inboxCount: inbox.matches.length,
                total: notifications.length + inbox.matches.length,
            },
        });
    } catch (error) {
        logger.error('Error searching communications:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/** Which identifier(s) matched an outbound record. Kept simple/case-insensitive. */
function matchNotification(
    message: string | null,
    recipient: string | null,
    idNumber: string | null,
    fullName: string | null,
    clientEmail: string | null,
): string[] {
    const matched: string[] = [];
    const body = (message || '').toLowerCase();
    if (idNumber && (message || '').includes(idNumber)) matched.push('ID_NUMBER');
    if (fullName && body.includes(fullName.toLowerCase())) matched.push('NAME');
    if (clientEmail && recipient && recipient.toLowerCase() === clientEmail.toLowerCase()) matched.push('EMAIL');
    return matched;
}
