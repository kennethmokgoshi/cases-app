import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';
        const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

        if (!query || query.length < 2) {
            return NextResponse.json({ clients: [], message: 'Query must be at least 2 characters' });
        }

        // Get user details
        const user = session.user;
        const isAdmin = user.role?.toUpperCase() === 'ADMIN' || user.isAdmin === true;
        const isStaff = user.userType === 'STAFF';
        const b2bPartnerId = user.b2bPartnerId;

        // B2B partners can ONLY see clients in cases linked to their partner project or its descendants
        // Non-B2B users should not use this endpoint (they can use the regular cases API)
        if (!b2bPartnerId && !isAdmin && !isStaff) {
            return NextResponse.json({
                error: 'Forbidden',
                message: 'This endpoint is only available for B2B partners'
            }, { status: 403 });
        }

        // Fetch all projects to build the descendant tree
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

        const getDescendantIds = (rootId: string): string[] => {
            const descendants: string[] = [];
            const queue = [rootId];
            while (queue.length > 0) {
                const currId = queue.shift()!;
                const children = childrenMap.get(currId);
                if (children) {
                    for (const childId of children) {
                        descendants.push(childId);
                        queue.push(childId);
                    }
                }
            }
            return descendants;
        };

        let allowedProjectIds: string[] = [];

        if (isAdmin || isStaff) {
            // Admins and Staff can see all clients via this search as well
            // No project restriction needed
        } else if (b2bPartnerId) {
            // B2B Partner: Restrict to their partner project and its descendants
            allowedProjectIds = [b2bPartnerId, ...getDescendantIds(b2bPartnerId)];
        }

        // Build the search query
        const searchTerm = query.toLowerCase();

        // Base where clause for client search
        const clientWhere: any = {
            OR: [
                { firstName: { contains: searchTerm, mode: 'insensitive' } },
                { lastName: { contains: searchTerm, mode: 'insensitive' } },
                { idNumber: { contains: searchTerm } },
                { phone: { contains: searchTerm } },
                { email: { contains: searchTerm, mode: 'insensitive' } }
            ]
        };

        // If not admin/staff, we need to filter by case project membership
        let clients;

        if (isAdmin || isStaff) {
            // Admin/Staff: Search all clients directly
            clients = await prisma.client.findMany({
                where: clientWhere,
                take: limit,
                include: {
                    cases: {
                        take: 1,
                        orderBy: { createdAt: 'desc' },
                        select: {
                            id: true,
                            fileNumber: true,
                            status: true
                        }
                    }
                }
            });
        } else {
            // B2B Partner: Only show clients who have at least one case in their project hierarchy
            clients = await prisma.client.findMany({
                where: {
                    ...clientWhere,
                    cases: {
                        some: {
                            projects: {
                                some: {
                                    projectId: { in: allowedProjectIds }
                                }
                            }
                        }
                    }
                },
                take: limit,
                include: {
                    cases: {
                        where: {
                            projects: {
                                some: {
                                    projectId: { in: allowedProjectIds }
                                }
                            }
                        },
                        take: 1,
                        orderBy: { createdAt: 'desc' },
                        select: {
                            id: true,
                            fileNumber: true,
                            status: true
                        }
                    }
                }
            });
        }

        // Map to a clean response format
        const results = clients.map(client => ({
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            fullName: `${client.firstName} ${client.lastName}`,
            idNumber: client.idNumber,
            phone: client.phone,
            email: client.email,
            latestCase: client.cases[0] || null,
            totalCases: client.cases.length
        }));

        return NextResponse.json({
            clients: results,
            count: results.length,
            query: query
        });

    } catch (error) {
        logger.error('Error searching clients:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
