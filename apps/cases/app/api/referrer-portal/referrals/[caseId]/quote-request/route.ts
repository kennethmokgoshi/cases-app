import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, touchCaseAction } from '@zenowethu/shared-lib';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { toPortalComment, REFERRER_COMMENT_TYPE } from '@/lib/referrer-portal';

const logger = createLogger('api/referrer-portal/referrals/quote-request');

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const { caseId } = await params;

        // Verify case exists and belongs to this referrer (must not be soft-deleted)
        const referralCase = await prisma.case.findFirst({
            where: { id: caseId, referrerId: access.referrer.id, deletedAt: null },
            select: { id: true, fileNumber: true, assignedToId: true },
        });

        if (!referralCase) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });

        // Create case comment indicating a quote request
        const commentContent = `[SYSTEM AUTO-MESSAGE] [QUOTE REQUEST] Referrer requested a quote for this case.`;
        const comment = await prisma.caseComment.create({
            data: {
                caseId,
                userId: access.sessionUserId,
                content: commentContent,
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

        await touchCaseAction(caseId, 'COMMENT', { userId: access.sessionUserId });

        // Notify assigned staff user if any
        if (referralCase.assignedToId) {
            await prisma.inAppNotification.create({
                data: {
                    userId: referralCase.assignedToId,
                    type: 'REFERRER_QUOTE_REQUEST',
                    title: `Quote requested on ${referralCase.fileNumber}`,
                    message: `${access.referrer.firstName} ${access.referrer.lastName} is asking for a quote on this case.`,
                    caseId,
                    commentId: comment.id,
                    linkUrl: `/cases/${caseId}`,
                },
            }).catch((err: unknown) => logger.error('Failed to notify staff of quote request', err));
        }

        return NextResponse.json({
            success: true,
            comment: toPortalComment(comment),
        }, { status: 201 });
    } catch (error) {
        logger.error('Failed to request quote', error);
        return NextResponse.json({ error: 'Failed to request quote' }, { status: 500 });
    }
}
