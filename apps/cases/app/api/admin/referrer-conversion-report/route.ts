import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/referrer-conversion-report');

// GET /api/admin/referrer-conversion-report
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
        const range = searchParams.get('range') ?? 'month';

        // Calculate date range
        const now = new Date();
        let sinceDate = new Date();
        if (range === 'week') {
            sinceDate.setDate(now.getDate() - 7);
        } else if (range === 'month') {
            sinceDate.setMonth(now.getMonth() - 1);
        } else {
            sinceDate = new Date('2000-01-01'); // All time
        }

        // Fetch converted referrers (those with notes indicating conversion)
        const referrers = await prisma.referrer.findMany({
            where: {
                notes: { contains: 'Converted from Client' },
            },
            orderBy: { createdAt: 'desc' },
            include: {
                project: { select: { id: true, name: true } },
                parentReferrer: { select: { firstName: true, lastName: true } },
                _count: { select: { cases: true } },
            },
        });

        // Calculate stats
        const totalConverted = referrers.length;
        const convertedThisMonth = referrers.filter(
            (r) => new Date(r.createdAt) >= sinceDate && range === 'month'
        ).length;
        const convertedThisWeek = referrers.filter(
            (r) => new Date(r.createdAt) >= sinceDate && range === 'week'
        ).length;
        const activeConverted = referrers.filter((r) => r.isActive).length;
        const withParentReferrer = referrers.filter((r) => r.parentReferrer).length;
        const totalCasesGenerated = referrers.reduce((sum, r) => sum + r._count.cases, 0);
        const avgCasesPerReferrer = totalConverted > 0 ? totalCasesGenerated / totalConverted : 0;

        // Filter by range if needed
        const filteredReferrers = range === 'all'
            ? referrers
            : referrers.filter((r) => new Date(r.createdAt) >= sinceDate);

        return NextResponse.json({
            referrers: filteredReferrers,
            stats: {
                totalConverted,
                convertedThisMonth: range === 'month' ? convertedThisMonth : totalConverted,
                convertedThisWeek: range === 'week' ? convertedThisWeek : totalConverted,
                activeConverted,
                withParentReferrer,
                totalCasesGenerated,
                avgCasesPerReferrer,
            },
        });
    } catch (error) {
        logger.error('Error fetching report:', error);
        return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
    }
}
