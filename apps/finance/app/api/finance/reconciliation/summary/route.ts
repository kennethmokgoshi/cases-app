import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const [unallocatedAgg, unreconciledBatches, batchesNeedingAttention] = await Promise.all([
            // Total count and value of UNALLOCATED payments
            prisma.payment.aggregate({
                where: { status: 'UNALLOCATED' },
                _count: { id: true },
                _sum: { amount: true } }),
            // Batches not yet fully reconciled
            prisma.paymentBatch.count({
                where: { status: { not: 'RECONCILED' } } }),
            // Most recent batches that still have unmatched payments
            prisma.paymentBatch.findMany({
                where: {
                    unmatchCount: { gt: 0 },
                    status: { not: 'RECONCILED' } },
                orderBy: { uploadedAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    fileName: true,
                    uploadedAt: true,
                    status: true,
                    totalAmount: true,
                    matchCount: true,
                    unmatchCount: true } }),
        ]);

        return NextResponse.json({
            unallocatedCount: unallocatedAgg._count.id,
            unallocatedAmount: Number(unallocatedAgg._sum.amount ?? 0),
            unreconciledBatches,
            batchesNeedingAttention });
    } catch (error: any) {
        logger.error('[Finance] GET /reconciliation/summary error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
