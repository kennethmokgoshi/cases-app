import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/reports/stats');


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const projectId = searchParams.get('projectId');

        const whereClause: any = {};

        if (from && to) {
            whereClause.createdAt = {
                gte: new Date(from),
                lte: new Date(to + 'T23:59:59.999Z')
            };
        }

        if (projectId && projectId !== 'all') {
            whereClause.projects = {
                some: { projectId }
            };
        }

        // Total cases in date range
        const totalCases = await prisma.case.count({
            where: whereClause
        });

        // Cases by status
        const casesByStatusRaw = await prisma.case.groupBy({
            by: ['status'],
            _count: { status: true },
            where: whereClause
        });
        const casesByStatus = casesByStatusRaw.map(item => ({
            status: item.status,
            count: item._count.status
        }));

        // Cases by client type
        const b2bCases = await prisma.case.count({
            where: { ...whereClause, acquisitionType: 'B2B' }
        });
        const b2cCases = await prisma.case.count({
            where: { ...whereClause, acquisitionType: 'B2C' }
        });

        // Cases by project (primary project)
        // If filtering by a project, we still want to see the primary project distribution
        const caseProjects = await prisma.caseProject.findMany({
            where: {
                isPrimary: true,
                case: whereClause
            },
            include: {
                project: { select: { name: true } }
            }
        });

        const projectCounts: Record<string, number> = {};
        caseProjects.forEach(cp => {
            const name = cp.project.name;
            projectCounts[name] = (projectCounts[name] || 0) + 1;
        });
        const casesByProject = Object.entries(projectCounts)
            .map(([projectName, count]) => ({ projectName, count }))
            .sort((a, b) => b.count - a.count);

        // Cases by month (last 6 months, respecting the filter if it overlaps)
        // Note: The 'whereClause' might handle the date. If 'searchParams' has 'from'/'to', 
        // it restricts this query. If we want "Trend" we might usually want loosely last 6 months 
        // BUT restricted by the project filter.

        // If users filter by "Last Month", trend chart is weird (1 point).
        // But let's respect the user's explicit date filter if provided for consistency,
        // OR default to 6 months if date filter is not strict. 
        // Actually, typical analytics dashboards respect the date filter for all charts.

        const casesForMonths = await prisma.case.findMany({
            where: whereClause,
            select: { createdAt: true }
        });

        const monthCounts: Record<string, number> = {};
        casesForMonths.forEach(c => {
            const month = c.createdAt.toISOString().slice(0, 7); // YYYY-MM
            monthCounts[month] = (monthCounts[month] || 0) + 1;
        });
        const casesByMonth = Object.entries(monthCounts)
            .map(([month, count]) => ({ month, count }))
            .sort((a, b) => a.month.localeCompare(b.month));

        return NextResponse.json({
            totalCases,
            casesByStatus,
            casesByProject,
            casesByMonth,
            b2bCases,
            b2cCases
        });
    } catch (error) {
        logger.error('Error fetching report stats:', error);
        return NextResponse.json({ error: 'Failed to fetch report stats' }, { status: 500 });
    }
}

