import { NextRequest, NextResponse } from 'next/server';
import { completePoaSigning } from '@zenowethu/shared-lib/src/poa/signing-service';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/poa/sign/[token]');

/**
 * POST /api/poa/sign/[token]
 *
 * Public endpoint (no auth required).
 * Client draws signature canvas → submit here with token.
 *
 * Body:
 * {
 *   signatureImage: "data:image/png;base64,..." (from canvas.toDataURL())
 * }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> },
) {
    try {
        const { token } = await params;
        const { signatureImage } = await request.json() as { signatureImage?: string };

        if (!signatureImage) {
            return NextResponse.json(
                { error: 'No signature provided' },
                { status: 400 },
            );
        }

        // Capture IP + user-agent for ECTA audit trail
        const ipAddress = request.headers.get('x-forwarded-for')
            || request.headers.get('x-real-ip')
            || 'unknown';
        const userAgent = request.headers.get('user-agent') || 'unknown';

        // Complete the signing
        const result = await completePoaSigning({
            token,
            signatureImage,
            ipAddress,
            userAgent,
        });

        if ('error' in result) {
            return NextResponse.json(
                { error: result.error },
                { status: result.status },
            );
        }

        logger.info('[POA] Signature submitted and processed', {
            token: token.slice(0, 8) + '…',
            documentId: result.documentId,
        });

        return NextResponse.json({
            success: true,
            documentId: result.documentId,
            message: 'Your Power of Attorney has been signed and submitted. Thank you!',
        });

    } catch (error) {
        logger.error('[POA] Signing error', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 },
        );
    }
}
