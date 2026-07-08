import { auth } from '@zenowethu/shared-lib';
import { prisma, type PrismaClient } from '@zenowethu/database';
import bcrypt from 'bcryptjs';

export const REFERRER_PORTAL_DEFAULT_PASSWORD = 'Agent@1';

type ReferrerPortalUserSummary = {
    id: string;
    username: string;
    email: string;
    lastLogin: Date | null;
    isLocked: boolean;
};

export type ReferrerPortalProvisioningInput = {
    id: string;
    firstName: string;
    lastName: string;
    idNumber: string | null;
    cellNumber: string | null;
    portalUser?: ReferrerPortalUserSummary | null;
};

type ReferrerPortalProvisioningClient = Pick<PrismaClient, 'user' | 'referrer'>;

export type ReferrerPortalProvisioningResult = {
    portalEnabled: true;
    referrerId: string;
    user: ReferrerPortalUserSummary;
    defaultPassword: string | null;
    created: boolean;
};

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

function portalEmailForIdNumber(idNumber: string): string {
    return `referrer.${idNumber}@portal.zenowethu.local`;
}

export async function provisionReferrerPortalUser(
    referrer: ReferrerPortalProvisioningInput,
    db: ReferrerPortalProvisioningClient = prisma
): Promise<ReferrerPortalProvisioningResult> {
    if (!referrer.idNumber) {
        throw new Error('Referrer must have an ID number before portal access can be enabled');
    }

    if (referrer.portalUser) {
        return {
            portalEnabled: true,
            referrerId: referrer.id,
            user: referrer.portalUser,
            defaultPassword: null,
            created: false,
        };
    }

    const existingUser = await db.user.findUnique({
        where: { username: referrer.idNumber },
        select: { id: true, username: true, email: true, lastLogin: true, isLocked: true, userType: true },
    });

    if (existingUser) {
        if (existingUser.userType !== 'REFERRER') {
            throw new Error('A non-referrer user already exists with this ID number username');
        }

        const updatedReferrer = await db.referrer.update({
            where: { id: referrer.id },
            data: { portalUserId: existingUser.id },
            include: {
                portalUser: {
                    select: { id: true, username: true, email: true, lastLogin: true, isLocked: true },
                },
            },
        });

        if (!updatedReferrer.portalUser) {
            throw new Error('Failed to link existing referrer portal user');
        }

        return {
            portalEnabled: true,
            referrerId: referrer.id,
            user: updatedReferrer.portalUser,
            defaultPassword: null,
            created: false,
        };
    }

    const hashedPassword = await bcrypt.hash(REFERRER_PORTAL_DEFAULT_PASSWORD, 10);
    const user = await db.user.create({
        data: {
            username: referrer.idNumber,
            firstName: referrer.firstName,
            lastName: referrer.lastName,
            email: portalEmailForIdNumber(referrer.idNumber),
            password: hashedPassword,
            organization: 'Referrer Portal',
            role: 'MEMBER',
            isAdmin: false,
            userType: 'REFERRER',
            phone: referrer.cellNumber,
            idNumber: referrer.idNumber,
            emailNotificationsEnabled: false,
        },
        select: {
            id: true,
            username: true,
            email: true,
            lastLogin: true,
            isLocked: true,
        },
    });

    await db.referrer.update({
        where: { id: referrer.id },
        data: { portalUserId: user.id },
    });

    return {
        portalEnabled: true,
        referrerId: referrer.id,
        user,
        defaultPassword: REFERRER_PORTAL_DEFAULT_PASSWORD,
        created: true,
    };
}
