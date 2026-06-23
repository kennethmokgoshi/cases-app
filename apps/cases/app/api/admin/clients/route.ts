import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/clients');

const PAGE_SIZE = 20;

// GET /api/admin/clients — paginated list with search
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive && !session.user.isSeniorManager && session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, Number(searchParams.get('page') ?? 1));
        const search = searchParams.get('search') ?? '';

        const where: Record<string, unknown> = {};
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { idNumber: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [clients, total] = await Promise.all([
            prisma.client.findMany({
                where,
                orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    idNumber: true,
                    email: true,
                    phone: true,
                    employer: true,
                    createdAt: true,
                    _count: { select: { cases: true } },
                },
            }),
            prisma.client.count({ where }),
        ]);

        return NextResponse.json({
            clients,
            total,
            page,
            pages: Math.ceil(total / PAGE_SIZE),
        });
    } catch (error) {
        logger.error('Error fetching clients:', error);
        return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
    }
}
