import { NextResponse } from 'next/server';
import { NCTService } from '@zenowethu/shared-lib/src/nct';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};


export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const identifier = searchParams.get('identifier') || searchParams.get('identityNo') || searchParams.get('idNumber') || searchParams.get('caseNumber');

    if (!identifier) {
        return NextResponse.json({ error: 'Identifier (ID number or Case Number) is required' }, { status: 400 });
    }

    try {
        const status = await NCTService.checkStatus(identifier);
        return NextResponse.json({ success: true, status });
    } catch (error) {
        logger.error({ err: error }, 'NCT Status API error');
        return NextResponse.json({ success: false, error: 'Failed to check NCT status' }, { status: 500 });
    }
}
