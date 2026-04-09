import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger, sendManualMessage } from '@zenowethu/shared-lib';
import { CaseFollowSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/follow');

// GET - Get follow status and preferences for current user
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const follower = await (prisma as any).caseFollower.findUnique({
            where: { caseId_userId: { caseId: id, userId: session.user.id } }
        });

        return NextResponse.json({
            isFollowing: !!follower,
            inAppNotifications: follower?.inAppNotifications ?? true,
            emailNotifications: follower?.emailNotifications ?? false
        });
    } catch (error) {
        logger.error('Error getting follow status:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Follow a case
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const parsed = parseBody(CaseFollowSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const { inAppNotifications, emailNotifications } = parsed.data as z.infer<typeof CaseFollowSchema>;

        // Verify case exists
        const caseData = await prisma.case.findUnique({
            where: { id },
            select: { id: true, fileNumber: true }
        });
        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const follower = await (prisma as any).caseFollower.upsert({
            where: { caseId_userId: { caseId: id, userId: session.user.id } },
            create: {
                caseId: id,
                userId: session.user.id,
                inAppNotifications: inAppNotifications ?? true,
                emailNotifications: emailNotifications ?? false
            },
            update: {
                inAppNotifications: inAppNotifications ?? true,
                emailNotifications: emailNotifications ?? false
            }
        });

        return NextResponse.json({
            isFollowing: true,
            inAppNotifications: follower.inAppNotifications,
            emailNotifications: follower.emailNotifications
        });
    } catch (error) {
        logger.error('Error following case:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH - Update notification preferences while staying followed
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const parsed = parseBody(CaseFollowSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const { inAppNotifications, emailNotifications } = parsed.data as z.infer<typeof CaseFollowSchema>;

        const existing = await (prisma as any).caseFollower.findUnique({
            where: { caseId_userId: { caseId: id, userId: session.user.id } }
        });
        if (!existing) {
            return NextResponse.json({ error: 'Not following this case' }, { status: 404 });
        }

        const updated = await (prisma as any).caseFollower.update({
            where: { caseId_userId: { caseId: id, userId: session.user.id } },
            data: {
                inAppNotifications: inAppNotifications ?? existing.inAppNotifications,
                emailNotifications: emailNotifications ?? existing.emailNotifications
            }
        });

        return NextResponse.json({
            isFollowing: true,
            inAppNotifications: updated.inAppNotifications,
            emailNotifications: updated.emailNotifications
        });
    } catch (error) {
        logger.error('Error updating follow preferences:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Unfollow a case
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        await (prisma as any).caseFollower.deleteMany({
            where: { caseId: id, userId: session.user.id }
        });

        return NextResponse.json({ isFollowing: false });
    } catch (error) {
        logger.error('Error unfollowing case:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
