import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, touchCaseAction } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { toPortalComment, REFERRER_COMMENT_TYPE } from '@/lib/referrer-portal';

const logger = createLogger('api/referrer-portal/referrals/[caseId]/comments');

const ReferrerCommentSchema = z.object({
    message: z.string().trim().min(2, 'Message is too short').max(4000),
});

// GET - The referrer<->staff discussion thread for one referral
export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const { caseId } = await params;

        const referralCase = await prisma.case.findFirst({
            where: { id: caseId, referrerId: access.referrer.id },
            select: { id: true },
        });
        if (!referralCase) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });

        const comments = await prisma.caseComment.findMany({
            where: { caseId: referralCase.id, type: REFERRER_COMMENT_TYPE },
            select: {
                id: true,
                content: true,
                createdAt: true,
                user: { select: { firstName: true, lastName: true, userType: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        return NextResponse.json({ comments: comments.map(toPortalComment) });
    } catch (error) {
        logger.error('Failed to load referrer case comments', error);
        return NextResponse.json({ error: 'Failed to load comments' }, { status: 500 });
    }
}

// POST - Referrer asks a question / comments on their referral. Staff see it
// in the case activity feed and can reply in referrer mode.
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const parsed = ReferrerCommentSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid comment', details: parsed.error.flatten() }, { status: 422 });
        }

        const { caseId } = await params;

        const referralCase = await prisma.case.findFirst({
            where: { id: caseId, referrerId: access.referrer.id },
            select: { id: true, fileNumber: true, assignedToId: true },
        });
        if (!referralCase) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });

        const comment = await prisma.caseComment.create({
            data: {
                caseId: referralCase.id,
                userId: access.sessionUserId,
                content: parsed.data.message,
                type: REFERRER_COMMENT_TYPE,
                isInternal: false,
                activityType: 'REFERRER_COMMENT',
            },
            select: {
                id: true,
                content: true,
                createdAt: true,
                user: { select: { firstName: true, lastName: true, userType: true } },
            },
        });

        await touchCaseAction(referralCase.id, 'COMMENT', { userId: access.sessionUserId });

        // Alert the assigned case manager so referrer questions do not go unseen
        if (referralCase.assignedToId) {
            await prisma.inAppNotification.create({
                data: {
                    userId: referralCase.assignedToId,
                    type: 'REFERRER_COMMENT',
                    title: `Referrer comment on ${referralCase.fileNumber}`,
                    message: `${access.referrer.firstName} ${access.referrer.lastName}: ${parsed.data.message.slice(0, 140)}`,
                    caseId: referralCase.id,
                    commentId: comment.id,
                    linkUrl: `/cases/${referralCase.id}`,
                },
            }).catch((error: unknown) => logger.error('Failed to notify assignee of referrer comment', error));
        }

        return NextResponse.json({ comment: toPortalComment(comment) }, { status: 201 });
    } catch (error) {
        logger.error('Failed to create referrer case comment', error);
        return NextResponse.json({ error: 'Failed to submit comment' }, { status: 500 });
    }
}
