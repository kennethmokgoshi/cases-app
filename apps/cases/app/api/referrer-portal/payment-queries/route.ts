import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, referrerEarnsCommission } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { maskConsumerName, toPortalNumber } from '@/lib/referrer-portal';

const logger = createLogger('api/referrer-portal/payment-queries');

const PaymentQuerySchema = z.object({
    caseId: z.string().min(1),
    claimedPaidAt: z.coerce.date().nullable().optional(),
    claimedAmount: z.coerce.number().min(0).nullable().optional(),
    notes: z.string().trim().min(10).max(2000),
});

export async function GET() {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const queries = await prisma.referrerPaymentQuery.findMany({
            where: { referrerId: access.referrer.id },
            select: {
                id: true,
                caseId: true,
                commissionId: true,
                status: true,
                claimedPaidAt: true,
                claimedAmount: true,
                notes: true,
                createdAt: true,
                updatedAt: true,
                case: {
                    select: {
                        fileNumber: true,
                        client: { select: { firstName: true, lastName: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({
            paymentQueries: queries.map((query) => ({
                id: query.id,
                caseId: query.caseId,
                commissionId: query.commissionId,
                fileNumber: query.case.fileNumber,
                consumerLabel: maskConsumerName(query.case.client.firstName, query.case.client.lastName),
                status: query.status,
                claimedPaidAt: query.claimedPaidAt,
                claimedAmount: toPortalNumber(query.claimedAmount),
                notes: query.notes,
                createdAt: query.createdAt,
                updatedAt: query.updatedAt,
            })),
        });
    } catch (error) {
        logger.error('Failed to list referrer payment queries', error);
        return NextResponse.json({ error: 'Failed to load payment queries' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const parsed = PaymentQuerySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid payment query', details: parsed.error.flatten() }, { status: 422 });
        }



        const referralCase = await prisma.case.findFirst({
            where: {
                id: parsed.data.caseId,
                referrerId: access.referrer.id,
                deletedAt: null,
            },
            select: {
                id: true,
                fileNumber: true,
                client: { select: { firstName: true, lastName: true } },
                referrerCommission: { select: { id: true } },
            },
        });

        if (!referralCase) {
            return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
        }

        const query = await prisma.referrerPaymentQuery.create({
            data: {
                referrerId: access.referrer.id,
                caseId: referralCase.id,
                commissionId: referralCase.referrerCommission?.id ?? null,
                submittedByUserId: access.sessionUserId,
                claimedPaidAt: parsed.data.claimedPaidAt ?? null,
                claimedAmount: parsed.data.claimedAmount ?? null,
                notes: parsed.data.notes.trim(),
                status: 'PENDING',
            },
            select: {
                id: true,
                caseId: true,
                commissionId: true,
                status: true,
                claimedPaidAt: true,
                claimedAmount: true,
                notes: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({
            paymentQuery: {
                ...query,
                fileNumber: referralCase.fileNumber,
                consumerLabel: maskConsumerName(referralCase.client.firstName, referralCase.client.lastName),
                claimedAmount: toPortalNumber(query.claimedAmount),
            },
        }, { status: 201 });
    } catch (error) {
        logger.error('Failed to create referrer payment query', error);
        return NextResponse.json({ error: 'Failed to submit payment query' }, { status: 500 });
    }
}
