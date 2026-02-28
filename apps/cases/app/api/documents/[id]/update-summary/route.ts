import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { DocumentSummarySchema, parseBody } from '@/lib/schemas';

export async function POST(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const documentId = params.id;
        const parsed = parseBody(DocumentSummarySchema, await request.json());
        if (!parsed.success) return parsed.response;
        const { openAccounts, closedAccounts, totalDebt, totalInstallment } = parsed.data;

        // Fetch the existing document with its case
        const document = await prisma.document.findUnique({
            where: { id: documentId },
            include: { case: true }
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Parse existing extracted data
        let extractedData: any = {};
        if (document.extractedData) {
            try {
                extractedData = JSON.parse(document.extractedData);
            } catch (e) {
                logger.error('Failed to parse existing data:', e);
            }
        }

        // Update with manually corrected values
        extractedData.openAccounts = openAccounts;
        extractedData.closedAccounts = closedAccounts;
        extractedData.totalAccounts = openAccounts + closedAccounts;
        extractedData.totalDebt = totalDebt;
        extractedData.totalInstallment = totalInstallment;
        extractedData._manuallyEdited = true;
        extractedData._editedAt = new Date().toISOString();

        // Save to document
        await prisma.document.update({
            where: { id: documentId },
            data: {
                extractedData: JSON.stringify(extractedData)
            }
        });

        // ALSO update the Case record itself
        if (document.caseId) {
            await prisma.case.update({
                where: { id: document.caseId },
                data: {
                    openAccounts: openAccounts,
                    closedAccounts: closedAccounts,
                    prescribedAccounts: extractedData.prescribedAccounts || 0
                }
            });
            logger.info(`✅ Case ${document.caseId} updated with manual edits`);
        }

        logger.info(`✅ Manual edits saved for document ${documentId}`);
        logger.info(`   - Open Accounts: ${openAccounts}`);
        logger.info(`   - Closed Accounts: ${closedAccounts}`);
        logger.info(`   - Total Debt: ${totalDebt}`);
        logger.info(`   - Total Installment: ${totalInstallment}`);

        return NextResponse.json({
            success: true,
            data: extractedData
        });

    } catch (error: any) {
        logger.error('❌ Update summary error:', error);
        return NextResponse.json(
            { error: error?.message || 'Failed to update summary' },
            { status: 500 }
        );
    }
}

