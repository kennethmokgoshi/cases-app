import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { hasCreditReport, isClearanceButtonEligible } from '@/lib/clearance-button-eligibility';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await context.params;

        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            include: {
                client: true,
                creditAccounts: true,
                documents: true,
            },
        });

        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const eligible = isClearanceButtonEligible({
            status: caseData.status,
            dhsStatus: caseData.dhsStatus,
            manuallyAcceptedViaDhs: Boolean(caseData.manuallyAcceptedViaDhs),
        });

        const creditReportPresent = hasCreditReport({
            documents: caseData.documents,
        });

        // Evaluate accounts
        const allAccounts = caseData.creditAccounts || [];
        const openAccounts = allAccounts.filter(a => {
            const statusUpper = (a.status || '').toUpperCase();
            const balance = (a as any).outstandingBalance ?? (a as any).balance ?? 0;
            const isSettled = statusUpper === 'PAID_UP' || statusUpper === 'CLOSED' || statusUpper === 'SETTLED';
            return !isSettled && balance > 0;
        });

        const closedAccounts = allAccounts.filter(a => {
            const statusUpper = (a.status || '').toUpperCase();
            const balance = (a as any).outstandingBalance ?? (a as any).balance ?? 0;
            return statusUpper === 'PAID_UP' || statusUpper === 'CLOSED' || statusUpper === 'SETTLED' || balance === 0;
        });

        const mortgageAccount = openAccounts.find(a => {
            const typeUpper = (a.accountType || '').toUpperCase();
            const nameLower = (a.creditorName || '').toLowerCase();
            return typeUpper.includes('MORTGAGE') || typeUpper.includes('BOND') || typeUpper.includes('HOME') ||
                   nameLower.includes('mortgage') || nameLower.includes('home loan') || nameLower.includes('bond');
        });

        const unsecuredOpenAccounts = openAccounts.filter(a => a.id !== mortgageAccount?.id);
        const totalBalance = openAccounts.reduce((sum, a) => sum + Number((a as any).outstandingBalance ?? (a as any).balance ?? 0), 0);
        const totalInstalment = openAccounts.reduce((sum, a) => sum + Number((a as any).monthlyInstalment ?? 0), 0);

        let recommendedForm: 'FORM_19_F2' | 'FORM_19_F1' | 'FORM_17_W' = 'FORM_19_F2';
        let recommendedFormTitle = 'Form 19 (F2 - Full Clearance Certificate)';
        let targetStatus: 'F2' | 'F1' | 'G' | 'B' = 'F2';
        let reasoning = '';

        if (unsecuredOpenAccounts.length === 0 && !mortgageAccount) {
            recommendedForm = 'FORM_19_F2';
            recommendedFormTitle = 'Form 19 (F2 - Full Clearance Certificate)';
            targetStatus = 'F2';
            reasoning = 'All credit accounts listed under debt review are fully paid up / settled. No active mortgage bond remains. Issue Form 19 (F2 Full Clearance).';
        } else if (unsecuredOpenAccounts.length === 0 && mortgageAccount) {
            recommendedForm = 'FORM_19_F1';
            recommendedFormTitle = 'Form 19 (F1 - Clearance Certificate w/ Mortgage)';
            targetStatus = 'F1';
            reasoning = `All unsecured accounts are settled. 1 active mortgage bond (${mortgageAccount.creditorName}) remains with payments current. Issue Form 19 (F1 Partial Clearance) + Form 17.2(c).`;
        } else {
            recommendedForm = 'FORM_17_W';
            recommendedFormTitle = 'Form 17.W (Notice of Withdrawal from Debt Review)';
            targetStatus = caseData.dhsStatus === 'D4' || caseData.dhsStatus === 'D3' ? 'G' : 'B';
            reasoning = `Consumer has ${unsecuredOpenAccounts.length} active unsecured account(s) with an open balance (R${totalBalance.toLocaleString()}). Form 17.W Withdrawal Notice or Court Rescission (Status G) is required.`;
        }

        const mappedAccounts = openAccounts.map(a => {
            const isMortgage = a.id === mortgageAccount?.id;
            const lastPaymentDate = a.lastPaymentDate ? new Date(a.lastPaymentDate) : null;
            const yearsSincePayment = lastPaymentDate ? (Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25) : 0;
            const isPrescribedCandidate = !isMortgage && yearsSincePayment >= 3;

            return {
                id: a.id,
                creditorName: a.creditorName,
                accountNumber: a.accountNumber,
                accountType: a.accountType,
                openingBalance: Number((a as any).originalAmount ?? 0),
                balance: Number((a as any).outstandingBalance ?? (a as any).balance ?? 0),
                instalment: Number((a as any).monthlyInstalment ?? 0),
                isMortgage,
                isPrescribedCandidate,
                lastPaymentDate: a.lastPaymentDate ? new Date(a.lastPaymentDate).toISOString() : null,
            };
        });

        return NextResponse.json({
            eligible,
            hasCreditReport: creditReportPresent,
            recommendedForm,
            recommendedFormTitle,
            targetStatus,
            reasoning,
            accountsSummary: {
                openCount: openAccounts.length,
                closedCount: closedAccounts.length,
                totalBalance,
                totalInstalment,
                openAccounts: mappedAccounts,
            },
            candidateForms: [
                {
                    id: 'FORM_19_F2',
                    label: 'Form 19 (F2 - Full Clearance)',
                    description: 'All debts settled (expunges debt review flag across all credit bureaus)',
                    recommended: recommendedForm === 'FORM_19_F2',
                    targetStatus: 'F2',
                },
                {
                    id: 'FORM_19_F1',
                    label: 'Form 19 (F1 - Clearance w/ Mortgage)',
                    description: 'Unsecured debts settled; mortgage bond active and current',
                    recommended: recommendedForm === 'FORM_19_F1',
                    targetStatus: 'F1',
                },
                {
                    id: 'FORM_17_W',
                    label: 'Form 17.W (Withdrawal Notice)',
                    description: 'Withdrawal prior to court order or upon court order rescission',
                    recommended: recommendedForm === 'FORM_17_W',
                    targetStatus: targetStatus === 'G' ? 'G' : 'B',
                },
            ],
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to evaluate clearance options' },
            { status: 500 }
        );
    }
}
