import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@zenowethu/shared-lib';
import { recordDrrProxyConsent, runDrrDocumentReadiness } from '@zenowethu/shared-lib/src/dhs';
import { auth } from '@zenowethu/shared-lib/src/auth';

const logger = createLogger('api/cases/[id]/drr-proxy-consent');

const proxyConsentSchema = z.object({
    role: z.enum(['STAFF', 'B2B', 'REFERRER']).optional().default('STAFF'),
    notes: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await params;
        const body = await request.json().catch(() => ({}));
        const parseResult = proxyConsentSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json({ error: 'Invalid input', details: parseResult.error.flatten() }, { status: 400 });
        }

        const { notes } = parseResult.data;
        const sessionUserType = (session.user as any).userType?.toUpperCase();
        // Automatically determine role based on authenticated session:
        // If logged-in user is B2B Partner -> B2B. If Referrer -> REFERRER. Otherwise -> STAFF.
        const role: 'STAFF' | 'B2B' | 'REFERRER' =
            sessionUserType === 'B2B_PARTNER' ? 'B2B' :
            sessionUserType === 'REFERRER' ? 'REFERRER' :
            (parseResult.data.role || 'STAFF');

        const userId = session.user.id;
        const userName = [session.user.firstName, session.user.lastName].filter(Boolean).join(' ') || (session.user as any).name || session.user.email || 'Authorized User';
        const userEmail = session.user.email || 'n/a';

        const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined;
        const userAgent = request.headers.get('user-agent') || undefined;

        logger.info(`[Proxy Consent API] User ${userName} (${role}, ${userId}) recording proxy consent for case ${caseId}`);

        const result = await recordDrrProxyConsent({
            caseId,
            userId,
            userName,
            userEmail,
            userRole: role,
            notes,
            ipAddress,
            userAgent,
        });

        if (!result.ok) {
            return NextResponse.json({ error: result.error || 'Failed to record proxy consent' }, { status: result.status || 500 });
        }

        // Trigger DRR document readiness check (credit report, payslip, bank statement)
        try {
            await runDrrDocumentReadiness({ caseId, triggeredByUserId: userId });
        } catch (err) {
            logger.error(`[Proxy Consent API] Post-consent readiness pipeline failed for case ${caseId}:`, err);
        }

        return NextResponse.json({
            success: true,
            message: `Proxy consent successfully recorded for ${userName} (${role}).`,
            caseId: result.caseId,
        });
    } catch (err: any) {
        logger.error('[Proxy Consent API] Unexpected error:', err);
        return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
    }
}
