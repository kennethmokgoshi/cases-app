import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const userType = (session.user as any).userType;
        const isAdmin = (session.user as any).isAdmin === true || (session.user as any).role?.toUpperCase() === 'ADMIN';
        const isStaff = userType === 'STAFF';
        const isRestricted = !isAdmin && !isStaff;

        // Build project-scoped where clause for restricted (B2B) users
        let projectWhere: any = {};

        if (isRestricted) {
            const memberships = await prisma.projectMember.findMany({
                where: { userId },
                select: { projectId: true },
            });
            const projectIds = memberships.map((m) => m.projectId);

            if (projectIds.length === 0) {
                return NextResponse.json({
                    totalCases: 0,
                    activeCases: 0,
                    completedCases: 0,
                    pendingCases: 0,
                    newLeads: 0,
                    newLeadsLast7Days: 0,
                    completedLast7Days: 0,
                    myCases: 0,
                    recentCases: [],
                });
            }

            projectWhere = { projects: { some: { projectId: { in: projectIds } } } };
        }

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Run all counts in parallel — each is a single fast SQL COUNT query
        const [
            totalCases,
            activeCases,
            completedCases,
            pendingCases,
            newLeads,
            newLeadsLast7Days,
            completedLast7Days,
            myCases,
            recentCases,
        ] = await Promise.all([
            prisma.case.count({ where: { ...projectWhere } }),

            prisma.case.count({
                where: {
                    ...projectWhere,
                    status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] },
                },
            }),

            prisma.case.count({
                where: { ...projectWhere, status: 'COMPLETED' },
            }),

            prisma.case.count({
                where: {
                    ...projectWhere,
                    status: { in: ['NEW_LEAD', 'Outstanding Documents'] },
                },
            }),

            prisma.case.count({
                where: { ...projectWhere, status: 'NEW_LEAD' },
            }),

            prisma.case.count({
                where: {
                    ...projectWhere,
                    status: 'NEW_LEAD',
                    createdAt: { gte: sevenDaysAgo },
                },
            }),

            prisma.case.count({
                where: {
                    ...projectWhere,
                    status: 'COMPLETED',
                    updatedAt: { gte: sevenDaysAgo },
                },
            }),

            prisma.case.count({
                where: { ...projectWhere, createdById: userId },
            }),

            // Only fetch 5 recent cases created by this user — minimal fields
            prisma.case.findMany({
                where: { ...projectWhere, createdById: userId },
                select: {
                    id: true,
                    fileNumber: true,
                    status: true,
                    createdAt: true,
                    client: { select: { firstName: true, lastName: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }),
        ]);

        return NextResponse.json({
            totalCases,
            activeCases,
            completedCases,
            pendingCases,
            newLeads,
            newLeadsLast7Days,
            completedLast7Days,
            myCases,
            recentCases: recentCases.map((c) => ({
                id: c.id,
                fileNumber: c.fileNumber,
                status: c.status,
                createdAt: c.createdAt.toISOString(),
                clientName: `${c.client.firstName} ${c.client.lastName}`,
            })),
        });
    } catch (error) {
        logger.error('[b2b-dashboard/stats] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
