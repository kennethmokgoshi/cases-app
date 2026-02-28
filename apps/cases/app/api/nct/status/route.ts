import { NextResponse } from 'next/server';
import { NCTService } from '@zenowethu/shared-lib/src/nct';
import { logger } from '@zenowethu/shared-lib';

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
