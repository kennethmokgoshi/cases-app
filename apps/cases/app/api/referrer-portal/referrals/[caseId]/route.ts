import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, referrerEarnsCommission } from '@zenowethu/shared-lib';
import { summariseCaseFinancials } from '@zenowethu/shared-lib/src/finance/case-financials';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import {
    formatDocumentTypeLabel,
    maskConsumerName,
    parseCaseServices,
    portalCommissionStatus,
    portalStageLabel,
    toPortalComment,
    toPortalNumber,
    REFERRER_COMMENT_TYPE,
} from '@/lib/referrer-portal';
import { getWorkflowInfo, formatStatus } from '@/lib/workflow-progress';

const logger = createLogger('api/referrer-portal/referrals/[caseId]');

// GET - Full referral detail for the referrer portal: workflow progress,
// status milestones (labels only — internal notes are never exposed),
// commission state, and the referrer<->staff discussion thread.
export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const { caseId } = await params;

        const referralCase = await prisma.case.findFirst({
            where: { id: caseId, referrerId: access.referrer.id, deletedAt: null },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                services: true,
                serviceFee: true,
                createdAt: true,
                updatedAt: true,
                client: { select: { firstName: true, lastName: true } },
                referrer: { select: { referrerType: true, clientDiscountPercent: true } },
                payments: {
                    select: { id: true, amount: true, status: true, date: true },
                    orderBy: { date: 'desc' },
                },
                invoices: { select: { total: true, status: true, type: true, acceptedAt: true } },
                referrerCommission: {
                    select: {
                        stage: true,
                        isEligible: true,
                        isPaid: true,
                        commissionAmount: true,
                        paidAt: true,
                        paymentRef: true,
                    },
                },
                // Document types + dates only — never filenames or file access,
                // and admin-only documents stay invisible to referrers.
                documents: {
                    where: { isAdminOnly: false },
                    select: { id: true, type: true, uploadedAt: true },
                    orderBy: { uploadedAt: 'desc' },
                },
            },
        });

        if (!referralCase) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });

        const [statusLogs, comments] = await Promise.all([
            prisma.workflowLog.findMany({
                where: { caseId: referralCase.id, action: 'STATUS_CHANGE' },
                select: { id: true, fromStatus: true, toStatus: true, timestamp: true },
                orderBy: { timestamp: 'desc' },
                take: 20,
            }),
            prisma.caseComment.findMany({
                where: { caseId: referralCase.id, type: REFERRER_COMMENT_TYPE },
                select: {
                    id: true,
                    content: true,
                    createdAt: true,
                    user: { select: { firstName: true, lastName: true, userType: true } },
                },
                orderBy: { createdAt: 'asc' },
            }),
        ]);

        const commission = referralCase.referrerCommission;

        // Client finances are shown to discount partners only — their clients'
        // money flow is the partner's benefit. Commission referrers see their
        // own commission block instead.
        const isDiscountReferrer = !referrerEarnsCommission(referralCase.referrer?.referrerType);
        const financials = isDiscountReferrer
            ? (() => {
                const fin = summariseCaseFinancials({
                    serviceFee: referralCase.serviceFee === null ? null : toPortalNumber(referralCase.serviceFee),
                    payments: referralCase.payments.map((p) => ({ amount: toPortalNumber(p.amount), status: p.status })),
                    invoices: referralCase.invoices.map((i) => ({ total: toPortalNumber(i.total), status: i.status, type: i.type ?? undefined, acceptedAt: i.acceptedAt })),
                });
                return {
                    quoteTotal: fin.feeBasisTotal,
                    totalPaid: fin.totalPaid,
                    outstanding: fin.outstanding,
                    payments: referralCase.payments
                        .filter((p) => p.status === 'COMPLETED')
                        .map((p) => ({ id: p.id, amount: toPortalNumber(p.amount), date: p.date })),
                };
            })()
            : null;

        return NextResponse.json({
            caseId: referralCase.id,
            fileNumber: referralCase.fileNumber,
            consumerLabel: maskConsumerName(referralCase.client.firstName, referralCase.client.lastName),
            createdAt: referralCase.createdAt,
            lastUpdatedAt: referralCase.updatedAt,
            // Workflow status, not commission stage — the stage lags and only
            // tracks the payout pipeline.
                        referralStatus: portalStageLabel(referralCase.status),
            commissionStage: commission?.stage ?? 'NEW_LEAD',
            referrerType: referralCase.referrer?.referrerType ?? 'COMMISSION',
            clientDiscountPercent: referralCase.referrer?.clientDiscountPercent != null
                ? toPortalNumber(referralCase.referrer.clientDiscountPercent)
                : null,
            services: parseCaseServices(referralCase.services),
            financials,
            documents: referralCase.documents.map((document) => ({
                id: document.id,
                label: formatDocumentTypeLabel(document.type),
                uploadedAt: document.uploadedAt,
            })),
            workflow: getWorkflowInfo(referralCase.status),
            statusHistory: statusLogs.map((log) => ({
                id: log.id,
                from: log.fromStatus ? formatStatus(log.fromStatus) : null,
                to: formatStatus(log.toStatus),
                timestamp: log.timestamp,
            })),
            commission: {
                amount: toPortalNumber(commission?.commissionAmount),
                status: portalCommissionStatus({
                    isEligible: commission?.isEligible ?? false,
                    isPaid: commission?.isPaid ?? false,
                    paymentRef: commission?.paymentRef,
                }),
                paidAt: commission?.paidAt ?? null,
                paymentRef: commission?.paymentRef ?? null,
            },
            comments: comments.map(toPortalComment),
        });
    } catch (error) {
        logger.error('Failed to load referral detail', error);
        return NextResponse.json({ error: 'Failed to load referral detail' }, { status: 500 });
    }
}
