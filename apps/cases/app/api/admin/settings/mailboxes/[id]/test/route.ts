import { NextResponse } from 'next/server';
import { auth, createLogger, getSMTPCredentials } from '@zenowethu/shared-lib';
import { verifyImapConnection } from '@zenowethu/shared-lib/src/integrations/imap';
import { decryptSecret } from '@zenowethu/shared-lib/src/security/encryption';
import { prisma } from '@zenowethu/database';
import { usesSmtpPassword } from '@/lib/mailboxes';

const logger = createLogger('api/admin/settings/mailboxes/[id]/test');

// POST /api/admin/settings/mailboxes/[id]/test — IMAP connect + login, nothing read.
// Anyone who can search a mailbox can test it: shared mailboxes for all staff,
// a personal mailbox for its owner (or Admin/Executive).
export async function POST(
    _request: Request,
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

        const { id } = await params;
        const mailbox = await prisma.mailboxAccount.findUnique({
            where: { id },
            select: {
                id: true,
                emailAddress: true,
                imapHost: true,
                imapPort: true,
                imapSecure: true,
                password: true,
                ownerUserId: true,
            },
        });
        if (!mailbox) {
            return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
        }

        const isPrivileged = Boolean(session.user.isAdmin || session.user.isExecutive);
        if (mailbox.ownerUserId !== null && mailbox.ownerUserId !== session.user.id && !isPrivileged) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Own encrypted password first, otherwise the Email (SMTP) Account
        // password when the address matches its login
        let password: string | null = null;
        if (mailbox.password) {
            password = decryptSecret(mailbox.password);
        } else {
            try {
                const smtp = await getSMTPCredentials();
                if (usesSmtpPassword(mailbox.emailAddress, mailbox.password, smtp.password ? smtp.username : null)) {
                    password = smtp.password;
                }
            } catch {
                // fall through to the no-password response
            }
        }

        if (!password) {
            return NextResponse.json(
                { success: false, error: 'No password saved for this mailbox — set it first, then test.' },
                { status: 400 }
            );
        }

        const result = await verifyImapConnection({
            host: mailbox.imapHost,
            port: mailbox.imapPort,
            secure: mailbox.imapSecure,
            username: mailbox.emailAddress,
            password,
        });

        logger.info(`Mailbox test ${result.success ? 'OK' : 'failed'} for ${mailbox.emailAddress} (by ${session.user.id})`);
        return NextResponse.json(result);
    } catch (error) {
        logger.error('Error testing mailbox connection:', error);
        return NextResponse.json({ error: 'Failed to test mailbox connection' }, { status: 500 });
    }
}
