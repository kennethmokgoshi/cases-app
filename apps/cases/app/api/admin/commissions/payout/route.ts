import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';

const logger = createLogger('api/admin/commissions/payout');

const PayoutSchema = z.object({
    commissionIds: z.array(z.string()).min(1),
    paymentRef: z.string().min(1).max(200),
    notes: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive && !session.user.isSeniorManager && session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const parsed = PayoutSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }

        const { commissionIds, paymentRef, notes } = parsed.data;

        const commissionsToPay = await prisma.referrerCommission.findMany({
            where: {
                id: { in: commissionIds },
                isEligible: true,
                isPaid: false,
            },
            include: { referrer: true },
        });

        if (commissionsToPay.length === 0) {
            return NextResponse.json({ error: 'No eligible unpaid commissions found' }, { status: 400 });
        }

        const now = new Date();
        let totalPaid = 0;

        await prisma.$transaction(async (tx) => {
            for (const commission of commissionsToPay) {
                const amount = commission.commissionAmount?.toNumber() || 0;
                totalPaid += amount;

                await tx.referrerCommission.update({
                    where: { id: commission.id },
                    data: {
                        isPaid: true,
                        paidAt: now,
                        paidById: session.user!.id,
                        paymentRef,
                        notes: notes ? notes : commission.notes,
                    },
                });

                // Create audit log entry on the case
                await tx.caseComment.create({
                    data: {
                        caseId: commission.caseId,
                        userId: session.user!.id,
                        type: 'NOTE',
                        activityType: 'COMMISSION_PAID',
                        content: `Referrer commission of R ${amount.toFixed(2)} paid to ${commission.referrer.firstName} ${commission.referrer.lastName}.\nRef: ${paymentRef}`,
                        isInternal: true,
                    },
                });
            }
        });

        // Send payout confirmation emails to referrers (best-effort, non-blocking)
        try {
            // Group commissions by referrer to send one email per referrer
            const byReferrer = new Map<string, { referrer: typeof commissionsToPay[0]['referrer']; total: number; count: number }>();
            for (const c of commissionsToPay) {
                const existing = byReferrer.get(c.referrerId);
                const amount = c.commissionAmount?.toNumber() || 0;
                if (existing) {
                    existing.total += amount;
                    existing.count += 1;
                } else {
                    byReferrer.set(c.referrerId, { referrer: c.referrer, total: amount, count: 1 });
                }
            }

            for (const [, { referrer, total, count }] of byReferrer) {
                const email = referrer.email;
                if (!email) continue;

                const formattedTotal = `R ${total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
                await sendEmailWithAttachments({
                    to: email,
                    subject: `Commission Payment Confirmation — ${formattedTotal}`,
                    html: `
                        <p>Hi ${referrer.firstName},</p>
                        <p>We're pleased to confirm that your referral commission of <strong>${formattedTotal}</strong> (${count} case${count > 1 ? 's' : ''}) has been processed.</p>
                        <p><strong>Bank Reference:</strong> ${paymentRef}</p>
                        <p>Please allow 1–2 business days for the funds to reflect in your account.</p>
                        <p>Thank you for your continued partnership!</p>
                        <p>Kind regards,<br/>Zenowethu Finance Team</p>
                    `,
                    fromName: 'Zenowethu Finance',
                    fromEmail: 'accounts@zenowethu.co.za'
                });
            }
        } catch (emailError) {
            // Non-blocking — payout succeeded, email is best-effort
            logger.error('Failed to send payout confirmation emails:', emailError);
        }

        logger.info(`Processed bulk commission payout. Count: ${commissionsToPay.length}, Total Amount: R${totalPaid}, Ref: ${paymentRef}`);
        return NextResponse.json({ success: true, count: commissionsToPay.length, totalPaid });
    } catch (error) {
        logger.error('Error processing bulk payout:', error);
        return NextResponse.json({ error: 'Failed to process payout' }, { status: 500 });
    }
}
