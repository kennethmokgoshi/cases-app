import { NextResponse } from 'next/server';
import { auth, logger } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { setInstalmentHonoured } from '@zenowethu/shared-lib/src/payments/payment-arrangement-service';

type Ctx = { params: Promise<{ id: string }> };

// `honoured` is the original boolean form; `outcome` adds AUTO so staff can undo
// a manual call and let recorded payments decide the month again.
const PatchSchema = z
    .object({
        honoured: z.boolean().optional(),
        outcome: z.enum(['PAID', 'MISSED', 'AUTO']).optional(),
    })
    .refine((d) => d.honoured !== undefined || d.outcome !== undefined, {
        message: 'Provide honoured or outcome',
    });

/** Manually record whether a month's instalment was honoured, missed, or unset. */
export async function PATCH(request: Request, { params }: Ctx) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
        const { id } = await params;

        const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
        }

        const outcome = parsed.data.outcome ?? (parsed.data.honoured ? 'PAID' : 'MISSED');
        const updated = await setInstalmentHonoured(
            id,
            outcome,
            (session.user as { id?: string }).id ?? null
        );
        return NextResponse.json({ instalment: { id: updated.id, status: updated.status } });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Finance] PATCH /instalments/[id] error:', error);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
