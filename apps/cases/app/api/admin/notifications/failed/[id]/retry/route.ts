import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger, executeNotificationRetry } from '@zenowethu/shared-lib';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await context.params;

        const queueItem = await prisma.notificationQueue.findUnique({
            where: { id }
        });

        if (!queueItem) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        if (queueItem.status === 'SUCCESS') {
            return NextResponse.json({ error: 'Already succeeded' }, { status: 400 });
        }

        const res = await executeNotificationRetry(id);

        if (res.smsSuccess || res.emailSuccess || res.whatsappSuccess) {
            return NextResponse.json({ success: true, message: 'Retry successful' });
        } else {
            return NextResponse.json({ success: false, error: res.errors.join(', ') }, { status: 500 });
        }
    } catch (error: any) {
        logger.error('Failed to retry notification', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
