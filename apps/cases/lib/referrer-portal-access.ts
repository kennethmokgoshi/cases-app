import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

export type ReferrerPortalAccessResult =
    | { ok: true; sessionUserId: string; referrer: { id: string; firstName: string; lastName: string } }
    | { ok: false; status: 401 | 403; error: string };

export async function getCurrentReferrerPortalAccess(): Promise<ReferrerPortalAccessResult> {
    const session = await auth();

    if (!session?.user?.id) {
        return { ok: false, status: 401, error: 'Unauthorized' };
    }

    const referrer = await prisma.referrer.findFirst({
        where: {
            portalUserId: session.user.id,
            isActive: true,
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
        },
    });

    if (!referrer) {
        return { ok: false, status: 403, error: 'No active referrer portal profile is linked to this user' };
    }

    return {
        ok: true,
        sessionUserId: session.user.id,
        referrer,
    };
}
