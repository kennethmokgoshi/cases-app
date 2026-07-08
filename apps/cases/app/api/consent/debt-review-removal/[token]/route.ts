import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@zenowethu/shared-lib';
import {
    getDrrConsentVerificationState,
    recordDrrConsent,
    verifyDrrConsentIdentity,
} from '@zenowethu/shared-lib/src/dhs/consent-service';
import { runDrrDocumentReadiness } from '@zenowethu/shared-lib/src/dhs/drr-readiness';

const logger = createLogger('api/consent/debt-review-removal/[token]');
const VerifyIdentitySchema = z.object({
    idNumber: z.string().trim().regex(/^\d{13}$/, 'Enter a valid 13-digit SA ID number.'),
});

/**
 * GET  /api/consent/debt-review-removal/[token]  — public; fetch consent details for the page.
 * POST /api/consent/debt-review-removal/[token]  — public; record the consumer's consent.
 *
 * No auth: the token identifies the consent, but the consumer must type the
 * matching SA ID number before details are shown or approval can be recorded.
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const state = await getDrrConsentVerificationState(token);
        if (!state) return NextResponse.json({ error: 'This consent link is not valid.' }, { status: 404 });
        return NextResponse.json(state);
    } catch (error) {
        logger.error('[DRR_CONSENT] GET error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const ipAddress =
            request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        const userAgent = request.headers.get('user-agent') || 'unknown';
        const parsed = VerifyIdentitySchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: 'Enter a valid 13-digit SA ID number.' }, { status: 400 });
        }

        const verification = await verifyDrrConsentIdentity({ token, idNumber: parsed.data.idNumber });
        if (!verification.ok) {
            return NextResponse.json(
                { error: verification.error ?? 'Unable to verify this consent link.' },
                { status: verification.status ?? 400 },
            );
        }

        const result = await recordDrrConsent({
            token,
            ipAddress,
            userAgent,
            verifiedIdNumber: parsed.data.idNumber,
        });
        if (!result.ok) {
            return NextResponse.json(
                { error: result.error ?? 'Unable to record consent.' },
                { status: result.status ?? 400 },
            );
        }

        logger.info('[DRR_CONSENT] Consent recorded', { token: token.slice(0, 8) + '…', alreadyConsented: result.alreadyConsented });

        // Post-consent document readiness (credit report / payslip / bank statement
        // check + combined-document split). Fire-and-forget: the consumer's confirm
        // must not wait on AI splitting; the outcome lands on the case timeline.
        if (!result.alreadyConsented && result.caseId) {
            const caseId = result.caseId;
            void runDrrDocumentReadiness({ caseId }).catch((err) =>
                logger.error(`[DRR_CONSENT] Post-consent readiness failed for case ${caseId}:`, err),
            );
        }

        return NextResponse.json({
            success: true,
            alreadyConsented: result.alreadyConsented,
            message: 'Thank you. Your approval has been recorded and Zenowethu Debt Management is confirmed as the team authorised to continue working on your file.',
        });
    } catch (error) {
        logger.error('[DRR_CONSENT] POST error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
