import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@zenowethu/database';

export async function POST() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const consumerId = session.user.id;

        const sub = await prisma.credoSubscription.create({
            data: {
                consumerId,
                planId: 'credo-premium',
                status: 'ACTIVE',
                providerRef: 'MOCK-PEACH-12345',
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            },
        });

        await prisma.consumerAccount.update({
            where: { id: consumerId },
            data: { activeSubscriptionId: sub.id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Upgrade error:', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
