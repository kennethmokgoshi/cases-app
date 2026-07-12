import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { encryptSecret } from '@zenowethu/shared-lib/src/security/encryption';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { parseBody } from '@/lib/schemas';
import { MAILBOX_PUBLIC_SELECT, toPublicMailbox } from '@/lib/mailboxes';
import { getSmtpUsernameIfConfigured } from '@/lib/mailbox-smtp';

const logger = createLogger('api/admin/settings/mailboxes/[id]');

const UpdateMailboxSchema = z.object({
    label:             z.string().trim().min(1).max(100).optional(),
    emailAddress:      z.string().trim().toLowerCase().email().max(200).optional(),
    imapHost:          z.string().trim().min(1).max(200).optional(),
    imapPort:          z.coerce.number().int().min(1).max(65535).optional(),
    imapSecure:        z.boolean().optional(),
    isDcCommunication: z.boolean().optional(),
    isActive:          z.boolean().optional(),
    password:          z.string().max(200).optional(),
    notes:             z.string().trim().max(500).nullable().optional(),
});

// PATCH /api/admin/settings/mailboxes/[id]
// Shared mailbox (no owner): Admin/Executive manage everything, including the password.
// Personal mailbox: the owner manages everything including their own password.
// An Admin who is NOT the owner may only enable/disable it — never its password
// or connection details (business rule: admin updates the shared mailbox
// passwords, each user manages their own).
export async function PATCH(
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

        const { id } = await params;
        const mailbox = await prisma.mailboxAccount.findUnique({
            where: { id },
            select: { id: true, ownerUserId: true, emailAddress: true },
        });
        if (!mailbox) {
            return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsed = parseBody<z.infer<typeof UpdateMailboxSchema>>(UpdateMailboxSchema, body);
        if (!parsed.success) return parsed.response;
        const { password, ...fields } = parsed.data;

        const isPrivileged = Boolean(session.user.isAdmin || session.user.isExecutive);
        const isShared = mailbox.ownerUserId === null;
        const isOwner = mailbox.ownerUserId === session.user.id;

        if (isShared && !isPrivileged) {
            return NextResponse.json(
                { error: 'Only Admin or Executive users can update shared mailboxes' },
                { status: 403 }
            );
        }

        if (!isShared && !isOwner) {
            if (!isPrivileged) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            // Admin on someone else's personal mailbox: activate/deactivate only
            const attemptedKeys = Object.keys(parsed.data).filter(
                k => (parsed.data as Record<string, unknown>)[k] !== undefined
            );
            const disallowed = attemptedKeys.filter(k => k !== 'isActive');
            if (disallowed.length > 0) {
                return NextResponse.json(
                    { error: `A personal mailbox is managed by its owner — admins may only enable or disable it (not: ${disallowed.join(', ')})` },
                    { status: 403 }
                );
            }
        }

        if (fields.emailAddress && fields.emailAddress !== mailbox.emailAddress) {
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
        }

        const updated = await prisma.mailboxAccount.update({
            where: { id },
            data: {
                ...fields,
                // Only replace the password when a real value is provided (not the masked placeholder)
                ...(password && !password.includes('•') ? { password: encryptSecret(password) } : {}),
            },
            select: MAILBOX_PUBLIC_SELECT,
        });

        logger.info(`Mailbox ${updated.emailAddress} updated by user ${session.user.id}${password ? ' (password changed)' : ''}`);
        return NextResponse.json({
            success: true,
            mailbox: toPublicMailbox(updated, await getSmtpUsernameIfConfigured()),
        });
    } catch (error) {
        logger.error('Error updating mailbox:', error);
        return NextResponse.json({ error: 'Failed to update mailbox' }, { status: 500 });
    }
}

// DELETE /api/admin/settings/mailboxes/[id]
// Shared: Admin/Executive only. Personal: the owner or Admin/Executive.
export async function DELETE(
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
            select: { id: true, ownerUserId: true, emailAddress: true },
        });
        if (!mailbox) {
            return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
        }

        const isPrivileged = Boolean(session.user.isAdmin || session.user.isExecutive);
        const isOwner = mailbox.ownerUserId === session.user.id;

        if (mailbox.ownerUserId === null ? !isPrivileged : (!isOwner && !isPrivileged)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.mailboxAccount.delete({ where: { id } });

        logger.info(`Mailbox ${mailbox.emailAddress} deleted by user ${session.user.id}`);
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error deleting mailbox:', error);
        return NextResponse.json({ error: 'Failed to delete mailbox' }, { status: 500 });
    }
}
