import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import bcrypt from 'bcryptjs';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                avatarUrl: true,
                organization: true,
                role: true,
                userType: true }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json(user);
    } catch (error) {
        logger.error('Error fetching profile:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { firstName, lastName, email, phone, avatarUrl, currentPassword, newPassword } = body;

        const originalUser = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!originalUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const updateData: any = {};
        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (email) updateData.email = email.toLowerCase();
        if (phone) updateData.phone = phone;
        if (avatarUrl) updateData.avatarUrl = avatarUrl;

        // Handle password change
        if (newPassword) {
            if (!currentPassword) {
                return NextResponse.json({ error: 'Current password is required to change password' }, { status: 400 });
            }

            const isPasswordValid = await bcrypt.compare(currentPassword, originalUser.password);
            if (!isPasswordValid) {
                return NextResponse.json({ error: 'Invalid current password' }, { status: 400 });
            }

            updateData.password = await bcrypt.hash(newPassword, 10);
        }

        const updatedUser = await prisma.user.update({
            where: { id: session.user.id },
            data: updateData,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                avatarUrl: true }
        });

        return NextResponse.json({
            message: 'Profile updated successfully',
            user: updatedUser
        });
    } catch (error: any) {
        logger.error('Error updating profile:', error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

