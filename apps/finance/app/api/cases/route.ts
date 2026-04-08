import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { calculateSlaDeadline , logger, CaseCreateSchema, parseBody } from '@zenowethu/shared-lib';
import { sendStatusChangeNotification } from '@zenowethu/shared-lib';

import { auth } from '@zenowethu/shared-lib';
import { z } from 'zod';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all projects first to support path building AND recursive filtering
        const allProjects = await prisma.project.findMany({
            select: { id: true, name: true, parentId: true, type: true }
        });

        const projectMap = new Map<string, { id: string; name: string; parentId: string | null; type: string }>(allProjects.map(p => [p.id, p]));

        // Helper to find all descendant IDs
        const getDescendantIds = (rootId: string): string[] => {
            const descendants: string[] = [];
            const queue = [rootId];

            while (queue.length > 0) {
                const currId = queue.shift()!;
                // Find children
                const children = allProjects.filter(p => p.parentId === currId);
                children.forEach(child => {
                    descendants.push(child.id);
                    queue.push(child.id);
                });
            }
            return descendants;
        };

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const projectId = searchParams.get('projectId');
        const filter = searchParams.get('filter');
        const createdBy = searchParams.get('createdBy');
        const assignedTo = searchParams.get('assignedTo');
        const take = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;
        const skip = searchParams.get('skip') ? parseInt(searchParams.get('skip')!) : undefined;

        // DOMAIN FILTER: Only return cases with a Payment
        const where: any = {
            payments: { some: {} }
        };

        // Security: Filter by project membership (Inherited Access)
        const userRole = session.user.role?.toUpperCase();
        const isAdmin = userRole === 'ADMIN' || session.user.isAdmin === true;
        const isStaff = session.user.userType === 'STAFF';

        // Staff members (internal) should see all cases, Partners (external) are restricted to their projects
        const isRestricted = !isAdmin && !isStaff;

        if (isRestricted) {
            // Find all projects the user is a member of
            const userMemberships = await prisma.projectMember.findMany({
                where: { userId: session.user.id },
                select: { projectId: true }
            });
            const rootAllowedIds = userMemberships.map((m: { projectId: string }) => m.projectId);

            if (rootAllowedIds.length === 0) {
                // If not an admin and not in any projects, they see nothing
                return NextResponse.json([]);
            }

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
                where.projects = { some: { projectId: projectId } };
            } else {
                where.projects = { some: { projectId: { in: allowedList } } };
            }
        } else if (projectId) {
            // Admin requesting a specific project bypasses membership but filters by ID
            where.projects = { some: { projectId: projectId } };
        }

        // Apply filters
        if (status) {
            where.status = status;
        }

        if (filter === 'overdue') {
            where.nextUpdate = { lt: new Date() };
            where.status = { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] };
        } else if (filter === 'my-cases') {
            where.createdById = session.user.id;
        } else if (filter === 'assigned') {
            where.assignedToId = session.user.id;
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

        const cases = await prisma.case.findMany({
            where,
            include: {
                client: true,
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



        const getFullPath = (id: string): string => {
            let curr: { id: string; name: string; parentId: string | null; type: string } | undefined = projectMap.get(id);
            if (!curr) return '';

            const pathParts: { name: string; type: string }[] = [];
            while (curr) {
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

        const enrichedCases = cases.map(c => ({
            ...c,
            projects: c.projects.map(cp => ({
                ...cp,
                project: {
                    ...cp.project,
                    fullPath: getFullPath(cp.project.id)
                }
            }))
        }));

        return NextResponse.json(enrichedCases);
    } catch (error) {
        logger.error('Error fetching cases:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        // Track creator explicitly
        const session = await auth();
        const currentUserId = session?.user?.id;
        logger.info(`[CASE_CREATE] Session User ID: ${currentUserId}`);

        const parsed = parseBody(CaseCreateSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data as z.infer<typeof CaseCreateSchema>;
        const {
            client,
            projectId,
            secondaryProjectIds = [],
            acquisitionType = 'B2C',
            partnerName = null,
            partnerBranch = null,
            partnerSplitPercent = 0,
            services = null } = body;

        // Validate required fields
        if (!client?.firstName || !client?.lastName || !client?.idNumber || !projectId) {
            return NextResponse.json(
                { error: 'Missing required client or project information' },
                { status: 400 }
            );
        }

        // Check for duplicate ID Number
        const existingClientWithId = await prisma.client.findUnique({
            where: { idNumber: client.idNumber },
            select: { id: true, firstName: true, lastName: true }
        });

        if (existingClientWithId) {
            // Generate suggested prefixed ID (e.g., DRL8207225452088 for "Debt Review Letsatsi")
            const suggestedPrefix = 'DRL'; // Default suggested prefix
            const suggestedIdNumber = `${suggestedPrefix}${client.idNumber}`;

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
                    suggestedIdNumber: suggestedIdNumber,
                    originalIdNumber: client.idNumber
                },
                { status: 409 }
            );
        }

        // Duplication checks for Phone/Email
        if (client.phone) {
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
            const lastNumber = parseInt(lastCase.fileNumber.split('-')[2], 10);
            nextNumber = lastNumber + 1;
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
                        createdBy: currentUserId ? { connect: { id: currentUserId } } : undefined, // Use relation connect
                        client: {
                            create: {
                                firstName: client.firstName,
                                lastName: client.lastName,
                                idNumber: client.idNumber,
                                email: client.email || null,
                                phone: client.phone || null,
                                address: client.address || null,
                                type: client.type || 'Standard' }
                        },
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
        let servicesText = 'Credit Repair';
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
                partnerUserName: (newCase.acquisitionType === 'B2B' && newCase.createdBy) ? `${newCase.createdBy.firstName} ${newCase.createdBy.lastName}` : (newCase.createdBy?.name || 'Partner'),
                isB2B: newCase.acquisitionType === 'B2B',
                services: servicesText,
                mainSource: mainSource,
                senderName: (newCase.acquisitionType === 'B2B') ? `${mainSource} (via Zenowethu)` : 'Zenowethu Debt Management',
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

        return NextResponse.json(newCase, { status: 201 });
    } catch (error: any) {
        logger.error('❌ Error creating case:', error);
        try {
            const fs = require('fs');
            fs.writeFileSync('last-case-error.txt', JSON.stringify(error, null, 2) + '\n' + (error.stack || ''));
        } catch (e) { }

        return NextResponse.json({
            error: error.message || 'Internal Server Error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
