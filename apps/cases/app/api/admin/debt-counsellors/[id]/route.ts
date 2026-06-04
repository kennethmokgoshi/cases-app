import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { classifyDeclineReason } from '@zenowethu/shared-lib/src/dhs/decline-handler';

const logger = createLogger('api/admin/debt-counsellors/[id]');

/**
 * GET /api/admin/debt-counsellors/[id]
 * Full drill-down: stats, decline breakdown, email history, case timeline.
 */
export async function GET(
    _request: Request,
    { params }: { params: { id: string } },
) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const dc = await (prisma as any).debtCounsellor.findUnique({
            where: { id: params.id },
            include: {
                emailHistory: { orderBy: { recordedAt: 'desc' } },
                updatedBy: { select: { firstName: true, lastName: true } },
                cases: {
                    where: { deletedAt: null },
                    select: {
                        id: true,
                        fileNumber: true,
                        dhsStatus: true,
                        dhsStatusDate: true,
                        dhsDaysCounter: true,
                        declineReason: true,
                        declineReasonAttended: true,
                        createdAt: true,
                        updatedAt: true,
                        status: true,
                        client: {
                            select: {
                                firstName: true,
                                lastName: true,
                                idNumber: true,
                            },
                        },
                        assignedTo: {
                            select: { firstName: true, lastName: true },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!dc) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const cases = dc.cases as Array<{
            id: string;
            fileNumber: string;
            dhsStatus: string | null;
            dhsStatusDate: Date | null;
            dhsDaysCounter: string | null;
            declineReason: string | null;
            declineReasonAttended: boolean;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            client: { firstName: string; lastName: string; idNumber: string | null };
            assignedTo: { firstName: string; lastName: string } | null;
        }>;

        const total = cases.length;
        const thisYear = cases.filter((c) => c.createdAt >= startOfYear).length;
        const thisMonth = cases.filter((c) => c.createdAt >= startOfMonth).length;
        const lastMonth = cases.filter(
            (c) => c.createdAt >= startOfLastMonth && c.createdAt < startOfMonth,
        ).length;
        const accepted = cases.filter((c) => c.dhsStatus === 'ACCEPTED').length;
        const declined = cases.filter((c) => c.dhsStatus === 'DECLINED').length;
        const pending = cases.filter((c) => c.dhsStatus === 'PENDING').length;

        // Decline reason breakdown
        const declineCounts: Record<string, number> = {};
        for (const c of cases) {
            if (c.dhsStatus === 'DECLINED' && c.declineReason) {
                const cat = classifyDeclineReason(c.declineReason);
                declineCounts[cat] = (declineCounts[cat] ?? 0) + 1;
            }
        }
        const declineBreakdown = Object.entries(declineCounts)
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count);

        // Case timeline entries
        const timeline = cases.map((c) => ({
            id: c.id,
            fileNumber: c.fileNumber,
            clientName: `${c.client.firstName} ${c.client.lastName}`,
            idNumber: c.client.idNumber,
            dhsStatus: c.dhsStatus,
            dhsDaysCounter: c.dhsDaysCounter,
            caseStatus: c.status,
            declineReason: c.declineReason,
            declineReasonAttended: c.declineReasonAttended,
            declineCategory: c.declineReason ? classifyDeclineReason(c.declineReason) : null,
            assignedTo: c.assignedTo
                ? `${c.assignedTo.firstName} ${c.assignedTo.lastName}`
                : null,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            dhsStatusDate: c.dhsStatusDate,
        }));

        return NextResponse.json({
            dc: {
                id: dc.id,
                ncrdcNo: dc.ncrdcNo,
                fullName: dc.fullName,
                tradingName: dc.tradingName,
                operatingStatus: dc.operatingStatus,
                province: dc.province,
                tel: dc.tel,
                mobile: dc.mobile,
                fax: dc.fax,
                email: dc.email,
                preferredEmail: dc.preferredEmail,
                lastKnownEmail: dc.lastKnownEmail,
                staffNotes: dc.staffNotes,
                updatedAt: dc.updatedAt,
                updatedBy: dc.updatedBy
                    ? `${dc.updatedBy.firstName} ${dc.updatedBy.lastName}`
                    : null,
            },
            stats: {
                total,
                thisYear,
                thisMonth,
                lastMonth,
                accepted,
                declined,
                pending,
                declineBreakdown,
            },
            emailHistory: dc.emailHistory,
            timeline,
        });
    } catch (error) {
        logger.error('GET /api/admin/debt-counsellors/[id]', { error });
        return NextResponse.json({ error: 'Failed to fetch debt counsellor' }, { status: 500 });
    }
}
