import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';

const logger = createLogger('api/users/search');

// GET - Search users for @mention autocomplete
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';
        const limit = parseInt(searchParams.get('limit') || '10');

        if (query.length < 1) {
            return NextResponse.json([]);
        }

        const users = await prisma.user.findMany({
            where: {
                isLocked: false,
                OR: [
                    { firstName: { contains: query } },
                    { lastName: { contains: query } },
                    { email: { contains: query } },
                    { username: { contains: query } },
                ] },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                username: true,
                organization: true },
            take: limit,
            orderBy: { firstName: 'asc' } });

        return NextResponse.json(users);
    } catch (error) {
        logger.error('Error searching users:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


