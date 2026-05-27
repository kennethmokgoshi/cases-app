import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/commissions');

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive && !session.user.isSeniorManager && session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || 'UNPAID'; // UNPAID, PAID, ALL
        const page = Math.max(1, Number(searchParams.get('page') ?? 1));
        const PAGE_SIZE = 50;

        const where: any = { isEligible: true };
        if (status === 'UNPAID') where.isPaid = false;
        else if (status === 'PAID') where.isPaid = true;

        const [commissions, total] = await Promise.all([
            prisma.referrerCommission.findMany({
                where,
                include: {
                    referrer: { select: { id: true, firstName: true, lastName: true, bankName: true, accountNumber: true, branchCode: true } },
                    case: {
                        include: {
                            client: { select: { firstName: true, lastName: true } },
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
            }),
            prisma.referrerCommission.count({ where })
        ]);

        return NextResponse.json({
            commissions,
            total,
            page,
            pages: Math.ceil(total / PAGE_SIZE),
        });

    } catch (error) {
        logger.error('Error fetching commissions:', error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}
