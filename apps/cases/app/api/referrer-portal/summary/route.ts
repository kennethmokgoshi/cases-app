import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import {
    calculatePortalCommissionTotals,
    maskConsumerName,
    portalCommissionStatus,
    portalStageLabel,
    toPortalNumber,
} from '@/lib/referrer-portal';

const logger = createLogger('api/referrer-portal/summary');

export async function GET() {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const referrer = await prisma.referrer.findUnique({
            where: { id: access.referrer.id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                cellNumber: true,
                bankName: true,
                accountNumber: true,
                accountType: true,
                branchCode: true,
                accountHolderName: true,
                referrerType: true,
                clientDiscountPercent: true,
                commissionType: true,
                fixedCommissionAmount: true,
                cases: {
                    select: {
                        id: true,
                        fileNumber: true,
                        status: true,
                        createdAt: true,
                        client: { select: { firstName: true, lastName: true } },
                        referrerCommission: {
                            select: {
                                id: true,
                                stage: true,
                                isEligible: true,
                                commissionAmount: true,
                                isPaid: true,
                                paidAt: true,
                                paymentRef: true,
                                updatedAt: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
                paymentQueries: {
                    select: {
                        id: true,
                        caseId: true,
                        commissionId: true,
                        status: true,
                        claimedPaidAt: true,
                        claimedAmount: true,
                        notes: true,
                        createdAt: true,
                        updatedAt: true,
                        case: {
                            select: {
                                fileNumber: true,
                                client: { select: { firstName: true, lastName: true } },
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!referrer) return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });

        const commissionInputs = referrer.cases.map((referral) => ({
            isEligible: referral.referrerCommission?.isEligible ?? false,
            isPaid: referral.referrerCommission?.isPaid ?? false,
            commissionAmount: referral.referrerCommission?.commissionAmount,
        }));

        const totals = calculatePortalCommissionTotals(commissionInputs);

        return NextResponse.json({
            referrer: {
                id: referrer.id,
                firstName: referrer.firstName,
                lastName: referrer.lastName,
                email: referrer.email,
                cellNumber: referrer.cellNumber,
                bankName: referrer.bankName,
                accountNumber: referrer.accountNumber,
                accountType: referrer.accountType,
                branchCode: referrer.branchCode,
                accountHolderName: referrer.accountHolderName,
                referrerType: referrer.referrerType,
                clientDiscountPercent: referrer.clientDiscountPercent != null ? toPortalNumber(referrer.clientDiscountPercent) : null,
                commissionType: referrer.commissionType,
                fixedCommissionAmount: toPortalNumber(referrer.fixedCommissionAmount),
            },
            summary: totals,
            referrals: referrer.cases.map((referral) => {
                const commission = referral.referrerCommission;
                return {
                    caseId: referral.id,
                    fileNumber: referral.fileNumber,
                    consumerLabel: maskConsumerName(referral.client.firstName, referral.client.lastName),
                    referralStatus: portalStageLabel(commission?.stage ?? referral.status),
                    caseStatus: referral.status,
                    createdAt: referral.createdAt,
                    commissionId: commission?.id ?? null,
                    commissionAmount: toPortalNumber(commission?.commissionAmount),
                    commissionStatus: portalCommissionStatus({
                        isEligible: commission?.isEligible ?? false,
                        isPaid: commission?.isPaid ?? false,
                        paymentRef: commission?.paymentRef,
                    }),
                    isEligible: commission?.isEligible ?? false,
                    isPaid: commission?.isPaid ?? false,
                    paidAt: commission?.paidAt ?? null,
                    paymentRef: commission?.paymentRef ?? null,
                    lastUpdatedAt: commission?.updatedAt ?? referral.createdAt,
                };
            }),
            paymentQueries: referrer.paymentQueries.map((query) => ({
                id: query.id,
                caseId: query.caseId,
                commissionId: query.commissionId,
                fileNumber: query.case.fileNumber,
                consumerLabel: maskConsumerName(query.case.client.firstName, query.case.client.lastName),
                status: query.status,
                claimedPaidAt: query.claimedPaidAt,
                claimedAmount: toPortalNumber(query.claimedAmount),
                notes: query.notes,
                createdAt: query.createdAt,
                updatedAt: query.updatedAt,
            })),
        });
    } catch (error) {
        logger.error('Failed to load referrer portal summary', error);
        return NextResponse.json({ error: 'Failed to load portal summary' }, { status: 500 });
    }
}
