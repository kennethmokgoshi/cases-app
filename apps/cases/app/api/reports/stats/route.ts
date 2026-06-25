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
        const filterBy = searchParams.get('filterBy') || 'createdAt'; // 'createdAt' or 'fileToBeCompleted'

        const whereClause: any = { deletedAt: { equals: null } };

        // Date Filter
        if (from && to) {
            whereClause[filterBy] = {
                gte: new Date(from),
                lte: new Date(to + 'T23:59:59.999Z')
            };
        }

        // Project Filter (Recursive)
        if (projectId && projectId !== 'all') {
            // Get all descendants of the selected project
            const allProjects = await prisma.project.findMany({
                select: { id: true, parentId: true }
            });

            const projectIds = new Set<string>([projectId]);
            let added = true;
            while (added) {
                added = false;
                allProjects.forEach(p => {
                    if (p.parentId && projectIds.has(p.parentId) && !projectIds.has(p.id)) {
                        projectIds.add(p.id);
                        added = true;
                    }
                });
            }

            whereClause.projects = {
                some: {
                    projectId: { in: Array.from(projectIds) }
                }
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

        // Cases by staff (Staff Performance)
        const staffCasesRaw = await prisma.case.groupBy({
            by: ['assignedToId'],
            _count: { id: true },
            where: whereClause
        });

        // Fetch staff names
        const staffIds = staffCasesRaw.map(s => s.assignedToId).filter(Boolean) as string[];
        const staffMembers = await prisma.user.findMany({
            where: { id: { in: staffIds } },
            select: { id: true, firstName: true, lastName: true }
        });

        const staffStats = staffCasesRaw.map(s => {
            const member = staffMembers.find(m => m.id === s.assignedToId);
            return {
                staffId: s.assignedToId || 'unassigned',
                staffName: member ? `${member.firstName} ${member.lastName}` : 'Unassigned',
                count: s._count.id
            };
        }).sort((a, b) => b.count - a.count);

        // Cases by B2B Partner (B2B Performance)
        const b2bStatsRaw = await prisma.case.groupBy({
            by: ['partnerName'],
            _count: { id: true },
            where: { ...whereClause, acquisitionType: 'B2B' }
        });

        const b2bStats = b2bStatsRaw.map(b => ({
            partnerName: b.partnerName || 'Unknown Partner',
            count: b._count.id
        })).sort((a, b) => b.count - a.count);

        // Cases by project (primary project)
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

        // Trend Chart data
        const casesForTrend = await prisma.case.findMany({
            where: whereClause,
            select: { [filterBy]: true }
        });

        const trendCounts: Record<string, number> = {};
        casesForTrend.forEach((c: any) => {
            const dateVal = c[filterBy];
            if (dateVal) {
                const month = dateVal.toISOString().slice(0, 7); // YYYY-MM
                trendCounts[month] = (trendCounts[month] || 0) + 1;
            }
        });
        const casesByMonth = Object.entries(trendCounts)
            .map(([month, count]) => ({ month, count }))
            .sort((a, b) => a.month.localeCompare(b.month));

        return NextResponse.json({
            totalCases,
            casesByStatus,
            casesByProject,
            casesByMonth,
            staffStats,
            b2bStats,
            b2bCases,
            b2cCases
        });
    } catch (error) {
        logger.error('Error fetching report stats:', error);
        return NextResponse.json({ error: 'Failed to fetch report stats' }, { status: 500 });
    }
}

