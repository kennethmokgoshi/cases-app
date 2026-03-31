import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

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

                const getDescendantIds = (rootIds: string[]): string[] => {
                    const descendants = new Set<string>();
                    const queue = [...rootIds];
                    while (queue.length > 0) {
                        const currId = queue.shift()!;
                        const children = allProjects.filter(p => p.parentId === currId);
                        children.forEach(child => {
                            if (!descendants.has(child.id)) {
                                descendants.add(child.id);
                                queue.push(child.id);
                            }
                        });
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
            assessmentsCount,
            policiesReviewed,
            totalSavingsResult,
            pendingUnderwriting,
            activePolicies,
            declinedAssessments,
            lettersGenerated,
        ] = await Promise.all([
            // 1. Active Files (Filtered by Insurance scope)
            safeQuery(() => prisma.case.count({
                where: {
                    ...projectFilter,
                    InsuranceAssessment: { some: {} }
                }
            }), 'totalActiveCases'),

            // 2. Assessments Conducted
            safeQuery(() => prisma.insuranceAssessment.count({
                where: { Case: { ...projectFilter } }
            }), 'assessmentsCount'),

            // 3. Policies Reviewed (Total policies linked to visible cases)
            safeQuery(() => prisma.insurancePolicy.count({
                where: { assessment: { Case: { ...projectFilter } } }
            }), 'policiesReviewed'),

            // 4. Total Annual Savings Found
            safeQuery(async () => {
                const result = await prisma.insuranceAssessment.aggregate({
                    _sum: { annualSavings: true },
                    where: { Case: { ...projectFilter } }
                });
                return result._sum.annualSavings ? Number(result._sum.annualSavings) : 0;
            }, 'totalSavings'),

            // 5. Assessments awaiting underwriting (DRAFT status, no decision yet)
            safeQuery(() => prisma.insuranceAssessment.count({
                where: {
                    Case: { ...projectFilter },
                    status: 'DRAFT'
                }
            }), 'pendingUnderwriting'),

            // 6. Active policies issued
            safeQuery(() => prisma.insurancePolicy.count({
                where: {
                    status: 'ACTIVE',
                    assessment: { Case: { ...projectFilter } }
                }
            }), 'activePolicies'),

            // 7. Declined assessments
            safeQuery(() => prisma.insuranceAssessment.count({
                where: {
                    Case: { ...projectFilter },
                    status: 'DECLINED'
                }
            }), 'declinedAssessments'),

            // 8. Cancellation letters generated
            safeQuery(() => prisma.cancellationLetter.count({
                where: {
                    assessment: { Case: { ...projectFilter } }
                }
            }), 'lettersGenerated'),
        ]);

        const formattedSavings = totalSavingsResult || 0;

        return NextResponse.json({
            totalActiveCases,
            assessmentsCount,
            policiesReviewed,
            totalSavings: formattedSavings,
            // Underwriting metrics
            pendingUnderwriting,
            activePolicies,
            declinedAssessments,
            lettersGenerated });
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
