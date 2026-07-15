import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { classifyDeclineReason } from '@zenowethu/shared-lib/src/dhs/decline-handler';

const logger = createLogger('api/admin/debt-counsellors/[id]');

/**
 * GET /api/admin/debt-counsellors/[id]
 * Full drill-down: stats, decline breakdown, top decline messages, priority
 * email list, email history, case timeline. Readable by ALL staff; editing
 * stays admin-only (see canEdit in the response).
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const dc = await (prisma as any).debtCounsellor.findUnique({
            where: { id },
            include: {
                emailHistory: { orderBy: { recordedAt: 'desc' } },
                priorityEmails: { orderBy: { priority: 'asc' } },
                outcomeEvents: { orderBy: { occurredAt: 'desc' } },
                updatedBy: { select: { firstName: true, lastName: true } },
                cases: {
                    where: { deletedAt: { equals: null } },
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

        const events = dc.outcomeEvents as Array<{
            id: string;
            caseId: string | null;
            outcome: string;
            message: string | null;
            category: string | null;
            extractedEmail: string | null;
            source: string;
            occurredAt: Date;
        }>;

        const isDeclinedStatus = (s: string | null) => Boolean(s && s.toUpperCase().includes('DECLIN'));
        const isAcceptedStatus = (s: string | null) =>
            Boolean(s && (s.toUpperCase().includes('ACCEPT') || s.toUpperCase().replace(/[\s_]/g, '').includes('AUTOTRANSFER')));

        const total = cases.length;
        const thisYear = cases.filter((c) => c.createdAt >= startOfYear).length;
        const thisMonth = cases.filter((c) => c.createdAt >= startOfMonth).length;
        const lastMonth = cases.filter(
            (c) => c.createdAt >= startOfLastMonth && c.createdAt < startOfMonth,
        ).length;

        // Prefer the durable event history (exact, survives repeat declines);
        // fall back to case snapshots for DCs with no events yet.
        const hasEvents = events.length > 0;
        const accepted = hasEvents
            ? events.filter((e) => e.outcome === 'ACCEPTED').length
            : cases.filter((c) => isAcceptedStatus(c.dhsStatus)).length;
        const declined = hasEvents
            ? events.filter((e) => e.outcome === 'DECLINED').length
            : cases.filter((c) => isDeclinedStatus(c.dhsStatus)).length;
        const pending = cases.filter((c) => c.dhsStatus === 'PENDING').length;
        const decided = accepted + declined;
        const acceptanceRate = decided > 0 ? Math.round((accepted / decided) * 100) : null;
        const declineRate = decided > 0 ? Math.round((declined / decided) * 100) : null;
        const lastDeclinedAt =
            events.find((e) => e.outcome === 'DECLINED')?.occurredAt ?? null; // events are ordered desc

        // Decline reason breakdown (by category)
        const declineCounts: Record<string, number> = {};
        if (hasEvents) {
            for (const e of events) {
                if (e.outcome === 'DECLINED') {
                    const cat = e.category ?? (e.message ? classifyDeclineReason(e.message) : 'UNKNOWN');
                    declineCounts[cat] = (declineCounts[cat] ?? 0) + 1;
                }
            }
        } else {
            for (const c of cases) {
                if (isDeclinedStatus(c.dhsStatus) && c.declineReason) {
                    const cat = classifyDeclineReason(c.declineReason);
                    declineCounts[cat] = (declineCounts[cat] ?? 0) + 1;
                }
            }
        }
        const declineBreakdown = Object.entries(declineCounts)
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count);

        // Top 5 decline MESSAGES — the actual text patterns this DC declines with
        const messageMap = new Map<string, { message: string; category: string | null; count: number; lastAt: Date }>();
        const messageSource = hasEvents
            ? events.filter((e) => e.outcome === 'DECLINED' && e.message)
                .map((e) => ({ message: e.message as string, category: e.category, at: e.occurredAt }))
            : cases.filter((c) => c.declineReason)
                .map((c) => ({
                    message: c.declineReason as string,
                    category: classifyDeclineReason(c.declineReason as string) as string | null,
                    at: c.updatedAt,
                }));
        for (const { message, category, at } of messageSource) {
            const key = message.trim().toUpperCase();
            const entry = messageMap.get(key);
            if (entry) {
                entry.count += 1;
                if (at > entry.lastAt) entry.lastAt = at;
            } else {
                messageMap.set(key, { message: message.trim(), category, count: 1, lastAt: at });
            }
        }
        const topDeclineMessages = [...messageMap.values()]
            .sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime())
            .slice(0, 5);

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
                decided,
                acceptanceRate,
                declineRate,
                lastDeclinedAt,
                declineBreakdown,
                topDeclineMessages,
            },
            priorityEmails: dc.priorityEmails,
            emailHistory: dc.emailHistory,
            timeline,
            canEdit: Boolean(session.user.isAdmin),
        });
    } catch (error) {
        logger.error('GET /api/admin/debt-counsellors/[id]', { error });
        return NextResponse.json({ error: 'Failed to fetch debt counsellor' }, { status: 500 });
    }
}
