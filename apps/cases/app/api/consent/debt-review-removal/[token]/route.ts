import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@zenowethu/shared-lib';
import { getDrrConsentByToken, recordDrrConsent } from '@zenowethu/shared-lib/src/dhs/consent-service';

const logger = createLogger('api/consent/debt-review-removal/[token]');

/**
 * GET  /api/consent/debt-review-removal/[token]  — public; fetch consent details for the page.
 * POST /api/consent/debt-review-removal/[token]  — public; record the consumer's consent.
 *
 * No auth: the unguessable token IS the credential (same model as POA signing links).
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const view = await getDrrConsentByToken(token);
        if (!view) return NextResponse.json({ error: 'This consent link is not valid.' }, { status: 404 });
        return NextResponse.json(view);
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

        const result = await recordDrrConsent({ token, ipAddress, userAgent });
        if (!result.ok) {
            return NextResponse.json(
                { error: result.error ?? 'Unable to record consent.' },
                { status: result.status ?? 400 },
            );
        }

        logger.info('[DRR_CONSENT] Consent recorded', { token: token.slice(0, 8) + '…', alreadyConsented: result.alreadyConsented });
        return NextResponse.json({
            success: true,
            alreadyConsented: result.alreadyConsented,
            message: 'Thank you. Your consent has been recorded and we will proceed with your debt review removal.',
        });
    } catch (error) {
        logger.error('[DRR_CONSENT] POST error', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
