import { NextResponse } from 'next/server';
import { GhlService , logger } from '@zenowethu/shared-lib';

/**
 * API Route for GoHighLevel Webhooks
 * 
 * Target this URL in GHL Automation / Workflow Webhook action:
 * {APP_URL}/api/webhooks/ghl
 */
export async function POST(request: Request) {
    try {
        const payload = await request.json();

        // Log the payload for debugging (GHL doesn't always send the same structure)
        logger.info('[GHL Webhook] POST received');

        const result = await GhlService.handleWebhook(payload);

        if (result.success) {
            return NextResponse.json({ success: true, caseId: (result as any).caseId });
        } else {
            // Even if we couldn't match a case, we return 200 to GHL to avoid retries
            // but we log the issue.
            return NextResponse.json({ success: false, reason: (result as any).error });
        }
    } catch (error: any) {
        logger.error('[GHL Webhook Error]', error);
        // Always return 200 to GHL unless it's a critical crash
        return NextResponse.json({ error: 'Failed to process webhook' }, { status: 200 });
    }
}

// Support for GHL verification (sometimes they do a GET/HEAD)
export async function GET() {
    return NextResponse.json({ status: 'active', service: 'Zeno GHL Integration' });
}
