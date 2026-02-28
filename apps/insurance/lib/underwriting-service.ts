import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import { calculateRiskScore, inferEmploymentStatus } from './risk-scoring';
import { runUnderwriting as executeUnderwriting } from './underwriting-engine';

export async function runAutomatedUnderwriting(assessmentId: string, userId: string) {
    try {
        const assessment = await prisma.insuranceAssessment.findUnique({
            where: { id: assessmentId },
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

        if (!assessment) throw new Error('Assessment not found');
        const client = assessment.Case.client;

        // 1. Calculate risk score
        const employmentStatus = inferEmploymentStatus(
            client.employer,
            client.grossSalary ? Number(client.grossSalary) : null
        );

        const activeAccounts = assessment.Case.creditAccounts.filter(a => a.status === 'ACTIVE');
        const totalMonthlyInstalment = activeAccounts.reduce(
            (sum, acc) => sum + (acc.monthlyInstalment ? Number(acc.monthlyInstalment) : 0),
            0
        );
        const totalOutstandingBalance = activeAccounts.reduce(
            (sum, acc) => sum + Number(acc.outstandingBalance),
            0
        );

        const riskScore = calculateRiskScore({
            idNumber: client.idNumber,
            employmentStatus,
            netSalary: client.netSalary ? Number(client.netSalary) : 0,
            grossSalary: client.grossSalary ? Number(client.grossSalary) : undefined,
            totalOutstandingBalance,
            totalMonthlyInstalment,
            activeAccountCount: activeAccounts.length,
            isInDebtReview: !!assessment.Case.ncrdcNo
        });

        // 2. Run underwriting
        const report = executeUnderwriting({
            riskScore,
            employmentStatus,
            age: riskScore.derivedAge > 0 ? riskScore.derivedAge : 35,
            accounts: assessment.accounts.map(a => ({
                creditAccountId: a.creditAccountId,
                creditorName: a.creditAccount.creditorName,
                outstandingBalance: Number(a.creditAccount.outstandingBalance),
                currentPremium: a.currentPremium ? Number(a.currentPremium) : 0,
                accountType: a.creditAccount.accountType,
                isIncluded: a.isIncluded,
                exclusionReason: a.exclusionReason ?? undefined
            })),
            totalCurrentPremium: Number(assessment.totalCurrentPremium)
        });

        // 3. Persist results
        const rec = report.policyRecommendation;
        await prisma.insuranceAssessment.update({
            where: { id: assessmentId },
            data: {
                status: report.decision === 'DECLINE' ? 'DECLINED' : 'UNDER_REVIEW',
                replacementPremium: rec ? rec.totalMonthlyPremium : undefined,
                monthlySavings: rec ? rec.monthlySavings : undefined,
                annualSavings: rec ? rec.annualSavings : undefined,
                savingsPercent: rec ? rec.savingsPercent : undefined,
                insurer: rec ? rec.insurer : undefined,
                policyType: rec ? rec.policyType : undefined,
                coverAmount: rec ? rec.totalCoverAmount : undefined,
            }
        });

        await prisma.case.update({
            where: { id: assessment.caseId },
            data: {
                insuranceNotes: JSON.stringify({
                    underwritingReport: report,
                    riskScore,
                    generatedAt: new Date().toISOString(),
                    generatedBy: userId
                })
            }
        });

        // 4. Log action
        await prisma.workflowLog.create({
            data: {
                caseId: assessment.caseId,
                fromStatus: assessment.status,
                toStatus: report.decision === 'DECLINE' ? 'DECLINED' : 'UNDER_REVIEW',
                action: 'UNDERWRITING_RUN',
                userId,
                notes: `Automated underwriting: ${report.decision} — Score ${riskScore.totalScore}/100 (${riskScore.tier})`
            }
        });

        return { report, riskScore };
    } catch (error: any) {
        logger.error({ error }, '[underwriting-service] Error:');
        throw error;
    }
}
