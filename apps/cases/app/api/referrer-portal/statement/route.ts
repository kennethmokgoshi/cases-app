import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, referrerEarnsCommission } from '@zenowethu/shared-lib';
import { generateCommissionStatementPdf, type CommissionStatementData } from '@/lib/commission-statement-pdf';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { maskConsumerName, toPortalNumber } from '@/lib/referrer-portal';

const logger = createLogger('api/referrer-portal/statement');

export async function GET(request: Request) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return new NextResponse(access.error, { status: access.status });

        const { searchParams } = new URL(request.url);
        const statusParam = searchParams.get('status') ?? 'ALL';

        const referrer = await prisma.referrer.findUnique({
            where: { id: access.referrer.id },
            include: {
                commissions: {
                    where: {
                        isEligible: true,
                        ...(statusParam === 'UNPAID' ? { isPaid: false } : {}),
                        ...(statusParam === 'PAID' ? { isPaid: true } : {}),
                    },
                    include: {
                        case: {
                            select: {
                                client: { select: { firstName: true, lastName: true } },
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!referrer) return new NextResponse('Referrer not found', { status: 404 });

        // Discount referrers earn no commission, so a commission statement does not apply.
        if (!referrerEarnsCommission(referrer.referrerType)) {
            return new NextResponse('Commission statements are not available for discount referrers', { status: 403 });
        }

        let totalPaid = 0;
        let totalUnpaid = 0;

        const lineItems = referrer.commissions.map((commission) => {
            const amount = toPortalNumber(commission.commissionAmount);
            if (commission.isPaid) totalPaid += amount;
            else totalUnpaid += amount;

            return {
                caseClientName: maskConsumerName(commission.case.client.firstName, commission.case.client.lastName),
                commissionAmount: amount,
                status: commission.isPaid ? 'PAID' : 'UNPAID',
                paidAt: commission.paidAt,
                paymentRef: commission.paymentRef,
            };
        });

        const statementData: CommissionStatementData = {
            statementNumber: `REF-${referrer.id.slice(-6).toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
            issuedAt: new Date(),
            referrerName: `${referrer.firstName} ${referrer.lastName}`,
            referrerEmail: referrer.email ?? undefined,
            bankAccount: referrer.bankName ? {
                bankName: referrer.bankName,
                accountNumber: referrer.accountNumber ?? '',
                branchCode: referrer.branchCode ?? '',
                accountHolderName: referrer.accountHolderName ?? '',
            } : undefined,
            lineItems,
            totalPaid,
            totalUnpaid,
            totalCommission: totalPaid + totalUnpaid,
        };

        const pdfBytes = await generateCommissionStatementPdf(statementData);

        return new NextResponse(Buffer.from(pdfBytes), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="referrer-commission-statement-${referrer.id.slice(-6)}.pdf"`,
            },
        });
    } catch (error) {
        logger.error('Failed to generate referrer portal statement', error);
        return new NextResponse('Failed to generate statement', { status: 500 });
    }
}
