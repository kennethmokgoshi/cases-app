import { NextResponse } from 'next/server';
import { NCTService } from '@zenowethu/shared-lib/src/nct';
import { logger } from '@zenowethu/shared-lib';

export async function GET() {
    try {
        const balance = await NCTService.getBalance();
        return NextResponse.json({ success: true, balance });
    } catch (error) {
        logger.error({ err: error }, 'NCT ePurse API error');
        return NextResponse.json({ success: false, error: 'Failed to retrieve NCT ePurse details' }, { status: 500 });
    }
}
