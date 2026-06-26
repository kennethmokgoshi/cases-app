import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { z } from 'zod';
import {
    createArrangement,
    listCaseArrangements,
} from '@zenowethu/shared-lib/src/payments/payment-arrangement-service';

type Ctx = { params: Promise<{ id: string }> };

const InstalmentLineSchema = z.object({
    dueDate: z.string().min(1, 'dueDate is required'),
    amountDue: z.coerce.number().positive('amountDue must be positive'),
});

const CreateSchema = z
    .object({
        frequency: z.enum(['MONTHLY', 'WEEKLY', 'ONCE']).default('MONTHLY'),
        reason: z.string().max(200).optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
        // Either explicit lines…
        instalments: z.array(InstalmentLineSchema).optional(),
        // …or schedule parameters to auto-generate
        schedule: z
            .object({
                totalAmount: z.coerce.number().positive().optional(),
                perInstalmentAmount: z.coerce.number().positive().optional(),
                numInstalments: z.coerce.number().int().min(1).max(60),
                firstDueDate: z.string().min(1),
                dayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
            })
            .optional(),
    })
    .refine((d) => (d.instalments && d.instalments.length > 0) || d.schedule, {
        message: 'Provide either instalments or schedule',
    })
    .refine((d) => !d.schedule || d.schedule.totalAmount || d.schedule.perInstalmentAmount, {
        message: 'schedule needs totalAmount or perInstalmentAmount',
    });

export async function GET(_request: Request, { params }: Ctx) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
        const { id } = await params;
        const arrangements = await listCaseArrangements(id);
        return NextResponse.json({ arrangements });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Finance] GET /cases/[id]/arrangements error:', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function POST(request: Request, { params }: Ctx) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
        const { id } = await params;

        const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
        }

        const caseRecord = await prisma.case.findUnique({
            where: { id },
            select: { id: true, clientId: true },
        });
        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const arrangement = await createArrangement({
            clientId: caseRecord.clientId,
            caseId: caseRecord.id,
            frequency: parsed.data.frequency,
            reason: parsed.data.reason ?? null,
            notes: parsed.data.notes ?? null,
            createdById: (session.user as { id?: string }).id ?? null,
            instalments: parsed.data.instalments,
            schedule: parsed.data.schedule,
        });

        return NextResponse.json({ arrangement }, { status: 201 });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Finance] POST /cases/[id]/arrangements error:', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
