import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/debt-counsellors/backfill');

/**
 * POST /api/admin/debt-counsellors/backfill
 * One-time operation: creates DebtCounsellor records from existing Case data
 * grouped by ncrdcNo, then links each Case to its DebtCounsellor.
 * Safe to re-run — skips cases already linked.
 */
export async function POST() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Only process cases that have an ncrdcNo but no debtCounsellordId yet
        const cases = await prisma.case.findMany({
            where: {
                ncrdcNo: { not: null },
                debtCounsellordId: null,
            },
            select: {
                id: true,
                ncrdcNo: true,
                debtCounsellorName: true,
                dcTradingName: true,
                dcEmail: true,
                lastKnownEmail: true,
                dcMobile: true,
                dcTel: true,
                dcOperatingStatus: true,
                dcProvince: true,
                updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
        });

        if (cases.length === 0) {
            return NextResponse.json({ message: 'Nothing to backfill.', created: 0, linked: 0 });
        }

        // Group by ncrdcNo — pick freshest values (cases ordered by updatedAt desc)
        const grouped = new Map<string, {
            ncrdcNo: string;
            fullName: string | null;
            tradingName: string | null;
            email: string | null;
            lastKnownEmail: string | null;
            mobile: string | null;
            tel: string | null;
            operatingStatus: string | null;
            province: string | null;
            caseIds: string[];
        }>();

        for (const c of cases) {
            const key = c.ncrdcNo!;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    ncrdcNo: key,
                    fullName: c.debtCounsellorName,
                    tradingName: c.dcTradingName,
                    email: c.dcEmail,
                    lastKnownEmail: c.lastKnownEmail,
                    mobile: c.dcMobile,
                    tel: c.dcTel,
                    operatingStatus: c.dcOperatingStatus,
                    province: c.dcProvince,
                    caseIds: [c.id],
                });
            } else {
                const g = grouped.get(key)!;
                g.caseIds.push(c.id);
                if (!g.fullName && c.debtCounsellorName) g.fullName = c.debtCounsellorName;
                if (!g.tradingName && c.dcTradingName) g.tradingName = c.dcTradingName;
                if (!g.email && c.dcEmail) g.email = c.dcEmail;
                if (!g.lastKnownEmail && c.lastKnownEmail) g.lastKnownEmail = c.lastKnownEmail;
                if (!g.mobile && c.dcMobile) g.mobile = c.dcMobile;
                if (!g.tel && c.dcTel) g.tel = c.dcTel;
                if (!g.operatingStatus && c.dcOperatingStatus) g.operatingStatus = c.dcOperatingStatus;
                if (!g.province && c.dcProvince) g.province = c.dcProvince;
            }
        }

        let created = 0;
        let linked = 0;

        for (const g of grouped.values()) {
            // Upsert the DebtCounsellor record
            const dc = await (prisma as any).debtCounsellor.upsert({
                where: { ncrdcNo: g.ncrdcNo },
                create: {
                    ncrdcNo: g.ncrdcNo,
                    fullName: g.fullName,
                    tradingName: g.tradingName,
                    email: g.email,
                    lastKnownEmail: g.lastKnownEmail,
                    mobile: g.mobile,
                    tel: g.tel,
                    operatingStatus: g.operatingStatus,
                    province: g.province,
                },
                update: {
                    // Only fill blanks on existing records
                    fullName: g.fullName ?? undefined,
                    tradingName: g.tradingName ?? undefined,
                    email: g.email ?? undefined,
                    lastKnownEmail: g.lastKnownEmail ?? undefined,
                    mobile: g.mobile ?? undefined,
                    tel: g.tel ?? undefined,
                    operatingStatus: g.operatingStatus ?? undefined,
                    province: g.province ?? undefined,
                },
            });

            if (dc._count === undefined) created++;

            // Seed email history if email present
            if (g.email) {
                await (prisma as any).debtCounsellorEmailHistory.upsert({
                    where: {
                        // No unique constraint on email+dcId — use findFirst pattern
                        id: 'placeholder_never_matches',
                    },
                    create: {
                        debtCounsellordId: dc.id,
                        email: g.email,
                        source: 'DHS',
                        notes: 'Backfilled from case history',
                    },
                    update: {},
                }).catch(async () => {
                    // Fallback: check if entry exists before creating
                    const exists = await (prisma as any).debtCounsellorEmailHistory.findFirst({
                        where: { debtCounsellordId: dc.id, email: g.email },
                    });
                    if (!exists) {
                        await (prisma as any).debtCounsellorEmailHistory.create({
                            data: {
                                debtCounsellordId: dc.id,
                                email: g.email,
                                source: 'DHS',
                                notes: 'Backfilled from case history',
                            },
                        });
                    }
                });
            }

            // Link all cases to this DC record
            const updateResult = await prisma.case.updateMany({
                where: { id: { in: g.caseIds }, debtCounsellordId: null },
                data: { debtCounsellordId: dc.id },
            });
            linked += updateResult.count;
        }

        logger.info('DC backfill complete', { dcGroups: grouped.size, linked });
        return NextResponse.json({
            message: 'Backfill complete.',
            dcGroups: grouped.size,
            linked,
        });
    } catch (error) {
        logger.error('POST /api/admin/debt-counsellors/backfill', { error });
        return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
    }
}
