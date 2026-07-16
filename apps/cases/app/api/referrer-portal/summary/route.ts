import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, referrerEarnsCommission } from '@zenowethu/shared-lib';
import { summariseCaseFinancials, isAcceptedQuote } from '@zenowethu/shared-lib/src/finance/case-financials';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import {
    calculateDiscountPartnerTotals,
    calculatePortalCommissionTotals,
    isInCalendarMonth,
    maskConsumerName,
    portalCommissionStatus,
    portalStageLabel,
    portalStatusTone,
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
                    where: { deletedAt: null },
                    select: {
                        id: true,
                        fileNumber: true,
                        status: true,
                        createdAt: true,
                        serviceFee: true,
                        client: { select: { firstName: true, lastName: true } },
                        payments: { select: { amount: true, status: true, date: true } },
                        invoices: { select: { total: true, status: true, type: true, acceptedAt: true, createdAt: true } },
                        workflowLogs: {
                            where: { action: 'STATUS_CHANGE' },
                            select: { toStatus: true, timestamp: true },
                            orderBy: { timestamp: 'desc' },
                            take: 50,
                        },
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
                missingClientReports: {
                    select: {
                        id: true,
                        clientName: true,
                        idNumber: true,
                        notes: true,
                        status: true,
                        linkedCaseId: true,
                        createdAt: true,
                    },
                    where: { status: 'PENDING' },
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

        // Per-case client finances (quote basis + completed payments) — shown to
        // discount partners, whose value is the client money flow, not commission.
        const caseFinancials = new Map(referrer.cases.map((referral) => {
            const fin = summariseCaseFinancials({
                serviceFee: referral.serviceFee === null ? null : toPortalNumber(referral.serviceFee),
                payments: referral.payments.map((p) => ({ amount: toPortalNumber(p.amount), status: p.status })),
                invoices: referral.invoices.map((i) => ({ total: toPortalNumber(i.total), status: i.status, type: i.type ?? undefined, acceptedAt: i.acceptedAt })),
            });
            // Date the quote basis was established: quote acceptance/creation date,
            // or case creation when the basis is the case service fee.
            const acceptedQuote = referral.invoices
                .filter((i) => isAcceptedQuote({ total: toPortalNumber(i.total), status: i.status, type: i.type ?? undefined, acceptedAt: i.acceptedAt }))
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
            const quoteDate = fin.feeBasisSource === 'ACCEPTED_QUOTE'
                ? (acceptedQuote?.acceptedAt ?? acceptedQuote?.createdAt ?? null)
                : fin.feeBasisSource === 'CASE_SERVICE_FEE' ? referral.createdAt : null;
            const completedPayments = referral.payments
                .filter((p) => p.status === 'COMPLETED')
                .map((p) => ({ amount: toPortalNumber(p.amount), date: p.date }));
            return [referral.id, { quoteTotal: fin.feeBasisTotal, totalPaid: fin.totalPaid, quoteDate, completedPayments }] as const;
        }));

        // Milestone dates from the case's status-change history — used to bucket
        // completions and settlements into calendar months on the dashboard.
        const caseMilestones = new Map(referrer.cases.map((referral) => {
            const logs = referral.workflowLogs ?? [];
            const settledLog = logs.find((log) => portalStatusTone(log.toStatus) === 'settled');
            const completedLog = logs.find((log) => portalStatusTone(log.toStatus) === 'completed');
            const stage = referral.referrerCommission?.stage ?? null;
            return [referral.id, {
                settledAt: settledLog?.timestamp
                    ?? (stage === 'SETTLED' ? referral.referrerCommission?.updatedAt ?? null : null),
                completedAt: completedLog?.timestamp ?? null,
            }] as const;
        }));

                const discountSummary = calculateDiscountPartnerTotals(referrer.cases.map((referral) => {
            const fin = caseFinancials.get(referral.id)!;
            const milestones = caseMilestones.get(referral.id)!;
            return {
                createdAt: referral.createdAt,
                stage: referral.referrerCommission?.stage ?? null,
                caseStatus: referral.status,
                settledAt: milestones.settledAt,
                completedAt: milestones.completedAt,
                quoteTotal: fin.quoteTotal,
                quoteDate: fin.quoteDate,
                payments: fin.completedPayments,
            };
        }));

        // Quote statistics: count and sum invoices of type QUOTE across all referred cases
        const pendingStatuses = ['SENT', 'OVERDUE'];
        const acceptedStatuses = ['ACCEPTED', 'CONVERTED', 'PAID', 'PARTIALLY_PAID'];
        const declinedStatuses = ['REJECTED', 'CANCELLED'];

        const allInvoices = referrer.cases.flatMap((c) =>
            c.invoices.filter((i) =>
                i.type === 'QUOTE' &&
                [...pendingStatuses, ...acceptedStatuses, ...declinedStatuses].includes(i.status)
            ),
        );
        const quoteStats = {
            totalCount: allInvoices.length,
            totalAmount: allInvoices.reduce((sum, i) => sum + toPortalNumber(i.total), 0),
            acceptedCount: allInvoices.filter((i) => acceptedStatuses.includes(i.status)).length,
            acceptedAmount: allInvoices.filter((i) => acceptedStatuses.includes(i.status)).reduce((sum, i) => sum + toPortalNumber(i.total), 0),
            pendingCount: allInvoices.filter((i) => pendingStatuses.includes(i.status)).length,
            pendingAmount: allInvoices.filter((i) => pendingStatuses.includes(i.status)).reduce((sum, i) => sum + toPortalNumber(i.total), 0),
            rejectedCount: allInvoices.filter((i) => declinedStatuses.includes(i.status)).length,
            rejectedAmount: allInvoices.filter((i) => declinedStatuses.includes(i.status)).reduce((sum, i) => sum + toPortalNumber(i.total), 0),
        };

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
            discountSummary,
            quoteStats,
            referrals: referrer.cases.map((referral) => {
                const commission = referral.referrerCommission;
                const fin = caseFinancials.get(referral.id);
                const milestones = caseMilestones.get(referral.id);
                const now = new Date();
                return {
                    caseId: referral.id,
                    fileNumber: referral.fileNumber,
                    consumerLabel: maskConsumerName(referral.client.firstName, referral.client.lastName),
                    // The workflow status is the truth about the file — the
                    // commission stage lags (few statuses update it) and is only
                    // used for payout tracking, never for display.
                    referralStatus: portalStageLabel(referral.status),
                    statusTone: portalStatusTone(referral.status),
                    caseStatus: referral.status,
                    createdAt: referral.createdAt,
                    settledAt: milestones?.settledAt ?? null,
                    completedAt: milestones?.completedAt ?? null,
                    quoteTotal: fin?.quoteTotal ?? null,
                    quoteDate: fin?.quoteDate ?? null,
                    quoteStatuses: referral.invoices.filter((i) => i.type === 'QUOTE').map((i) => i.status),
                    totalPaid: fin?.totalPaid ?? 0,
                    paidThisMonth: (fin?.completedPayments ?? [])
                        .filter((payment) => isInCalendarMonth(payment.date, now))
                        .reduce((sum, payment) => sum + payment.amount, 0),
                    paidLastMonth: (fin?.completedPayments ?? [])
                        .filter((payment) => isInCalendarMonth(payment.date, now, 1))
                        .reduce((sum, payment) => sum + payment.amount, 0),
                                        commissionId: commission?.id ?? null,
                    commissionAmount: toPortalNumber(commission?.commissionAmount),
                    commissionStage: commission?.stage ?? 'NEW_LEAD',
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
            missingClientReports: referrer.missingClientReports.map((report) => ({
                id: report.id,
                clientName: report.clientName,
                idNumber: report.idNumber ? report.idNumber.replace(/^(\d{6})\d+(\d{3})$/, '$1*****$2') : null,
                notes: report.notes,
                status: report.status,
                linkedCaseId: report.linkedCaseId,
                createdAt: report.createdAt,
            })),
        });
    } catch (error) {
        logger.error('Failed to load referrer portal summary', error);
        return NextResponse.json({ error: 'Failed to load portal summary' }, { status: 500 });
    }
}
