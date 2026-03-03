import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { ProjectCreateSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

// Helper function to recursively fetch children
async function getProjectWithChildren(projectId: string, depth: number = 5): Promise<unknown> {
    if (depth <= 0) return null;

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            children: true,
            _count: { select: { cases: true } }
        }
    });

    if (!project) return null;

    const childrenWithSubChildren = await Promise.all(
        project.children.map(async (child) => {
            const childData = await getProjectWithChildren(child.id, depth - 1);
            return childData || child;
        })
    );

    return {
        ...project,
        children: childrenWithSubChildren
    };
}

// Helper function to add case counts to projects (counting ONLY direct cases, not descendants)
// Changed to count ALL cases, not just active ones
async function addActiveCaseCounts<T extends { id: string; _count?: any }>(projects: T[]): Promise<T[]> {
    if (projects.length === 0) return [];

    // Fetch all counts in a single batch query to avoid N+1 problem
    const projectIds = projects.map(p => p.id);
    const counts = await prisma.caseProject.groupBy({
        by: ['projectId'],
        _count: {
            caseId: true
        },
        where: {
            projectId: { in: projectIds }
        }
    });

    const countMap = new Map(counts.map(c => [c.projectId, c._count.caseId]));

    return projects.map(project => ({
        ...project,
        _count: {
            ...project._count,
            cases: countMap.get(project.id) || 0
        }
    }));
}

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const parentId = searchParams.get('parentId');
        const type = searchParams.get('type');
        const flat = searchParams.get('flat') === 'true';

        const isAllRequested = searchParams.get('all') === 'true';
        const isAdmin = session.user.role === 'ADMIN' || session.user.isAdmin;
        const isStaff = (session.user as any).userType === 'STAFF';

        // Allow users to see all ACQUISITION_SOURCE projects (Partners) for selection
        // regardless of direct membership. This fixes the issue where Partners with invalid/stale
        // assignments see nothing, or where we want to "pull all" sources.
        const isPublicType = type === 'ACQUISITION_SOURCE';

        // 1. Admins see everything
        // 2. Public types (Sources) are accessible to everyone for selection
        // 3. Staff see everything IF they explicitly ask for 'all' (e.g. for Sidebar/Search)
        const shouldFilter = !isAdmin && !isPublicType && !(isStaff && isAllRequested);
        const whereClause: any = {};

        if (shouldFilter) {
            // 1. Get explicit memberships
            const memberships = await prisma.projectMember.findMany({
                where: { userId: session.user.id },
                select: { projectId: true }
            });
            const explicitProjectIds = memberships.map(m => m.projectId);

            // 2. Add assigned B2B partner project for partners
            if ((session.user as any).b2bPartnerId) {
                explicitProjectIds.push((session.user as any).b2bPartnerId);
            }

            if (explicitProjectIds.length === 0) {
                // User has no projects
                whereClause.id = { in: [] };
            } else {
                // 3. We need to include all PARENT IDs (to build tree up) and CHILD IDs (to see descendants)
                const allProjectsRaw = await prisma.project.findMany({
                    select: { id: true, parentId: true }
                });

                const getAllowedIds = (rootIds: string[]) => {
                    const results = new Set<string>(rootIds);

                    // Add ancestors (Up)
                    const upQueue = [...rootIds];
                    while (upQueue.length > 0) {
                        const currId = upQueue.shift()!;
                        const project = allProjectsRaw.find(p => p.id === currId);
                        if (project && project.parentId && !results.has(project.parentId)) {
                            results.add(project.parentId);
                            upQueue.push(project.parentId);
                        }
                    }

                    // Add descendants (Down)
                    const downQueue = [...rootIds];
                    while (downQueue.length > 0) {
                        const currId = downQueue.shift()!;
                        const children = allProjectsRaw.filter(p => p.parentId === currId);
                        children.forEach(child => {
                            if (!results.has(child.id)) {
                                results.add(child.id);
                                downQueue.push(child.id);
                            }
                        });
                    }

                    return Array.from(results);
                };

                const allowedIds = getAllowedIds(explicitProjectIds);
                whereClause.id = { in: allowedIds };
            }
        }

        if (parentId) whereClause.parentId = parentId;
        if (type) whereClause.type = type;

        // If flat=true, return all projects matching criteria as a flat list
        if (flat) {
            const projects = await prisma.project.findMany({
                where: whereClause,
                include: {
                    parent: true,
                    _count: { select: { children: true } },
                    members: {
                        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }
                    },
                    children: {
                        select: { id: true, name: true, type: true }
                    }
                },
                orderBy: { name: 'asc' }
            });

            const projectsWithActiveCounts = await addActiveCaseCounts(projects);

            return NextResponse.json(projectsWithActiveCounts);
        }

        // If parentId specified, return children of that parent (with permission check)
        if (parentId) {
            const children = await prisma.project.findMany({
                where: whereClause,
                include: {
                    _count: { select: { children: true } },
                    members: {
                        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }
                    }
                },
                orderBy: { name: 'asc' }
            });
            const childrenWithCounts = await addActiveCaseCounts(children);
            return NextResponse.json(childrenWithCounts);
        }

        if (!isAdmin) {
            const myProjects = await prisma.project.findMany({
                where: {
                    members: { some: { userId: session.user.id } }
                },
                include: {
                    parent: true,
                    children: true,
                    _count: { select: { children: true } },
                    members: {
                        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }
                    }
                },
                orderBy: { name: 'asc' }
            });

            const myProjectsWithCounts = await addActiveCaseCounts(myProjects);
            return NextResponse.json({ hierarchy: null, independent: myProjectsWithCounts });
        }

        // Default: return full hierarchy starting from ROOT (Admin only)
        const rootProject = await prisma.project.findFirst({
            where: { type: 'ROOT' },
            include: {
                members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } }
            }
        });

        // If no explicit ROOT, return all top-level projects as independent
        if (!rootProject) {
            const topLevel = await prisma.project.findMany({
                where: { parentId: null },
                include: {
                    members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } }
                }
            });
            const independentWithCounts = await addActiveCaseCounts(topLevel);
            return NextResponse.json({ hierarchy: null, independent: independentWithCounts });
        }

        const hierarchy = await getProjectWithChildren(rootProject.id);

        const independent = await prisma.project.findMany({
            where: {
                parentId: null,
                id: { not: rootProject.id }
            },
            include: {
                members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } }
            }
        });

        return NextResponse.json({ hierarchy, independent });
    } catch (error) {
        logger.error('Error fetching projects:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(ProjectCreateSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data as z.infer<typeof ProjectCreateSchema>;
        let { name, description, type, clientType, parentId, members } = body;

        // Determine effective parent ID first
        if (type === 'ACQUISITION_SOURCE' && !parentId) {
            parentId = 'zdm-files-root';
        }

        // Check for duplicate name under effective parent (or at root level)
        const existingProject = await prisma.project.findFirst({
            where: {
                name: name,
                parentId: parentId || null
            }
        });

        if (existingProject) {
            return NextResponse.json({
                error: `A project named "${name}" already exists${parentId ? ' under this parent' : ' at the top level'}`
            }, { status: 400 });
        }

        // Only allow one ROOT project
        if (type === 'ROOT') {
            const existingRoot = await prisma.project.findFirst({
                where: { type: 'ROOT' }
            });
            if (existingRoot) {
                return NextResponse.json({
                    error: 'A ROOT project already exists. There can only be one ROOT project.'
                }, { status: 400 });
            }
        }

        const membersData = members || [];

        // Inheritance: If parentId exists, fetch parent's members and merge them
        // EXCEPTION: Partners (ACQUISITION_SOURCE) do not inherit members.
        if (parentId && type !== 'ACQUISITION_SOURCE') {
            const parentProject = await prisma.project.findUnique({
                where: { id: parentId },
                include: { members: true }
            });

            if (parentProject && parentProject.members) {
                const existingMembersMap = new Map();
                membersData.forEach((m: any) => existingMembersMap.set(m.userId, m));

                parentProject.members.forEach((pm) => {
                    const existing = existingMembersMap.get(pm.userId);
                    if (existing) {
                        // Propagate manager role
                        if (pm.role === 'MANAGER' && existing.role !== 'MANAGER') {
                            existing.role = 'MANAGER';
                        }
                    } else {
                        const newMember = { userId: pm.userId, role: pm.role as "MEMBER" | "MANAGER" };
                        membersData.push(newMember);
                        existingMembersMap.set(pm.userId, newMember);
                    }
                });
            }
        }

        // Logic: Every project needs at least one MANAGER.
        // If no manager is specified (including via inheritance), the creator becomes the MANAGER.
        // EXCEPTION: Partners (ACQUISITION_SOURCE) do not require a manager.
        if (type !== 'ACQUISITION_SOURCE') {
            const hasManager = membersData.some((m: any) => m.role === 'MANAGER');

            if (!hasManager) {
                const creatorIndex = membersData.findIndex((m: any) => m.userId === session.user.id);
                if (creatorIndex !== -1) {
                    membersData[creatorIndex].role = 'MANAGER';
                } else {
                    membersData.push({ userId: session.user.id, role: 'MANAGER' });
                }
            }
        }

        const project = await prisma.project.create({
            data: {
                name,
                description: description || null,
                type: type || 'FOLDER',
                clientType: type === 'ACQUISITION_SOURCE' ? (clientType || null) : null,
                parentId: parentId || null,
                members: {
                    create: membersData.map((m: any) => ({
                        userId: m.userId,
                        role: m.role || 'MEMBER'
                    }))
                }
            },
            include: {
                parent: true,
                _count: { select: { cases: true, children: true } },
                members: true
            }
        });

        return NextResponse.json(project, { status: 201 });
    } catch (error) {
        logger.error('Error creating project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

