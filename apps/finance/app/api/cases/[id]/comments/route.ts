import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger, CaseCommentCreateSchema, parseBody  } from '@zenowethu/shared-lib';
import { sendManualMessage } from '../../../../../lib/notifications/service';

// Parse @mentions from comment text - returns array of usernames
function parseMentions(text: string): string[] {
    const mentionRegex = /@(\w+(?:\.\w+)?)/g;
    const matches = text.match(mentionRegex);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.substring(1)))]; // Remove @ and deduplicate
}

// GET - Get all comments/activity for a case
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const [comments, workflowLogs] = await Promise.all([
            prisma.caseComment.findMany({
                where: { caseId: id },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true }
                    },
                    mentions: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' } }),
            prisma.workflowLog.findMany({
                where: { caseId: id },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true }
                    }
                },
                orderBy: { timestamp: 'desc' } })
        ]);

        // Map workflow logs to comment structure
        const activityLogs = workflowLogs.map(log => ({
            id: log.id,
            content: log.notes || log.action,
            activityType: log.action,
            activityData: null,
            createdAt: log.timestamp.toISOString(),
            user: log.user ? {
                id: log.user.id,
                firstName: log.user.firstName,
                lastName: log.user.lastName,
                email: log.user.email } : {
                id: 'system',
                firstName: 'System',
                lastName: 'Activity',
                email: 'system' },
            mentions: []
        }));

        // Merge and sort
        const allActivity = [...comments, ...activityLogs].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return NextResponse.json(allActivity);
    } catch (error) {
        logger.error('Error fetching comments:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Add a comment (with @mention support)
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
        const parsed = parseBody(CaseCommentCreateSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const { content, activityType, activityData, type, isInternal } = parsed.data;

        if (!content || content.trim() === '') {
            return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
        }

        // Get the case to verify it exists and get file number for notifications
        const caseData = await prisma.case.findUnique({
            where: { id },
            select: { id: true, fileNumber: true }
        });

        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Parse @mentions from the content
        const mentionedUsernames = parseMentions(content);

        // Find users by various matching strategies
        // Use a Map to ensure uniqueness by user ID
        const mentionedUsersMap = new Map<string, { id: string; email: string; emailNotificationsEnabled: boolean }>();

        if (mentionedUsernames.length > 0) {
            // 1. Fetch all users and groups for checking
            const [allUsers, allGroups] = await Promise.all([
                prisma.user.findMany({
                    select: { id: true, email: true, firstName: true, lastName: true, username: true, emailNotificationsEnabled: true }
                }),
                // @ts-ignore - UserGroup model exists but types might be stale
                prisma.userGroup.findMany({
                    include: { members: { include: { user: { select: { id: true, email: true, emailNotificationsEnabled: true } } } } }
                })
            ]);

            for (const mention of mentionedUsernames) {
                const mentionLower = mention.toLowerCase();

                // A. Check for Group Matches first
                // @ts-ignore
                const groupMatch = allGroups.find(g => g.name.toLowerCase().replace(/\s+/g, '') === mentionLower || g.name.toLowerCase() === mentionLower);
                if (groupMatch) {
                    // Add all group members
                    // @ts-ignore
                    groupMatch.members.forEach(m => {
                        mentionedUsersMap.set(m.user.id, m.user);
                    });
                }

                // B. Check for User Matches
                // @ts-ignore
                const userMatches = allUsers.filter(user => {
                    // Match exact username
                    if (user.username.toLowerCase() === mentionLower) return true;
                    // Match email
                    if (user.email.toLowerCase() === mentionLower) return true;
                    // Match email prefix
                    if (user.email.split('@')[0].toLowerCase() === mentionLower) return true;
                    // Match FirstLast
                    if (`${user.firstName}${user.lastName}`.toLowerCase() === mentionLower) return true;
                    // Match First.Last
                    if (`${user.firstName}.${user.lastName}`.toLowerCase() === mentionLower) return true;
                    // Match Firstname
                    if (user.firstName.toLowerCase() === mentionLower) return true;

                    return false;
                });

                // @ts-ignore
                userMatches.forEach(u => mentionedUsersMap.set(u.id, u));
            }
        }

        const mentionedUsers = Array.from(mentionedUsersMap.values());

        // Create comment with mentions
        const comment = await prisma.caseComment.create({
            data: {
                caseId: id,
                userId: session.user.id,
                content: content.trim(),
                type: type || 'NOTE',
                isInternal: isInternal === undefined ? true : isInternal,
                activityType: activityType || (type === 'JOURNAL' ? 'JOURNAL_ENTRY' : 'COMMENT'),
                activityData: activityData ? JSON.stringify(activityData) : null,
                mentions: {
                    create: mentionedUsers.map(user => ({
                        userId: user.id }))
                }
            },
            include: {
                user: {
                    select: { id: true, firstName: true, lastName: true, email: true }
                },
                mentions: {
                    include: {
                        user: { select: { id: true, firstName: true, lastName: true } }
                    }
                }
            }
        });

        // Create in-app notifications for mentioned users
        const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { firstName: true, lastName: true }
        });

        for (const user of mentionedUsers) {
            // Don't notify yourself
            if (user.id === session.user.id) continue;

            await prisma.inAppNotification.create({
                data: {
                    userId: user.id,
                    type: 'MENTION',
                    title: `${currentUser?.firstName} ${currentUser?.lastName} mentioned you`,
                    message: `You were mentioned in a comment on case ${caseData.fileNumber}`,
                    caseId: id,
                    commentId: comment.id,
                    linkUrl: `/cases/${id}` }
            });

            // Send email notification if user has it enabled
            if (user.emailNotificationsEnabled) {
                sendManualMessage(
                    id,
                    'EMAIL',
                    user.email,
                    `${currentUser?.firstName} ${currentUser?.lastName} mentioned you in a comment on case ${caseData.fileNumber}.`,
                    `You were mentioned in case ${caseData.fileNumber}`
                ).catch(err => logger.error(`[Comments] Failed to send mention email to ${user.email}:`, err));
            }
        }

        return NextResponse.json(comment, { status: 201 });
    } catch (error) {
        logger.error('Error creating comment:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

