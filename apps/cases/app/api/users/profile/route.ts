import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const logger = createLogger('api/users/profile');

const BankingDetailsSchema = z.object({
    bankName: z.string().trim().min(1).max(100),
    accountName: z.string().trim().min(1).max(200),
    accountNumber: z.string().trim().min(1).max(50),
    branchCode: z.string().trim().max(20).optional(),
});

const UpdateProfileSchema = z.object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().max(30).optional(),
    idNumber: z.string().trim().max(20).optional(),
    address: z.string().trim().max(500).optional(),
    avatarUrl: z.string().trim().max(2000).optional(),
    currentPassword: z.string().optional(),
    // The account page always submits this field (empty string when the user
    // isn't changing their password) — only enforce the length when non-empty.
    newPassword: z.string().optional().refine((v) => !v || v.length >= 8, {
        message: 'New password must be at least 8 characters',
    }),
    /**
     * Own personal banking, used only for the R350 admin fee invoice on cases
     * this user created (falls back to Zenowethu's default banking if unset).
     * Pass `null` to clear a previously saved record.
     */
    bankingDetails: BankingDetailsSchema.nullable().optional(),
});

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
                idNumber: true,
                address: true,
                avatarUrl: true,
                organization: true,
                role: true,
                userType: true,
                staffBankingDetail: {
                    select: { bankName: true, accountName: true, accountNumber: true, branchCode: true },
                },
            }
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

        const rawBody = await request.json();
        const parsed = UpdateProfileSchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
        }
        const { firstName, lastName, email, phone, idNumber, address, avatarUrl, currentPassword, newPassword, bankingDetails } = parsed.data;

        const originalUser = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!originalUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const updateData: Record<string, unknown> = {};
        if (firstName) updateData.firstName = firstName;
        if (lastName)  updateData.lastName  = lastName;
        if (email)     updateData.email     = email.toLowerCase();
        if (phone)     updateData.phone     = phone;
        if (idNumber !== undefined) updateData.idNumber = idNumber;
        if (address  !== undefined) updateData.address  = address;
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
                idNumber: true,
                address: true,
                avatarUrl: true }
        });

        // Self-service banking details — own record only, upserted independently
        // of the rest of the profile fields.
        if (bankingDetails === null) {
            await prisma.staffBankingDetail.deleteMany({ where: { userId: session.user.id } });
        } else if (bankingDetails) {
            await prisma.staffBankingDetail.upsert({
                where: { userId: session.user.id },
                create: { userId: session.user.id, ...bankingDetails },
                update: { ...bankingDetails },
            });
        }

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
