import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const batchId = searchParams.get('batchId') || '';
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const skip = (page - 1) * limit;

        const where: any = { status: 'UNALLOCATED' };

        if (batchId) where.batchId = batchId;
        if (from || to) {
            where.date = {};
            if (from) where.date.gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                where.date.lte = toDate;
            }
        }

        const [payments, total] = await Promise.all([
            prisma.payment.findMany({
                where,
                orderBy: { date: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    amount: true,
                    date: true,
                    method: true,
                    reference: true,
                    unmatchedId: true,
                    notes: true,
                    batch: {
                        select: {
                            id: true,
                            fileName: true,
                            uploadedAt: true,
                            status: true } } } }),
            prisma.payment.count({ where }),
        ]);

        return NextResponse.json({
            payments,
            total,
            page,
            pages: Math.ceil(total / limit) });
    } catch (error: any) {
        logger.error('[Finance] GET /reconciliation/exceptions error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
