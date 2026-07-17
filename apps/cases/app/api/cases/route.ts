import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { calculateSlaDeadline, sendStatusChangeNotification, auth, createLogger, WORKFLOW_STATUSES } from '@zenowethu/shared-lib';
import { flagCaseIfFlaggedDC } from '@zenowethu/shared-lib/src/dc/counsellor-flag-db';
import { CaseCreateSchema, parseBody } from '@/lib/schemas';
import { buildProjectDisplayName } from '@/lib/project-path';
import fs from 'fs';
import path from 'path';

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

        const where: any = { deletedAt: { equals: null } };
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
            const data = await prisma.case.findMany({ where, select: { id: true, createdAt: true, recordedAt: true }, take: 1000, orderBy: { recordedAt: 'desc' } });
            return NextResponse.json(data);
        }

        const [cases, totalCount] = await Promise.all([
            prisma.case.findMany({
                where,
                // Slim projection — the list view and its client-side filters only read
                // these fields. The Case model has 131 columns and Client 38; selecting
                // every column for all ~1k rows produced a multi-MB payload that took
                // ~20s+ to serialize and transfer. The selected shape (field names) is
                // identical to before, so the page needs no changes.
                select: {
                    id: true,
                    fileNumber: true,
                    status: true,
                    services: true,
                    nextUpdate: true,
                    updatedAt: true,
                    createdAt: true,
                    recordedAt: true,
                    client: { select: { firstName: true, lastName: true, email: true, phone: true, idNumber: true } },
                    updatedBy: { select: { firstName: true, lastName: true } },
                    projects: { select: { isPrimary: true, projectId: true, project: { select: { id: true, name: true } } } },
                },
                take: isNaN(take) ? 10000 : take,
                skip: isNaN(skip) ? 0 : skip,
                orderBy: { recordedAt: 'desc' }
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

        // 6. Serialization — slim projection contains only scalars/dates (no Decimal or
        // bigint), so native serialization is safe and avoids the per-key replacer that
        // previously blocked the event loop over the whole result tree.
        return NextResponse.json(enriched, {
            headers: { 'X-Total-Count': totalCount.toString() }
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
                    select: { projectId: true, project: { select: { name: true } } },
                    take: 1
                }
            }
        });

        if (activeCase && !data.allowDuplicate) {
            const existingClientName = activeCase.client
                ? `${activeCase.client.firstName} ${activeCase.client.lastName}`
                : 'Unknown';
            // Resolve the full hierarchical project path (e.g. "Letsatsi › Mbombela › June 2026")
            // rather than just the leaf name (e.g. "June"), so the duplicate modal matches the
            // project label shown on the case detail view.
            const existingProjectId = activeCase.projects[0]?.projectId;
            let existingProjectName = activeCase.projects[0]?.project?.name || 'Unknown Project';
            if (existingProjectId) {
                const allProjects = await prisma.project.findMany({ select: { id: true, name: true, parentId: true, type: true } });
                const path = buildProjectDisplayName(existingProjectId, allProjects);
                if (path) existingProjectName = path;
            }
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

        // Resolve target creation date from project hierarchy
        let targetDate = new Date();
        if (data.projectId) {
            let monthName: string | null = null;
            let yearNum: number | null = null;
            let currId: string | null = data.projectId;
            while (currId) {
                const proj = await prisma.project.findUnique({
                    where: { id: currId },
                    select: { name: true, type: true, parentId: true }
                });
                if (!proj) break;
                if (proj.type === 'MONTH') {
                    monthName = proj.name;
                } else if (proj.type === 'YEAR') {
                    const parsedYear = parseInt(proj.name, 10);
                    if (!isNaN(parsedYear)) {
                        yearNum = parsedYear;
                    }
                }
                currId = proj.parentId;
            }

            if (monthName && yearNum !== null) {
                const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
                const monthIndex = monthNames.indexOf(monthName.toLowerCase());
                if (monthIndex !== -1) {
                    const now = new Date();
                    const maxDays = new Date(yearNum, monthIndex + 1, 0).getDate();
                    const targetDay = Math.min(now.getDate(), maxDays);
                    targetDate = new Date(
                        yearNum,
                        monthIndex,
                        targetDay,
                        now.getHours(),
                        now.getMinutes(),
                        now.getSeconds(),
                        now.getMilliseconds()
                    );
                    logger.info(`Resolved targetDate=${targetDate.toISOString()} for MONTH=${monthName} YEAR=${yearNum}`);
                }
            }
        }

        const count = await prisma.case.count();
        const fileNumber = `ZDM-${targetDate.getFullYear()}-${String(count + 1).padStart(3, '0')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
        // All cases start with null nextUpdate so the automation picks them up on the first cron run.
        const deadline = null;

        // 1. Handle Primary Client
        const client = await prisma.client.upsert({
            where: { idNumber: data.client.idNumber },
            update: data.client,
            create: {
                ...data.client,
                createdAt: targetDate
            }
        });

        // 2. Handle Joint Client if present
        let jointClientId: string | undefined = undefined;
        if (data.jointClient) {
            const joint = await prisma.client.upsert({
                where: { idNumber: data.jointClient.idNumber },
                update: data.jointClient,
                create: {
                    ...data.jointClient,
                    createdAt: targetDate
                }
            });
            jointClientId = joint.id;
        }

        // Auto-detect referrerId from the primary project if not explicitly provided.
        // When a sub-project IS a registered referral folder (has a linked Referrer record),
        // the case should be credited to that referrer even if the client didn't send referrerId.
        let resolvedReferrerId = data.referrerId ?? null;
        if (!resolvedReferrerId && data.projectId) {
            let currentProjectId: string | null = data.projectId;
            while (currentProjectId) {
                const projectReferrer = await prisma.referrer.findUnique({
                    where: { projectId: currentProjectId },
                    select: { id: true },
                });
                if (projectReferrer) {
                    resolvedReferrerId = projectReferrer.id;
                    logger.info(`Auto-detected referrerId=${resolvedReferrerId} from ancestor projectId=${currentProjectId}`);
                    break;
                }
                const project = await prisma.project.findUnique({
                    where: { id: currentProjectId },
                    select: { parentId: true },
                });
                currentProjectId = project?.parentId ?? null;
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
                // createdAt is back-dated to the case's month folder so month/year filters
                // and the timeline sidebar bucket it correctly. recordedAt is the true
                // insertion time, used for "latest referrals" ordering.
                createdAt: targetDate,
                recordedAt: new Date(),
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

        // Flag case if current debt counsellor is flagged
        try {
            await flagCaseIfFlaggedDC(newCase.id, prisma);
        } catch (flagErr) {
            logger.warn('Failed to check/flag B2B or loaded case DC (non-blocking):', flagErr);
        }

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
                clientWhatsApp:    client.whatsappNumber ?? client.phone ?? null,
                clientTelegram:    client.telegramNumber ?? null,
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

        // Auto-provision a Credo consumer profile for the client(s) so every B2B/staff
        // case has a portal login. Idempotent and never throws — cannot break case creation.
        // NOTE: do NOT email an activation invite here. The account is created without a
        // password; the consumer receives the "set your password" link only when they
        // request a password reset (requestPasswordReset / forgot-password flow).
        import('@zenowethu/shared-lib').then(({ provisionConsumerForClient }) => {
            provisionConsumerForClient(client.id).then(res => {
                if (res?.created) logger.info(`Credo profile provisioned for ${newCase.fileNumber} (client ${client.id})`);
            }).catch(err => logger.error(`Credo provisioning failed for ${newCase.id}:`, err));
            if (jointClientId) provisionConsumerForClient(jointClientId).catch(err => logger.error(`Credo provisioning failed for joint client on ${newCase.id}:`, err));
        }).catch(err => logger.error(`Credo provisioning import failed for ${newCase.id}:`, err));

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
