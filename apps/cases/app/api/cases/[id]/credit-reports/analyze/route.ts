import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { analyzeDocument } from '@zenowethu/shared-lib/src/openai';
import type { DocType } from '@zenowethu/shared-lib/src/openai/extraction';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { CREDIT_REPORT_DOC_TYPES } from '@/lib/credit-account-sync';
import { resolveCreditReportPromptType } from '@/lib/credit-report-analysis';

const logger = createLogger('api/cases/[id]/credit-reports/analyze');

function resolveFilePath(fileUrl: string): string {
    if (fileUrl.startsWith('/uploads/')) {
        return join(process.cwd(), 'storage', 'uploads', fileUrl.replace('/uploads/', ''));
    }
    const relativePath = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
    return join(process.cwd(), 'public', relativePath);
}

const RequestSchema = z.object({
    force: z.boolean().optional(),
});

// Isolated to credit report documents only: unlike /api/documents/reanalyze (which also
// touches ID/POA/Payslip/BankStatement docs and overwrites Client profile fields), this
// route only ever reads/writes Document rows whose type is a credit-report variant.
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await context.params;

        let body: unknown = {};
        try {
            const text = await request.text();
            if (text) body = JSON.parse(text);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        const parsed = RequestSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
        }
        const force = parsed.data.force ?? false;

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

        const targets = force ? creditReportDocs : creditReportDocs.filter(d => !d.extractedData);
        const skipped = creditReportDocs.length - targets.length;

        if (targets.length === 0) {
            return NextResponse.json({
                analyzed: 0,
                failed: 0,
                skipped,
                results: [],
                message: creditReportDocs.length === 0
                    ? 'No credit report documents found on this case.'
                    : 'All credit report documents are already analyzed.',
            });
        }

        const results: { documentId: string; fileName: string; success: boolean; accountsFound?: number; error?: string }[] = [];

        for (const doc of targets) {
            try {
                const filePath = resolveFilePath(doc.fileUrl);
                if (!existsSync(filePath)) {
                    logger.error(`Credit report file not found — fileUrl=${doc.fileUrl} resolvedPath=${filePath} cwd=${process.cwd()}`);
                    results.push({
                        documentId: doc.id,
                        fileName: doc.fileName,
                        success: false,
                        error: `File not found on disk (looked at: ${filePath})`,
                    });
                    continue;
                }

                const fileBuffer = await readFile(filePath);
                const base64File = fileBuffer.toString('base64');
                const promptType: DocType = resolveCreditReportPromptType(doc.type);

                const result = await analyzeDocument(base64File, promptType, doc.mimeType);
                const analysis = result.data;

                // A single CREDIT_REPORT pass is known to be unreliable for the financial
                // totals in the "Accounts Summary" table — a dedicated summary-only prompt
                // exists specifically for this and is more accurate; use it to correct
                // totalDebt/totalInstallment without discarding the detailed pass's accounts.
                if (promptType === 'CREDIT_REPORT') {
                    try {
                        // 'CREDIT_REPORT_SUMMARY' is a valid PROMPTS key (packages/shared-lib/src/openai/prompts.ts)
                        // but isn't part of the exported DocType union — same cast used at the only other call site.
                        const summaryResult = await analyzeDocument(base64File, 'CREDIT_REPORT_SUMMARY' as unknown as DocType, doc.mimeType);
                        if (summaryResult.data) {
                            analysis.summary = {
                                ...(analysis.summary || {}),
                                totalDebt: summaryResult.data.totalDebt,
                                totalInstallment: summaryResult.data.totalInstallment,
                            };
                        }
                    } catch (err) {
                        logger.warn(`Summary-totals pass failed for document ${doc.id}, keeping detailed-pass totals`, err as Error);
                    }
                }

                await prisma.document.update({
                    where: { id: doc.id },
                    data: {
                        extractedData: JSON.stringify(analysis),
                        analyzedAt: new Date(),
                    },
                });

                results.push({
                    documentId: doc.id,
                    fileName: doc.fileName,
                    success: true,
                    accountsFound: Array.isArray(analysis?.accounts) ? analysis.accounts.length : 0,
                });
            } catch (err: any) {
                logger.error(`Failed to analyze credit report document ${doc.id}`, err);
                results.push({ documentId: doc.id, fileName: doc.fileName, success: false, error: err.message || 'Analysis failed' });
            }
        }

        return NextResponse.json({
            analyzed: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            skipped,
            results,
        });
    } catch (err: any) {
        logger.error('Failed to analyze credit reports', err);
        return NextResponse.json(
            { error: err.message || 'Failed to analyze credit reports' },
            { status: 500 }
        );
    }
}

export const maxDuration = 300;
