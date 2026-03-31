import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/cases/[id]/debt-review');

type RouteContext = { params: Promise<{ id: string }> };

export const DOCUMENT_TYPES = [
    'FORM_16',
    'FORM_17_1',
    'SECTION_86_NOTICE',
    'DEBT_RESTRUCTURING_PROPOSAL',
] as const;

// GET /api/cases/[id]/debt-review
// Returns all DebtReviewDocuments for the case + credit-provider email status
export async function GET(_req: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const caseRecord = await prisma.case.findUnique({
            where: { id },
            select: { id: true, fileNumber: true }
        });
        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const [documents, creditAccounts, letterheadSetting] = await Promise.all([
            prisma.debtReviewDocument.findMany({
                where:   { caseId: id },
                include: { approvedBy: { select: { id: true, firstName: true, lastName: true } } },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.creditAccount.findMany({
                where:  { caseId: id, isIncluded: true },
                select: {
                    id: true, creditorName: true, accountNumber: true,
                    creditProviderId: true,
                    creditProvider: { select: { id: true, name: true, email: true } },
                }
            }),
            prisma.systemSettings.findUnique({ where: { key: 'letterhead_url' } }),
        ]);

        // Build missing-email warnings for credit providers linked to included accounts
        const missingEmails = creditAccounts
            .filter(a => !a.creditProvider?.email)
            .map(a => ({
                accountId:        a.id,
                creditorName:     a.creditorName,
                creditProviderId: a.creditProviderId,
                providerName:     a.creditProvider?.name ?? null,
            }));

        // Build a map docType → document record for quick UI lookup
        const docsByType: Record<string, unknown> = {};
        for (const doc of documents) {
            docsByType[doc.documentType] = doc;
        }

        return NextResponse.json({
            caseId:         id,
            fileNumber:     caseRecord.fileNumber,
            documents,
            docsByType,
            documentTypes:  DOCUMENT_TYPES,
            letterheadUrl:  letterheadSetting?.value ?? null,
            missingEmails,
        });
    } catch (error) {
        logger.error('Error fetching debt review docs:', error);
        return NextResponse.json({ error: 'Failed to fetch debt review documents' }, { status: 500 });
    }
}
