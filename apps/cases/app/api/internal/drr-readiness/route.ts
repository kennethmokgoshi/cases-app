import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { runDrrDocumentReadiness } from '@zenowethu/shared-lib/src/dhs/drr-readiness';

const logger = createLogger('api/internal/drr-readiness');

const bodySchema = z.object({
    caseId: z.string().min(1),
});

/**
 * POST /api/internal/drr-readiness — run the post-consent document readiness
 * pipeline for a case (credit report / payslip / bank statement check, combined
 * document split, referrer chase-up).
 *
 * The pipeline reads case files from this app's local storage, so it MUST run
 * in the Cases app. Callers:
 *   • the Credo consent route (server-to-server, `x-internal-secret` header)
 *   • signed-in staff (session auth) — e.g. a manual re-run
 *
 * AI splitting can take a couple of minutes; server-to-server callers should
 * fire-and-forget. The outcome is always posted to the case timeline.
 */
export async function POST(request: NextRequest) {
    try {
        // ── Auth: internal shared secret OR a staff session ─────────────────
        const secret = process.env.INTERNAL_API_SECRET;
        const headerSecret = request.headers.get('x-internal-secret');
        const internalCall = Boolean(secret && headerSecret && headerSecret === secret);

        let triggeredByUserId: string | undefined;
        if (!internalCall) {
            const session = await auth();
            if (!session?.user || session.user.userType === 'B2B_PARTNER') {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            triggeredByUserId = session.user.id;
        }

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: 'caseId is required' }, { status: 400 });
        }

        logger.info(`[DRR Readiness] Triggered for case ${parsed.data.caseId} (${internalCall ? 'internal' : 'staff'})`);
        const result = await runDrrDocumentReadiness({ caseId: parsed.data.caseId, triggeredByUserId });

        return NextResponse.json({ success: result.errors.length === 0, result });
    } catch (error) {
        logger.error('[DRR Readiness] Route error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
