import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { generateCommissionStatementPdf, CommissionStatementData } from '@/lib/commission-statement-pdf';

const logger = createLogger('api/admin/referrers/[id]/statement');

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive && !session.user.isSeniorManager && session.user.role !== 'MANAGER') {
            return new NextResponse('Forbidden', { status: 403 });
        }

        const { id } = await props.params;
        const { searchParams } = new URL(request.url);
        // default to fetching all eligible commissions, but can be filtered
        const statusParam = searchParams.get('status') || 'ALL'; 

        const referrer = await prisma.referrer.findUnique({
            where: { id },
            include: {
                commissions: {
                    where: { 
                        isEligible: true,
                        ...(statusParam === 'UNPAID' ? { isPaid: false } : {}),
                        ...(statusParam === 'PAID' ? { isPaid: true } : {})
                    },
                    include: {
                        case: {
                            include: {
                                client: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!referrer) {
            return new NextResponse('Referrer not found', { status: 404 });
        }

        let totalPaid = 0;
        let totalUnpaid = 0;

        const lineItems = referrer.commissions.map(c => {
            const amount = c.commissionAmount?.toNumber() || 0;
            if (c.isPaid) totalPaid += amount;
            else totalUnpaid += amount;

            return {
                caseClientName: `${c.case.client.firstName} ${c.case.client.lastName}`,
                commissionAmount: amount,
                status: c.isPaid ? 'PAID' : 'UNPAID',
                paidAt: c.paidAt,
                paymentRef: c.paymentRef
            };
        });

        const statementData: CommissionStatementData = {
            statementNumber: `STMT-${referrer.id.slice(-6).toUpperCase()}-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`,
            issuedAt: new Date(),
            referrerName: `${referrer.firstName} ${referrer.lastName}`,
            referrerIdNumber: referrer.idNumber || undefined,
            referrerEmail: referrer.email || undefined,
            bankAccount: referrer.bankName ? {
                bankName: referrer.bankName,
                accountNumber: referrer.accountNumber || '',
                branchCode: referrer.branchCode || '',
                accountHolderName: referrer.accountHolderName || ''
            } : undefined,
            lineItems,
            totalPaid,
            totalUnpaid,
            totalCommission: totalPaid + totalUnpaid
        };

        const pdfBytes = await generateCommissionStatementPdf(statementData);

        return new NextResponse(Buffer.from(pdfBytes), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="commission-statement-${referrer.id.slice(-6)}.pdf"`,
            },
        });

    } catch (error) {
        logger.error(`Error generating statement for referrer ${props.params}:`, error);
        return new NextResponse('Failed to generate statement', { status: 500 });
    }
}
