import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger, WORKFLOW_STATUSES } from '@zenowethu/shared-lib';
import * as XLSX from 'xlsx';

// Returns the start of the current Sat–Fri week in UTC, accounting for SAST (UTC+2).
export function getWeekStart(): Date {
    const nowLocal = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const dayOfWeek = nowLocal.getUTCDay(); // 0=Sun … 6=Sat
    const daysSinceSaturday = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
    const boundary = new Date(Date.now() - daysSinceSaturday * 24 * 60 * 60 * 1000);
    boundary.setUTCHours(0, 0, 0, 0);
    // Shift back by 2 h so midnight SAST = 22:00 UTC previous day
    return new Date(boundary.getTime() - 2 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const userType = session.user.userType;
        const isAdmin = session.user.isAdmin === true || session.user.role?.toUpperCase() === 'ADMIN';
        const isStaff = userType === 'STAFF';
        const isRestricted = !isAdmin && !isStaff;

        // Same project-scoping logic as the stats route
        let projectWhere: Record<string, unknown> = {};

        if (isRestricted) {
            const memberships = await prisma.projectMember.findMany({
                where: { userId },
                select: { projectId: true },
            });
            const rootProjectIds = memberships.map((m) => m.projectId);

            if (session.user.b2bPartnerId && !rootProjectIds.includes(session.user.b2bPartnerId)) {
                rootProjectIds.push(session.user.b2bPartnerId);
            }

            if (rootProjectIds.length === 0) {
                projectWhere = { createdById: userId };
            } else {
                const allProjects = await prisma.project.findMany({
                    select: { id: true, parentId: true },
                });
                const childrenMap = new Map<string, string[]>();
                for (const p of allProjects) {
                    if (p.parentId) {
                        const list = childrenMap.get(p.parentId) || [];
                        list.push(p.id);
                        childrenMap.set(p.parentId, list);
                    }
                }
                const effectiveIds = new Set<string>(rootProjectIds);
                const queue = [...rootProjectIds];
                while (queue.length > 0) {
                    const curr = queue.shift()!;
                    for (const child of childrenMap.get(curr) || []) {
                        if (!effectiveIds.has(child)) {
                            effectiveIds.add(child);
                            queue.push(child);
                        }
                    }
                }
                projectWhere = { projects: { some: { projectId: { in: Array.from(effectiveIds) } } } };
            }
        }

        const completedCodes = WORKFLOW_STATUSES
            .filter(s => s.category === 'COMPLETED' || s.category === 'SETTLED')
            .map(s => s.code);

        const weekStart = getWeekStart();

        const cases = await prisma.case.findMany({
            where: {
                ...projectWhere,
                status: { in: completedCodes },
                updatedAt: { gte: weekStart },
            },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                updatedAt: true,
                createdAt: true,
                client: {
                    select: {
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                        phone: true,
                        email: true,
                    },
                },
                projects: {
                    select: {
                        project: { select: { name: true } },
                    },
                    take: 1,
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const { searchParams } = new URL(request.url);
        const format = searchParams.get('format');

        const rows = cases.map((c) => ({
            fileNumber: c.fileNumber,
            clientName: `${c.client.firstName} ${c.client.lastName}`,
            idNumber: c.client.idNumber || '',
            phone: c.client.phone || '',
            email: c.client.email || '',
            status: c.status.replace(/_/g, ' '),
            completedAt: c.updatedAt.toISOString(),
            project: c.projects[0]?.project.name || '',
        }));

        if (format === 'xlsx') {
            const weekStartDate = weekStart.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
            const today = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

            const sheetData = rows.map((r) => ({
                'File Number': r.fileNumber,
                'Client Name': r.clientName,
                'ID Number': r.idNumber,
                'Phone': r.phone,
                'Email': r.email,
                'Status': r.status,
                'Completed Date': new Date(r.completedAt).toLocaleDateString('en-ZA', {
                    day: 'numeric', month: 'short', year: 'numeric',
                }),
                'Project / Group': r.project,
            }));

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(sheetData);

            // Column widths
            ws['!cols'] = [
                { wch: 14 }, { wch: 28 }, { wch: 16 }, { wch: 16 },
                { wch: 30 }, { wch: 22 }, { wch: 18 }, { wch: 30 },
            ];

            XLSX.utils.book_append_sheet(wb, ws, 'Completed This Week');
            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            const filename = `completed-this-week-${today.replace(/ /g, '-')}.xlsx`;
            return new NextResponse(buffer, {
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                },
            });
        }

        return NextResponse.json({ cases: rows, weekStart: weekStart.toISOString() });
    } catch (error) {
        logger.error('[b2b-dashboard/completed-this-week] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
