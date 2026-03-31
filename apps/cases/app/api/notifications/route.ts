import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { NotificationReadSchema, parseBody } from '@/lib/schemas';
import { z } from 'zod';

const logger = createLogger('api/notifications');

// GET - Get all notifications for current user
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const unreadOnly = searchParams.get('unread') === 'true';
        const limit = parseInt(searchParams.get('limit') || '50');

        const notifications = await prisma.inAppNotification.findMany({
            where: {
                userId: session.user.id,
                ...(unreadOnly ? { isRead: false } : {}) },
            orderBy: { createdAt: 'desc' },
            take: limit });

        // Get unread count
        const unreadCount = await prisma.inAppNotification.count({
            where: {
                userId: session.user.id,
                isRead: false } });

        return NextResponse.json({
            notifications,
            unreadCount });
    } catch (error) {
        logger.error('Error fetching notifications:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Mark notifications as read
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = parseBody(NotificationReadSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data as z.infer<typeof NotificationReadSchema>;
        const { notificationIds, markAllRead } = body;

        if (markAllRead) {
            // Mark all as read
            await prisma.inAppNotification.updateMany({
                where: {
                    userId: session.user.id,
                    isRead: false },
                data: {
                    isRead: true,
                    readAt: new Date() } });
        } else if (notificationIds && Array.isArray(notificationIds)) {
            // Mark specific notifications as read
            await prisma.inAppNotification.updateMany({
                where: {
                    id: { in: notificationIds },
                    userId: session.user.id, // Security: only own notifications
                },
                data: {
                    isRead: true,
                    readAt: new Date() } });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error marking notifications as read:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete notifications
export async function DELETE(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const notificationId = searchParams.get('id');
        const deleteRead = searchParams.get('deleteRead') === 'true';

        if (deleteRead) {
            // Delete all read notifications
            const deleted = await prisma.inAppNotification.deleteMany({
                where: {
                    userId: session.user.id,
                    isRead: true } });
            return NextResponse.json({ success: true, deletedCount: deleted.count });
        } else if (notificationId) {
            // Delete single notification
            await prisma.inAppNotification.delete({
                where: {
                    id: notificationId,
                    userId: session.user.id, // Security: only own notifications
                } });
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Missing notification id or deleteRead flag' }, { status: 400 });
    } catch (error) {
        logger.error('Error deleting notifications:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


