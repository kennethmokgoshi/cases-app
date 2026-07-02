import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { toPortalNumber } from '@/lib/referrer-portal';

const logger = createLogger('api/referrer-portal/profile');

const ProfileSchema = z.object({
    email: z.string().email().nullable().optional(),
    cellNumber: z.string().trim().min(7).max(30).nullable().optional(),
    bankName: z.string().trim().max(80).nullable().optional(),
    accountNumber: z.string().trim().max(40).nullable().optional(),
    accountType: z.string().trim().max(40).nullable().optional(),
    branchCode: z.string().trim().max(20).nullable().optional(),
    accountHolderName: z.string().trim().max(120).nullable().optional(),
});

function normalizeNullable(value: string | null | undefined): string | null | undefined {
    if (value === undefined || value === null) return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(request: Request) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const parsed = ProfileSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid profile update', details: parsed.error.flatten() }, { status: 422 });
        }

        const updated = await prisma.referrer.update({
            where: { id: access.referrer.id },
            data: {
                email: normalizeNullable(parsed.data.email),
                cellNumber: normalizeNullable(parsed.data.cellNumber),
                bankName: normalizeNullable(parsed.data.bankName),
                accountNumber: normalizeNullable(parsed.data.accountNumber),
                accountType: normalizeNullable(parsed.data.accountType),
                branchCode: normalizeNullable(parsed.data.branchCode),
                accountHolderName: normalizeNullable(parsed.data.accountHolderName),
            },
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
                fixedCommissionAmount: true,
                commissionType: true,
            },
        });

        return NextResponse.json({
            referrer: {
                ...updated,
                fixedCommissionAmount: toPortalNumber(updated.fixedCommissionAmount),
            },
        });
    } catch (error) {
        logger.error('Failed to update referrer portal profile', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
}
