import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q') || '';
        const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

        if (!q || q.length < 2) {
            return NextResponse.json({ clients: [] });
        }

        const clients = await prisma.client.findMany({
            where: {
                OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                    { idNumber: { contains: q } },
                ] },
            take: limit,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                idNumber: true,
                email: true,
                phone: true,
                cases: {
                    where: { status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] } },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { id: true, fileNumber: true, status: true } } } });

        return NextResponse.json({
            clients: clients.map(c => ({
                id: c.id,
                firstName: c.firstName,
                lastName: c.lastName,
                idNumber: c.idNumber,
                email: c.email,
                phone: c.phone,
                activeCase: c.cases[0] ?? null })) });
    } catch (error: any) {
        logger.error('[Finance] GET /finance/clients/search error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
