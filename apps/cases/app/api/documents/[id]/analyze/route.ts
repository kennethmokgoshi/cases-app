import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';

export const maxDuration = 300; // Allow 5 minutes for heavy analysis
import { auth } from '@zenowethu/shared-lib';
import { analyzeDocument, analyzeCombinedDocument } from '@zenowethu/shared-lib';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

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

        // 1. Fetch Document
        const document = await prisma.document.findUnique({
            where: { id: documentId }
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // 2. Check if document has been manually edited
        let manuallyEditedData: any = null;
        let targetAccountCount: number | null = null;

        if (document.extractedData) {
            try {
                const existingData = JSON.parse(document.extractedData);
                if (existingData._manuallyEdited) {
                    manuallyEditedData = existingData;
                    targetAccountCount = typeof existingData.openAccounts === 'number' ? existingData.openAccounts : null;
                    logger.info(`📝 Document has manual edits. Will extract ONLY ${targetAccountCount} accounts.`);
                }
            } catch (e) { /* ignore */ }
        }

        // 3. Resolve File Path
        let filePath = '';
        if (document.fileUrl.startsWith('/uploads/')) {
            filePath = join(process.cwd(), 'storage', 'uploads', document.fileUrl.replace('/uploads/', ''));
        } else {
            const relativePath = document.fileUrl.startsWith('/') ? document.fileUrl.slice(1) : document.fileUrl;
            filePath = join(process.cwd(), 'public', relativePath);
        }

        // 4. Read File
        const fileBuffer = await readFile(filePath);
        const base64File = fileBuffer.toString('base64');

        // 4. Analyze
        let docType = document.type;
        const body = await request.json().catch(() => ({}));

        if (body.analysisType) {
            docType = body.analysisType;
        } else if (docType.includes('CREDIT_REPORT')) {
            docType = 'CREDIT_REPORT';
        }

        logger.info(`🤖 Analyzing document ${documentId} (Type: ${docType})...`);

        let analysis: any = {};

        if (docType.toUpperCase().includes('COMBINED')) {
            logger.info(`📦 Re-analyzing COMBINED document (Structure Only, No Splitting)...`);
            try {
                // Use the advanced combined analyzer
                analysis = await analyzeCombinedDocument(base64File);
                logger.info('✅ Combined Analysis Success:', JSON.stringify(analysis).substring(0, 100) + '...');
            } catch (err: any) {
                logger.error('❌ Combined Analysis FAILED in lib/openai:', err);
                throw new Error(`Combined Analysis Failed: ${err.message}`);
            }
        } else if (docType === 'CREDIT_REPORT') {
            logger.info('📊 Step 1: Running High-Accuracy Summary Scan...');
            const summaryAnalysis = await analyzeDocument(base64File, 'CREDIT_REPORT_SUMMARY' as any, document.mimeType);

            logger.info('DETAILS Step 2: Running Detailed Account Scan...');
            const detailedAnalysis = await analyzeDocument(base64File, 'CREDIT_REPORT', document.mimeType);

            // MERGE: Use Detailed accounts, but FORCE Summary totals
            analysis = {
                ...detailedAnalysis,
                ...summaryAnalysis, // Overwrite totals with the trusted summary
                accounts: detailedAnalysis.accounts, // Keep the detailed list
                insuranceNotes: detailedAnalysis.insuranceNotes
            };

            // If manually edited, override counts and limit accounts array
            if (manuallyEditedData) {
                logger.info('✏️ Applying manual edits and constraining accounts...');
                analysis.openAccounts = manuallyEditedData.openAccounts;
                analysis.closedAccounts = manuallyEditedData.closedAccounts;
                analysis.totalAccounts = manuallyEditedData.openAccounts + manuallyEditedData.closedAccounts;
                analysis.totalDebt = manuallyEditedData.totalDebt;
                analysis.totalInstallment = manuallyEditedData.totalInstallment;

                // CRITICAL: Limit accounts array to match manual count
                if (analysis.accounts && targetAccountCount !== null && analysis.accounts.length > targetAccountCount) {
                    logger.info(`   Trimming ${analysis.accounts.length} accounts to ${targetAccountCount}`);
                    analysis.accounts = analysis.accounts.slice(0, targetAccountCount);
                }

                analysis._manuallyEdited = true;
            }

            logger.info('✅ Final Analysis:');
            logger.info('   - Open Accounts:', analysis.openAccounts);
            logger.info('   - Accounts in list:', analysis.accounts?.length || 0);
            logger.info('   - Total Debt:', analysis.totalDebt)

        } else {
            // Standard single-pass for other docs
            analysis = await analyzeDocument(base64File, docType as any, document.mimeType);
        }

        // 5. Update Database
        let currentExtraction = {};
        if (document.extractedData) {
            try {
                currentExtraction = JSON.parse(document.extractedData);
            } catch (e) { /* ignore */ }
        }

        // For summary-only scans, ensure we don't accidentally wipe accounts if they existed?
        // Actually, if running specifically SUMMARY, we probably want to just update summary fields.
        // But for full CREDIT_REPORT, we are replacing everything.

        let updatedExtraction = { ...currentExtraction, ...analysis };

        if (docType === 'CREDIT_REPORT_SUMMARY') {
            // If user specifically requested ONLY summary, don't overwrite the accounts list if it exists,
            // UNLESS the prompt returned accounts (it shouldn't).
            // But 'analysis' here comes from a single pass.
            // We want to ensure 'accounts' isn't in 'analysis' for this mode.
            delete (analysis as any).accounts;
            updatedExtraction = { ...currentExtraction, ...analysis };
        }

        await prisma.document.update({
            where: { id: documentId },
            data: {
                extractedData: JSON.stringify(updatedExtraction),
                analyzedAt: new Date()
            }
        });

        logger.info(`✅ Analysis saved for ${documentId}`);

        return NextResponse.json({
            success: true,
            data: updatedExtraction
        });

    } catch (error: any) {
        logger.error('❌ Re-analysis error:', error);
        return NextResponse.json(
            { error: error?.message || 'Failed to analyze document' },
            { status: 500 }
        );
    }
}
