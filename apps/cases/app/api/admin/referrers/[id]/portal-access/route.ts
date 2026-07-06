import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { canAccessReferrer } from '@/lib/referrer-access';

const logger = createLogger('api/admin/referrers/[id]/portal-access');

function isAdminLevel(session: { user: { isAdmin?: boolean; isExecutive?: boolean; isSeniorManager?: boolean; role?: string } }) {
    return session.user.isAdmin || session.user.isExecutive || session.user.isSeniorManager || session.user.role === 'MANAGER';
}

function generateTemporaryPassword(): string {
    return `Zeno-${randomBytes(9).toString('base64url')}`;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!isAdminLevel(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { id } = await params;
        const referrer = await prisma.referrer.findUnique({
            where: { id },
            include: {
                portalUser: {
                    select: { id: true, email: true, lastLogin: true, isLocked: true },
                },
            },
        });

        if (!referrer) return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });

        // Non-admins may only manage portal access for referrers whose sub-project they belong to
        if (!(await canAccessReferrer(session.user, referrer.projectId))) {
            return NextResponse.json({ error: 'Forbidden — you are not a member of this referrer' }, { status: 403 });
        }

        if (referrer.portalUser) {
            return NextResponse.json({
                portalEnabled: true,
                referrerId: referrer.id,
                user: referrer.portalUser,
                temporaryPassword: null,
            });
        }

        if (!referrer.email) {
            return NextResponse.json({ error: 'Referrer must have an email address before portal access can be enabled' }, { status: 422 });
        }

        const email = referrer.email.toLowerCase();
        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, userType: true },
        });

        if (existingUser) {
            if (existingUser.userType !== 'REFERRER') {
                return NextResponse.json({ error: 'A non-referrer user already exists with this email address' }, { status: 409 });
            }

            const updatedReferrer = await prisma.referrer.update({
                where: { id: referrer.id },
                data: { portalUserId: existingUser.id },
                include: { portalUser: { select: { id: true, email: true, lastLogin: true, isLocked: true } } },
            });

            return NextResponse.json({
                portalEnabled: true,
                referrerId: updatedReferrer.id,
                user: updatedReferrer.portalUser,
                temporaryPassword: null,
            });
        }

        const temporaryPassword = generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

        const user = await prisma.user.create({
            data: {
                username: email,
                firstName: referrer.firstName,
                lastName: referrer.lastName,
                email,
                password: hashedPassword,
                organization: 'Referrer Portal',
                role: 'MEMBER',
                isAdmin: false,
                userType: 'REFERRER',
                phone: referrer.cellNumber,
                idNumber: referrer.idNumber,
            },
            select: {
                id: true,
                email: true,
                lastLogin: true,
                isLocked: true,
            },
        });

        await prisma.referrer.update({
            where: { id: referrer.id },
            data: { portalUserId: user.id },
        });

        return NextResponse.json({
            portalEnabled: true,
            referrerId: referrer.id,
            user,
            temporaryPassword,
        }, { status: 201 });
    } catch (error) {
        logger.error('Failed to enable referrer portal access', error);
        return NextResponse.json({ error: 'Failed to enable portal access' }, { status: 500 });
    }
}
