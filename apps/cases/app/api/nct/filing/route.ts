import { NextResponse } from 'next/server';
import { NCTService } from '@zenowethu/shared-lib/src/nct';

import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/nct/filing');

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { caseId, data } = body;

        if (!caseId) {
            return NextResponse.json({ error: 'Case ID is required' }, { status: 400 });
        }

        // 1. Trigger NCT eFiling
        const result = await NCTService.fileApplication(data);

        if (result.success && result.caseNumber) {
            // 2. Update database with NCT case number and status
            await prisma.case.update({
                where: { id: caseId },
                data: {
                    nctCaseNumber: result.caseNumber,
                    nctStatus: 'FILED',
                    nctFilingDate: new Date(),
                    nctLastUpdated: new Date()
                }
            });
        }

        return NextResponse.json(result);
    } catch (error) {
        logger.error({ err: error }, 'NCT Filing API error');
        return NextResponse.json({ error: 'Failed to process NCT eFiling' }, { status: 500 });
    }
}
