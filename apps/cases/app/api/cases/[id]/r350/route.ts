import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/r350');

const R350Schema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('pay'),
        /** ISO date string — defaults to now if omitted */
        paidDate: z.string().datetime({ offset: true }).optional(),
        /** Bank reference, receipt number, etc. */
        paidRef: z.string().max(200).trim().optional(),
    }),
    z.object({
        action: z.literal('waive'),
        reason: z.string().min(1, 'Reason is required').max(500).trim(),
    }),
    z.object({
        /** Reset back to PENDING (undo a pay/waive) — admin only */
        action: z.literal('reset'),
    }),
]);

/**
 * PATCH /api/cases/[id]/r350
 *
 * Three actions:
 *  - "pay"   — marks R350 as paid, records date, reference, and who recorded it
 *  - "waive" — waives the R350 requirement for this case, records reason
 *  - "reset" — reverts to PENDING (admin/executive only)
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // All staff can record/waive R350; only admin/executive can reset
        const isStaff = session.user.isAdmin
            || session.user.isExecutive
            || session.user.isSeniorManager
            || session.user.role === 'MANAGER'
            || session.user.userType === 'STAFF';

        if (!isStaff) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const existing = await prisma.case.findUnique({
            where: { id },
            select: {
                id: true,
                r350Status: true,
                acquisitionType: true,
                fileNumber: true,
            },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        if (existing.acquisitionType === 'B2B') {
            return NextResponse.json(
                { error: 'R350 is not applicable for B2B cases' },
                { status: 422 },
            );
        }

        const body = await request.json();
        const parsed = R350Schema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', issues: parsed.error.issues },
                { status: 422 },
            );
        }

        const data = parsed.data;

        if (data.action === 'reset') {
            const canReset = session.user.isAdmin || session.user.isExecutive;
            if (!canReset) {
                return NextResponse.json(
                    { error: 'Only Admin or Executive can reset R350 status' },
                    { status: 403 },
                );
            }
        }

        let updateData: Record<string, unknown>;

        switch (data.action) {
            case 'pay':
                updateData = {
                    r350Status:    'PAID_R350',
                    r350PaidDate:  data.paidDate ? new Date(data.paidDate) : new Date(),
                    r350PaidRef:   data.paidRef ?? null,
                    r350PaidById:  session.user.id,
                    // Clear any waiver if this case was previously waived then re-paid
                    r350Waived:       false,
                    r350WaivedById:   null,
                    r350WaivedAt:     null,
                    r350WaivedReason: null,
                };
                break;

            case 'waive':
                updateData = {
                    r350Status:       'WAIVED',
                    r350Waived:       true,
                    r350WaivedById:   session.user.id,
                    r350WaivedAt:     new Date(),
                    r350WaivedReason: data.reason,
                    // Clear any previous payment record
                    r350PaidDate:  null,
                    r350PaidRef:   null,
                    r350PaidById:  null,
                };
                break;

            case 'reset':
                updateData = {
                    r350Status:       'PENDING',
                    r350PaidDate:     null,
                    r350PaidRef:      null,
                    r350PaidById:     null,
                    r350Waived:       false,
                    r350WaivedById:   null,
                    r350WaivedAt:     null,
                    r350WaivedReason: null,
                };
                break;
        }

        const updated = await prisma.case.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                fileNumber: true,
                r350Status: true,
                r350PaidDate: true,
                r350PaidRef: true,
                r350Waived: true,
                r350WaivedAt: true,
                r350WaivedReason: true,
                r350PaidBy:    { select: { firstName: true, lastName: true } },
                r350WaivedBy:  { select: { firstName: true, lastName: true } },
            },
        });

        logger.info(
            `R350 ${data.action} on case ${id} (${existing.fileNumber}) by user ${session.user.id}`,
        );

        return NextResponse.json(updated);
    } catch (error) {
        logger.error('Error updating R350 status:', error);
        return NextResponse.json({ error: 'Failed to update R350 status' }, { status: 500 });
    }
}

/**
 * GET /api/cases/[id]/r350
 * Returns the current R350 status detail for the case.
 */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const record = await prisma.case.findUnique({
            where: { id },
            select: {
                id: true,
                fileNumber: true,
                r350Status: true,
                r350PaidDate: true,
                r350PaidRef: true,
                r350Waived: true,
                r350WaivedAt: true,
                r350WaivedReason: true,
                acquisitionType: true,
                r350PaidBy:   { select: { firstName: true, lastName: true } },
                r350WaivedBy: { select: { firstName: true, lastName: true } },
            },
        });

        if (!record) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        return NextResponse.json(record);
    } catch (error) {
        logger.error('Error fetching R350 status:', error);
        return NextResponse.json({ error: 'Failed to fetch R350 status' }, { status: 500 });
    }
}
