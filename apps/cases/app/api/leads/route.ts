/**
 * GET /api/leads   — paginated lead list with status/search filters (staff only)
 */

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/leads');

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const isStaff =
            session.user.isAdmin ||
            session.user.isExecutive ||
            session.user.isSeniorManager ||
            session.user.isManager ||
            session.user.role === 'STAFF' ||
            session.user.userType === 'STAFF';
        if (!isStaff) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const status  = searchParams.get('status') || '';
        const search  = searchParams.get('search') || '';
        const page    = Math.max(1, parseInt(searchParams.get('page')  || '1',  10));
        const limit   = Math.min(100, parseInt(searchParams.get('limit') || '50', 10));
        const skip    = (page - 1) * limit;

        const where: Record<string, unknown> = {};

        if (status && status !== 'ALL') {
            where.status = status;
        }

        if (search.trim()) {
            const s = search.trim();
            where.OR = [
                { firstName: { contains: s, mode: 'insensitive' } },
                { lastName:  { contains: s, mode: 'insensitive' } },
                { phone:     { contains: s, mode: 'insensitive' } },
                { email:     { contains: s, mode: 'insensitive' } },
                { idNumber:  { contains: s, mode: 'insensitive' } },
            ];
        }

        const [leads, total] = await Promise.all([
            prisma.lead.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    assignedTo: { select: { id: true, firstName: true, lastName: true } },
                },
            }),
            prisma.lead.count({ where }),
        ]);

        // Status counts for filter pills
        const statusCounts = await prisma.lead.groupBy({
            by: ['status'],
            _count: { _all: true },
        });
        const counts: Record<string, number> = {};
        for (const row of statusCounts) {
            counts[row.status] = row._count._all;
        }

        logger.info(`[leads] Listed ${leads.length}/${total} leads (page ${page})`);

        return NextResponse.json({
            leads,
            meta: { total, page, limit, pages: Math.ceil(total / limit) },
            counts,
        });
    } catch (error) {
        logger.error('[leads] GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    }
}
