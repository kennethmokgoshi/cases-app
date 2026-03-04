import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import bcrypt from 'bcryptjs';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                organization: true,
                isAdmin: true,
                isLocked: true,
                userType: true,
                b2bPartnerId: true,
                lastLogin: true,
                createdAt: true,
                b2bPartner: {
                    select: {
                        id: true,
                        name: true }
                }
            }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json(user);
    } catch (error) {
        logger.error('Error fetching user:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();

        // Only admins can update users
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();

        const {
            firstName,
            lastName,
            email,
            password,
            organization,
            role,
            isLocked,
            userType,
            b2bPartnerId } = body;

        // Build update data
        const updateData: Record<string, unknown> = {};

        if (firstName !== undefined) updateData.firstName = firstName;
        if (lastName !== undefined) updateData.lastName = lastName;
        if (email !== undefined) {
            updateData.email = email;
            updateData.username = email;
        }
        if (organization !== undefined) updateData.organization = organization;
        if (role !== undefined) {
            updateData.role = role;
            updateData.isAdmin = role === 'ADMIN';
        }
        if (isLocked !== undefined) updateData.isLocked = isLocked;
        if (userType !== undefined) updateData.userType = userType;
        if (b2bPartnerId !== undefined) {
            updateData.b2bPartnerId = userType === 'B2B_PARTNER' ? b2bPartnerId : null;
        }

        // Only hash and update password if provided
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                organization: true,
                role: true,
                isAdmin: true,
                isLocked: true,
                userType: true,
                b2bPartnerId: true,
                createdAt: true }
        });

        return NextResponse.json(user);
    } catch (error) {
        logger.error('Error updating user:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();

        // Only admins can delete users
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const { id } = await params;

        // Prevent self-deletion
        if (session.user.id === id) {
            return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
        }

        await prisma.user.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error deleting user:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
