import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import bcrypt from 'bcryptjs';
import { UserCreateSchema, parseBody } from '@/lib/schemas';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        // Basic security: Must be authenticated
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const users = await prisma.user.findMany({
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
                lastLogin: true,
                createdAt: true,
                b2bPartner: {
                    select: {
                        id: true,
                        name: true }
                }
            },
            orderBy: { lastName: 'asc' }
        });

        return NextResponse.json(users);
    } catch (error) {
        logger.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        // Only admins can create users
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const parsed = parseBody(UserCreateSchema, await request.json());
        if (!parsed.success) return parsed.response;

        const {
            firstName,
            lastName,
            email,
            password,
            organization,
            role,
            userType,
            b2bPartnerId } = parsed.data;

        // Check if user already exists (case-insensitive)
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (existingUser) {
            return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Convert email to lowercase for consistency
        const emailLowerCase = email.toLowerCase();

        // Create user
        const user = await prisma.user.create({
            data: {
                username: emailLowerCase,
                firstName,
                lastName,
                email: emailLowerCase,
                password: hashedPassword,
                organization: organization || (userType === 'B2B_PARTNER' ? 'Partner' : 'Zenowethu'),
                role,
                isAdmin: role === 'ADMIN',
                userType,
                b2bPartnerId: userType === 'B2B_PARTNER' ? (b2bPartnerId ?? null) : null },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                organization: true,
                role: true,
                isAdmin: true,
                userType: true,
                b2bPartnerId: true,
                createdAt: true }
        });

        return NextResponse.json(user, { status: 201 });
    } catch (error) {
        logger.error('Error creating user:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

