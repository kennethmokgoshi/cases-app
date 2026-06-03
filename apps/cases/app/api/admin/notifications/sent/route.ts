import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { logger } from '@zenowethu/shared-lib';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const channel = searchParams.get('channel') || undefined;
        const search = searchParams.get('search') || undefined;
        const from = searchParams.get('from') || undefined;
        const to = searchParams.get('to') || undefined;
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const pageSize = 50;

        const where = {
            success: true,
            ...(channel && { channel }),
            ...(search && {
                OR: [
                    { recipient: { contains: search, mode: 'insensitive' as const } },
                    { message: { contains: search, mode: 'insensitive' as const } },
                    { case: { fileNumber: { contains: search, mode: 'insensitive' as const } } },
                    { case: { client: { firstName: { contains: search, mode: 'insensitive' as const } } } },
                    { case: { client: { lastName: { contains: search, mode: 'insensitive' as const } } } },
                ],
            }),
            ...(from || to ? {
                sentAt: {
                    ...(from && { gte: new Date(from) }),
                    ...(to && { lte: new Date(to + 'T23:59:59.999Z') }),
                },
            } : {}),
        };

        const [total, items] = await Promise.all([
            prisma.notificationLog.count({ where }),
            prisma.notificationLog.findMany({
                where,
                include: {
                    case: {
                        select: {
                            id: true,
                            fileNumber: true,
                            client: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                },
                            },
                        },
                    },
                    sender: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                },
                orderBy: { sentAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);

        return NextResponse.json({
            data: items,
            pagination: {
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
        });
    } catch (error) {
        logger.error('Failed to fetch sent notifications', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
