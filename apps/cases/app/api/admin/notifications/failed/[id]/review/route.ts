import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { logger } from '@zenowethu/shared-lib';
import { z } from 'zod';

const ReviewSchema = z.object({
    status: z.enum(['CANCELLED', 'SUCCESS']), // Allow marking as SUCCESS manually if handled outside
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await context.params;
        const body = await request.json();
        const parsed = ReviewSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
        }

        const queueItem = await prisma.notificationQueue.findUnique({
            where: { id }
        });

        if (!queueItem) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        if (queueItem.status === 'SUCCESS') {
            return NextResponse.json({ error: 'Already succeeded' }, { status: 400 });
        }

        await prisma.notificationQueue.update({
            where: { id },
            data: { status: parsed.data.status }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        logger.error('Failed to review notification', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
