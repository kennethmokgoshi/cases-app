import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { CREDIT_REPORT_DOC_TYPES } from '@/lib/credit-account-sync';
import { buildCreditReportInsights, type CreditReportExtractedData } from '@/lib/credit-report-insights';

const logger = createLogger('api/cases/[id]/credit-reports/insights');

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
            include: { documents: true },
        });

        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const creditReportDocs = (caseData.documents || []).filter(d =>
            CREDIT_REPORT_DOC_TYPES.has((d.type || '').toUpperCase())
        );
        const analyzedDocs = creditReportDocs.filter(d => d.extractedData);
        const unanalyzedDocs = creditReportDocs.filter(d => !d.extractedData);

        const reports = analyzedDocs.map(doc => {
            let data: CreditReportExtractedData = {};
            try {
                data = JSON.parse(doc.extractedData as string);
            } catch (err) {
                logger.error(`Failed to parse extractedData for document ${doc.id}`, err);
            }
            return {
                documentId: doc.id,
                fileName: doc.fileName,
                type: doc.type,
                analyzedAt: doc.analyzedAt,
                data,
                insights: buildCreditReportInsights(data),
            };
        });

        return NextResponse.json({
            reports,
            unanalyzedReports: unanalyzedDocs.map(d => ({ id: d.id, fileName: d.fileName, type: d.type })),
            hasCreditReports: creditReportDocs.length > 0,
        });
    } catch (err: any) {
        logger.error('Failed to build credit report insights', err);
        return NextResponse.json(
            { error: err.message || 'Failed to build credit report insights' },
            { status: 500 }
        );
    }
}
