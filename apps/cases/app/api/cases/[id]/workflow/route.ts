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

        const [caseRow, logs, payments] = await Promise.all([
            prisma.case.findUnique({
                where: { id },
                select: {
                    id: true,
                    fileNumber: true,
                    status: true,
                    statusEntryDate: true,
                    createdAt: true,
                    serviceFee: true,
                    instalments: true,
                    totalMonthlyInstallment: true,
                    client: { select: { firstName: true, lastName: true } },
                    createdBy: { select: { firstName: true, lastName: true } },
                },
            }),
            prisma.workflowLog.findMany({
                where: { caseId: id },
                orderBy: { timestamp: 'asc' },
                include: {
                    user: { select: { firstName: true, lastName: true } },
                },
            }),
            prisma.payment.findMany({
                where: { caseId: id },
                orderBy: { date: 'asc' },
                select: {
                    id: true,
                    amount: true,
                    date: true,
                    method: true,
                    reference: true,
                    category: true,
                    status: true,
                    recordedBy: { select: { firstName: true, lastName: true } },
                },
            }),
        ]);

        if (!caseRow) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const paymentTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);

        return NextResponse.json({
            case: caseRow,
            logs,
            payments,
            paymentTotal,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Cases] GET /api/cases/[id]/workflow error:', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
