import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        const [
            totalCollectedThisMonth,
            totalCollectedLastMonth,
            pendingBatchCount,
            unallocatedCount,
            totalPaymentsThisMonth,
        ] = await Promise.all([
            // Total collected amount this month
            prisma.payment.aggregate({
                where: {
                    date: { gte: startOfMonth },
                    status: 'COMPLETED' },
                _sum: { amount: true } }),
            // Total collected last month (for % change)
            prisma.payment.aggregate({
                where: {
                    date: { gte: startOfLastMonth, lte: endOfLastMonth },
                    status: 'COMPLETED' },
                _sum: { amount: true } }),
            // Batches still in PROCESSING (pending reconciliation)
            prisma.paymentBatch.count({
                where: { status: { in: ['PROCESSING', 'MATCHED'] } } }),
            // Payments with no client or case linked (unallocated)
            prisma.payment.count({
                where: { clientId: null, caseId: null } }),
            // Count of payments this month
            prisma.payment.count({
                where: {
                    date: { gte: startOfMonth },
                    status: 'COMPLETED' } }),
        ]);

        const thisMonth = Number(totalCollectedThisMonth._sum.amount ?? 0);
        const lastMonth = Number(totalCollectedLastMonth._sum.amount ?? 0);
        const percentChange = lastMonth === 0
            ? (thisMonth > 0 ? 100 : 0)
            : Math.round(((thisMonth - lastMonth) / lastMonth) * 100);

        return NextResponse.json({
            totalCollectedThisMonth: thisMonth,
            totalCollectedLastMonth: lastMonth,
            percentChange,
            pendingBatchCount,
            unallocatedCount,
            totalPaymentsThisMonth });
    } catch (error: any) {
        logger.error('[Finance] Stats error:', error);
        return NextResponse.json({
            totalCollectedThisMonth: 0,
            totalCollectedLastMonth: 0,
            percentChange: 0,
            pendingBatchCount: 0,
            unallocatedCount: 0,
            totalPaymentsThisMonth: 0,
            error: error.message });
    }
}
