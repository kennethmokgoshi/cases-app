import { NextResponse } from 'next/server';
import { NCTService } from '@zenowethu/shared-lib/src/nct';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};


export async function GET() {
    try {
        const balance = await NCTService.getBalance();
        return NextResponse.json({ success: true, balance });
    } catch (error) {
        logger.error({ err: error }, 'NCT ePurse API error');
        return NextResponse.json({ success: false, error: 'Failed to retrieve NCT ePurse details' }, { status: 500 });
    }
}
