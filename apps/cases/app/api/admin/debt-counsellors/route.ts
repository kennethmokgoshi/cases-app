import { NextResponse } from 'next/server';
import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = {
    info: (...args: unknown[]) => console.log('[INFO]', ...args),
    error: (...args: unknown[]) => console.error('[ERROR]', ...args),
};

/**
 * GET /api/admin/debt-counsellors
 * Returns one record per unique NCRDC number (or email if no NCRDC),
 * including the latest contact details across all matching cases.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Pull every case that has had a DC email sent (has dcEmail set)
        const cases = await prisma.case.findMany({
            where: {
                OR: [
                    { dcEmail: { not: null } },
                    { ncrdcNo: { not: null } },
                ],
            },
            select: {
                ncrdcNo: true,
                debtCounsellorName: true,
                dcTradingName: true,
                dcEmail: true,
                lastKnownEmail: true,
                dcMobile: true,
                lastUsedMobile: true,
                dcTel: true,
                lastUsedTel: true,
                dcOperatingStatus: true,
                dcProvince: true,
                updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
        });

        // Group by ncrdcNo (or fallback key = email), keep freshest values
        const map = new Map<string, {
            ncrdcNo: string | null;
            debtCounsellorName: string | null;
            dcTradingName: string | null;
            dcEmail: string | null;
            lastKnownEmail: string | null;
            dcMobile: string | null;
            lastUsedMobile: string | null;
            dcTel: string | null;
            lastUsedTel: string | null;
            dcOperatingStatus: string | null;
            dcProvince: string | null;
            caseCount: number;
        }>();

        for (const c of cases) {
            const key = c.ncrdcNo ?? c.dcEmail ?? '__unknown__';
            if (!map.has(key)) {
                map.set(key, {
                    ncrdcNo: c.ncrdcNo,
                    debtCounsellorName: c.debtCounsellorName,
                    dcTradingName: c.dcTradingName,
                    dcEmail: c.dcEmail,
                    lastKnownEmail: c.lastKnownEmail,
                    dcMobile: c.dcMobile,
                    lastUsedMobile: c.lastUsedMobile,
                    dcTel: c.dcTel,
                    lastUsedTel: c.lastUsedTel,
                    dcOperatingStatus: c.dcOperatingStatus,
                    dcProvince: c.dcProvince,
                    caseCount: 1,
                });
            } else {
                const existing = map.get(key)!;
                existing.caseCount++;
                // Fill in missing fields from older cases (freshest first, so only fill nulls)
                if (!existing.debtCounsellorName && c.debtCounsellorName) existing.debtCounsellorName = c.debtCounsellorName;
                if (!existing.dcTradingName && c.dcTradingName) existing.dcTradingName = c.dcTradingName;
                if (!existing.dcEmail && c.dcEmail) existing.dcEmail = c.dcEmail;
                if (!existing.lastKnownEmail && c.lastKnownEmail) existing.lastKnownEmail = c.lastKnownEmail;
                if (!existing.dcMobile && c.dcMobile) existing.dcMobile = c.dcMobile;
                if (!existing.lastUsedMobile && c.lastUsedMobile) existing.lastUsedMobile = c.lastUsedMobile;
                if (!existing.dcTel && c.dcTel) existing.dcTel = c.dcTel;
                if (!existing.lastUsedTel && c.lastUsedTel) existing.lastUsedTel = c.lastUsedTel;
                if (!existing.dcOperatingStatus && c.dcOperatingStatus) existing.dcOperatingStatus = c.dcOperatingStatus;
                if (!existing.dcProvince && c.dcProvince) existing.dcProvince = c.dcProvince;
            }
        }

        const counsellors = Array.from(map.values());
        return NextResponse.json({ counsellors, total: counsellors.length });
    } catch (error) {
        logger.error('GET /api/admin/debt-counsellors error:', error);
        return NextResponse.json({ error: 'Failed to fetch debt counsellors' }, { status: 500 });
    }
}

const PatchSchema = z.object({
    ncrdcNo: z.string().min(1),
    debtCounsellorName: z.string().optional(),
    dcTradingName: z.string().optional(),
    dcEmail: z.string().email().optional().or(z.literal('')),
    lastKnownEmail: z.string().email().optional().or(z.literal('')),
    dcMobile: z.string().optional(),
    lastUsedMobile: z.string().optional(),
    dcTel: z.string().optional(),
    lastUsedTel: z.string().optional(),
    dcOperatingStatus: z.string().optional(),
    dcProvince: z.string().optional(),
});

/**
 * PATCH /api/admin/debt-counsellors
 * Update contact details for all cases with a given NCRDC number.
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
            return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
        }

        const { ncrdcNo, ...updates } = parsed.data;

        // Build update object — only include fields that were provided
        const data: Record<string, string | null> = {};
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                data[key] = value === '' ? null : value;
            }
        }

        const result = await prisma.case.updateMany({
            where: { ncrdcNo },
            data,
        });

        logger.info(`DC details updated for NCRDC ${ncrdcNo}: ${result.count} cases`);
        return NextResponse.json({ success: true, updatedCases: result.count });
    } catch (error) {
        logger.error('PATCH /api/admin/debt-counsellors error:', error);
        return NextResponse.json({ error: 'Failed to update debt counsellor' }, { status: 500 });
    }
}
