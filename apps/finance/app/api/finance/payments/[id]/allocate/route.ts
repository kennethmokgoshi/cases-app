import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { checkQuoteFulfilmentSafe } from '@zenowethu/shared-lib/src/finance/quote-case-sync';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { idNumber, clientId: directClientId, caseId: directCaseId } = body;

        const payment = await prisma.payment.findUnique({ where: { id } });
        if (!payment) {
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }
        if (payment.status !== 'UNALLOCATED') {
            return NextResponse.json({ error: 'Payment is not in UNALLOCATED status' }, { status: 400 });
        }

        let clientId: string = directClientId;
        let caseId: string | undefined = directCaseId;

        // If idNumber provided, resolve client and active case
        if (idNumber && !clientId) {
            const client = await prisma.client.findUnique({
                where: { idNumber },
                include: {
                    cases: {
                        where: { status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] } },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: { id: true } } } });
            if (!client) {
                return NextResponse.json({ error: 'No client found with that ID number' }, { status: 404 });
            }
            clientId = client.id;
            if (client.cases.length > 0) {
                caseId = client.cases[0].id;
            }
        }

        if (!clientId) {
            return NextResponse.json({ error: 'clientId or idNumber is required' }, { status: 400 });
        }

        // Update payment and batch counts in a transaction
        const ops: any[] = [
            prisma.payment.update({
                where: { id },
                data: {
                    clientId,
                    caseId: caseId ?? null,
                    status: 'COMPLETED' },
                include: {
                    client: { select: { firstName: true, lastName: true, idNumber: true } },
                    case: { select: { fileNumber: true } } } }),
        ];

        // Sync batch match/unmatch counters if payment came from a batch
        if (payment.batchId) {
            ops.push(
                prisma.paymentBatch.update({
                    where: { id: payment.batchId },
                    data: {
                        matchCount: { increment: 1 },
                        unmatchCount: { decrement: 1 } } })
            );
        }

        const [updatedPayment] = await prisma.$transaction(ops as any);

        // A newly allocated payment may complete the case's accepted quote —
        // advance the case workflow (forward-only). Never fails the allocation.
        await checkQuoteFulfilmentSafe(caseId, session.user.id);

        return NextResponse.json(updatedPayment);
    } catch (error: any) {
        logger.error('[Finance] PATCH /payments/[id]/allocate error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
