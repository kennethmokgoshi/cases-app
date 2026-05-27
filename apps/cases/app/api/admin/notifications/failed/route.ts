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
        const status = searchParams.get('status') || undefined;
        const channel = searchParams.get('channel') || undefined;

        const items = await prisma.notificationQueue.findMany({
            where: {
                ...(status ? { status } : { status: { not: 'SUCCESS' } }),
                ...(channel && { channel })
            },
            include: {
                case: {
                    select: {
                        id: true,
                        fileNumber: true,
                        client: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        return NextResponse.json({ data: items });
    } catch (error) {
        logger.error('Failed to fetch notification queue', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
