import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

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
                        creditAccounts: true } },
                accounts: {
                    include: { creditAccount: true } },
                policies: true,
                cancellationLetters: true } });

        if (!assessment) {
            return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
        }

        // Parse stored underwriting report if available
        let underwritingReport = null;
        let riskScore = null;
        if (assessment.Case.insuranceNotes) {
            try {
                const notes = JSON.parse(assessment.Case.insuranceNotes);
                underwritingReport = notes.underwritingReport ?? null;
                riskScore = notes.riskScore ?? null;
            } catch { /* ignore */ }
        }

        return NextResponse.json({ ...assessment, underwritingReport, riskScore });
    } catch (error: any) {
        logger.error('[assessments/[id]] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

        const body = await request.json();
        const allowedFields = [
            'status', 'insurer', 'policyType', 'coverAmount',
            'replacementPremium', 'monthlySavings', 'annualSavings',
            'savingsPercent', 'consentGiven', 'consentDate', 'consentMethod',
        ];

        const data: Record<string, any> = {};
        for (const field of allowedFields) {
            if (field in body) data[field] = body[field];
        }

        const updated = await prisma.insuranceAssessment.update({
            where: { id },
            data });

        return NextResponse.json(updated);
    } catch (error: any) {
        logger.error('[assessments/[id]] PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
