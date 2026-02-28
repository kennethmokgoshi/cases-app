import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { runAutomatedUnderwriting } from '../../../../../../lib/underwriting-service';
import { calculateRiskScore, inferEmploymentStatus } from '../../../../../../lib/risk-scoring';
import { runUnderwriting } from '../../../../../../lib/underwriting-engine';

export async function POST(
    _request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

        const assessment = await prisma.insuranceAssessment.findUnique({
            where: { id: params.id },
            include: {
                Case: {
                    include: {
                        client: true,
                        creditAccounts: true
                    }
                },
                accounts: {
                    include: { creditAccount: true }
                }
            }
        });

        if (!assessment) {
            return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
        }

        const client = assessment.Case.client;

        // Run automated underwriting service
        const result = await runAutomatedUnderwriting(params.id, session.user.id);

        return NextResponse.json(result);
    } catch (error: any) {
        logger.error({ error }, '[underwrite] POST error:');
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
