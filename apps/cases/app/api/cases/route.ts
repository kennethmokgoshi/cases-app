import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { calculateSlaDeadline, sendStatusChangeNotification, auth, createLogger } from '@zenowethu/shared-lib';
import { CaseCreateSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

const logger = createLogger('api/cases');

// Types for hierarchy
type ProjectNode = { id: string; name: string; parentId: string | null; type: string };

/**
 * Robust Project Hierarchy Helpers
 */
function buildChildrenMap(projects: ProjectNode[]) {
    const map = new Map<string, string[]>();
    for (const p of projects) {
        if (p.parentId) {
            const list = map.get(p.parentId) || [];
            list.push(p.id);
            map.set(p.parentId, list);
        }
    }
    return map;
}

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

function buildFullPath(projectId: string, projectMap: Map<string, ProjectNode>): string {
    let curr = projectMap.get(projectId);
    if (!curr) return 'Unknown Project';

    const path: string[] = [];
    const seen = new Set<string>();
    
    while (curr && !seen.has(curr.id)) {
        seen.add(curr.id);
        if (curr.type !== 'ROOT') {
            let name = curr.name;
            // Clean common noise
            if (name === 'Letsatsi Referrals') name = 'Letsatsi';
            name = name.replace(/My Cases\s*-?\s*/gi, '').trim();
            if (name) path.unshift(name);
        }
        curr = curr.parentId ? projectMap.get(curr.parentId) : undefined;
    }
    
    return path.join(' › ');
}

export async function GET(request: Request) {
    // DIAGNOSTIC TEST: If this returns, the API itself is reachable
    const { searchParams: diagnosticParams } = new URL(request.url);
    if (diagnosticParams.get('diag') === 'true') {
        return NextResponse.json({ status: 'ok', message: 'API is reachable' });
    }

    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const slim = searchParams.get('slim') === 'true';
        const projectId = searchParams.get('projectId');
        const urlYear = searchParams.get('year');
        const urlMonth = searchParams.get('month');
        const status = searchParams.get('status');
        const take = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;
        const skip = searchParams.get('skip') ? parseInt(searchParams.get('skip')!) : undefined;

        // Load hierarchy data once
        const allProjects = await prisma.project.findMany({
            select: { id: true, name: true, parentId: true, type: true }
        });
        const projectMap = new Map(allProjects.map(p => [p.id, p]));
        const childrenMap = buildChildrenMap(allProjects);

        const userRole = session.user.role?.toUpperCase();
        const isAdmin = session.user.isAdmin === true || userRole === 'ADMIN';
        const isStaff = session.user.userType === 'STAFF';
        const isRestricted = !isAdmin && !isStaff;

        const where: any = {};

        // Security: Restrict non-admins from admin-only cases
        if (!isAdmin) {
            where.isAdminOnly = false;
        }

        // Security: Project-based scoping for B2B/Restricted users
        if (isRestricted) {
            const memberships = await prisma.projectMember.findMany({
                where: { userId: session.user.id },
                select: { projectId: true }
            });
            const rootAllowed = memberships.map(m => m.projectId);
            if (session.user.b2bPartnerId && !rootAllowed.includes(session.user.b2bPartnerId)) {
                rootAllowed.push(session.user.b2bPartnerId);
            }

            if (rootAllowed.length === 0) {
                where.createdById = session.user.id;
            } else {
                const allAllowed = new Set<string>();
                rootAllowed.forEach(id => {
                    allAllowed.add(id);
                    getDescendantIds(id, childrenMap).forEach(d => allAllowed.add(d));
                });
                
                const allowedList = Array.from(allAllowed);
                
                if (projectId) {
                    if (!allowedList.includes(projectId)) {
                        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                    }
                    const scope = [projectId, ...getDescendantIds(projectId, childrenMap)];
                    where.projects = { some: { projectId: { in: scope.filter(id => allowedList.includes(id)) } } };
                } else {
                    where.projects = { some: { projectId: { in: allowedList } } };
                }
            }
        } else if (projectId) {
            const scope = [projectId, ...getDescendantIds(projectId, childrenMap)];
            where.projects = { some: { projectId: { in: scope } } };
        }

        // Timeline intersection logic
        if (urlYear || urlMonth) {
            let timelineIds: string[] = [];
            if (urlYear && urlMonth) {
                timelineIds = allProjects
                    .filter(p => {
                        const pName = p.name || '';
                        if (pName.toLowerCase() !== urlMonth.toLowerCase()) return false;
                        if (!p.parentId) return false;
                        const parent = projectMap.get(p.parentId);
                        return parent?.name === urlYear;
                    })
                    .map(p => p.id);
            } else if (urlYear) {
                timelineIds = allProjects
                    .filter(p => {
                        const pName = p.name || '';
                        return pName === urlYear && (p.type === 'YEAR' || !isNaN(Number(pName)));
                    })
                    .map(p => p.id);
            }

            if (timelineIds.length > 0) {
                const timelineSet = new Set<string>();
                timelineIds.forEach(id => {
                    timelineSet.add(id);
                    getDescendantIds(id, childrenMap).forEach(d => timelineSet.add(d));
                });
                
                const timelineList = Array.from(timelineSet);
                
                // Intersect with existing project filter
                if (where.projects?.some?.projectId?.in) {
                    const currentIn = where.projects.some.projectId.in;
                    where.projects.some.projectId.in = timelineList.filter(id => currentIn.includes(id));
                } else {
                    where.projects = { some: { projectId: { in: timelineList } } };
                }
            }
        }

        // Status filter
        if (status && status !== 'ALL') {
            where.status = status.includes(',') 
                ? { in: status.split(',').map(s => s.trim()) } 
                : status;
        }

        // Search
        const search = searchParams.get('search');
        if (search) {
            const term = search.toLowerCase();
            where.OR = [
                { fileNumber: { contains: term, mode: 'insensitive' } },
                { client: { OR: [
                    { firstName: { contains: term, mode: 'insensitive' } },
                    { lastName: { contains: term, mode: 'insensitive' } },
                    { idNumber: { contains: term } }
                ]}}
            ];
        }

        if (slim) {
            const data = await prisma.case.findMany({ 
                where, select: { id: true, createdAt: true }, take, skip, orderBy: { createdAt: 'desc' } 
            });
            return NextResponse.json(data);
        }

        const cases = await prisma.case.findMany({
            where,
            include: {
                client: true,
                jointClient: true,
                projects: { include: { project: true } }
            },
            take,
            skip,
            orderBy: { updatedAt: 'desc' }
        });

        const enriched = cases.map(c => {
            try {
                return {
                    ...c,
                    projects: (c.projects || []).map((cp: any) => {
                        try {
                            const pData = cp?.project || {};
                            return {
                                ...cp,
                                project: {
                                    ...pData,
                                    fullPath: cp?.projectId ? buildFullPath(cp.projectId, projectMap) : 'Unknown Project'
                                }
                            };
                        } catch (e) {
                            return cp;
                        }
                    })
                };
            } catch (e) {
                return c;
            }
        });

        // Manual serialization to handle Decimals/BigInts which often crash NextResponse.json
        const json = JSON.stringify(enriched, (key, value) => 
            typeof value === 'bigint' ? value.toString() : 
            (value && value.constructor && value.constructor.name === 'Decimal') ? value.toString() : 
            value
        );

        return new Response(json, { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });
    } catch (err: any) {
        const errorDetail = {
            message: err?.message || 'No message',
            stack: err?.stack || 'No stack',
            name: err?.name || 'UnknownError',
            timestamp: new Date().toISOString(),
            url: request.url
        };
        
        // Log to terminal
        logger.error('[API] GET Cases Critical Failure:', errorDetail);

        // ATTEMPT TO WRITE TO A DEBUG FILE
        try {
            const fs = require('fs');
            const path = require('path');
            const debugPath = path.join(process.cwd(), 'api-debug-error.log');
            fs.appendFileSync(debugPath, JSON.stringify(errorDetail, null, 2) + '\n---\n');
        } catch (e) {
            // Ignore fs errors
        }

        return new Response(JSON.stringify({ error: err.message || 'Internal Server Error', _debug: errorDetail }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        const currentUserId = session?.user?.id;
        const body = await request.json();
        
        const parsed = CaseCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
        }

        const data = parsed.data;
        
        // Simple file number generation for now to avoid complexity in this stabilization phase
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
                createdById: currentUserId,
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
        logger.error('[API] POST Case Failed:', err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
