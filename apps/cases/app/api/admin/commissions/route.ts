import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/commissions');
const PAGE_SIZE = 30;

// GET /api/admin/commissions
// Global commission list across all referrers — supports filter by isPaid, isEligible, referrerId
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const isAdmin = session.user.isAdmin || session.user.isExecutive || session.user.isSeniorManager || session.user.role === 'MANAGER';
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, Number(searchParams.get('page') ?? 1));
        const isPaidParam = searchParams.get('isPaid');
        const isEligibleParam = searchParams.get('isEligible');
        const referrerId = searchParams.get('referrerId') ?? undefined;
        const search = searchParams.get('search') ?? '';

        const where: Record<string, unknown> = {};
        if (isPaidParam === 'true') where.isPaid = true;
        if (isPaidParam === 'false') where.isPaid = false;
        if (isEligibleParam === 'true') where.isEligible = true;
        if (isEligibleParam === 'false') where.isEligible = false;
        if (referrerId) where.referrerId = referrerId;
        if (search) {
            where.OR = [
                { referrer: { firstName: { contains: search, mode: 'insensitive' } } },
                { referrer: { lastName: { contains: search, mode: 'insensitive' } } },
                { case: { fileNumber: { contains: search, mode: 'insensitive' } } },
                { case: { client: { firstName: { contains: search, mode: 'insensitive' } } } },
                { case: { client: { lastName: { contains: search, mode: 'insensitive' } } } },
            ];
        }

        const [commissions, total] = await Promise.all([
            prisma.referrerCommission.findMany({
                where,
                include: {
                    referrer: { select: { id: true, firstName: true, lastName: true, cellNumber: true, email: true } },
                    case: {
                        select: {
                            id: true,
                            fileNumber: true,
                            status: true,
                            createdAt: true,
                            client: { select: { firstName: true, lastName: true, idNumber: true } },
                        },
                    },
                    paidBy: { select: { firstName: true, lastName: true } },
                },
                orderBy: [{ isEligible: 'desc' }, { isPaid: 'asc' }, { updatedAt: 'desc' }],
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
            }),
            prisma.referrerCommission.count({ where }),
        ]);

        const [totalEligible, totalPaid, totalUnpaidEligible] = await Promise.all([
            prisma.referrerCommission.count({ where: { isEligible: true } }),
            prisma.referrerCommission.count({ where: { isPaid: true } }),
            prisma.referrerCommission.count({ where: { isEligible: true, isPaid: false } }),
        ]);

        return NextResponse.json({
            commissions,
            total,
            page,
            pages: Math.ceil(total / PAGE_SIZE),
            meta: { totalEligible, totalPaid, totalUnpaidEligible },
        });
    } catch (error) {
        logger.error('Error fetching commissions:', error);
        return NextResponse.json({ error: 'Failed to fetch commissions' }, { status: 500 });
    }
}
