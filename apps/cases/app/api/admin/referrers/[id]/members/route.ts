import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { canAccessReferrer } from '@/lib/referrer-access';

const logger = createLogger('api/admin/referrers/[id]/members');

const PutSchema = z.object({
    userIds: z.array(z.string().min(1)).max(100),
});

function isAdminLevel(session: { user: { isAdmin?: boolean; isExecutive?: boolean; isSeniorManager?: boolean; role?: string } }) {
    return session.user.isAdmin || session.user.isExecutive || session.user.isSeniorManager || session.user.role === 'MANAGER';
}

// GET /api/admin/referrers/[id]/members
// Lists the staff members of the referrer's sub-project. Membership is what
// grants visibility of this referrer to non-admin staff.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!isAdminLevel(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const referrer = await prisma.referrer.findUnique({
            where: { id },
            select: { id: true, projectId: true },
        });
        if (!referrer) return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });

        if (!(await canAccessReferrer(session.user, referrer.projectId))) {
            return NextResponse.json({ error: 'Forbidden — you are not a member of this referrer' }, { status: 403 });
        }

        if (!referrer.projectId) {
            return NextResponse.json({ members: [] });
        }

        const members = await prisma.projectMember.findMany({
            where: { projectId: referrer.projectId },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            },
            orderBy: { assignedAt: 'asc' },
        });

        return NextResponse.json({ members });
    } catch (error) {
        logger.error('Error fetching referrer members:', error);
        return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }
}

// PUT /api/admin/referrers/[id]/members — replace the member set (Admin/Executive only)
// Members are created directly on the referrer sub-project without syncing up
// to ancestor projects: membership of one referrer must never grant visibility
// of the whole Referrals tree.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!session.user.isAdmin && !session.user.isExecutive) {
            return NextResponse.json({ error: 'Forbidden — only Admin or Executive can manage referrer members' }, { status: 403 });
        }

        const referrer = await prisma.referrer.findUnique({
            where: { id },
            select: { id: true, projectId: true, firstName: true, lastName: true },
        });
        if (!referrer) return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });
        if (!referrer.projectId) {
            return NextResponse.json({ error: 'This referrer has no linked sub-project, so members cannot be assigned' }, { status: 422 });
        }
        const projectId = referrer.projectId;

        const parsed = PutSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }
        const userIds = Array.from(new Set(parsed.data.userIds));

        // Only internal staff accounts can be referrer members
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, userType: true },
        });
        if (users.length !== userIds.length) {
            return NextResponse.json({ error: 'One or more selected users do not exist' }, { status: 422 });
        }
        const nonStaff = users.filter((u) => u.userType !== 'STAFF');
        if (nonStaff.length > 0) {
            return NextResponse.json({ error: 'Only staff users can be members of a referrer' }, { status: 422 });
        }

        const members = await prisma.$transaction(async (tx) => {
            const existing = await tx.projectMember.findMany({
                where: { projectId },
                select: { userId: true, role: true },
            });
            const existingRoles = new Map(existing.map((m) => [m.userId, m.role]));

            await tx.projectMember.deleteMany({ where: { projectId } });
            if (userIds.length > 0) {
                await tx.projectMember.createMany({
                    data: userIds.map((userId) => ({
                        projectId,
                        userId,
                        // Preserve the role of retained members; new ones join as MEMBER
                        role: existingRoles.get(userId) ?? 'MEMBER',
                    })),
                });
            }

            return tx.projectMember.findMany({
                where: { projectId },
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                },
                orderBy: { assignedAt: 'asc' },
            });
        });

        logger.info(`Referrer ${id} (${referrer.firstName} ${referrer.lastName}) members updated by ${session.user.id}: ${userIds.length} member(s)`);
        return NextResponse.json({ members });
    } catch (error) {
        logger.error('Error updating referrer members:', error);
        return NextResponse.json({ error: 'Failed to update members' }, { status: 500 });
    }
}
