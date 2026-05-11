import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { calculateSlaDeadline, sendStatusChangeNotification, auth, createLogger } from '@zenowethu/shared-lib';
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
        const take = parseInt(searchParams.get('take') || '50');
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

        const where: any = {};
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

        // 2. Timeline filtering
        if (urlYear || urlMonth) {
            let timelineIds: string[] = [];
            if (urlYear && urlMonth) {
                timelineIds = allProjects.filter(p => (p.name || '').toLowerCase() === urlMonth.toLowerCase() && p.parentId && projectMap.get(p.parentId)?.name === urlYear).map(p => p.id);
            } else if (urlYear) {
                timelineIds = allProjects.filter(p => (p.name || '') === urlYear).map(p => p.id);
            }

            if (timelineIds.length > 0) {
                const timelineSet = new Set<string>();
                timelineIds.forEach(id => {
                    timelineSet.add(id);
                    getDescendantIds(id, childrenMap).forEach(d => timelineSet.add(d));
                });
                const timelineList = Array.from(timelineSet);
                if (where.projects?.some?.projectId?.in) {
                    const current = where.projects.some.projectId.in;
                    where.projects.some.projectId.in = timelineList.filter(id => current.includes(id));
                } else {
                    where.projects = { some: { projectId: { in: timelineList } } };
                }
            }
        }

        // 3. Status
        if (status && status !== 'ALL') where.status = status.includes(',') ? { in: status.split(',').map(s => s.trim()) } : status;

        // 4. Execution
        if (slim) {
            const data = await prisma.case.findMany({ where, select: { id: true, createdAt: true }, take: 1000, orderBy: { createdAt: 'desc' } });
            return NextResponse.json(data);
        }

        const cases = await prisma.case.findMany({
            where,
            include: { client: true, projects: { include: { project: true } } },
            take: isNaN(take) ? 50 : take,
            skip: isNaN(skip) ? 0 : skip,
            orderBy: { createdAt: 'desc' }
        });

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

        return new Response(json, { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    try {
        const session = await auth();
        const body = await request.json();
        const parsed = CaseCreateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
        const data = parsed.data;
        const count = await prisma.case.count();
        const fileNumber = `ZDM-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
        const deadline = calculateSlaDeadline(new Date());

        const newCase = await prisma.case.create({
            data: {
                fileNumber,
                status: 'NEW_LEAD',
                nextUpdate: deadline,
                acquisitionType: data.acquisitionType,
                partnerName: data.partnerName,
                partnerBranch: data.partnerBranch,
                partnerSplitPercent: data.partnerSplitPercent,
                createdById: session?.user?.id,
                clientId: (await prisma.client.upsert({
                    where: { idNumber: data.client.idNumber },
                    update: data.client,
                    create: data.client
                })).id,
                projects: {
                    create: [
                        { projectId: data.projectId, isPrimary: true },
                        ...(data.secondaryProjectIds || []).map(id => ({ projectId: id, isPrimary: false }))
                    ]
                }
            }
        });
        return NextResponse.json(newCase);
    } catch (err: any) {
        return NextResponse.json({ error: 'Internal Server Error', message: err?.message }, { status: 500 });
    }
}
