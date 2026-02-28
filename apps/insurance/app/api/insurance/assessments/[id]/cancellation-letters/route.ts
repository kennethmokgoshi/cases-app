import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { generateSubstitutionNotice } from '../../../../../../lib/substitution-notice';

/**
 * POST /api/insurance/assessments/[id]/cancellation-letters
 *
 * Auto-generates a CancellationLetter record (and PDF content) for every
 * included credit account in this assessment. Idempotent — skips accounts
 * that already have a letter.
 */
export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

        const body = await request.json().catch(() => ({}));
        const { newInsurerName = 'Old Mutual Credit Life (Compliant)', effectiveDate } = body;

        const assessment = await prisma.insuranceAssessment.findUnique({
            where: { id: params.id },
            include: {
                Case: { include: { client: true } },
                accounts: {
                    where: { isIncluded: true },
                    include: { creditAccount: true } },
                cancellationLetters: { select: { creditorName: true, accountNumber: true } } } });

        if (!assessment) {
            return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
        }

        const client = assessment.Case.client;
        const clientName = `${client.firstName} ${client.lastName}`;
        const effective = effectiveDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toLocaleDateString('en-ZA');

        // Identify accounts that already have letters (skip them)
        const existingKeys = new Set(
            assessment.cancellationLetters.map(
                l => `${l.creditorName}|${l.accountNumber ?? ''}`
            )
        );

        const results: Array<{ creditorName: string; status: 'created' | 'skipped' }> = [];

        for (const accLink of assessment.accounts) {
            const acc = accLink.creditAccount;
            const key = `${acc.creditorName}|${acc.accountNumber ?? ''}`;

            if (existingKeys.has(key)) {
                results.push({ creditorName: acc.creditorName, status: 'skipped' });
                continue;
            }

            // Generate the PDF bytes
            const pdfBytes = await generateSubstitutionNotice({
                clientName,
                idNumber: client.idNumber,
                accountNumber: acc.accountNumber ?? 'UNKNOWN',
                insurerName: acc.insurerName ?? acc.creditorName,
                policyNumber: acc.policyNumber ?? 'UNKNOWN',
                newInsurerName,
                effectiveDate: effective });

            // Store as base64 in letterContent (no file upload needed for draft)
            const base64Content = Buffer.from(pdfBytes).toString('base64');

            await prisma.cancellationLetter.create({
                data: {
                    assessmentId: params.id,
                    creditorName: acc.creditorName,
                    accountNumber: acc.accountNumber ?? undefined,
                    letterType: 'CREDIT_LIFE_CANCELLATION',
                    letterContent: base64Content,
                    status: 'DRAFT' } });

            results.push({ creditorName: acc.creditorName, status: 'created' });
        }

        // Update assessment status to reflect letters generated
        if (results.some(r => r.status === 'created')) {
            await prisma.insuranceAssessment.update({
                where: { id: params.id },
                data: { status: 'LETTERS_GENERATED' } });

            await prisma.workflowLog.create({
                data: {
                    caseId: assessment.Case.id } fromStatus: assessment.status,
                    toStatus: 'LETTERS_GENERATED',
                    action: 'CANCELLATION_LETTERS_GENERATED',
                    userId: session.user.id,
                    notes: `${results.filter(r => r.status === 'created').length} cancellation letter(s) auto-generated` } });
        }

        return NextResponse.json({ results, total: results.length });
    } catch (error: any) {
        logger.error('[cancellation-letters] POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * GET /api/insurance/assessments/[id]/cancellation-letters
 * Returns all letters for this assessment.
 */
export async function GET(
    _request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

        const letters = await prisma.cancellationLetter.findMany({
            where: { assessmentId: params.id },
            orderBy: { createdAt: 'asc' } });

        return NextResponse.json(letters);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
