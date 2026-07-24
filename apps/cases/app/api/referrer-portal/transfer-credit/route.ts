import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { auth } from '@zenowethu/shared-lib';
import { z } from 'zod';

const logger = createLogger('api/referrer-portal/transfer-credit');

const transferCreditSchema = z.object({
    fromCaseId: z.string().min(1, 'Source case ID required'),
    toCaseId: z.string().min(1, 'Destination case ID required'),
    amount: z.number().positive('Amount must be positive'),
    notes: z.string().optional(),
});

export async function POST(request: Request) {
    try {
        // Check user role — only FINANCE, EXECUTIVE, ADMIN can transfer
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const userRole = (session.user as any).role?.toUpperCase();
        const allowedRoles = ['FINANCE', 'EXECUTIVE', 'ADMIN'];
        if (!allowedRoles.includes(userRole)) {
            return NextResponse.json({ error: 'Only finance, executive, and admin staff can transfer credits' }, { status: 403 });
        }

        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const body = await request.json();
        const validation = transferCreditSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid request', details: validation.error.flatten() }, { status: 400 });
        }

        const { fromCaseId, toCaseId, amount, notes } = validation.data;

        // Fetch both cases with referrer check
        const [fromCase, toCase] = await Promise.all([
            prisma.case.findUnique({ where: { id: fromCaseId }, select: { id: true, referrerId: true, fileNumber: true } }),
            prisma.case.findUnique({ where: { id: toCaseId }, select: { id: true, referrerId: true, fileNumber: true } }),
        ]);

        if (!fromCase || !toCase) {
            return NextResponse.json({ error: 'One or both cases not found' }, { status: 404 });
        }

        // Verify both cases belong to the same referrer and match session referrer
        if (fromCase.referrerId !== access.referrer.id || toCase.referrerId !== access.referrer.id) {
            return NextResponse.json({ error: 'Cases must belong to your referral network' }, { status: 403 });
        }

        // Verify source and destination are different
        if (fromCaseId === toCaseId) {
            return NextResponse.json({ error: 'Source and destination must be different cases' }, { status: 400 });
        }

        // Create the credit transfer record and update destination case payment
        const transfer = await prisma.$transaction(async (tx) => {
            // Record the transfer
            const creditTransfer = await tx.creditTransfer.create({
                data: {
                    fromCaseId,
                    toCaseId,
                    referrerId: access.referrer.id,
                    amount,
                    notes: notes || null,
                    transferredById: access.sessionUserId,
                    status: 'COMPLETED',
                },
                select: {
                    id: true,
                    fromCase: { select: { fileNumber: true } },
                    toCase: { select: { fileNumber: true } },
                    amount: true,
                    createdAt: true,
                },
            });

            // Create a payment record on destination case to reflect the credit
            await tx.payment.create({
                data: {
                    caseId: toCaseId,
                    amount,
                    status: 'COMPLETED',
                    date: new Date(),
                    notes: `Credit transfer from ${fromCase.fileNumber} (Ref ID: ${creditTransfer.id})`,
                    recordedById: access.sessionUserId,
                },
            });

            return creditTransfer;
        });

        logger.info('Credit transfer completed', {
            transferId: transfer.id,
            fromFile: transfer.fromCase.fileNumber,
            toFile: transfer.toCase.fileNumber,
            amount: transfer.amount.toString(),
            referrerId: access.referrer.id,
        });

        return NextResponse.json({
            success: true,
            transfer: {
                id: transfer.id,
                fromFile: transfer.fromCase.fileNumber,
                toFile: transfer.toCase.fileNumber,
                amount: transfer.amount.toString(),
                createdAt: transfer.createdAt,
            },
        });
    } catch (error) {
        logger.error('Credit transfer failed', { error });
        return NextResponse.json({ error: 'Transfer failed' }, { status: 500 });
    }
}
