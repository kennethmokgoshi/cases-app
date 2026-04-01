import { PDFDocument } from 'pdf-lib';
import { convertPdfToImages, extractTextFromPdf } from '../pdf-image';
import { logger } from '../logger';
import { openai } from './client';
import { IDENTIFICATION_PROMPT } from './prompts';

/**
 * Identifies document pages in a combined PDF
 */
export async function identifyDocumentPages(
    base64Pdf: string,
    onProgress?: (msg: string, progress?: number) => void
): Promise<{
    documents: Array<{
        type: 'ID' | 'POA' | 'CREDIT_REPORT' | 'CREDIT_REPORT_OTHER' | 'ZENOWETHU_POA' | 'PAYSLIP' | 'BANK_STATEMENT' | 'OTHER';
        startPage: number;
        endPage: number;
        confidence: number;
        description: string;
        bureauName?: string;
    }>;
    totalPages: number;
}> {
    try {
        logger.info('📄 Identifying document pages in combined PDF (Optimized)...');
        onProgress?.('📄 Analyzing document structure...', 10);

        const isLargeFile = base64Pdf.length > 13 * 1024 * 1024;
        let extractedText = '';

        if (isLargeFile) {
            logger.info(`⚠️ Large file detected (${(base64Pdf.length / 1024 / 1024).toFixed(2)} MB base64). Skipping text extraction to avoid timeout.`);
            onProgress?.('⚠️ Large file detected. Using image-based identification...', 12);
        } else {
            try {
                logger.info('📄 Calling extractTextFromPdf for identification...');
                extractedText = await extractTextFromPdf(base64Pdf, 25);
                logger.info(`📄 Text extraction returned ${extractedText.length} characters.`);
            } catch (e) {
                logger.warn({ err: e }, '⚠️ Text extraction failed for identification');
            }
        }

        const messages: any[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: IDENTIFICATION_PROMPT.replace('{{EXTRACTED_TEXT}}', extractedText ? extractedText.substring(0, 50000) : '(Text extraction skipped/failed - rely on images below)')
                    }
                ]
            }
        ];

        const imageLimit = isLargeFile ? 5 : 10;

        if (!extractedText || isLargeFile) {
            logger.warn(`⚠️ Using image-based identification (Limit: ${imageLimit} pages).`);
            onProgress?.(`🖼️ Converting first ${imageLimit} pages to images for identification...`, 15);

            try {
                const images = await convertPdfToImages(base64Pdf, imageLimit, (msg) => {
                    onProgress?.(msg, 15);
                });

                images.forEach((imgBase64, index) => {
                    messages[0].content.push({
                        type: 'text',
                        text: `[PAGE SCAN] Page: ${index + 1}`
                    });
                    messages[0].content.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${imgBase64}`,
                            detail: 'low'
                        }
                    });
                });
            } catch (err) {
                logger.error({ err }, '❌ Failed to convert PDF for identification');
                throw new Error(`Failed to process PDF for identification: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        onProgress?.('🤖 Grouping and preparing documents for AI...', 20);

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            max_tokens: 1000,
            response_format: { type: "json_object" }
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in AI response');
        }

        const result = JSON.parse(jsonMatch[0]);
        logger.info({ result }, '✅ Identified documents');
        return result;

    } catch (error) {
        logger.error({ err: error }, '❌ Error identifying document pages');
        throw error;
    }
}

/**
 * Splits PDF based on page ranges
 */
export async function splitPdf(
    base64Pdf: string,
    pageRanges: Array<{ startPage: number; endPage: number; type: string }>
): Promise<Array<{ type: string; base64Pdf: string; pageCount: number }>> {
    try {
        const pdfBytes = Buffer.from(base64Pdf, 'base64');
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const totalPages = pdfDoc.getPageCount();

        const results: Array<{ type: string; base64Pdf: string; pageCount: number }> = [];

        for (const range of pageRanges) {
            const startIdx = Math.max(0, range.startPage - 1);
            const endIdx = Math.min(totalPages - 1, range.endPage - 1);

            if (startIdx > endIdx || startIdx >= totalPages) continue;

            const newPdf = await PDFDocument.create();
            const pageIndices = [];
            for (let i = startIdx; i <= endIdx; i++) pageIndices.push(i);

            const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
            copiedPages.forEach(page => newPdf.addPage(page));

            const newPdfBytes = await newPdf.save();
            results.push({
                type: range.type,
                base64Pdf: Buffer.from(newPdfBytes).toString('base64'),
                pageCount: copiedPages.length
            });
        }

        return results;
    } catch (error) {
        logger.error({ err: error }, '❌ Error splitting PDF');
        throw error;
    }
}

/**
 * Merges multiple documents into a single PDF
 */
export async function mergeDocuments(documents: Array<{ base64: string; type: string }>): Promise<string> {
    const mergedPdf = await PDFDocument.create();
    const sortedDocs = [...documents].sort((a, b) => {
        const order: Record<string, number> = { 'ID': 1, 'POA': 2, 'CREDIT_REPORT': 3, 'OTHER': 4 };
        return (order[a.type] || 99) - (order[b.type] || 99);
    });

    for (const doc of sortedDocs) {
        try {
            const pdfBytes = Buffer.from(doc.base64, 'base64');
            const sourcePdf = await PDFDocument.load(pdfBytes);
            const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        } catch (e) {
            logger.error({ err: e }, `❌ Failed to add ${doc.type}`);
        }
    }

    const mergedPdfBytes = await mergedPdf.save();
    return Buffer.from(mergedPdfBytes).toString('base64');
}
