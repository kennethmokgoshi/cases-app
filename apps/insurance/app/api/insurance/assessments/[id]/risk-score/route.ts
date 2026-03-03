import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { calculateRiskScore, inferEmploymentStatus } from '../../../../../../lib/risk-scoring';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

        const assessment = await prisma.insuranceAssessment.findUnique({
            where: { id },
            include: {
                Case: {
                    include: {
                        client: true,
                        creditAccounts: { where: { status: 'ACTIVE' } } } },
                accounts: {
                    include: { creditAccount: true } } } });

        if (!assessment) {
            return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
        }

        const client = assessment.Case.client;
        const creditAccounts = assessment.Case.creditAccounts;

        const employmentStatus = inferEmploymentStatus(
            client.employer,
            client.grossSalary ? Number(client.grossSalary) : null
        );

        const totalMonthlyInstalment = creditAccounts.reduce(
            (sum, acc) => sum + (acc.monthlyInstalment ? Number(acc.monthlyInstalment) : 0),
            0
        );
        const totalOutstandingBalance = creditAccounts.reduce(
            (sum, acc) => sum + Number(acc.outstandingBalance),
            0
        );

        const result = calculateRiskScore({
            idNumber: client.idNumber,
            employmentStatus,
            netSalary: client.netSalary ? Number(client.netSalary) : 0,
            grossSalary: client.grossSalary ? Number(client.grossSalary) : undefined,
            totalOutstandingBalance,
            totalMonthlyInstalment,
            activeAccountCount: creditAccounts.length,
            isInDebtReview: !!assessment.Case.ncrdcNo });

        return NextResponse.json(result);
    } catch (error: any) {
        logger.error('[risk-score] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
