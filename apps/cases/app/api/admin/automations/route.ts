import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/admin/automations');

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const type = searchParams.get('type');
        const take = parseInt(searchParams.get('take') || '50');
        const skip = parseInt(searchParams.get('skip') || '0');

        const where: any = {};
        if (status) where.status = status;
        if (type) where.type = type;

        const [runs, total] = await Promise.all([
            prisma.automationRun.findMany({
                where,
                take,
                skip,
                orderBy: { createdAt: 'desc' },
                include: {
                    case: { select: { id: true, fileNumber: true } },
                    client: { select: { id: true, firstName: true, lastName: true } },
                }
            }),
            prisma.automationRun.count({ where })
        ]);

        return NextResponse.json({ runs, total });
    } catch (error) {
        logger.error('Error fetching automation runs:', error);
        return NextResponse.json({ error: 'Failed to fetch automation runs' }, { status: 500 });
    }
}
