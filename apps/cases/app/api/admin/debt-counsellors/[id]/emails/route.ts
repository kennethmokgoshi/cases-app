/**
 * PUT /api/admin/debt-counsellors/[id]/emails
 *
 * Replace a debt counsellor's priority email list (admin only). The body is
 * the full ordered list — index 0 becomes priority 1. Max 5 entries; bounce
 * flags are preserved for addresses that stay on the list.
 * DebtCounsellor.preferredEmail is synced to the best (non-bounced) entry so
 * legacy send paths keep working.
 */

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import {
    MAX_PRIORITY_EMAILS,
    normalizeDcEmail,
    getDcPriorityEmails,
} from '@zenowethu/shared-lib/src/dc/email-priority';

const logger = createLogger('api/admin/debt-counsellors/emails');

const PutSchema = z.object({
    emails: z
        .array(
            z.object({
                email: z.string().email(),
                /** Clear an existing bounce flag (staff confirmed the address works again). */
                clearBounce: z.boolean().optional(),
            })
        )
        .max(MAX_PRIORITY_EMAILS, `A debt counsellor can have at most ${MAX_PRIORITY_EMAILS} priority emails`),
});

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;
        const db = prisma as any;

        const dc = await db.debtCounsellor.findUnique({ where: { id }, select: { id: true } });
        if (!dc) {
            return NextResponse.json({ error: 'Debt counsellor not found' }, { status: 404 });
        }

        const parsed = PutSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        // Normalise + reject duplicates
        const normalized = parsed.data.emails.map((e) => ({
            ...e,
            email: normalizeDcEmail(e.email),
        }));
        const unique = new Set(normalized.map((e) => e.email));
        if (unique.size !== normalized.length) {
            return NextResponse.json({ error: 'Duplicate email addresses in the list' }, { status: 400 });
        }

        const existing = await getDcPriorityEmails(id);
        const existingByEmail = new Map(existing.map((r) => [normalizeDcEmail(r.email), r]));
        const staffName = `${session.user.firstName ?? ''} ${session.user.lastName ?? ''}`.trim();

        await db.$transaction(async (tx: any) => {
            // Remove entries no longer on the list
            for (const row of existing) {
                if (!unique.has(normalizeDcEmail(row.email))) {
                    await tx.debtCounsellorEmail.delete({ where: { id: row.id } });
                }
            }
            // Upsert the new ordered list
            for (let i = 0; i < normalized.length; i++) {
                const entry = normalized[i];
                const current = existingByEmail.get(entry.email);
                if (current) {
                    await tx.debtCounsellorEmail.update({
                        where: { id: current.id },
                        data: {
                            priority: i + 1,
                            ...(entry.clearBounce ? { lastBouncedAt: null, bounceReason: null } : {}),
                        },
                    });
                } else {
                    await tx.debtCounsellorEmail.create({
                        data: {
                            debtCounsellordId: id,
                            email: entry.email,
                            priority: i + 1,
                            source: 'STAFF',
                            notes: staffName ? `Added by ${staffName}` : null,
                        },
                    });
                }
            }
        });

        // Audit-log newly added addresses (once per address)
        for (const entry of normalized) {
            if (!existingByEmail.has(entry.email)) {
                const seen = await db.debtCounsellorEmailHistory.findFirst({
                    where: { debtCounsellordId: id, email: entry.email },
                });
                if (!seen) {
                    await db.debtCounsellorEmailHistory
                        .create({
                            data: {
                                debtCounsellordId: id,
                                email: entry.email,
                                source: 'STAFF',
                                notes: staffName ? `Added by ${staffName}` : null,
                            },
                        })
                        .catch(() => null);
                }
            }
        }

        // Sync legacy preferredEmail to the best non-bounced entry
        const updatedList = await getDcPriorityEmails(id);
        const best = updatedList.find((r) => !r.lastBouncedAt) ?? updatedList[0] ?? null;
        await db.debtCounsellor.update({
            where: { id },
            data: { preferredEmail: best?.email ?? null, updatedById: session.user.id },
        });

        logger.info('DC priority emails updated', { id, count: updatedList.length, by: session.user.id });
        return NextResponse.json({ success: true, priorityEmails: updatedList });
    } catch (error) {
        logger.error('PUT /api/admin/debt-counsellors/[id]/emails', { error });
        return NextResponse.json({ error: 'Failed to update priority emails' }, { status: 500 });
    }
}
