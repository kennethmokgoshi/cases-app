import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import bcrypt from 'bcryptjs';
import { logger, ResetPasswordSchema, parseBody } from '@zenowethu/shared-lib';
import { z } from 'zod';

export async function POST(request: NextRequest) {
    try {
        const parsed = parseBody(ResetPasswordSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data as z.infer<typeof ResetPasswordSchema>;
        const { token, password } = body;

        if (!token || !password) {
            return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
        }

        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: {
                    gt: new Date() // Token must not be expired
                }
            }
        });

        if (!user) {
            return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update the user and clear the reset fields
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpires: null
            }
        });

        return NextResponse.json({ message: 'Password has been reset successfully' });
    } catch (error) {
        logger.error('Reset password API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
