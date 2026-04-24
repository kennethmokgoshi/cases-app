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
        const userType = session.user.userType;
        const isAdmin = session.user.isAdmin === true || session.user.role?.toUpperCase() === 'ADMIN';
        const isStaff = userType === 'STAFF';
        const isRestricted = !isAdmin && !isStaff;

        // Build project-scoped where clause for restricted (B2B) users
        let projectWhere: any = {};

        if (isRestricted) {
            const memberships = await prisma.projectMember.findMany({
                where: { userId },
                select: { projectId: true },
            });
            const rootProjectIds = memberships.map((m) => m.projectId);

            if (rootProjectIds.length === 0) {
                // No project memberships — show only cases this user created directly
                projectWhere = { createdById: userId };
            } else {
                // Expand root memberships to include all descendant projects
                // (cases live on MONTH projects which are children of the user's root membership)
                const allProjects = await prisma.project.findMany({
                    select: { id: true, parentId: true },
                });
                const childrenMap = new Map<string, string[]>();
                for (const p of allProjects) {
                    if (p.parentId) {
                        const list = childrenMap.get(p.parentId) || [];
                        list.push(p.id);
                        childrenMap.set(p.parentId, list);
                    }
                }
                const effectiveIds = new Set<string>(rootProjectIds);
                const queue = [...rootProjectIds];
                while (queue.length > 0) {
                    const curr = queue.shift()!;
                    for (const child of childrenMap.get(curr) || []) {
                        if (!effectiveIds.has(child)) {
                            effectiveIds.add(child);
                            queue.push(child);
                        }
                    }
                }
                projectWhere = { projects: { some: { projectId: { in: Array.from(effectiveIds) } } } };
            }
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
        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : undefined;
        logger.error('[b2b-dashboard/stats] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', detail: errMsg, stack: errStack }, { status: 500 });
    }
}
