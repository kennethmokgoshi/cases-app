import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const take = Math.min(parseInt(searchParams.get('take') || '50', 10), 200);
        const skip = parseInt(searchParams.get('skip') || '0', 10);

        const where: any = {};
        if (status) where.status = status;

        const [assessments, total] = await Promise.all([
            prisma.insuranceAssessment.findMany({
                where,
                take,
                skip,
                orderBy: { updatedAt: 'desc' },
                include: {
                    Case: {
                        select: {
                            id: true,
                            fileNumber: true,
                            status: true,
                            insuranceNotes: true,
                            client: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    idNumber: true,
                                    employer: true,
                                    netSalary: true } } } },
                    accounts: {
                        include: {
                            creditAccount: {
                                select: {
                                    id: true,
                                    creditorName: true,
                                    outstandingBalance: true,
                                    premiumAmount: true } } } },
                    policies: { select: { id: true, status: true, policyNumber: true } },
                    cancellationLetters: { select: { id: true, status: true } } } }),
            prisma.insuranceAssessment.count({ where }),
        ]);

        // Attach parsed underwriting report summary if present
        const enriched = assessments.map(a => {
            let riskTier: string | null = null;
            let riskScore: number | null = null;
            let uwDecision: string | null = null;

            if (a.Case.insuranceNotes) {
                try {
                    const notes = JSON.parse(a.Case.insuranceNotes);
                    riskTier = notes.riskScore?.tier ?? null;
                    riskScore = notes.riskScore?.totalScore ?? null;
                    uwDecision = notes.underwritingReport?.decision ?? null;
                } catch { /* ignore parse errors */ }
            }

            return { ...a, riskTier, riskScore, uwDecision };
        });

        return NextResponse.json({ assessments: enriched, total, take, skip });
    } catch (error: any) {
        logger.error('[assessments] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
