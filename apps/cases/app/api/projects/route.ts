import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { ProjectCreateSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

const logger = createLogger('api/projects');

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

// ---- Project graph helpers (O(n) tree walks via index maps) ----
type RawProject = { id: string; parentId: string | null };

function buildChildIndex(all: RawProject[]) {
    const byId = new Map<string, RawProject>();
    const childrenByParent = new Map<string, string[]>();
    for (const p of all) {
        byId.set(p.id, p);
        if (p.parentId) {
            const arr = childrenByParent.get(p.parentId);
            if (arr) arr.push(p.id);
            else childrenByParent.set(p.parentId, [p.id]);
        }
    }
    return { byId, childrenByParent };
}

function addAncestors(rootIds: string[], byId: Map<string, RawProject>, into: Set<string>) {
    const queue = [...rootIds];
    while (queue.length > 0) {
        const node = byId.get(queue.shift()!);
        if (node?.parentId && !into.has(node.parentId)) {
            into.add(node.parentId);
            queue.push(node.parentId);
        }
    }
}

function addDescendants(rootIds: string[], childrenByParent: Map<string, string[]>, into: Set<string>) {
    const queue = [...rootIds];
    while (queue.length > 0) {
        const children = childrenByParent.get(queue.shift()!);
        if (!children) continue;
        for (const childId of children) {
            if (!into.has(childId)) {
                into.add(childId);
                queue.push(childId);
            }
        }
    }
}

// Short-lived per-user cache for the member-scoped project tree. The hierarchy
// changes infrequently; a 15s TTL absorbs repeat navigations and concurrent
// staff hitting the same dropdown without risking visibly stale data. Cleared
// on project creation (POST below).
const TREE_CACHE_TTL_MS = 15_000;
const treeCache = new Map<string, { expires: number; payload: unknown }>();

function getCachedTree(key: string): unknown | null {
    const hit = treeCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.payload;
    if (hit) treeCache.delete(key);
    return null;
}

function setCachedTree(key: string, payload: unknown) {
    treeCache.set(key, { expires: Date.now() + TREE_CACHE_TTL_MS, payload });
}

function clearTreeCache() {
    treeCache.clear();
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
        const isStaff = session.user.userType === 'STAFF';

        // memberOnly=true forces membership filtering even for admins (used by the new case form dropdown)
        const isMemberOnly = searchParams.get('memberOnly') === 'true';

        // 1. Admins see everything (unless memberOnly is explicitly requested)
        // 2. Staff see everything IF they explicitly ask for 'all' (e.g. for Sidebar/Search)
        // 3. All other users are filtered by project membership
        const shouldFilter = (!isAdmin || isMemberOnly) && !(isStaff && isAllRequested && !isMemberOnly);
        const whereClause: any = {};

        // Shared per-request loaders — each underlying query runs at most once even
        // when both the membership-filter block and the memberOnly block need it.
        let cachedIndex: ReturnType<typeof buildChildIndex> | null = null;
        const loadProjectGraph = async () => {
            if (!cachedIndex) {
                const all = await prisma.project.findMany({ select: { id: true, parentId: true } });
                cachedIndex = buildChildIndex(all);
            }
            return cachedIndex;
        };

        let cachedMembershipIds: string[] | null = null;
        const loadMembershipIds = async () => {
            if (!cachedMembershipIds) {
                const memberships = await prisma.projectMember.findMany({
                    where: { userId: session.user.id },
                    select: { projectId: true }
                });
                const ids = memberships.map(m => m.projectId);
                if (session.user.b2bPartnerId && !ids.includes(session.user.b2bPartnerId)) {
                    ids.push(session.user.b2bPartnerId);
                }
                cachedMembershipIds = ids;
            }
            return cachedMembershipIds;
        };

        if (shouldFilter) {
            const explicitProjectIds = await loadMembershipIds();

            if (explicitProjectIds.length === 0) {
                // User has no projects
                whereClause.id = { in: [] };
            } else {
                // Include ancestors (to build the tree up) and descendants (to see
                // everything under a project the user belongs to).
                const { byId, childrenByParent } = await loadProjectGraph();
                const allowed = new Set<string>(explicitProjectIds);
                addAncestors(explicitProjectIds, byId, allowed);
                addDescendants(explicitProjectIds, childrenByParent, allowed);
                whereClause.id = { in: Array.from(allowed) };
            }
        }

        if (parentId) whereClause.parentId = parentId;
        if (type) whereClause.type = type;

        const slim = searchParams.get('slim') === 'true';

        // If flat=true, return all projects matching criteria as a flat list
        if (flat) {
            if (slim) {
                // Slim mode: only return fields the sidebar needs
                const projects = await prisma.project.findMany({
                    where: whereClause,
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        parentId: true
                    },
                    orderBy: { name: 'asc' }
                });

                const projectsWithCounts = await addActiveCaseCounts(projects);
                return NextResponse.json(projectsWithCounts);
            }

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

        if (!isAdmin || isMemberOnly) {
            // Serve the member-scoped tree from a short-lived per-user cache when fresh.
            const cacheKey = `tree:${session.user.id}:${searchParams.toString()}`;
            const cached = getCachedTree(cacheKey);
            if (cached) return NextResponse.json(cached);

            // Copy so we don't mutate the memoized membership list.
            const memberProjectIds = [...(await loadMembershipIds())];

            // When memberOnly=true, also include ALL REFERRER-type projects and their
            // ancestors so staff can assign cases to any referrer regardless of membership.
            if (isMemberOnly) {
                const referrerProjects = await prisma.project.findMany({
                    where: { type: 'REFERRER' },
                    select: { id: true }
                });
                const referrerIds = referrerProjects.map(p => p.id);

                const { byId } = await loadProjectGraph();
                const referrerAndAncestors = new Set<string>(referrerIds);
                addAncestors(referrerIds, byId, referrerAndAncestors);
                memberProjectIds.push(...referrerAndAncestors);
            }

            const myProjects = await prisma.project.findMany({
                where: {
                    id: { in: memberProjectIds },
                    ...whereClause
                },
                include: {
                    parent: true,
                    // Only include children that the user is also a member of
                    children: {
                        where: { id: { in: memberProjectIds } },
                        select: {
                            id: true,
                            name: true,
                            type: true,
                            // Include linked referrer so case creation can auto-detect referrerId
                            referrer: { select: { id: true, firstName: true, lastName: true } },
                        }
                    },
                    _count: { select: { children: true } },
                    members: {
                        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }
                    },
                    // Also include referrer on the top-level project itself
                    referrer: { select: { id: true, firstName: true, lastName: true } },
                },
                orderBy: { name: 'asc' }
            });

            const myProjectsWithCounts = await addActiveCaseCounts(myProjects);
            const payload = { hierarchy: null, independent: myProjectsWithCounts };
            setCachedTree(cacheKey, payload);
            return NextResponse.json(payload);
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
    } catch (error: any) {
        logger.error('Error fetching projects:', error?.code, error?.message, error?.meta);
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

        const membersData: { userId: string; role: "MEMBER" | "MANAGER" }[] = members || [];

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

        // New project changes every user's visible tree — drop the short-lived cache.
        clearTreeCache();

        return NextResponse.json(project, { status: 201 });
    } catch (error) {
        logger.error('Error creating project:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

