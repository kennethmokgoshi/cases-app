import { redirect } from 'next/navigation';
import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { NotificationsClient, type NotificationWithCase } from '../../(authenticated)/notifications/NotificationsClient';

export const metadata = { title: 'Notifications' };

export default async function B2BNotificationsPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');

    const rawNotifications = await prisma.inAppNotification.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
    });

    const caseIds = [...new Set(rawNotifications.map(n => n.caseId).filter(Boolean))] as string[];

    const cases = caseIds.length > 0
        ? await prisma.case.findMany({
            where: { id: { in: caseIds } },
            select: {
                id: true,
                fileNumber: true,
                client: { select: { firstName: true, lastName: true } },
            },
        })
        : [];

    const caseMap = new Map(cases.map(c => [c.id, c]));

    const notifications: NotificationWithCase[] = rawNotifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        caseId: n.caseId,
        commentId: n.commentId,
        linkUrl: n.linkUrl,
        isRead: n.isRead,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
        case: n.caseId ? (caseMap.get(n.caseId) ?? null) : null,
    }));

    const totalUnread = notifications.filter(n => !n.isRead).length;

    return (
        <div>
            <NotificationsClient
                initialNotifications={notifications}
                totalUnread={totalUnread}
                baseCasePath="/b2b-dashboard/cases"
            />
        </div>
    );
}
