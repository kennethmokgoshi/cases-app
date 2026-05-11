import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { calculateSlaDeadline, sendStatusChangeNotification, auth, createLogger } from '@zenowethu/shared-lib';
import { CaseCreateSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

const logger = createLogger('api/cases');

export async function GET(request: Request) {
    try {
        const session = await auth();
        console.log(`[API] GET /api/cases entry - User: ${session?.user?.id}, Role: ${session?.user?.role}`);
        if (!session?.user) {
            console.log('[API] Unauthorized - No session user');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const slim = searchParams.get('slim') === 'true';

        // Fetch all projects first to support path building AND recursive filtering
        const allProjects = await prisma.project.findMany({
            select: { id: true, name: true, parentId: true, type: true }
        });

        type ProjectMapType = { id: string; name: string; parentId: string | null; type: string };
        const projectMap = new Map<string, ProjectMapType>(allProjects.map(p => [p.id, p]));

        // Pre-build a children map for O(n) descendant traversal
        const childrenMap = new Map<string, string[]>();
        for (const p of allProjects) {
            if (p.parentId) {
                const list = childrenMap.get(p.parentId);
                if (list) list.push(p.id);
                else childrenMap.set(p.parentId, [p.id]);
            }
        }

        // Helper to find all descendant IDs — O(n) using pre-built map
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

        const status = searchParams.get('status');
        const projectId = searchParams.get('projectId');
        const service = searchParams.get('service');
        const filter = searchParams.get('filter');
        const createdBy = searchParams.get('createdBy');
        const assignedTo = searchParams.get('assignedTo');
        const take = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;
        const skip = searchParams.get('skip') ? parseInt(searchParams.get('skip')!) : undefined;

        const where: any = {};

        // Security: Filter by project membership (Inherited Access)
        const userRole = session.user.role?.toUpperCase();
        const isAdmin = userRole === 'ADMIN' || session.user.isAdmin === true;
        const isStaff = session.user.userType === 'STAFF' || userRole === 'STAFF';

        // Non-admins never see admin-only cases
        if (!isAdmin) {
            where.isAdminOnly = false;
        }

        // Staff members (internal) should see all cases, Partners (external) are restricted to their projects
        const isRestricted = !isAdmin && !isStaff;

        if (isRestricted) {
            // Find all projects the user is a member of
            const userMemberships = await prisma.projectMember.findMany({
                where: { userId: session.user.id },
                select: { projectId: true }
            });
            const rootAllowedIds = userMemberships.map((m: { projectId: string }) => m.projectId);
            
            // CRITICAL FIX: Also include the project assigned via b2bPartnerId
            if (session.user.b2bPartnerId && !rootAllowedIds.includes(session.user.b2bPartnerId)) {
                rootAllowedIds.push(session.user.b2bPartnerId);
            }

            if (rootAllowedIds.length === 0) {
                // No project memberships — fall back to cases created by this user
                where.createdById = session.user.id;
            } else {
                // Expand to include all descendants
                const effectiveProjectIds = new Set<string>();
                rootAllowedIds.forEach(id => {
                    effectiveProjectIds.add(id);
                    getDescendantIds(id).forEach(childId => effectiveProjectIds.add(childId));
                });

                const allowedList = Array.from(effectiveProjectIds);

                if (projectId) {
                    if (!allowedList.includes(projectId)) {
                        return NextResponse.json({ error: 'Forbidden: You do not have access to this project' }, { status: 403 });
                    }
                    const projectAndDescendants = [projectId, ...getDescendantIds(projectId)];
                    const effectiveIds = projectAndDescendants.filter(id => allowedList.includes(id));
                    where.projects = { some: { projectId: { in: effectiveIds } } };
                } else {
                    where.projects = { some: { projectId: { in: allowedList } } };
                }
            }
        } else if (projectId) {
            // Admin requesting a specific project bypasses membership but filters by ID
            // Include the project itself + all its descendants so parent folders show child cases
            const projectAndDescendants = [projectId, ...getDescendantIds(projectId)];
            where.projects = { some: { projectId: { in: projectAndDescendants } } };
        }

        // NEW: Timeline/Source Filtering (Year, Month, Source)
        const urlYear = searchParams.get('year');
        const urlMonth = searchParams.get('month');
        const urlSource = searchParams.get('source');

        if (urlYear || urlMonth || urlSource) {
            let targetIds: string[] = [];
            
            if (urlYear && urlMonth) {
                // Find month project under a specific year project
                targetIds = allProjects
                    .filter(p => {
                        const isMonth = p.name.toLowerCase() === urlMonth.toLowerCase();
                        if (!isMonth) return false;
                        const parent = p.parentId ? projectMap.get(p.parentId) : null;
                        return parent && parent.name === urlYear;
                    })
                    .map(p => p.id);
            } else if (urlYear) {
                // Find all projects named 'year'
                targetIds = allProjects
                    .filter(p => p.name === urlYear && (p.type === 'YEAR' || !isNaN(Number(p.name))))
                    .map(p => p.id);
            } else if (urlSource) {
                // Find top-level source projects
                targetIds = allProjects
                    .filter(p => p.name === urlSource && (p.parentId === null || projectMap.get(p.parentId!)?.type === 'ROOT'))
                    .map(p => p.id);
            }

            if (targetIds.length > 0) {
                const allDescendants = new Set<string>();
                targetIds.forEach(id => {
                    allDescendants.add(id);
                    getDescendantIds(id).forEach(dId => allDescendants.add(dId));
                });
                
                const timelineProjectIds = Array.from(allDescendants);
                
                // Merge with existing projects filter if any (intersection)
                if (where.projects?.some?.projectId?.in) {
                    const allowedIds = where.projects.some.projectId.in;
                    const intersection = timelineProjectIds.filter(id => allowedIds.includes(id));
                    where.projects = { some: { projectId: { in: intersection } } };
                } else {
                    where.projects = { some: { projectId: { in: timelineProjectIds } } };
                }
            }
        }

        // Apply filters
        if (status && status !== 'ALL') {
            if (status.includes(',')) {
                where.status = { in: status.split(',').map(s => s.trim()) };
            } else {
                where.status = status;
            }
        }

        const category = searchParams.get('category');
        if (category && category !== 'ALL') {
            where.category = category;
        }
 
        if (service && service !== 'ALL') {
            where.services = { contains: '"' + service + '"' };
        }

        if (filter === 'overdue') {
            where.nextUpdate = { lt: new Date() };
            where.status = { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] };
        } else if (filter === 'my-cases') {
            where.OR = [
                { createdById: session.user.id },
                { assignments: { some: { userId: session.user.id } } }
            ];
        } else if (filter === 'assigned') {
            where.assignments = { some: { userId: session.user.id } };
        } else if (filter === 'new-leads') {
            where.status = 'NEW_LEAD';
        }

        if (createdBy) {
            where.createdById = createdBy;
        }

        if (assignedTo) {
            where.assignedToId = assignedTo;
        }

        const search = searchParams.get('search');
        if (search) {
            const searchTerm = search.toLowerCase();
            where.OR = [
                { fileNumber: { contains: searchTerm, mode: 'insensitive' } },
                {
                    client: {
                        OR: [
                            { firstName: { contains: searchTerm, mode: 'insensitive' } },
                            { lastName: { contains: searchTerm, mode: 'insensitive' } },
                            { idNumber: { contains: searchTerm } },
                            { phone: { contains: searchTerm } },
                            { email: { contains: searchTerm, mode: 'insensitive' } }
                        ]
                    }
                }
            ];
        }

        console.log(`[API] Final GET Where Clause: ${JSON.stringify(where)}`);

        // Slim mode: sidebar only needs id + createdAt for timeline grouping
        if (slim) {
            const slimCases = await prisma.case.findMany({
                where,
                select: { id: true, createdAt: true },
                take,
                skip,
                orderBy: { updatedAt: 'desc' }
            });
            return NextResponse.json(slimCases);
        }

        let cases: any[] = [];
        try {
            cases = await prisma.case.findMany({
                where,
                include: {
                    client: true,
                    jointClient: true,
                    updatedBy: {
                        select: {
                            firstName: true,
                            lastName: true
                        }
                    },
                    assignments: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    email: true,
                                    avatarUrl: true
                                }
                            }
                        }
                    },
                    projects: {
                        include: {
                            project: true
                        }
                    }
                },
                take,
                skip,
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        } catch (initialError) {
            console.error('[API] Failed with assignments include or where, retrying without:', initialError);
            
            // Clean 'assignments' from where if it exists
            const fallbackWhere = { ...where };
            if (fallbackWhere.OR) {
                fallbackWhere.OR = fallbackWhere.OR.filter((clause: any) => !clause.assignments);
                if (fallbackWhere.OR.length === 0) delete fallbackWhere.OR;
            }
            if (fallbackWhere.assignments) delete fallbackWhere.assignments;

                cases = await prisma.case.findMany({
                    where: fallbackWhere,
                    include: {
                        client: true,
                        jointClient: true,
                        updatedBy: {
                            select: {
                                firstName: true,
                                lastName: true
                            }
                        },
                        projects: {
                        include: {
                            project: true
                        }
                    }
                },
                take,
                skip,
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        }



        const getFullPath = (id: string): string => {
            let curr: ProjectMapType | undefined = projectMap.get(id);
            if (!curr) return '';

            const pathParts: { name: string; type: string }[] = [];
            const visited = new Set<string>(); // Cycle detection

            while (curr && !visited.has(curr.id)) {
                visited.add(curr.id);
                if (curr.type !== 'ROOT') {
                    pathParts.unshift({ name: curr.name, type: curr.type });
                }
                if (curr.parentId) {
                    curr = projectMap.get(curr.parentId);
                } else {
                    break;
                }
            }

            const clean = (name: string) => {
                let s = name;
                if (s === 'Letsatsi Referrals') s = 'Letsatsi';
                s = s.replace(/My Cases\s*-?\s*/gi, '').trim();
                return s;
            };

            const year = clean(pathParts.filter(p => p.type === 'YEAR').pop()?.name || '');
            const month = clean(pathParts.filter(p => p.type === 'MONTH').pop()?.name || '');

            // Find sources (skip generic "Cases" if more specific exists)
            const allSources = pathParts.filter(p => p.type === 'ACQUISITION_SOURCE');
            const specificSource = allSources.filter(p => p.name !== 'Cases').pop();
            const source = clean(specificSource?.name || allSources[0]?.name || '');

            // Find all branches/folders
            const branches = pathParts
                .filter(p => (p.type === 'BRANCH' || p.type === 'FOLDER') && p.name !== source)
                .map(p => clean(p.name));
            const branch = branches.join(' ');

            if (year || month || source || branch) {
                return [source, branch, month, year].filter(Boolean).join(' ');
            }

            // Fallback for untyped or complex paths
            return pathParts
                .filter(p => !['ROOT', 'Audit'].includes(p.type) && p.name.toUpperCase() !== 'ZDM FILES')
                .map(p => clean(p.name))
                .filter(Boolean)
                .join(' ');
        };

        const enrichedCases = cases.map((c: any) => ({
            ...c,
            projects: (c.projects || []).map((cp: any) => ({
                ...cp,
                project: {
                    ...cp.project,
                    fullPath: getFullPath(cp.project.id)
                }
            }))
        }));

        console.log(`[API] Cases found: ${cases.length}, Enriched: ${enrichedCases.length}, IsArray: ${Array.isArray(enrichedCases)}`);
        if (!Array.isArray(enrichedCases)) {
            console.error('[API] CRITICAL: enrichedCases is not an array!', typeof enrichedCases);
            return NextResponse.json({ error: 'Internal Error: Data format mismatch', type: typeof enrichedCases }, { status: 500 });
        }
        return NextResponse.json(enrichedCases);
    } catch (error: any) {
        console.error('[API] Error fetching cases:', error);
        return NextResponse.json({ 
            error: error.message || 'Internal Server Error',
            details: error instanceof Error ? error.stack : String(error)
        }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        // Track creator explicitly
        const session = await auth();
        const currentUserId = session?.user?.id;
        const creatorRole = session?.user?.role?.toUpperCase();
        const isAdminCreator = creatorRole === 'ADMIN' || session?.user?.isAdmin === true;
        logger.info(`[CASE_CREATE] Session User ID: ${currentUserId}`);

        const parsed = parseBody(CaseCreateSchema, await request.json());
        if (!parsed.success) return parsed.response;

        const body = parsed.data as z.infer<typeof CaseCreateSchema>;
        const {
            client,
            jointClient,
            projectId,
            secondaryProjectIds,
            acquisitionType,
            partnerName,
            partnerBranch,
            partnerSplitPercent,
            services,
            referrerId } = body;

        // Resolve referrerId: if prefixed with "project:" it's an orphan sub-project — auto-create a minimal Referrer
        let resolvedReferrerId: string | null = referrerId ?? null;
        if (resolvedReferrerId?.startsWith('project:')) {
            const subProjectId = resolvedReferrerId.replace('project:', '');
            const subProject = await prisma.project.findUnique({ where: { id: subProjectId }, select: { id: true, name: true } });
            if (subProject) {
                const nameParts = subProject.name.trim().split(/\s+/);
                const firstName = nameParts[0] || subProject.name;
                const lastName = nameParts.slice(1).join(' ') || '-';
                const newReferrer = await prisma.referrer.create({
                    data: { firstName, lastName, projectId: subProject.id, isActive: true },
                    select: { id: true },
                });
                resolvedReferrerId = newReferrer.id;
            } else {
                resolvedReferrerId = null;
            }
        }

        // Check for duplicate ID Number — smart reuse logic:
        // 1. Client has no cases (orphaned — previous case was deleted) → reuse client record
        // 2. Client has cases but ALL are admin-only AND caller is non-admin → reuse client record
        // 3. Client has visible cases → block with duplicate error
        let existingClientId: string | null = null;

        const existingClientWithId = await prisma.client.findFirst({
            where: { idNumber: client.idNumber },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                cases: {
                    select: { id: true, fileNumber: true, isAdminOnly: true }
                }
            }
        });

        if (existingClientWithId) {
            const allCases = existingClientWithId.cases;

            // Check if special role (Employee, Referrer, or B2B Partner)
            let isSpecialRole = false;
            if (client.idNumber) {
                const [employee, referrer, b2bUser] = await Promise.all([
                    prisma.user.findFirst({ where: { idNumber: client.idNumber, userType: 'STAFF' }, select: { id: true } }),
                    prisma.referrer.findFirst({ where: { idNumber: client.idNumber }, select: { id: true } }),
                    prisma.user.findFirst({ where: { idNumber: client.idNumber, userType: 'B2B_PARTNER' }, select: { id: true } })
                ]);
                isSpecialRole = !!(employee || referrer || b2bUser);
            }

            if (allCases.length === 0) {
                // Orphaned client — the case was deleted but the client record wasn't.
                existingClientId = existingClientWithId.id;
                logger.info(`[CASE_CREATE] Reusing orphaned client ${existingClientId} (no linked cases)`);
            } else {
                const nonAdminOnlyCases = allCases.filter(c => !c.isAdminOnly);

                // Allow reuse if:
                // 1. Caller is an ADMIN (admins should always be able to link to existing clients)
                // 2. Individual is an Employee/Referrer/B2B Partner
                // 3. No visible cases exist for a non-admin caller
                if (isAdminCreator || isSpecialRole || (nonAdminOnlyCases.length === 0 && !isAdminCreator)) {
                    existingClientId = existingClientWithId.id;
                    logger.info(`[CASE_CREATE] Reusing client ${existingClientId} (Role: ${isSpecialRole ? 'Special' : isAdminCreator ? 'Admin' : 'None'}, Cases: ${allCases.length})`);
                } else {
                    // Visible cases exist — block with a clear duplicate error.
                    const suggestedIdNumber = `DRL${client.idNumber}`;
                    return NextResponse.json(
                        {
                            error: 'Duplicate ID Number',
                            message: `A client with ID number ${client.idNumber} already exists: ${existingClientWithId.firstName} ${existingClientWithId.lastName}`,
                            code: 'DUPLICATE_ID_NUMBER',
                            field: 'idNumber',
                            existingClient: {
                                id: existingClientWithId.id,
                                name: `${existingClientWithId.firstName} ${existingClientWithId.lastName}`
                            },
                            allowPrefixedId: true,
                            suggestedIdNumber,
                            originalIdNumber: client.idNumber
                        },
                        { status: 409 }
                    );
                }
            }
        }

        // Phone duplication check — skip if reusing an existing client (same person)
        if (!existingClientId && client.phone) {
            const existingClientWithPhone = await prisma.client.findFirst({
                where: { phone: client.phone },
                select: { id: true, firstName: true, lastName: true, phone: true }
            });
            if (existingClientWithPhone) {
                return NextResponse.json({ error: 'Duplicate Cell Number' }, { status: 409 });
            }
        }

        // Determine R350 status
        const r350Status = acquisitionType === 'B2B' ? 'NOT_APPLICABLE' : 'PENDING';
        const serviceFeeCollectedBy = acquisitionType === 'B2B' ? 'PARTNER' : 'ZENOWETHU';

        // Generate file number
        const year = new Date().getFullYear();
        const lastCase = await prisma.case.findFirst({
            where: { fileNumber: { startsWith: `ZDM-${year}-` } },
            orderBy: { fileNumber: 'desc' },
            select: { fileNumber: true }
        });
        let nextNumber = 1;
        if (lastCase) {
            const parts = lastCase.fileNumber.split('-');
            const lastNumber = parseInt(parts[2] || '0', 10);
            nextNumber = (isNaN(lastNumber) ? 0 : lastNumber) + 1;
        }
        let fileNumber = `ZDM-${year}-${String(nextNumber).padStart(3, '0')}`;

        // Calculate SLA deadline
        const deadline = calculateSlaDeadline(new Date());

        // Create case with retry for unique constraint conflicts
        let newCase: any;
        let retryCount = 0;
        const maxRetries = 5;

        while (retryCount < maxRetries) {
            try {
                newCase = await (prisma.case.create as any)({
                    data: {
                        fileNumber,
                        status: 'NEW_LEAD',
                        nextUpdate: deadline,
                        acquisitionType,
                        partnerName: acquisitionType === 'B2B' ? partnerName : null,
                        partnerBranch: acquisitionType === 'B2B' ? partnerBranch : null,
                        r350Status,
                        serviceFeeCollectedBy,
                        services: services ? JSON.stringify(services) : null,
                        partnerSplitPercent: acquisitionType === 'B2B' ? (partnerSplitPercent || 50) : 0,
                        referrer: resolvedReferrerId ? { connect: { id: resolvedReferrerId } } : undefined,
                        createdBy: currentUserId ? { connect: { id: currentUserId } } : undefined,
                        updatedBy: currentUserId ? { connect: { id: currentUserId } } : undefined,
                        client: existingClientId
                            ? { connect: { id: existingClientId } }
                            : {
                                create: {
                                    firstName: client.firstName,
                                    lastName: client.lastName,
                                    idNumber: client.idNumber,
                                    email: client.email || null,
                                    alternativeEmail: (client as any).alternativeEmail || null,
                                    phone: client.phone || null,
                                    alternativePhone: (client as any).alternativePhone || null,
                                    address: client.address || null,
                                    type: client.type || 'Standard'
                                }
                            },
                        jointClient: jointClient && jointClient.idNumber ? {
                            connectOrCreate: {
                                where: { idNumber: jointClient.idNumber },
                                create: {
                                    firstName: jointClient.firstName,
                                    lastName: jointClient.lastName,
                                    idNumber: jointClient.idNumber,
                                    email: jointClient.email || null,
                                    phone: jointClient.phone || null,
                                    type: jointClient.type || 'Standard'
                                }
                            }
                        } : undefined,
                        projects: {
                            create: [
                                // Primary project
                                {
                                    projectId: projectId,
                                    isPrimary: true
                                },
                                // Secondary projects
                                ...secondaryProjectIds.map((id: string) => ({
                                    projectId: id,
                                    isPrimary: false
                                }))
                            ]
                        },
                        assignments: {
                            create: currentUserId ? [{ userId: currentUserId }] : []
                        },
                        workflowLogs: {
                            create: [
                                {
                                    fromStatus: null,
                                    toStatus: 'NEW_LEAD',
                                    timestamp: new Date(),
                                    notes: 'Case created',
                                    userId: session?.user?.id || null
                                }
                            ]
                        }
                    },
                    include: {
                        client: true,
                        jointClient: true,
                        createdBy: true,
                        projects: {
                            include: {
                                project: true
                            }
                        }
                    }
                });
                break; // Success! Exit the retry loop
            } catch (createError: any) {
                // Check if it's a unique constraint error on fileNumber
                if (createError?.code === 'P2002' && createError?.meta?.target?.includes('fileNumber')) {
                    retryCount++;
                    nextNumber++;
                    fileNumber = `ZDM-${year}-${String(nextNumber).padStart(3, '0')}`;
                    logger.info(`Retrying case creation with fileNumber: ${fileNumber} (attempt ${retryCount}/${maxRetries})`);
                } else {
                    // Different error, rethrow it
                    throw createError;
                }
            }
        }

        if (!newCase) {
            throw new Error('Failed to create case after multiple retries');
        }

        // Get the main source from the primary project's root parent
        logger.info(`Debug Case Creation: ID=${newCase.id}, Projects=${newCase.projects?.length}`);

        // Fallback: If no projects were linked (e.g. silent failure), force link the primary project
        if (newCase.projects.length === 0 && projectId) {
            logger.info('⚠️ Fallback: Manually linking primary project', projectId);
            try {
                await prisma.caseProject.create({
                    data: {
                        caseId: newCase.id,
                        projectId: projectId,
                        isPrimary: true
                    }
                });
                // Reload case with projects
                const refreshedCase = await prisma.case.findUnique({
                    where: { id: newCase.id },
                    include: {
                        client: true,
                        projects: { include: { project: true } }
                    }
                });
                if (refreshedCase) newCase = refreshedCase as any;
            } catch (fallbackError) {
                logger.error('Failed to manually link project:', fallbackError);
            }
        }

        let mainSource = newCase.partnerName || 'Zenowethu Debt Management';

        // 1. Try to get source from User's Organization (Best for B2B)
        if (newCase.acquisitionType === 'B2B' && newCase.createdBy && newCase.createdBy.organization && newCase.createdBy.organization !== 'Zenowethu') {
            mainSource = newCase.createdBy.organization;
        } else {
            // 2. Fallback: Deduce from project hierarchy
            const primaryProject = newCase.projects.find((p: { isPrimary: boolean }) => p.isPrimary)?.project;
            if (primaryProject) {
                // Find root parent (main source) by traversing up the hierarchy
                let currentProject = primaryProject;
                // Traverse up until we hit a root or a specific top-level folder
                while (currentProject?.parentId) {
                    // Stop if we are about to hit the "ZDM FILES" root, so we keep the partner folder name
                    // We need to peek at the parent
                    const parent = await prisma.project.findUnique({
                        where: { id: currentProject.parentId }
                    });

                    if (!parent) break;

                    // If the parent is the generic root "ZDM FILES", stop here and use currentProject as the source
                    if (parent.name === 'ZDM FILES') {
                        break;
                    }

                    currentProject = parent;
                }
                mainSource = currentProject.name;
            }
        }

        // Format services for display
        let servicesText = '';
        if (services && Array.isArray(services) && services.length > 0) {
            servicesText = services.map((s: string) => {
                return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            }).join(', ');
        }

        // Send "File Received" notification to client (async, don't block response)
        if (newCase.client.phone || newCase.client.email) {
            sendStatusChangeNotification({
                caseId: newCase.id,
                clientName: `${newCase.client.firstName} ${newCase.client.lastName}`,
                clientPhone: newCase.client.phone,
                clientEmail: newCase.client.email,
                clientWhatsApp: newCase.client.phone,
                fileNumber: newCase.fileNumber,
                statusCode: 'NEW_LEAD',
                partnerName: newCase.partnerName,
                partnerUserName: newCase.createdBy ? `${newCase.createdBy.firstName} ${newCase.createdBy.lastName}` : 'Zenowethu Team',
                isB2B: newCase.acquisitionType === 'B2B',
                isCreatedByPartner: newCase.createdBy?.userType === 'B2B_PARTNER',
                services: servicesText,
                mainSource: mainSource,
                senderName: newCase.createdBy ? `${newCase.createdBy.firstName} ${newCase.createdBy.lastName}` : 'Zenowethu Team',
                senderEmail: 'updates@zenowethu.co.za' }).then(result => {
                if (result.errors.length > 0) {
                    logger.warn(`⚠️ Welcome notification errors for ${newCase.id}:`, result.errors);
                } else {
                    logger.info(`📬 Welcome notification sent for ${newCase.fileNumber}: SMS=${result.smsSuccess}, Email=${result.emailSuccess}`);
                }
            }).catch(err => {
                logger.error(`❌ Failed to send welcome notification for ${newCase.id}:`, err);
            });
        }

        // Notify project managers for B2B referrals (async, don't block response)
        if (newCase.acquisitionType === 'B2B' && projectId) {
            (async () => {
                try {
                    // 1. Get all ancestor project IDs to find all relevant managers
                    const ancestorIds = [projectId];
                    let currentPid = newCase.projects.find((p: any) => p.projectId === projectId)?.project?.parentId;

                    while (currentPid) {
                        ancestorIds.push(currentPid);
                        const parentProj = await prisma.project.findUnique({
                            where: { id: currentPid },
                            select: { id: true, parentId: true }
                        });
                        currentPid = parentProj?.parentId || null;
                    }

                    // 2. Get all managers for the project and all its ancestors
                    const projectMembers = await prisma.projectMember.findMany({
                        where: {
                            projectId: { in: ancestorIds },
                            role: 'MANAGER'
                        },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    email: true,
                                    firstName: true,
                                    lastName: true
                                }
                            }
                        }
                    });

                    // Deduplicate managers by user ID (a user might be manager on multiple levels)
                    const uniqueManagers = Array.from(new Map(projectMembers.map(pm => [pm.user.id, pm.user])).values()) as { id: string; firstName: string; lastName: string; email: string }[];

                    if (uniqueManagers.length > 0) {
                        const creatorName = newCase.createdBy
                            ? `${newCase.createdBy.firstName} ${newCase.createdBy.lastName}`
                            : 'Unknown User';

                        const mentionList = uniqueManagers
                            .map(u => `@${u.firstName} ${u.lastName}`)
                            .join(' ');

                        const commentContent = `🔔 **New B2B Referral Alert**

${mentionList}

A new referral has been submitted:
• **Partner:** ${mainSource}
• **Uploaded by:** ${creatorName}
• **Client:** ${newCase.client.firstName} ${newCase.client.lastName}
• **File Number:** ${newCase.fileNumber}
• **Services:** ${servicesText}
• **Submitted:** ${new Date().toLocaleString()}

Please review and process this referral.`;

                        // 3. Create a comment to notify managers
                        const comment = await prisma.caseComment.create({
                            data: {
                                content: commentContent,
                                caseId: newCase.id,
                                userId: newCase.createdBy?.id || null,
                                type: 'NOTE',
                                isInternal: false,
                                activityType: 'SYSTEM_NOTIFICATION'
                            }
                        });

                        // 4. Create explicit in-app notifications for each manager
                        for (const manager of uniqueManagers) {
                            // Don't notify the person who created it if they happen to be a manager
                            if (manager.id === currentUserId) continue;

                            await prisma.inAppNotification.create({
                                data: {
                                    userId: manager.id,
                                    type: 'MENTION',
                                    title: `New Referral: ${newCase.fileNumber}`,
                                    message: `${creatorName} submitted a new referral from ${mainSource} for ${newCase.client.firstName} ${newCase.client.lastName}`,
                                    caseId: newCase.id,
                                    commentId: comment.id,
                                    linkUrl: `/cases/${newCase.id}` }
                            });
                        }

                        logger.info(`✅ Manager notification created for ${newCase.fileNumber} - ${uniqueManagers.length} unique manager(s) notified`);
                    } else {
                        logger.warn(`⚠️ No managers found for project path [${ancestorIds.join(', ')}] - case ${newCase.fileNumber}`);
                    }
                } catch (notifyError) {
                    logger.error(`❌ Failed to notify managers for ${newCase.id}:`, notifyError);
                }
            })();
        }

        // Fire Case Automation trigger (async, non-blocking — does not affect response time)
        import('@zenowethu/shared-lib/src/ai/case-automation-trigger').then(({ runCaseAutomationTrigger }) => {
            runCaseAutomationTrigger(newCase.id, 'CASE_CREATED').catch(err => {
                logger.error(`❌ Case automation trigger failed for ${newCase.id}:`, err);
            });
        });

        return NextResponse.json(newCase, { status: 201 });
    } catch (error: any) {
        logger.error('❌ Error creating case:', error, error?.stack);

        return NextResponse.json({
            error: error.message || 'Internal Server Error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
