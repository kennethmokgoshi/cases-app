import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id } = await params;

        const batch = await prisma.paymentBatch.findUnique({
            where: { id },
            include: {
                uploadedBy: { select: { firstName: true, lastName: true, email: true } },
                payments: {
                    orderBy: { date: 'desc' },
                    include: {
                        client: { select: { firstName: true, lastName: true, idNumber: true } },
                        case: { select: { fileNumber: true, status: true } } } } } });

        if (!batch) {
            return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
        }

        return NextResponse.json(batch);
    } catch (error: any) {
        logger.error('[Finance] GET /batches/[id] error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
