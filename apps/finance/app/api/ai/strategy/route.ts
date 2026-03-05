
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger, generateCaseStrategy } from '@zenowethu/shared-lib';

/**
 * POST /api/ai/strategy
 * Generates an AI Case Strategy for a specific case
 */
export async function POST(
    request: NextRequest,
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { caseId } = body;

        if (!caseId) {
            return NextResponse.json({ error: 'Case ID is required' }, { status: 400 });
        }

        // 1. Fetch case with related data
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: {
                client: true,
                creditAccounts: {
                    where: { isIncluded: true }
                }
            }
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // 2. Prepare request for AI Engine
        const strategyRequest = {
            client: {
                firstName: caseRecord.client.firstName,
                lastName: caseRecord.client.lastName,
                idNumber: caseRecord.client.idNumber,
                grossSalary: caseRecord.client.grossSalary ? Number(caseRecord.client.grossSalary) : null,
                netSalary: caseRecord.client.netSalary ? Number(caseRecord.client.netSalary) : null,
                type: caseRecord.client.type,
            },
            caseData: {
                fileNumber: caseRecord.fileNumber,
                acquisitionType: caseRecord.acquisitionType,
                status: caseRecord.status,
                dhsStatus: caseRecord.dhsStatus,
                totalDebtAmount: caseRecord.totalDebtAmount ? Number(caseRecord.totalDebtAmount) : 0,
                openAccounts: caseRecord.openAccounts,
                closedAccounts: caseRecord.closedAccounts,
                prescribedAccounts: caseRecord.prescribedAccounts,
            },
            accounts: caseRecord.creditAccounts.map(acc => ({
                creditorName: acc.creditorName,
                accountType: acc.accountType,
                outstandingBalance: Number(acc.outstandingBalance),
                lastPaymentDate: acc.lastPaymentDate,
                isPrescribed: acc.isPrescribed,
                monthlyInstalment: acc.monthlyInstalment ? Number(acc.monthlyInstalment) : null,
            }))
        };

        // 3. Generate Strategy
        const strategy = await generateCaseStrategy(strategyRequest);

        // 4. Log the activity
        await prisma.caseComment.create({
            data: {
                caseId,
                userId: session.user.id,
                content: `AI Strategy generated: ${strategy.primaryPath}. Risk Score: ${strategy.riskScore}/10. Recommended Path: ${strategy.pathDescription}`,
                type: 'AI_INSIGHT',
                isInternal: true
            }
        });

        return NextResponse.json(strategy);
    } catch (error) {
        logger.error('Error in AI Strategy API:', error);
        return NextResponse.json(
            { error: 'Failed to generate AI strategy' },
            { status: 500 }
        );
    }
}
