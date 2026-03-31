import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { analyzeCombinedDocument, batchAnalyzeDocuments, extractDocumentsFromCombinedPdf } from '@zenowethu/shared-lib';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const logger = createLogger('api/cases/[id]/compare-analysis');

interface ComparisonField {
    field: string;
    label: string;
    oldValue: string | number | null;
    newValue: string | number | null;
    hasChanged: boolean;
}

interface ComparisonData {
    personalInfo: ComparisonField[];
    creditBureau: ComparisonField[];
    restructuring: ComparisonField[];
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const encoder = new TextEncoder();

    return new Response(
        new ReadableStream({
            async start(controller) {
                const sendUpdate = (data: any, progress?: number) => {
                    controller.enqueue(encoder.encode(JSON.stringify({ ...data, progress }) + '\n'));
                };

                try {
                    const session = await auth();
                    if (!session?.user) {
                        sendUpdate({ type: 'error', message: 'Unauthorized' });
                        controller.close();
                        return;
                    }

                    const { id: caseId } = await params;
                    sendUpdate({ type: 'progress', message: '🔍 Fetching case documents...' }, 2);

                    // Fetch case with client and documents
                    const caseRecord = await prisma.case.findUnique({
                        where: { id: caseId },
                        include: {
                            client: true,
                            documents: {
                                where: {
                                    type: { in: ['COMBINED', 'ID', 'POA', 'CREDIT_REPORT', 'ZENOWETHU_POA'] }
                                },
                                orderBy: { uploadedAt: 'desc' }
                            }
                        }
                    });

                    if (!caseRecord) {
                        sendUpdate({ type: 'error', message: 'Case not found' });
                        controller.close();
                        return;
                    }

                    if (caseRecord.documents.length === 0) {
                        sendUpdate({ type: 'error', message: 'No documents found to analyze' });
                        controller.close();
                        return;
                    }

                    // Helper to resolve file paths from URLs
                    const getFilePath = (fileUrl: string) => {
                        if (fileUrl.startsWith('/uploads/')) {
                            return join(process.cwd(), 'storage', 'uploads', fileUrl.replace('/uploads/', ''));
                        }
                        return join(process.cwd(), 'public', fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl);
                    };

                    // Determine analysis approach
                    const combinedDoc = caseRecord.documents.find(d => d.type === 'COMBINED');
                    let analysis: any = null;

                    const onProgress = (message: string, progress?: number) => {
                        sendUpdate({ type: 'progress', message }, progress);
                    };

                    if (combinedDoc) {
                        // Use combined document analysis
                        const filePath = getFilePath(combinedDoc.fileUrl);

                        if (!existsSync(filePath)) {
                            logger.error(`❌ Combined document not found at: ${filePath}`);
                            sendUpdate({ type: 'error', message: 'Combined document file not found' });
                            controller.close();
                            return;
                        }

                        const fileBuffer = await readFile(filePath);
                        const base64Pdf = fileBuffer.toString('base64');

                        analysis = await extractDocumentsFromCombinedPdf(base64Pdf, onProgress);
                    } else {
                        // Use batch analysis on separate documents
                        const docsForAnalysis = [];
                        onProgress('📄 Preparing separate documents for analysis...', 5);

                        for (const doc of caseRecord.documents) {
                            const filePath = getFilePath(doc.fileUrl);

                            if (existsSync(filePath)) {
                                const buffer = await readFile(filePath);
                                docsForAnalysis.push({
                                    base64: buffer.toString('base64'),
                                    type: doc.type as 'ID' | 'POA' | 'CREDIT_REPORT',
                                    mimeType: 'application/pdf'
                                });
                            }
                        }

                        if (docsForAnalysis.length === 0) {
                            sendUpdate({ type: 'error', message: 'No readable documents found' });
                            controller.close();
                            return;
                        }

                        analysis = await batchAnalyzeDocuments(docsForAnalysis as any, onProgress);
                    }

                    // Handle different return structures
                    const actualAnalysis = analysis.analysis || analysis;
                    logger.info('🤖 Actual analysis results to compare:', JSON.stringify(actualAnalysis, null, 2));

                    if (!actualAnalysis || Object.keys(actualAnalysis).length === 0) {
                        logger.error('❌ Analysis returned empty results:', analysis);
                        sendUpdate({ type: 'error', message: 'Analysis completed but returned no results. This can happen if documents are unreadable or blurry.' });
                        controller.close();
                        return;
                    }

                    // Build comparison data
                    onProgress('📊 Generating comparison report...', 95);
                    const comparison: ComparisonData = {
                        personalInfo: [],
                        creditBureau: [],
                        restructuring: []
                    };

                    // Helper function to compare values
                    const compareValue = (oldVal: any, newVal: any): boolean => {
                        if (oldVal === null && newVal === null) return false;
                        if (oldVal === null || newVal === null) return true;
                        return String(oldVal).trim() !== String(newVal).trim();
                    };

                    // Personal Information
                    const personalFields = [
                        { field: 'idNumber', label: 'ID Number', oldValue: caseRecord.client.idNumber, newValue: actualAnalysis.id?.idNumber || null },
                        { field: 'lastName', label: 'Surname', oldValue: caseRecord.client.lastName, newValue: actualAnalysis.id?.surname || null },
                        { field: 'firstName', label: 'Full Names', oldValue: caseRecord.client.firstName, newValue: actualAnalysis.id?.names || null },
                        { field: 'phone', label: 'Cell Number', oldValue: caseRecord.client.phone, newValue: actualAnalysis.poa?.cellNumber || actualAnalysis.creditReport?.consumer?.cellNumber || null },
                    ];

                    for (const pf of personalFields) {
                        comparison.personalInfo.push({
                            field: pf.field,
                            label: pf.label,
                            oldValue: pf.oldValue,
                            newValue: pf.newValue,
                            hasChanged: compareValue(pf.oldValue, pf.newValue)
                        });
                    }

                    // Credit Bureau - Accounts Summary
                    const creditFields = [
                        { field: 'totalDebtAmount', label: 'Balance Exposure', oldValue: caseRecord.totalDebtAmount ? Number(caseRecord.totalDebtAmount) : null, newValue: actualAnalysis.creditReport?.summary?.totalDebt || null },
                        { field: 'totalMonthlyInstallment', label: 'Monthly Instalment', oldValue: caseRecord.totalMonthlyInstallment ? Number(caseRecord.totalMonthlyInstallment) : null, newValue: actualAnalysis.creditReport?.summary?.totalInstallment || null },
                        { field: 'openAccounts', label: 'Active Accounts', oldValue: caseRecord.openAccounts, newValue: actualAnalysis.creditReport?.summary?.activeAccounts || null },
                        { field: 'closedAccounts', label: 'Closed Accounts', oldValue: caseRecord.closedAccounts, newValue: actualAnalysis.creditReport?.summary?.closedAccounts || null },
                    ];

                    for (const cf of creditFields) {
                        comparison.creditBureau.push({
                            field: cf.field,
                            label: cf.label,
                            oldValue: cf.oldValue,
                            newValue: cf.newValue,
                            hasChanged: compareValue(cf.oldValue, cf.newValue)
                        });
                    }

                    // Restructuring Info
                    const debtRestructuring = actualAnalysis.creditReport?.debtRestructuring || actualAnalysis.debtRestructuring || {};
                    const restructuringFields = [
                        { field: 'cb_ncrdcNo', label: 'Registration No.', oldValue: caseRecord.cb_ncrdcNo, newValue: debtRestructuring.ncrdcNo || null },
                        { field: 'cb_debtCounsellor', label: 'Debt Counsellor', oldValue: caseRecord.cb_debtCounsellor, newValue: debtRestructuring.debtCounsellorName || null },
                        { field: 'cb_contactNo', label: 'Contact No.', oldValue: caseRecord.cb_contactNo, newValue: debtRestructuring.debtCounsellorNumber || null },
                        { field: 'cb_applicationDate', label: 'Application Date', oldValue: caseRecord.cb_applicationDate ? new Date(caseRecord.cb_applicationDate).toISOString().split('T')[0] : null, newValue: debtRestructuring.debtReviewDate || debtRestructuring.applicationDate || null },
                        { field: 'cb_status', label: 'Status Description', oldValue: caseRecord.cb_status, newValue: debtRestructuring.dhsStatus || debtRestructuring.statusDescription || null },
                        { field: 'cb_statusDate', label: 'Status Date', oldValue: caseRecord.cb_statusDate ? new Date(caseRecord.cb_statusDate).toISOString().split('T')[0] : null, newValue: debtRestructuring.statusDate || null },
                    ];

                    for (const rf of restructuringFields) {
                        comparison.restructuring.push({
                            field: rf.field,
                            label: rf.label,
                            oldValue: rf.oldValue,
                            newValue: rf.newValue,
                            hasChanged: compareValue(rf.oldValue, rf.newValue)
                        });
                    }

                    sendUpdate({
                        type: 'result',
                        data: {
                            success: true,
                            comparison,
                            rawAnalysis: actualAnalysis
                        }
                    });
                    controller.close();

                } catch (error) {
                    logger.error('❌ Streaming analysis error:', error);
                    sendUpdate({
                        type: 'error',
                        message: error instanceof Error ? error.message : 'Failed to run analysis'
                    });
                    controller.close();
                }
            }
        }),
        {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive' } }
    );
}

export const maxDuration = 300; // Allow 5 minutes for AI analysis
