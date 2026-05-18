import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { createLogger } from '@zenowethu/shared-lib';
import { GhlService } from '@zenowethu/shared-lib/src/integrations';

const logger = createLogger('api/webhooks/ghl');

/**
 * Verify GHL webhook HMAC-SHA256 signature.
 * GHL sends the signature in the x-ghl-signature header.
 * Set GHL_WEBHOOK_SECRET in .env to enable — if the env var is absent, verification is skipped
 * (allows testing without a secret while keeping prod hardened).
 */
function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
    if (!signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    // timingSafeEqual prevents timing attacks; buffers must be equal length
    try {
        return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
        return false;
    }
}

/**
 * API Route for GoHighLevel Webhooks.
 * Target URL in GHL Automation → Webhook action: {APP_URL}/api/webhooks/ghl
 * Env var: GHL_WEBHOOK_SECRET — set this to the signing secret from the GHL webhook config.
 */
export async function POST(request: Request) {
    try {
        const rawBody = await request.text();

        const secret = process.env.GHL_WEBHOOK_SECRET;
        if (secret) {
            const signature = request.headers.get('x-ghl-signature');
            if (!verifySignature(rawBody, signature, secret)) {
                logger.warn('[GHL Webhook] Rejected — invalid signature');
                // Return 200 so GHL doesn't retry a legitimately rejected request
                return NextResponse.json({ success: false, reason: 'Invalid signature' });
            }
        }

        const payload = JSON.parse(rawBody);
        logger.info('[GHL Webhook] POST received');

        const result = await GhlService.handleWebhook(payload);

        if (result.success) {
            return NextResponse.json({ success: true, caseId: (result as any).caseId });
        } else {
            // Return 200 to GHL even on business-logic failures to prevent retries
            return NextResponse.json({ success: false, reason: (result as any).error });
        }
    } catch (error: any) {
        logger.error('[GHL Webhook Error]', error);
        return NextResponse.json({ error: 'Failed to process webhook' }, { status: 200 });
    }
}

// GHL sometimes sends a GET/HEAD to verify the endpoint is alive
export async function GET() {
    return NextResponse.json({ status: 'active', service: 'Zeno GHL Integration' });
}
