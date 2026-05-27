import { prisma } from '@zenowethu/database';

export async function getConsumerSubscription(consumerId: string) {
    const account = await prisma.consumerAccount.findUnique({
        where: { id: consumerId },
        include: { activeSubscription: true },
    });

    if (!account) return { isPremium: false, subscription: null };

    const sub = account.activeSubscription;
    const isPremium = sub?.status === 'ACTIVE' || sub?.status === 'TRIALING';

    return {
        isPremium,
        subscription: sub,
    };
}
