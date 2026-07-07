/**
 * Bureau/provider file requests are paused.
 *
 * Debt review related matters must not be emailed to credit bureaus or credit
 * providers from this endpoint until the request contents are updated and
 * re-approved.
 */

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/cases/[id]/send-file-requests');

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        logger.info(`[send-file-requests] Case ${id}: bureau/provider file requests are paused`);

        return NextResponse.json({
            success: true,
            paused: true,
            message: 'Credit bureau and credit provider file requests are paused until further notice.',
            bureauResults: [],
            providerResults: [],
            summary: {
                bureausSent: 0,
                providersSent: 0,
                totalFailures: 0,
            },
        });
    } catch (error) {
        logger.error('send-file-requests pause response error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
