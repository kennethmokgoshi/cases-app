import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { canAccessReferrer } from '@/lib/referrer-access';
import { provisionReferrerPortalUser } from '@/lib/referrer-portal-access';

const logger = createLogger('api/admin/referrers/[id]/portal-access');

function isAdminLevel(session: { user: { isAdmin?: boolean; isExecutive?: boolean; isSeniorManager?: boolean; role?: string } }) {
    return session.user.isAdmin || session.user.isExecutive || session.user.isSeniorManager || session.user.role === 'MANAGER';
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!isAdminLevel(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { id } = await params;
        const referrer = await prisma.referrer.findUnique({
            where: { id },
            include: {
                portalUser: {
                    select: { id: true, username: true, email: true, lastLogin: true, isLocked: true },
                },
            },
        });

        if (!referrer) return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });

        // Non-admins may only manage portal access for referrers whose sub-project they belong to
        if (!(await canAccessReferrer(session.user, referrer.projectId))) {
            return NextResponse.json({ error: 'Forbidden — you are not a member of this referrer' }, { status: 403 });
        }

        try {
            const result = await provisionReferrerPortalUser(referrer);
            return NextResponse.json({
                ...result,
                temporaryPassword: result.defaultPassword,
            }, { status: result.created ? 201 : 200 });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to enable portal access';
            if (message.includes('ID number')) {
                return NextResponse.json({ error: message }, { status: 422 });
            }
            if (message.includes('non-referrer user')) {
                return NextResponse.json({ error: message }, { status: 409 });
            }
            throw error;
        }
    } catch (error) {
        logger.error('Failed to enable referrer portal access', error);
        return NextResponse.json({ error: 'Failed to enable portal access' }, { status: 500 });
    }
}
