import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { generatePolicySchedule } from '../../../../../../lib/policy-pdf';

/**
 * POST /api/insurance/assessments/[id]/policy
 *
 * Finalizes an insurance assessment by issuing a formal policy.
 * Requirements:
 * 1. Assessment must be in UNDER_REVIEW or LETTERS_GENERATED status.
 * 2. Assessment must have a policy recommendation from the UW engine.
 */
export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

        // 1. Fetch assessment with client and accounts
        const assessment = await prisma.insuranceAssessment.findUnique({
            where: { id },
            include: {
                Case: { include: { client: true } },
                accounts: {
                    where: { isIncluded: true },
                    include: { creditAccount: true }
                }
            }
        });

        if (!assessment) {
            return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
        }

        if (!['UNDER_REVIEW', 'LETTERS_GENERATED', 'DRAFT'].includes(assessment.status)) {
            return NextResponse.json({
                error: `Cannot issue policy from status: ${assessment.status}`
            }, { status: 400 });
        }

        // Check if we have recommendation data
        if (!assessment.replacementPremium || !assessment.coverAmount) {
            return NextResponse.json({
                error: 'Assessment missing recommendation data. Run underwriting first.'
            }, { status: 400 });
        }

        // 2. Generate a unique policy number (e.g., ZINS-2026-XXXX)
        const year = new Date().getFullYear();
        const count = await prisma.insurancePolicy.count();
        const policyNumber = `ZINS-${year}-${(count + 1).toString().padStart(5, '0')}`;

        // 3. Generate the Policy PDF
        const pdfBytes = await generatePolicySchedule({
            policyNumber,
            insurerName: assessment.insurer || 'Old Mutual Credit Life (Compliant)',
            clientName: `${assessment.Case.client.firstName} ${assessment.Case.client.lastName}`,
            idNumber: assessment.Case.client.idNumber,
            startDate: new Date().toLocaleDateString('en-ZA'),
            premiumAmount: Number(assessment.replacementPremium),
            coverAmount: Number(assessment.coverAmount),
            coverBenefits: {
                death: true,
                disability: true,
                retrenchment: assessment.policyType?.includes('Compreh') || false,
                funeral: true
            },
            accounts: assessment.accounts.map(acc => ({
                creditorName: acc.creditAccount.creditorName,
                accountNumber: acc.creditAccount.accountNumber || 'UNKNOWN',
                outstandingBalance: Number(acc.creditAccount.outstandingBalance),
                premium: Number(acc.currentPremium)
            }))
        });

        const base64Pdf = Buffer.from(pdfBytes).toString('base64');

        // 4. Atomic transaction: Create policy, update assessment, update case
        await prisma.$transaction([
            // Create the policy record
            prisma.insurancePolicy.create({
                data: {
                    assessmentId: assessment.id,
                    policyNumber,
                    insurer: assessment.insurer || 'Old Mutual Credit Life (Compliant)',
                    startDate: new Date(),
                    premiumAmount: assessment.replacementPremium,
                    coverAmount: assessment.coverAmount,
                    status: 'ACTIVE'
                }
            }),
            // Update the assessment status
            prisma.insuranceAssessment.update({
                where: { id: assessment.id },
                data: {
                    status: 'ACCEPTED',
                    acceptedAt: new Date(),
                    policyIssuedAt: new Date()
                }
            }),
            // Update the Case status (Global Case flow)
            prisma.case.update({
                where: { id: assessment.caseId },
                data: { status: 'INSURANCE_ACTIVE' }
            }),
            // Log the workflow
            prisma.workflowLog.create({
                data: {
                    caseId: assessment.caseId,
                    fromStatus: assessment.status,
                    toStatus: 'ACCEPTED',
                    action: 'POLICY_ISSUED',
                    userId: session.user.id,
                    notes: `Policy ${policyNumber} issued for R${assessment.coverAmount.toLocaleString()} cover.`
                }
            })
        ]);

        return NextResponse.json({
            success: true,
            policyNumber,
            pdf: base64Pdf
        });

    } catch (error: any) {
        logger.error({ error }, '[issue-policy] POST error:');
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
