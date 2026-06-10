import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { summariseCaseFinancials } from '../../../../../../lib/case-financials';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id } = await params;

        const caseRecord = await prisma.case.findUnique({
            where: { id },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                createdAt: true,
                acquisitionType: true,
                partnerName: true,
                partnerBranch: true,
                partnerSplitPercent: true,
                serviceFeeCollectedBy: true,
                serviceFee: true,
                instalments: true,
                zenowethuShare: true,
                isInvoiced: true,
                r350Status: true,
                totalDebtAmount: true,
                totalMonthlyInstallment: true,
                clientId: true,
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                        email: true,
                        phone: true,
                    },
                },
            },
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Payments explicitly on this case, plus client payments not linked to any case
        const paymentWhere = {
            OR: [
                { caseId: id },
                { clientId: caseRecord.clientId, caseId: null },
            ],
        };

        const [payments, invoices] = await Promise.all([
            prisma.payment.findMany({
                where: paymentWhere,
                orderBy: { date: 'desc' },
                take: 100,
                select: {
                    id: true,
                    amount: true,
                    date: true,
                    method: true,
                    reference: true,
                    category: true,
                    status: true,
                    recordedBy: { select: { firstName: true, lastName: true } },
                    batch: { select: { fileName: true } },
                },
            }),
            prisma.invoice.findMany({
                where: { caseId: id },
                orderBy: { issuedAt: 'desc' },
                select: {
                    id: true,
                    invoiceNumber: true,
                    status: true,
                    type: true,
                    total: true,
                    issuedAt: true,
                    dueAt: true,
                    sentAt: true,
                },
            }),
        ]);

        const summary = summariseCaseFinancials({
            serviceFee: caseRecord.serviceFee === null ? null : Number(caseRecord.serviceFee),
            payments: payments.map(p => ({ amount: Number(p.amount), status: p.status })),
            invoices: invoices.map(i => ({ total: Number(i.total), status: i.status })),
        });

        return NextResponse.json({
            case: {
                id: caseRecord.id,
                fileNumber: caseRecord.fileNumber,
                status: caseRecord.status,
                createdAt: caseRecord.createdAt,
                acquisitionType: caseRecord.acquisitionType,
                partnerName: caseRecord.partnerName,
                partnerBranch: caseRecord.partnerBranch,
                partnerSplitPercent: caseRecord.partnerSplitPercent,
                serviceFeeCollectedBy: caseRecord.serviceFeeCollectedBy,
                serviceFee: caseRecord.serviceFee,
                instalments: caseRecord.instalments,
                zenowethuShare: caseRecord.zenowethuShare,
                isInvoiced: caseRecord.isInvoiced,
                r350Status: caseRecord.r350Status,
                totalDebtAmount: caseRecord.totalDebtAmount,
                totalMonthlyInstallment: caseRecord.totalMonthlyInstallment,
            },
            client: caseRecord.client,
            summary,
            payments,
            invoices,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Finance] GET /finance/cases/[id]/summary error:', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
