import { NextResponse } from 'next/server';
import { auth, createLogger, isCommissionEligible } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import type { ReferrerCommissionStage } from '@zenowethu/database';

const logger = createLogger('api/admin/referrers/[id]/commission/[commissionId]');

const VALID_STAGES: ReferrerCommissionStage[] = [
    'NEW_LEAD', 'ADMIN_FEE_PAID', 'QUOTE_SUBMITTED', 'QUOTE_ACCEPTED',
    'DEPOSIT_PAID', 'PAYING_INSTALMENTS', 'UP_TO_DATE',
    'ARREARS_1M', 'ARREARS_2M', 'ARREARS_3M', 'ARREARS_4M_PLUS',
    'HANDED_OVER', 'SETTLED',
];

const PatchSchema = z.object({
    isPaid: z.boolean().optional(),
    paymentRef: z.string().max(200).nullable().optional(),
    commissionAmount: z.number().positive().nullable().optional(),
    stage: z.enum(VALID_STAGES as [ReferrerCommissionStage, ...ReferrerCommissionStage[]]).optional(),
    notes: z.string().max(1000).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' });

function isAdminLevel(session: { user: { isAdmin?: boolean; isExecutive?: boolean; isSeniorManager?: boolean; role?: string } }) {
    return session.user.isAdmin || session.user.isExecutive || session.user.isSeniorManager || session.user.role === 'MANAGER';
}

// PATCH /api/admin/referrers/[id]/commission/[commissionId]
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string; commissionId: string }> }
) {
    try {
        const { id, commissionId } = await params;
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!isAdminLevel(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const existing = await prisma.referrerCommission.findUnique({
            where: { id: commissionId },
        });
        if (!existing || existing.referrerId !== id) {
            return NextResponse.json({ error: 'Commission record not found' }, { status: 404 });
        }

        const body = await request.json();
        const parsed = PatchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }

        const data = parsed.data;
        const updateData: Record<string, unknown> = {};

        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.paymentRef !== undefined) updateData.paymentRef = data.paymentRef;
        if (data.commissionAmount !== undefined) updateData.commissionAmount = data.commissionAmount;

        if (data.stage !== undefined) {
            updateData.stage = data.stage;
            updateData.isEligible = isCommissionEligible(data.stage);
        }

        if (data.isPaid !== undefined) {
            updateData.isPaid = data.isPaid;
            if (data.isPaid) {
                updateData.paidAt = new Date();
                updateData.paidById = session.user.id;
            } else {
                updateData.paidAt = null;
                updateData.paidById = null;
            }
        }

        const updated = await prisma.referrerCommission.update({
            where: { id: commissionId },
            data: updateData,
            include: {
                case: {
                    select: {
                        fileNumber: true,
                        status: true,
                        client: { select: { firstName: true, lastName: true } },
                    },
                },
                paidBy: { select: { firstName: true, lastName: true } },
            },
        });

        logger.info(`Commission ${commissionId} updated by ${session.user.id}`);
        return NextResponse.json(updated);
    } catch (error) {
        logger.error('Error updating commission:', error);
        return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 });
    }
}
