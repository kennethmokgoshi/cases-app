import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import bcrypt from 'bcryptjs';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};


export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, password } = body;

        logger.error('[DEBUG-AUTH] Testing auth for:', email);

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            logger.error('[DEBUG-AUTH] User not found');
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        logger.error('[DEBUG-AUTH] User found:', user.email);
        logger.error('[DEBUG-AUTH] Stored hash:', user.password);
        logger.error('[DEBUG-AUTH] Test password:', password);

        const match = await bcrypt.compare(password, user.password);
        logger.error('[DEBUG-AUTH] Password match result:', match);

        return NextResponse.json({
            success: match,
            userFound: true,
            email: user.email,
            match: match
        });

    } catch (error) {
        logger.error('[DEBUG-AUTH] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
