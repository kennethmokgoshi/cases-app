import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function PATCH(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id } = await params;

        const batch = await prisma.paymentBatch.findUnique({ where: { id } });
        if (!batch) {
            return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
        }

        if (batch.status === 'RECONCILED') {
            return NextResponse.json({ error: 'Batch is already reconciled' }, { status: 400 });
        }

        const updated = await prisma.paymentBatch.update({
            where: { id },
            data: { status: 'RECONCILED' } });

        return NextResponse.json(updated);
    } catch (error: any) {
        logger.error('[Finance] PATCH /batches/[id]/reconcile error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
