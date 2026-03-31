import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/dashboard/stats');

export async function GET(request: Request) {
    try {
        // Check authentication
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Build project filter (Inherited Access + Admin Bypass)
        // Check multiple flags for robustness
        const userRole = session.user.role || 'MEMBER';
        const isAdmin = userRole === 'ADMIN' || session.user.isAdmin === true;
        const isStaff = session.user.userType === 'STAFF';
        const isPartner = session.user.userType === 'B2B_PARTNER';

        let projectFilter: any = {};

        // 1. Admins and Staff see everything
        if (isAdmin || isStaff) {
            projectFilter = {}; // No filter
        } else {
            // 2. Others (Partners/Members) are restricted
            // Get explicit memberships
            const userProducts = await prisma.projectMember.findMany({
                where: { userId: session.user.id },
                select: { projectId: true }
            });
            const rootProjectIds = userProducts.map((up: { projectId: string }) => up.projectId);

            // Also include their assigned B2B partner project if they have one
            if (session.user.b2bPartnerId) {
                rootProjectIds.push(session.user.b2bPartnerId);
            }

            if (rootProjectIds.length > 0) {
                // Expand to include sub-projects
                const allProjects = await prisma.project.findMany({
                    select: { id: true, parentId: true }
                });

                // Pre-build children map for O(n) traversal
                const childrenMap = new Map<string, string[]>();
                for (const p of allProjects) {
                    if (p.parentId) {
                        const list = childrenMap.get(p.parentId);
                        if (list) list.push(p.id);
                        else childrenMap.set(p.parentId, [p.id]);
                    }
                }

                const getDescendantIds = (rootIds: string[]): string[] => {
                    const descendants = new Set<string>();
                    const queue = [...rootIds];
                    while (queue.length > 0) {
                        const currId = queue.shift()!;
                        const children = childrenMap.get(currId);
                        if (children) {
                            for (const childId of children) {
                                if (!descendants.has(childId)) {
                                    descendants.add(childId);
                                    queue.push(childId);
                                }
                            }
                        }
                    }
                    return Array.from(descendants);
                };

                const descendantIds = getDescendantIds(rootProjectIds);
                const allAllowedIds = Array.from(new Set([...rootProjectIds, ...descendantIds]));

                // For Partners, we allow cases they created OR cases in allowed projects
                if (isPartner) {
                    projectFilter = {
                        OR: [
                            { createdById: session.user.id },
                            {
                                projects: {
                                    some: { projectId: { in: allAllowedIds } }
                                }
                            }
                        ]
                    };
                } else {
                    projectFilter = {
                        projects: {
                            some: { projectId: { in: allAllowedIds } }
                        }
                    };
                }
            } else {
                // No projects assigned.
                if (isPartner) {
                    // Partners still see what they created
                    projectFilter = { createdById: session.user.id };
                } else {
                    // Fallback to match nothing if no creation power
                    projectFilter = { id: 'NON_EXISTENT' };
                }
            }
        }

        // Helper to run a count or calculation safely
        const safeQuery = async (queryFn: () => Promise<number>, label: string) => {
            try {
                return await queryFn();
            } catch (err: any) {
                logger.error(`[Dashboard Stats] Error in ${label}:`, err.message);
                return 0;
            }
        };

        // Get current date boundaries
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Run queries in parallel to mitigate network latency bottlenecks
        const [
            totalActiveCases,
            newLeadsToday,
            overdueCases,
            myCasesCount,
            assignedCasesCount,
            pendingInvoicesCount
        ] = await Promise.all([
            safeQuery(() => prisma.case.count({ where: projectFilter }), 'totalActiveCases'),
            safeQuery(() => prisma.case.count({
                where: {
                    createdAt: { gte: today, lt: tomorrow },
                    status: 'NEW_LEAD',
                    ...projectFilter
                }
            }), 'newLeadsToday'),
            safeQuery(() => prisma.case.count({
                where: {
                    nextUpdate: { lt: today },
                    status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] },
                    ...projectFilter
                }
            }), 'overdueCases'),
            safeQuery(() => prisma.case.count({
                where: {
                    createdById: session.user.id
                }
            }), 'myCasesCount'),
            safeQuery(() => prisma.case.count({
                where: {
                    assignedToId: session.user.id
                }
            }), 'assignedCasesCount'),
            safeQuery(async () => {
                return await prisma.case.count({
                    where: {
                        acquisitionType: 'B2C',
                        r350Status: { in: ['PENDING', 'TOLD'] },
                        status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] },
                        ...projectFilter
                    }
                });
            }, 'pendingInvoices')
        ]);

        const slaBreaches = overdueCases;
        const pendingInvoices = (pendingInvoicesCount || 0) * 350;

        return NextResponse.json({
            totalActiveCases,
            newLeadsToday,
            pendingInvoices,
            slaBreaches,
            overdueCases,
            myCasesCount,
            assignedCasesCount });
    } catch (error: any) {
        logger.error('Error fetching dashboard stats:', error);
        return NextResponse.json({
            totalActiveCases: 0,
            newLeadsToday: 0,
            pendingInvoices: 0,
            slaBreaches: 0,
            overdueCases: 0,
            myCasesCount: 0,
            assignedCasesCount: 0,
            error: error.message
        });
    }
}

