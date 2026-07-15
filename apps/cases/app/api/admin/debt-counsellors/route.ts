import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { classifyDeclineReason } from '@zenowethu/shared-lib/src/dhs/decline-handler';
import { promoteDcEmail } from '@zenowethu/shared-lib/src/dc/email-priority';

const logger = createLogger('api/admin/debt-counsellors');

/** Case dhsStatus labels vary ('DECLINED', 'Declined Via DHS'…) — match loosely. */
const isDeclinedStatus = (s: string | null) => Boolean(s && s.toUpperCase().includes('DECLIN'));
const isAcceptedStatus = (s: string | null) =>
    Boolean(s && (s.toUpperCase().includes('ACCEPT') || s.toUpperCase().replace(/[\s_]/g, '').includes('AUTOTRANSFER')));

/**
 * GET /api/admin/debt-counsellors
 * Returns all DebtCounsellor records with priority email lists and aggregate
 * stats. Stats prefer the durable DhsOutcomeEvent history (exact, survives
 * repeat declines) and fall back to linked Case records for DCs with no
 * events yet. Readable by ALL staff; editing endpoints stay admin-only.
 */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') ?? '';

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const counsellors = await (prisma as any).debtCounsellor.findMany({
            where: search
                ? {
                    OR: [
                        { ncrdcNo: { contains: search, mode: 'insensitive' } },
                        { fullName: { contains: search, mode: 'insensitive' } },
                        { tradingName: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { province: { contains: search, mode: 'insensitive' } },
                    ],
                }
                : undefined,
            include: {
                cases: {
                    select: {
                        id: true,
                        dhsStatus: true,
                        declineReason: true,
                        createdAt: true,
                    },
                },
                priorityEmails: {
                    orderBy: { priority: 'asc' },
                    select: {
                        id: true,
                        email: true,
                        priority: true,
                        source: true,
                        lastBouncedAt: true,
                        notes: true,
                    },
                },
                outcomeEvents: {
                    select: {
                        outcome: true,
                        category: true,
                        occurredAt: true,
                    },
                },
                emailHistory: {
                    orderBy: { recordedAt: 'desc' },
                    take: 1,
                },
                updatedBy: {
                    select: { firstName: true, lastName: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const result = counsellors.map((dc: any) => {
            const cases = dc.cases as Array<{
                id: string;
                dhsStatus: string | null;
                declineReason: string | null;
                createdAt: Date;
            }>;
            const events = dc.outcomeEvents as Array<{
                outcome: string;
                category: string | null;
                occurredAt: Date;
            }>;

            const total = cases.length;
            const thisYear = cases.filter((c) => c.createdAt >= startOfYear).length;
            const thisMonth = cases.filter((c) => c.createdAt >= startOfMonth).length;
            const lastMonth = cases.filter(
                (c) => c.createdAt >= startOfLastMonth && c.createdAt < startOfMonth,
            ).length;

            // Prefer event history (exact); fall back to case snapshots (approximate)
            const hasEvents = events.length > 0;
            const accepted = hasEvents
                ? events.filter((e) => e.outcome === 'ACCEPTED').length
                : cases.filter((c) => isAcceptedStatus(c.dhsStatus)).length;
            const declined = hasEvents
                ? events.filter((e) => e.outcome === 'DECLINED').length
                : cases.filter((c) => isDeclinedStatus(c.dhsStatus)).length;
            const decided = accepted + declined;
            const acceptanceRate = decided > 0 ? Math.round((accepted / decided) * 100) : null;
            const declineRate = decided > 0 ? Math.round((declined / decided) * 100) : null;

            const lastDeclinedAt = hasEvents
                ? events
                    .filter((e) => e.outcome === 'DECLINED')
                    .reduce<Date | null>((max, e) => (!max || e.occurredAt > max ? e.occurredAt : max), null)
                : null;

            // Most common decline category
            const declineCounts: Record<string, number> = {};
            if (hasEvents) {
                for (const e of events) {
                    if (e.outcome === 'DECLINED' && e.category) {
                        declineCounts[e.category] = (declineCounts[e.category] ?? 0) + 1;
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
            const topDeclineCategory =
                Object.entries(declineCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

            return {
                id: dc.id,
                ncrdcNo: dc.ncrdcNo,
                fullName: dc.fullName,
                tradingName: dc.tradingName,
                operatingStatus: dc.operatingStatus,
                province: dc.province,
                tel: dc.tel,
                mobile: dc.mobile,
                email: dc.email,
                preferredEmail: dc.preferredEmail,
                lastKnownEmail: dc.lastKnownEmail,
                priorityEmails: dc.priorityEmails,
                staffNotes: dc.staffNotes,
                updatedAt: dc.updatedAt,
                updatedBy: dc.updatedBy
                    ? `${dc.updatedBy.firstName} ${dc.updatedBy.lastName}`
                    : null,
                stats: {
                    total,
                    thisYear,
                    thisMonth,
                    lastMonth,
                    accepted,
                    declined,
                    decided,
                    acceptanceRate,
                    declineRate,
                    lastDeclinedAt,
                    topDeclineCategory,
                },
            };
        });

        // Top 5 DCs by decline volume — the "patterns" summary for the page header
        const topDecliners = [...result]
            .filter((dc: any) => dc.stats.declined > 0)
            .sort((a: any, b: any) => b.stats.declined - a.stats.declined)
            .slice(0, 5)
            .map((dc: any) => ({
                id: dc.id,
                ncrdcNo: dc.ncrdcNo,
                name: dc.fullName ?? dc.tradingName ?? dc.ncrdcNo,
                tradingName: dc.tradingName,
                declined: dc.stats.declined,
                accepted: dc.stats.accepted,
                declineRate: dc.stats.declineRate,
                topDeclineCategory: dc.stats.topDeclineCategory,
                lastDeclinedAt: dc.stats.lastDeclinedAt,
            }));

        return NextResponse.json({
            counsellors: result,
            total: result.length,
            topDecliners,
            canEdit: Boolean(session.user.isAdmin),
        });
    } catch (error) {
        logger.error('GET /api/admin/debt-counsellors', { error });
        return NextResponse.json({ error: 'Failed to fetch debt counsellors' }, { status: 500 });
    }
}

const PatchSchema = z.object({
    id: z.string().min(1),
    ncrdcNo: z.string().min(1),
    fullName: z.string().optional(),
    tradingName: z.string().optional(),
    operatingStatus: z.string().optional(),
    province: z.string().optional(),
    tel: z.string().optional(),
    mobile: z.string().optional(),
    fax: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    preferredEmail: z.string().email().optional().or(z.literal('')),
    lastKnownEmail: z.string().email().optional().or(z.literal('')),
    staffNotes: z.string().optional(),
});

/**
 * PATCH /api/admin/debt-counsellors
 * Update a DebtCounsellor record. Also syncs key fields back to linked Case rows.
 */
export async function PATCH(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const parsed = PatchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const { id, ...fields } = parsed.data;

        const data: Record<string, string | null> = { updatedById: session.user.id };
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) {
                data[key] = value === '' ? null : value;
            }
        }

        const dc = await (prisma as any).debtCounsellor.update({
            where: { id },
            data,
        });

        // Keep the priority list in step with a staff-set preferred email
        if (fields.preferredEmail && fields.preferredEmail !== '') {
            await promoteDcEmail({
                debtCounsellordId: id,
                email: fields.preferredEmail,
                source: 'STAFF',
                notes: `Set by ${session.user.firstName ?? ''} ${session.user.lastName ?? ''}`.trim(),
            });
        }

        // Track email change in history
        if (fields.email && fields.email !== '') {
            const existing = await (prisma as any).debtCounsellorEmailHistory.findFirst({
                where: { debtCounsellordId: id, email: fields.email },
            });
            if (!existing) {
                await (prisma as any).debtCounsellorEmailHistory.create({
                    data: {
                        debtCounsellordId: id,
                        email: fields.email,
                        source: 'STAFF',
                        notes: `Updated by ${session.user.firstName ?? ''} ${session.user.lastName ?? ''}`.trim(),
                    },
                });
            }
        }

        // Sync contact fields back to all linked cases
        const caseSync: Record<string, string | null> = {};
        if ('email' in data) caseSync.dcEmail = data.email;
        if ('fullName' in data) caseSync.debtCounsellorName = data.fullName;
        if ('tradingName' in data) caseSync.dcTradingName = data.tradingName;
        if ('mobile' in data) caseSync.dcMobile = data.mobile;
        if ('tel' in data) caseSync.dcTel = data.tel;
        if ('province' in data) caseSync.dcProvince = data.province;
        if ('operatingStatus' in data) caseSync.dcOperatingStatus = data.operatingStatus;

        if (Object.keys(caseSync).length > 0) {
            await prisma.case.updateMany({
                where: { debtCounsellordId: id },
                data: { ...caseSync, updatedById: session.user.id },
            });
        }

        logger.info('DC record updated', { id: dc.id, ncrdcNo: dc.ncrdcNo });
        return NextResponse.json({ success: true, dc });
    } catch (error) {
        logger.error('PATCH /api/admin/debt-counsellors', { error });
        return NextResponse.json({ error: 'Failed to update debt counsellor' }, { status: 500 });
    }
}
