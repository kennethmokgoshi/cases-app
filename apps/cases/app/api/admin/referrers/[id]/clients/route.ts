import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { summariseCaseFinancials } from '@zenowethu/shared-lib/src/finance/case-financials';
import { prisma } from '@zenowethu/database';
import { canAccessReferrer } from '@/lib/referrer-access';

const logger = createLogger('api/admin/referrers/[id]/clients');

function isAdminLevel(session: { user: { isAdmin?: boolean; isExecutive?: boolean; isSeniorManager?: boolean; role?: string } }) {
    return session.user.isAdmin || session.user.isExecutive || session.user.isSeniorManager || session.user.role === 'MANAGER';
}

const ARREARS_STAGES = new Set(['ARREARS_1M', 'ARREARS_2M', 'ARREARS_3M', 'ARREARS_4M_PLUS', 'HANDED_OVER']);

// A referral counts as converted once it reaches a paying stage. Stage-based
// (not isEligible-based) so it also works for DISCOUNT referrers, whose
// referrals are never commission-eligible.
const CONVERTED_STAGES = new Set(['DEPOSIT_PAID', 'PAYING_INSTALMENTS', 'UP_TO_DATE', 'SETTLED']);

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// GET /api/admin/referrers/[id]/clients
// Referrer clients dashboard: every case referred by this referrer with client,
// case status and commission progress, plus summary stats, a commission-stage
// breakdown, and a 6-month referral trend.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!isAdminLevel(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const referrer = await prisma.referrer.findUnique({
            where: { id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                isActive: true,
                cellNumber: true,
                email: true,
                referrerType: true,
                clientDiscountPercent: true,
                commissionType: true,
                fixedCommissionAmount: true,
                projectId: true,
                project: { select: { id: true, name: true } },
            },
        });
        if (!referrer) return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });

        // Non-admins may only view referrers whose sub-project they belong to
        if (!(await canAccessReferrer(session.user, referrer.projectId))) {
            return NextResponse.json({ error: 'Forbidden — you are not a member of this referrer' }, { status: 403 });
        }

        const cases = await prisma.case.findMany({
            where: { referrerId: id, deletedAt: null },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                createdAt: true,
                recordedAt: true,
                updatedAt: true,
                nextUpdate: true,
                serviceFee: true,
                updatedBy: { select: { firstName: true, lastName: true } },
                client: { select: { id: true, firstName: true, lastName: true, idNumber: true, phone: true, email: true } },
                payments: { select: { amount: true, status: true } },
                invoices: { select: { total: true, status: true, type: true, acceptedAt: true } },
                referrerCommission: {
                    select: { stage: true, isEligible: true, isPaid: true, commissionAmount: true, paidAt: true },
                },
            },
            orderBy: { recordedAt: 'desc' },
        });

        const clients = cases.map((c) => {
            const fin = summariseCaseFinancials({
                serviceFee: c.serviceFee === null ? null : Number(c.serviceFee),
                payments: c.payments.map((p) => ({ amount: Number(p.amount), status: p.status })),
                invoices: c.invoices.map((i) => ({ total: Number(i.total), status: i.status, type: i.type, acceptedAt: i.acceptedAt })),
            });
            return {
                caseId: c.id,
                fileNumber: c.fileNumber,
                caseStatus: c.status,
                referredAt: c.recordedAt ?? c.createdAt,
                lastUpdatedAt: c.updatedAt,
                lastUpdatedBy: c.updatedBy ? `${c.updatedBy.firstName} ${c.updatedBy.lastName}`.trim() : null,
                nextUpdate: c.nextUpdate,
                client: c.client,
                financials: {
                    quoteTotal: fin.feeBasisTotal,
                    quoteSource: fin.feeBasisSource,
                    totalPaid: fin.totalPaid,
                    balance: fin.outstanding,
                    overpaid: Math.max(fin.quoteOverpaid, fin.overCollected),
                    percentCollected: fin.feeBasisPercentCollected,
                },
                commission: c.referrerCommission
                    ? {
                        stage: c.referrerCommission.stage,
                        isEligible: c.referrerCommission.isEligible,
                        isPaid: c.referrerCommission.isPaid,
                        commissionAmount: c.referrerCommission.commissionAmount != null ? Number(c.referrerCommission.commissionAmount) : null,
                        paidAt: c.referrerCommission.paidAt,
                    }
                    : null,
            };
        });

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const uniqueClientIds = new Set(cases.map((c) => c.client.id));
        const withCommission = clients.filter((c) => c.commission != null);
        const eligible = withCommission.filter((c) => c.commission!.isEligible);
        const paid = withCommission.filter((c) => c.commission!.isPaid);
        const converted = withCommission.filter((c) => CONVERTED_STAGES.has(c.commission!.stage));

        const summary = {
            totalClients: uniqueClientIds.size,
            totalCases: cases.length,
            settled: withCommission.filter((c) => c.commission!.stage === 'SETTLED').length,
            inArrears: withCommission.filter((c) => ARREARS_STAGES.has(c.commission!.stage)).length,
            newThisMonth: cases.filter((c) => c.createdAt >= monthStart).length,
            eligible: eligible.length,
            paid: paid.length,
            unpaidEligible: eligible.filter((c) => !c.commission!.isPaid).length,
            totalOwed: eligible
                .filter((c) => !c.commission!.isPaid && c.commission!.commissionAmount != null)
                .reduce((sum, c) => sum + c.commission!.commissionAmount!, 0),
            totalPaid: paid
                .filter((c) => c.commission!.commissionAmount != null)
                .reduce((sum, c) => sum + c.commission!.commissionAmount!, 0),
            conversionRate: cases.length > 0 ? Math.round((converted.length / cases.length) * 100) : 0,
            // Client-side money across all referred cases (service fee / accepted quotes vs collected payments)
            totalQuoted: round2(clients.reduce((sum, c) => sum + (c.financials.quoteTotal ?? 0), 0)),
            totalCollected: round2(clients.reduce((sum, c) => sum + c.financials.totalPaid, 0)),
            totalBalanceDue: round2(clients.reduce((sum, c) => sum + (c.financials.balance ?? 0), 0)),
            updatesOverdue: clients.filter((c) => c.nextUpdate != null && c.nextUpdate < now).length,
        };

        // Commission-stage pipeline breakdown; cases without a commission record are early-stage
        const stageCounts = new Map<string, number>();
        for (const c of clients) {
            const stage = c.commission?.stage ?? 'NO_RECORD';
            stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
        }
        const stageBreakdown = Array.from(stageCounts.entries()).map(([stage, count]) => ({ stage, count }));

        // Referrals per month for the last 6 calendar months (oldest first)
        const monthlyTrend: { month: string; label: string; count: number }[] = [];
        for (let i = 5; i >= 0; i--) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            monthlyTrend.push({
                month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
                label: start.toLocaleDateString('en-ZA', { month: 'short' }),
                count: cases.filter((c) => c.createdAt >= start && c.createdAt < end).length,
            });
        }

        return NextResponse.json({
            referrer: {
                ...referrer,
                clientDiscountPercent: referrer.clientDiscountPercent != null ? Number(referrer.clientDiscountPercent) : null,
                fixedCommissionAmount: referrer.fixedCommissionAmount != null ? Number(referrer.fixedCommissionAmount) : null,
            },
            clients, summary, stageBreakdown, monthlyTrend,
        });
    } catch (error) {
        logger.error('Error fetching referrer clients dashboard:', error);
        return NextResponse.json({ error: 'Failed to fetch referrer clients' }, { status: 500 });
    }
}
