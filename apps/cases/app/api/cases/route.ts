import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { calculateSlaDeadline, sendStatusChangeNotification, auth, createLogger, WORKFLOW_STATUSES } from '@zenowethu/shared-lib';
import { CaseCreateSchema, parseBody } from '@/lib/schemas';
import fs from 'fs';
import path from 'path';

console.log('>>> LOADING CASE API ROUTE');

const logger = createLogger('api/cases');

// Hierarchy Helper with Cycle Detection
function getDescendantIds(rootId: string, childrenMap: Map<string, string[]>): string[] {
    const descendants: string[] = [];
    const queue = [rootId];
    const seen = new Set<string>([rootId]);
    while (queue.length > 0) {
        const currId = queue.shift()!;
        const children = childrenMap.get(currId) || [];
        for (const childId of children) {
            if (!seen.has(childId)) {
                seen.add(childId);
                descendants.push(childId);
                queue.push(childId);
            }
        }
    }
    return descendants;
}

// Path Helper
function buildFullPath(projectId: string, projectMap: Map<string, any>): string {
    let curr = projectMap.get(projectId);
    if (!curr) return 'Unknown Project';
    const path: string[] = [];
    const seen = new Set<string>();
    while (curr && !seen.has(curr.id)) {
        seen.add(curr.id);
        if (curr.type !== 'ROOT') {
            const name = (curr.name || '').replace(/My Cases\s*-?\s*/gi, '').trim();
            if (name) path.unshift(name);
        }
        curr = curr.parentId ? projectMap.get(curr.parentId) : undefined;
    }
    return path.join(' › ');
}

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        const { searchParams } = new URL(request.url);
        const slim = searchParams.get('slim') === 'true';
        const urlProjectId = searchParams.get('projectId');
        const urlYear = searchParams.get('year');
        const urlMonth = searchParams.get('month');
        const status = searchParams.get('status');
        const filter = searchParams.get('filter'); // overdue, my-cases, new-leads
        const take = parseInt(searchParams.get('take') || '10000');
        const skip = parseInt(searchParams.get('skip') || '0');

        // Load hierarchy once
        const allProjects = await prisma.project.findMany({ select: { id: true, name: true, parentId: true, type: true } });
        const projectMap = new Map(allProjects.map(p => [p.id, p]));
        const childrenMap = new Map<string, string[]>();
        allProjects.forEach(p => {
            if (p.parentId) {
                const list = childrenMap.get(p.parentId) || [];
                list.push(p.id);
                childrenMap.set(p.parentId, list);
            }
        });

        const isAdmin = session.user.isAdmin === true || session.user.role?.toUpperCase() === 'ADMIN';
        const isStaff = session.user.userType === 'STAFF';
        const isRestricted = !isAdmin && !isStaff;

        const where: any = { deletedAt: null };
        if (!isAdmin) where.isAdminOnly = false;

        // 1. Scoping for B2B/Restricted
        if (isRestricted) {
            const memberships = await prisma.projectMember.findMany({ where: { userId: session.user.id }, select: { projectId: true } });
            const roots = memberships.map(m => m.projectId);
            if (session.user.b2bPartnerId && !roots.includes(session.user.b2bPartnerId)) roots.push(session.user.b2bPartnerId);

            if (roots.length === 0) {
                where.createdById = session.user.id;
            } else {
                const allowedSet = new Set<string>();
                roots.forEach(id => {
                    allowedSet.add(id);
                    getDescendantIds(id, childrenMap).forEach(d => allowedSet.add(d));
                });
                const allowedList = Array.from(allowedSet);

                if (urlProjectId) {
                    if (!allowedList.includes(urlProjectId)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
                    const scope = [urlProjectId, ...getDescendantIds(urlProjectId, childrenMap)].filter(id => allowedList.includes(id));
                    where.projects = { some: { projectId: { in: scope } } };
                } else {
                    where.projects = { some: { projectId: { in: allowedList } } };
                }
            }
        } else if (urlProjectId) {
            const scope = [urlProjectId, ...getDescendantIds(urlProjectId, childrenMap)];
            where.projects = { some: { projectId: { in: scope } } };
        }

        // 2. Timeline filtering (Date Range vs Project Assignment)
        if (urlYear || urlMonth) {
            const dateWhere: any = {};
            if (urlYear && urlMonth) {
                const monthIndex = new Date(`${urlMonth} 1, ${urlYear}`).getMonth();
                const startDate = new Date(parseInt(urlYear), monthIndex, 1);
                const endDate = new Date(parseInt(urlYear), monthIndex + 1, 1);
                dateWhere.createdAt = { gte: startDate, lt: endDate };
            } else if (urlYear) {
                const startDate = new Date(parseInt(urlYear), 0, 1);
                const endDate = new Date(parseInt(urlYear) + 1, 0, 1);
                dateWhere.createdAt = { gte: startDate, lt: endDate };
            }
            
            // Apply date range to main where
            Object.assign(where, dateWhere);

            // Note: We intentionally DO NOT narrow down by project IDs here if urlYear/urlMonth are provided.
            // The sidebar timeline counts by createdAt, so the list should filter by createdAt.
            // Project-based scoping (for restricted users) is already in 'where.projects' from step 1.
        }

        // 3. Status & Quick Filters
        const completedCodes = WORKFLOW_STATUSES.filter(s => s.category === 'COMPLETED' || s.category === 'SETTLED').map(s => s.code);
        const beginningCodes = WORKFLOW_STATUSES.filter(s => s.category === 'BEGINNING').map(s => s.code);
        const overdueCodes = WORKFLOW_STATUSES.filter(s => s.category === 'OVERDUE').map(s => s.code);
        const lostCodes = WORKFLOW_STATUSES.filter(s => s.category === 'LOST').map(s => s.code);
        const payingCodes = WORKFLOW_STATUSES.filter(s => s.category === 'PAYING').map(s => s.code);

        if (filter === 'overdue') {
            // Cases whose nextUpdate deadline has passed and are not completed/lost
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            where.nextUpdate = { lt: today };
            where.status = { notIn: [...completedCodes, ...lostCodes] };
        } else if (filter === 'my-cases') {
            where.OR = [
                { createdById: session.user.id },
                { assignedToId: session.user.id },
            ];
        } else if (filter === 'begin') {
            where.status = { in: beginningCodes };
        } else if (filter === 'progress') {
            const progressCodes = WORKFLOW_STATUSES.filter(s => s.category === 'IN_PROGRESS').map(s => s.code);
            where.status = { in: progressCodes };
        } else if (filter === 'detour') {
            // Detour + Advanced Detour (cleared, parked, CL handed over, etc.)
            const detourCodes = WORKFLOW_STATUSES.filter(s => s.category === 'DETOUR' || s.category === 'ADVANCED_DETOUR').map(s => s.code);
            where.status = { in: detourCodes };
        } else if (filter === 'advanced') {
            // Advanced + Advanced Progress (followed up, positive outcome, ready for clearance)
            const advancedCodes = WORKFLOW_STATUSES.filter(s => s.category === 'ADVANCED' || s.category === 'ADVANCED_PROGRESS').map(s => s.code);
            where.status = { in: advancedCodes };
        } else if (filter === 'completed') {
            const justCompletedCodes = WORKFLOW_STATUSES.filter(s => s.category === 'COMPLETED').map(s => s.code);
            where.status = { in: justCompletedCodes };
        } else if (filter === 'finance') {
            // Paying + Settled
            const financeCodes = WORKFLOW_STATUSES.filter(s => s.category === 'PAYING' || s.category === 'SETTLED').map(s => s.code);
            where.status = { in: financeCodes };
        } else if (filter === 'lost') {
            where.status = { in: lostCodes };
        }

        if (status && status !== 'ALL') {
            if (status === 'active') {
                where.status = { notIn: [...completedCodes, ...lostCodes] };
            } else if (status === 'pending') {
                where.status = { in: [...beginningCodes, ...overdueCodes] };
            } else {
                where.status = status.includes(',') ? { in: status.split(',').map(s => s.trim()) } : status;
            }
        }

        // 4. Execution
        if (slim) {
            const data = await prisma.case.findMany({ where, select: { id: true, createdAt: true }, take: 1000, orderBy: { createdAt: 'desc' } });
            return NextResponse.json(data);
        }

        const [cases, totalCount] = await Promise.all([
            prisma.case.findMany({
                where,
                include: {
                    client: true,
                    projects: { include: { project: true } },
                    updatedBy: { select: { firstName: true, lastName: true } },
                },
                take: isNaN(take) ? 10000 : take,
                skip: isNaN(skip) ? 0 : skip,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.case.count({ where })
        ]);

        // 5. Defensive Enrichment
        const enriched = cases.map(c => {
            try {
                return {
                    ...c,
                    client: c.client || { firstName: 'Unknown', lastName: 'Client', idNumber: 'N/A', phone: 'N/A' },
                    projects: (c.projects || []).map((cp: any) => ({
                        ...cp,
                        project: {
                            ...(cp.project || {}),
                            fullPath: cp.projectId ? buildFullPath(cp.projectId, projectMap) : 'Unknown'
                        }
                    }))
                };
            } catch (e) { return c; }
        });

        // 6. Safe Serialization
        const json = JSON.stringify(enriched, (key, value) => 
            typeof value === 'bigint' ? value.toString() : 
            (value && value.constructor && value.constructor.name === 'Decimal') ? value.toString() : 
            value
        );

        return new Response(json, { 
            status: 200, 
            headers: { 
                'Content-Type': 'application/json',
                'X-Total-Count': totalCount.toString()
            } 
        });
    } catch (err: any) {
        const errorDetail = {
            message: err?.message || 'No message',
            stack: err?.stack || 'No stack',
            timestamp: new Date().toISOString()
        };
        try {
            const debugPath = path.join(process.cwd(), 'api-debug-error.log');
            fs.appendFileSync(debugPath, JSON.stringify(errorDetail, null, 2) + '\n---\n');
        } catch (e) {}
        
        logger.error('[API] Critical Error:', err);
        return new Response(JSON.stringify({ error: 'Internal Server Error', message: err?.message, _debug: errorDetail }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

export async function POST(request: Request) {
    let body: any;
    try {
        const session = await auth();
        body = await request.json();
        
        logger.info('Creating new case from body:', JSON.stringify({
            ...body,
            client: { ...body.client, idNumber: body.client?.idNumber ? '***' : undefined },
            jointClient: body.jointClient ? { ...body.jointClient, idNumber: '***' } : undefined
        }));

        const parsed = CaseCreateSchema.safeParse(body);
        if (!parsed.success) {
            logger.warn('Validation failed:', parsed.error.issues);
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
        }
        
        const data = parsed.data;
        
        // 0. Check for existing active case for this ID number to prevent accidental duplicates
        const nonActiveCodes = WORKFLOW_STATUSES.filter(s => s.category === 'COMPLETED' || s.category === 'SETTLED' || s.category === 'LOST').map(s => s.code);
        const activeCase = await prisma.case.findFirst({
            where: {
                client: { idNumber: data.client.idNumber.trim() },
                status: { notIn: nonActiveCodes }
            },
            select: {
                fileNumber: true,
                client: { select: { firstName: true, lastName: true } },
                projects: {
                    where: { isPrimary: true },
                    include: { project: { select: { name: true } } },
                    take: 1
                }
            }
        });

        if (activeCase && !data.allowDuplicate) {
            const existingClientName = activeCase.client
                ? `${activeCase.client.firstName} ${activeCase.client.lastName}`
                : 'Unknown';
            const existingProjectName = activeCase.projects[0]?.project?.name || 'Unknown Project';
            logger.warn(`Duplicate case alert for ID ${data.client.idNumber}. Existing case: ${activeCase.fileNumber} (${existingClientName})`);
            return NextResponse.json({
                error: 'Duplicate Case',
                code: 'DUPLICATE_CASE',
                existingClientName,
                existingFileNumber: activeCase.fileNumber,
                existingProjectName,
                message: `ID ${data.client.idNumber} is already on file as ${existingClientName} — case ${activeCase.fileNumber} in project "${existingProjectName}".`
            }, { status: 409 });
        }

        const count = await prisma.case.count();
        const fileNumber = `ZDM-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
        // All cases start with null nextUpdate so the automation picks them up on the first cron run.
        const deadline = null;

        // 1. Handle Primary Client
        const client = await prisma.client.upsert({
            where: { idNumber: data.client.idNumber },
            update: data.client,
            create: data.client
        });

        // 2. Handle Joint Client if present
        let jointClientId: string | undefined = undefined;
        if (data.jointClient) {
            const joint = await prisma.client.upsert({
                where: { idNumber: data.jointClient.idNumber },
                update: data.jointClient,
                create: data.jointClient
            });
            jointClientId = joint.id;
        }

        // Auto-detect referrerId from the primary project if not explicitly provided.
        // When a sub-project IS a registered referral folder (has a linked Referrer record),
        // the case should be credited to that referrer even if the client didn't send referrerId.
        let resolvedReferrerId = data.referrerId ?? null;
        if (!resolvedReferrerId && data.projectId) {
            const projectReferrer = await prisma.referrer.findUnique({
                where: { projectId: data.projectId },
                select: { id: true },
            });
            if (projectReferrer) {
                resolvedReferrerId = projectReferrer.id;
                logger.info(`Auto-detected referrerId=${resolvedReferrerId} from projectId=${data.projectId}`);
            }
        }

        // Resolve referrer's sub-project so the case appears in their project folder
        let referrerSubProjectId: string | null = null;
        if (resolvedReferrerId) {
            const referrerRecord = await prisma.referrer.findUnique({
                where: { id: resolvedReferrerId },
                select: { projectId: true },
            });
            const secondaryIds = data.secondaryProjectIds || [];
            if (referrerRecord?.projectId && referrerRecord.projectId !== data.projectId && !secondaryIds.includes(referrerRecord.projectId)) {
                referrerSubProjectId = referrerRecord.projectId;
            }
        }

        // 3. Create Case
        const newCase = await prisma.case.create({
            data: {
                fileNumber,
                status: 'NEW_LEAD',
                nextUpdate: deadline,
                acquisitionType: data.acquisitionType,
                partnerName: data.partnerName,
                partnerBranch: data.partnerBranch,
                partnerSplitPercent: data.partnerSplitPercent,
                createdBy: session?.user?.id ? { connect: { id: session.user.id } } : undefined,
                client: { connect: { id: client.id } },
                jointClient: jointClientId ? { connect: { id: jointClientId } } : undefined,
                referrer: resolvedReferrerId ? { connect: { id: resolvedReferrerId } } : undefined,
                services: data.services ? JSON.stringify(data.services) : null,
                projects: {
                    create: [
                        { projectId: data.projectId, isPrimary: true },
                        ...(data.secondaryProjectIds || []).map(id => ({ projectId: id, isPrimary: false })),
                        ...(referrerSubProjectId ? [{ projectId: referrerSubProjectId, isPrimary: false }] : [])
                    ]
                }
            }
        });

        logger.info('Case created successfully:', newCase.id);

        // Send welcome notification if the client has contact details
        if (client.email || client.phone) {
            const isB2B = data.acquisitionType === 'B2B';
            const isCreatedByPartner = session?.user?.userType === 'B2B_PARTNER';
            const servicesText = data.services
                ? (Array.isArray(data.services) ? data.services : JSON.parse(data.services as string)).join(', ')
                : '';

            sendStatusChangeNotification({
                caseId:            newCase.id,
                clientName:        `${client.firstName} ${client.lastName}`,
                clientPhone:       client.phone ?? null,
                clientEmail:       client.email ?? null,
                clientWhatsApp:    client.phone ?? null,
                fileNumber:        newCase.fileNumber,
                statusCode:        'NEW_LEAD',
                partnerName:       data.partnerName ?? null,
                isB2B,
                isCreatedByPartner,
                services:          servicesText,
                senderName:        session?.user?.name || 'Zenowethu Debt Management',
                senderEmail:       'updates@zenowethu.co.za',
            }).then(result => {
                logger.info(`Welcome notification sent for ${newCase.fileNumber}: Email=${result.emailSuccess}, SMS=${result.smsSuccess}, WA=${result.whatsappSuccess}`);
            }).catch(err => {
                logger.error(`Failed to send welcome notification for ${newCase.id}:`, err);
            });
        }

        // Fire Case Automation trigger (async, non-blocking)
        import('@zenowethu/shared-lib/src/ai/case-automation-trigger').then(({ runCaseAutomationTrigger }) => {
            runCaseAutomationTrigger(newCase.id, 'CASE_CREATED').catch(err => {
                logger.error(`❌ Case automation trigger failed for ${newCase.id}:`, err);
            });
        });

        // Notify assigned staff member (async, non-blocking)
        if (data.assignedToId && data.assignedToId !== session?.user?.id) {
            prisma.user.findUnique({ where: { id: data.assignedToId } }).then(async assignee => {
                if (!assignee) return;
                const servicesText = data.services
                    ? (Array.isArray(data.services) ? data.services : JSON.parse(data.services as string)).join(', ')
                    : 'Credit Repair';
                await prisma.inAppNotification.create({
                    data: {
                        userId: assignee.id,
                        type: 'CASE_ASSIGNED',
                        title: `New Case Assigned: ${newCase.fileNumber}`,
                        message: `Case ${newCase.fileNumber} for ${client.firstName} ${client.lastName} (${servicesText}) has been assigned to you.`,
                        caseId: newCase.id,
                        linkUrl: `/cases/${newCase.id}`,
                    },
                });
            }).catch(err => logger.error(`Failed to send assignment notification for ${newCase.id}:`, err));
        }

        return NextResponse.json(newCase);
    } catch (err: any) {
        logger.error('[API/POST] Critical Error creating case:', {
            message: err.message,
            stack: err.stack,
            body: body ? JSON.stringify(body).substring(0, 500) : 'none'
        });
        
        return NextResponse.json({ 
            error: err?.message || 'Internal Server Error',
            message: err?.message,
            _stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: 500 });
    }
}
