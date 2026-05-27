/**
 * GET    /api/leads/[id]  — single lead
 * PATCH  /api/leads/[id]  — update status / notes / assignee
 */

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { LeadPatchSchema } from '@/lib/schemas';

const logger = createLogger('api/leads/[id]');

type RouteCtx = { params: Promise<{ id: string }> };

function isStaff(user: { isAdmin?: boolean; isExecutive?: boolean; isSeniorManager?: boolean; isManager?: boolean; role?: string; userType?: string }) {
    return (
        user.isAdmin || user.isExecutive || user.isSeniorManager || user.isManager ||
        user.role === 'STAFF' || user.userType === 'STAFF'
    );
}

export async function GET(_req: Request, { params }: RouteCtx) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!isStaff(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const lead = await prisma.lead.findUnique({
            where: { id },
            include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
        });
        if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

        return NextResponse.json({ lead });
    } catch (error) {
        logger.error('[leads/[id]] GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: RouteCtx) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!isStaff(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await request.json().catch(() => ({}));
        const parsed = LeadPatchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
                { status: 422 },
            );
        }

        const lead = await prisma.lead.findUnique({ where: { id } });
        if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

        const updated = await prisma.lead.update({
            where: { id },
            data:  {
                ...(parsed.data.status       !== undefined && { status:       parsed.data.status }),
                ...(parsed.data.notes        !== undefined && { notes:        parsed.data.notes }),
                ...(parsed.data.assignedToId !== undefined && {
                    assignedTo: parsed.data.assignedToId
                        ? { connect: { id: parsed.data.assignedToId } }
                        : { disconnect: true },
                }),
            },
            include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
        });

        logger.info(`[leads/[id]] Updated lead ${id} — status: ${updated.status}`);

        return NextResponse.json({ lead: updated });
    } catch (error) {
        logger.error('[leads/[id]] PATCH error:', error);
        return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }
}
