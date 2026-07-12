import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { encryptSecret } from '@zenowethu/shared-lib/src/security/encryption';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { parseBody } from '@/lib/schemas';
import { MAILBOX_PUBLIC_SELECT, toPublicMailbox } from '@/lib/mailboxes';
import { getSmtpUsernameIfConfigured } from '@/lib/mailbox-smtp';

const logger = createLogger('api/admin/settings/mailboxes');

const CreateMailboxSchema = z.object({
    scope:             z.enum(['SHARED', 'PERSONAL']),
    label:             z.string().trim().min(1, 'Label is required').max(100),
    emailAddress:      z.string().trim().toLowerCase().email('A valid email address is required').max(200),
    imapHost:          z.string().trim().min(1, 'IMAP host is required').max(200),
    imapPort:          z.coerce.number().int().min(1).max(65535).default(993),
    imapSecure:        z.boolean().default(true),
    isDcCommunication: z.boolean().default(false),
    password:          z.string().max(200).optional(),
    notes:             z.string().trim().max(500).optional(),
});

// GET /api/admin/settings/mailboxes — list mailboxes the caller can see.
// Staff: active shared mailboxes + their own personal mailbox.
// Admin/Executive: all shared mailboxes + all personal mailboxes (read-only for
// personal ones they do not own — passwords there are owner-managed).
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (session.user.userType === 'B2B_PARTNER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const isPrivileged = Boolean(session.user.isAdmin || session.user.isExecutive);

        const mailboxes = await prisma.mailboxAccount.findMany({
            where: isPrivileged
                ? {}
                : {
                    OR: [
                        { ownerUserId: null, isActive: true },
                        { ownerUserId: session.user.id },
                    ],
                },
            select: MAILBOX_PUBLIC_SELECT,
            orderBy: [{ ownerUserId: 'asc' }, { createdAt: 'asc' }],
        });

        const smtpUsername = await getSmtpUsernameIfConfigured();
        const shared = mailboxes.filter(m => m.ownerUserId === null).map(m => toPublicMailbox(m, smtpUsername));
        const personal = mailboxes
            .filter(m => m.ownerUserId === session.user.id)
            .map(m => toPublicMailbox(m, smtpUsername))[0] ?? null;
        const otherPersonal = isPrivileged
            ? mailboxes
                .filter(m => m.ownerUserId !== null && m.ownerUserId !== session.user.id)
                .map(m => toPublicMailbox(m, smtpUsername))
            : [];

        return NextResponse.json({ shared, personal, otherPersonal });
    } catch (error) {
        logger.error('Error listing mailboxes:', error);
        return NextResponse.json({ error: 'Failed to list mailboxes' }, { status: 500 });
    }
}

// POST /api/admin/settings/mailboxes — register a mailbox.
// SHARED: Admin/Executive only. PERSONAL: any staff member, one for themselves.
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (session.user.userType === 'B2B_PARTNER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsed = parseBody<z.infer<typeof CreateMailboxSchema>>(CreateMailboxSchema, body);
        if (!parsed.success) return parsed.response;
        const { scope, password, ...fields } = parsed.data;

        const isPrivileged = Boolean(session.user.isAdmin || session.user.isExecutive);
        if (scope === 'SHARED' && !isPrivileged) {
            return NextResponse.json(
                { error: 'Only Admin or Executive users can add shared mailboxes' },
                { status: 403 }
            );
        }

        if (scope === 'PERSONAL') {
            const existing = await prisma.mailboxAccount.findUnique({
                where: { ownerUserId: session.user.id },
                select: { id: true },
            });
            if (existing) {
                return NextResponse.json(
                    { error: 'You already have a personal mailbox — update it instead' },
                    { status: 409 }
                );
            }
        }

        const emailTaken = await prisma.mailboxAccount.findUnique({
            where: { emailAddress: fields.emailAddress },
            select: { id: true },
        });
        if (emailTaken) {
            return NextResponse.json(
                { error: 'A mailbox with this email address is already registered' },
                { status: 409 }
            );
        }

        const created = await prisma.mailboxAccount.create({
            data: {
                ...fields,
                ownerUserId: scope === 'PERSONAL' ? session.user.id : null,
                password: password && !password.includes('•') ? encryptSecret(password) : null,
            },
            select: MAILBOX_PUBLIC_SELECT,
        });

        logger.info(`Mailbox ${created.emailAddress} (${scope}) registered by user ${session.user.id}`);
        return NextResponse.json(
            { success: true, mailbox: toPublicMailbox(created, await getSmtpUsernameIfConfigured()) },
            { status: 201 }
        );
    } catch (error) {
        logger.error('Error creating mailbox:', error);
        return NextResponse.json({ error: 'Failed to create mailbox' }, { status: 500 });
    }
}
