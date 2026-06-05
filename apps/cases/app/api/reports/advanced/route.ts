import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, getSLATier, getBusinessDaysBetween, createLogger } from '@zenowethu/shared-lib';
import { startOfMonth, subMonths, format, endOfMonth } from 'date-fns';

const logger = createLogger('api/reports/advanced');

/**
 * Advanced Analytics API
 * Provides depth metrics for SLA compliance, status bottlenecks, and volume trends.
 */

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');

        // --- FILTERS ---
        const whereClause: any = { deletedAt: null };
        if (projectId && projectId !== 'all') {
            whereClause.projects = { some: { projectId } };
        }

        // --- SLA COMPLIANCE ---
        const cases = await prisma.case.findMany({
            where: whereClause,
            select: { id: true, status: true, deadline: true, isOverdue: true }
        });

        const slaStats = {
            total: cases.length,
            critical: 0,
            warning: 0,
            normal: 0,
            overdue: 0
        };

        cases.forEach(c => {
            const tier = getSLATier(c.deadline, c.status);
            if (c.isOverdue || tier === 'CRITICAL') slaStats.critical++;
            else if (tier === 'WARNING') slaStats.warning++;
            else slaStats.normal++;

            if (c.isOverdue) slaStats.overdue++;
        });

        // --- VOLUME TRENDS (Last 6 Months) ---
        const sixMonthsAgo = startOfMonth(subMonths(new Date(), 6));
        const trendsRaw = await prisma.case.findMany({
            where: { ...whereClause, createdAt: { gte: sixMonthsAgo } },
            select: { createdAt: true }
        });

        const trendMap: Record<string, number> = {};
        for (let i = 0; i < 6; i++) {
            const m = format(subMonths(new Date(), i), 'MMM yyyy');
            trendMap[m] = 0;
        }

        trendsRaw.forEach(t => {
            const m = format(t.createdAt, 'MMM yyyy');
            if (trendMap[m] !== undefined) trendMap[m]++;
        });

        const trends = Object.entries(trendMap)
            .map(([month, count]) => ({ month, count }))
            .reverse();

        // --- BOTTLENECK ANALYSIS (Mean Time in Status) ---
        // We aggregate the last 200 workflow logs to find average days spent per status
        const logs = await prisma.workflowLog.findMany({
            where: {
                case: whereClause
            },
            orderBy: { timestamp: 'desc' },
            take: 500,
            select: { fromStatus: true, timestamp: true, caseId: true }
        });

        // Sort logs by case and timestamp to calculate durations
        const caseLogs: Record<string, any[]> = {};
        logs.forEach(l => {
            if (!caseLogs[l.caseId]) caseLogs[l.caseId] = [];
            caseLogs[l.caseId].push(l);
        });

        const statusDurations: Record<string, { totalDays: number; count: number }> = {};

        Object.values(caseLogs).forEach(logs => {
            // Logs are desc, so logs[i] is newer than logs[i+1]
            for (let i = 0; i < logs.length - 1; i++) {
                const newer = logs[i];
                const older = logs[i + 1];
                if (older.fromStatus) {
                    const days = getBusinessDaysBetween(older.timestamp, newer.timestamp);
                    if (!statusDurations[older.fromStatus]) {
                        statusDurations[older.fromStatus] = { totalDays: 0, count: 0 };
                    }
                    statusDurations[older.fromStatus].totalDays += days;
                    statusDurations[older.fromStatus].count++;
                }
            }
        });

        const bottlenecks = Object.entries(statusDurations).map(([status, data]) => ({
            status,
            avgDays: data.count > 0 ? (data.totalDays / data.count).toFixed(1) : 0,
            volume: data.count
        })).sort((a, b) => Number(b.avgDays) - Number(a.avgDays));

        return NextResponse.json({
            slaStats,
            trends,
            bottlenecks
        });

    } catch (error) {
        logger.error('Error fetching advanced analytics:', error);
        return NextResponse.json({ error: 'Failed to fetch advanced analytics' }, { status: 500 });
    }
}
