import { NextResponse } from 'next/server';
import { auth, logger } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { setInstalmentHonoured } from '@zenowethu/shared-lib/src/payments/payment-arrangement-service';

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({ honoured: z.boolean() });

/** Manually confirm an instalment as honoured (paid) or missed. */
export async function PATCH(request: Request, { params }: Ctx) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
        const { id } = await params;

        const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }

        const updated = await setInstalmentHonoured(
            id,
            parsed.data.honoured,
            (session.user as { id?: string }).id ?? null
        );
        return NextResponse.json({ instalment: { id: updated.id, status: updated.status } });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Finance] PATCH /instalments/[id] error:', error);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
