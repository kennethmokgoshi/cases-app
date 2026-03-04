import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

/**
 * GET /api/b2b/stats
 *
 * Returns referral performance statistics for the currently logged-in B2B partner.
 * Counts are scoped to cases created by the requesting user (createdById).
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        // Calendar date boundaries
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

        // Base filter: only cases submitted by this partner
        const baseFilter = { createdById: userId };

        // Helper — returns 0 on failure so page never breaks
        const safeCount = async (fn: () => Promise<number>, label: string): Promise<number> => {
            try {
                return await fn();
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                logger.error(`[B2B Stats] Error in ${label}:`, msg);
                return 0;
            }
        };

        const [
            totalLeads,
            thisMonth,
            lastMonth,
            pendingReview,
            approved,
            rejected,
            resolvedForAvg,
            recentCases,
        ] = await Promise.all([
            // All-time referral count
            safeCount(() => prisma.case.count({ where: baseFilter }), 'totalLeads'),

            // Cases submitted in the current calendar month
            safeCount(() => prisma.case.count({
                where: { ...baseFilter, createdAt: { gte: startOfThisMonth } }
            }), 'thisMonth'),

            // Cases submitted in the previous calendar month
            safeCount(() => prisma.case.count({
                where: { ...baseFilter, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } }
            }), 'lastMonth'),

            // Awaiting first review — still at NEW_LEAD status
            safeCount(() => prisma.case.count({
                where: { ...baseFilter, status: 'NEW_LEAD' }
            }), 'pendingReview'),

            // Accepted / actively being worked on (progressed beyond NEW_LEAD, not cancelled)
            safeCount(() => prisma.case.count({
                where: { ...baseFilter, status: { notIn: ['NEW_LEAD', 'CANCELLED'] } }
            }), 'approved'),

            // Declined / cancelled referrals
            safeCount(() => prisma.case.count({
                where: { ...baseFilter, status: 'CANCELLED' }
            }), 'rejected'),

            // Fetch last 50 progressed cases to compute average response time
            prisma.case.findMany({
                where: { ...baseFilter, status: { not: 'NEW_LEAD' } },
                select: { createdAt: true, updatedAt: true },
                orderBy: { updatedAt: 'desc' },
                take: 50 }).catch(() => [] as { createdAt: Date; updatedAt: Date }[]),

            // Last 5 cases for the recent activity feed
            prisma.case.findMany({
                where: baseFilter,
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                    id: true,
                    fileNumber: true,
                    status: true,
                    createdAt: true,
                    client: {
                        select: { firstName: true, lastName: true }
                    } } }).catch(() => []),
        ]);

        // Average time from submission to first status change (approximated via updatedAt)
        const avgResponseTime = resolvedForAvg.length > 0
            ? (() => {
                const totalMs = resolvedForAvg.reduce(
                    (sum, c) => sum + (c.updatedAt.getTime() - c.createdAt.getTime()),
                    0
                );
                const avgDays = totalMs / resolvedForAvg.length / (1000 * 60 * 60 * 24);
                return avgDays < 1 ? 'Same day' : `${avgDays.toFixed(1)} days`;
            })()
            : '--';

        return NextResponse.json({
            totalLeads,
            thisMonth,
            lastMonth,
            pendingReview,
            approved,
            rejected,
            averageResponseTime: avgResponseTime,
            recentCases });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[B2B Stats] Unhandled error:', msg);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}

