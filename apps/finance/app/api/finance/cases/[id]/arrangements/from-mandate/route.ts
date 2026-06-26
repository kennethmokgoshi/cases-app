import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { createArrangementFromMandate } from '@zenowethu/shared-lib/src/payments/payment-arrangement-service';

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({ mandateId: z.string().min(1, 'mandateId is required') });

/**
 * Generate a payment arrangement from an approved debit-order mandate on this
 * case. The schedule (amount, frequency, count, day, first collection date) is
 * taken from the mandate.
 */
export async function POST(request: Request, { params }: Ctx) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
        const { id } = await params;

        const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }

        const mandate = await prisma.debitOrderMandate.findUnique({
            where: { id: parsed.data.mandateId },
            select: { id: true, caseId: true },
        });
        if (!mandate || mandate.caseId !== id) {
            return NextResponse.json({ error: 'Mandate not found on this case' }, { status: 404 });
        }

        const arrangement = await createArrangementFromMandate(mandate.id, {
            createdById: (session.user as { id?: string }).id ?? null,
        });

        return NextResponse.json({ arrangement }, { status: 201 });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Finance] POST /cases/[id]/arrangements/from-mandate error:', error);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
