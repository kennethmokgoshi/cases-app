import { NextResponse } from 'next/server';
import { auth, logger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { runFullForensicAudit, type FullAuditInput } from '@/lib/forensic-engine';
import type { FinancialProfile } from '@/lib/affordability-engine';

export async function POST(
    request: Request,
    { params }: { params: { caseId: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const repoRate: number = body.repoRate ?? 8.25;

        // Load case + client + credit accounts
        const caseRecord = await prisma.case.findUnique({
            where: { id: params.caseId },
            include: {
                client: true,
                creditAccounts: {
                    where: { status: { not: 'CLOSED' } } } } });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Load rate table from DB (or empty if none seeded)
        const rateTable = await prisma.creditLifeRateTable.findMany({
            where: { isActive: true },
            select: { creditorName: true, accountType: true, maxRate: true } });

        const client = caseRecord.client;

        // Build financial profile from client salary data
        const financialProfile: FinancialProfile = {
            grossIncome: Number(client.grossSalary ?? 0),
            netIncome: Number(client.netSalary ?? 0),
            declaredExpenses: body.declaredExpenses ?? 0,
            householdSize: body.householdSize ?? 1,
            existingDebtInstallments: caseRecord.creditAccounts
                .reduce((sum, acc) => sum + Number(acc.monthlyInstalment ?? 0), 0) };

        const auditInput: FullAuditInput = {
            caseId: caseRecord.id,
            clientName: `${client.firstName} ${client.lastName}`,
            accounts: caseRecord.creditAccounts.map(acc => ({
                id: acc.id,
                creditorName: acc.creditorName,
                accountType: acc.accountType,
                outstandingBalance: Number(acc.outstandingBalance),
                monthlyInstalment: acc.monthlyInstalment !== null ? Number(acc.monthlyInstalment) : null,
                interestRate: acc.interestRate !== null ? Number(acc.interestRate) : null,
                originalAmount: acc.originalAmount !== null ? Number(acc.originalAmount) : null,
                lastPaymentDate: acc.lastPaymentDate,
                isPrescribed: acc.isPrescribed,
                premiumRate: acc.premiumRate !== null ? Number(acc.premiumRate) : null,
                premiumSource: acc.premiumSource })),
            rateTable: rateTable.map(r => ({
                creditorName: r.creditorName,
                accountType: r.accountType,
                maxRate: Number(r.maxRate) })),
            financialProfile,
            repoRate };

        const result = runFullForensicAudit(auditInput);

        // Upsert ForensicAudit record
        const existingAudit = await prisma.forensicAudit.findFirst({
            where: { caseId: params.caseId },
            orderBy: { createdAt: 'desc' } });

        const auditStatus =
            result.riskLevel === 'CRITICAL' ? 'REQUIRES_ACTION' :
            result.riskLevel === 'HIGH' ? 'REQUIRES_ACTION' : 'REVIEWED';

        let forensicAudit;
        if (existingAudit) {
            forensicAudit = await prisma.forensicAudit.update({
                where: { id: existingAudit.id },
                data: {
                    status: auditStatus,
                    auditorId: session.user.id,
                    findings: JSON.stringify(result.accountFindings),
                    recommendations: result.recommendedAction } });
        } else {
            forensicAudit = await prisma.forensicAudit.create({
                data: {
                    id: crypto.randomUUID(),
                    caseId: params.caseId,
                    status: auditStatus,
                    auditorId: session.user.id,
                    findings: JSON.stringify(result.accountFindings),
                    recommendations: result.recommendedAction } });
        }

        // Upsert RecklessLendingAssessment — use the account with highest reckless risk score
        const recklessAccount = result.accountFindings
            .filter(af => af.checks.recklessLending.flagged)
            .sort((a, b) => b.checks.recklessLending.riskScore - a.checks.recklessLending.riskScore)[0];

        if (recklessAccount) {
            const existingAssessment = await prisma.recklessLendingAssessment.findUnique({
                where: { auditId: forensicAudit.id } });

            const assessmentData = {
                auditId: forensicAudit.id,
                agreementDate: new Date(),
                declaredIncome: financialProfile.netIncome,
                trueIncome: financialProfile.netIncome,
                declaredExpenses: financialProfile.declaredExpenses,
                trueExpenses: financialProfile.declaredExpenses,
                existingDebt: financialProfile.existingDebtInstallments,
                availableSurplus: recklessAccount.checks.recklessLending.disposableIncome ?? 0,
                instalmentAmount: recklessAccount.outstandingBalance,
                isReckless: true,
                reason: recklessAccount.checks.recklessLending.reason ?? null,
                assessedBy: `${session.user.firstName ?? ''} ${session.user.lastName ?? ''}`.trim() || session.user.email };

            if (existingAssessment) {
                await prisma.recklessLendingAssessment.update({
                    where: { auditId: forensicAudit.id },
                    data: assessmentData });
            } else {
                await prisma.recklessLendingAssessment.create({
                    data: { id: crypto.randomUUID(), ...assessmentData } });
            }
        }

        return NextResponse.json({
            auditId: forensicAudit.id,
            ...result });
    } catch (error) {
        logger.error('Error running forensic audit:', error);
        return NextResponse.json({ error: 'Failed to run forensic audit' }, { status: 500 });
    }
}
