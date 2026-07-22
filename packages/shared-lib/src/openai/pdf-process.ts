// Removed server-only modifier to fix edge build
import { PDFDocument } from 'pdf-lib';
import { convertPdfToImages, extractTextFromPdf } from '../pdf-image';
import { logger } from '../logger';
import { getAiClientForTask } from '../ai/provider-client';
import { IDENTIFICATION_PROMPT, DHS_IDENTIFICATION_PROMPT } from './prompts';

/**
 * Identifies document pages in a combined PDF
 */
export async function identifyDocumentPages(
    base64Pdf: string,
    onProgress?: (msg: string, progress?: number) => void,
    password?: string
): Promise<{
    documents: Array<{
        type: 'ID' | 'POA' | 'CREDIT_REPORT' | 'CREDIT_REPORT_OTHER' | 'ZENOWETHU_POA' | 'PAYSLIP' | 'BANK_STATEMENT' | 'PROOF_OF_RESIDENCE' | 'OTHER';
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

        const isLargeFile = base64Pdf.length > 50 * 1024 * 1024; // Increased to 50MB
        let extractedText = '';

        if (isLargeFile) {
            logger.info(`⚠️ Large file detected (${(base64Pdf.length / 1024 / 1024).toFixed(2)} MB base64). Skipping text extraction to avoid timeout.`);
            onProgress?.('⚠️ Large file detected. Using image-based identification...', 12);
        } else {
            try {
                logger.info('📄 Calling extractTextFromPdf for identification (all pages)...');
                // No page limit — the full document text is needed to identify documents on later pages
                extractedText = await extractTextFromPdf(base64Pdf, 0, password);
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
                        text: IDENTIFICATION_PROMPT.replace('{{EXTRACTED_TEXT}}', extractedText ? extractedText.substring(0, 10000) : '(Text extraction skipped/failed - rely on images below)')
                    }
                ]
            }
        ];

        const imageLimit = isLargeFile ? 30 : 100; // Increased to 100 pages for identification

        // Always add page images — text alone is unreliable for scanned/image-based PDFs.
        logger.info(`🖼️ Adding page images for identification (limit: ${imageLimit} pages).`);
        onProgress?.(`🖼️ Converting first ${imageLimit} pages to images for identification...`, 15);
        try {
            const images = await convertPdfToImages(base64Pdf, imageLimit, (msg) => {
                onProgress?.(msg, 15);
            }, password);
            images.forEach((imgBase64, index) => {
                messages[0].content.push({ type: 'text', text: `[PAGE SCAN] Page: ${index + 1}` });
                messages[0].content.push({
                    type: 'image_url',
                    image_url: { 
                        url: `data:image/jpeg;base64,${imgBase64}`, 
                        detail: isLargeFile ? 'low' : 'high' 
                    }
                });
            });
        } catch (err) {
            logger.warn({ err }, '⚠️ Image conversion failed — falling back to text-only identification');
            if (!extractedText) {
                throw new Error('Failed to process PDF for identification: No text or images available');
            }
        }

        onProgress?.('🤖 Grouping and preparing documents for AI...', 20);

        const { client: openai, model: identModel } = await getAiClientForTask('document_identification');
        const response = await openai.chat.completions.create({
            model: identModel,
            messages: messages,
            max_tokens: 4000,
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
 * Identifies DHS-specific document pages (ID and Zenowethu POA only)
 */
export async function identifyDhsDocumentPages(
    base64Pdf: string,
    onProgress?: (msg: string, progress?: number) => void,
    password?: string
): Promise<{
    documents: Array<{
        type: 'ID' | 'ZENOWETHU_POA';
        pages?: number[];
        startPage?: number;
        endPage?: number;
        confidence: number;
        description: string;
    }>;
    totalPages: number;
}> {
    try {
        logger.info('📄 Identifying DHS document pages (ID + Zenowethu POA)...');
        onProgress?.('📄 Analyzing document structure for DHS...', 10);

        const isLargeFile = base64Pdf.length > 50 * 1024 * 1024;
        let extractedText = '';

        if (isLargeFile) {
            logger.info(`⚠️ Large file detected. Skipping text extraction for DHS identification.`);
            onProgress?.('⚠️ Large file detected. Using image-based identification...', 12);
        } else {
            try {
                extractedText = await extractTextFromPdf(base64Pdf, 0, password); // All pages
            } catch (e) {
                logger.warn({ err: e }, '⚠️ Text extraction failed for DHS identification');
            }
        }

        const messages: any[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: DHS_IDENTIFICATION_PROMPT.replace('{{EXTRACTED_TEXT}}', extractedText ? extractedText.substring(0, 10000) : '(Text extraction skipped/failed - rely on images below)')
                    }
                ]
            }
        ];

        const imageLimit = isLargeFile ? 30 : 100;

        if (!extractedText || isLargeFile) {
            onProgress?.(`🖼️ Converting first ${imageLimit} pages for identification...`, 15);
            try {
                const images = await convertPdfToImages(base64Pdf, imageLimit, (msg) => {
                    onProgress?.(msg, 15);
                }, password);

                images.forEach((imgBase64, index) => {
                    messages[0].content.push({ type: 'text', text: `[PAGE SCAN] Page: ${index + 1}` });
                    messages[0].content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imgBase64}`, detail: 'low' } });
                });
            } catch (err) {
                logger.error({ err }, '❌ Failed to convert PDF for DHS identification');
                throw err;
            }
        }

        onProgress?.('🤖 Identifying ID and Zenowethu POA...', 20);

        const { client: openai, model: identModel } = await getAiClientForTask('document_identification');
        const response = await openai.chat.completions.create({
            model: identModel,
            messages: messages,
            max_tokens: 4000,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0]?.message?.content || '{}');
        
        // Final sanity filter: only return ID and ZENOWETHU_POA
        if (result.documents) {
            result.documents = result.documents.filter((d: any) => d.type === 'ID' || d.type === 'ZENOWETHU_POA');
        }

        logger.info({ result }, '✅ Identified DHS documents');
        return result;

    } catch (error) {
        logger.error({ err: error }, '❌ Error identifying DHS document pages');
        throw error;
    }
}


/**
 * Splits PDF based on page ranges
 */
export async function splitPdf(
    base64Pdf: string,
    pageRanges: Array<{ startPage?: number; endPage?: number; type: string; pages?: number[] }>
): Promise<Array<{ type: string; base64Pdf: string; pageCount: number }>> {
    try {
        const pdfBytes = Buffer.from(base64Pdf, 'base64');
        const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const totalPages = pdfDoc.getPageCount();

        const results: Array<{ type: string; base64Pdf: string; pageCount: number }> = [];

        for (const range of pageRanges) {
            const newPdf = await PDFDocument.create();
            const pageIndices: number[] = [];

            if (range.pages && Array.isArray(range.pages)) {
                // Handle explicit pages array
                for (const p of range.pages) {
                    const idx = p - 1;
                    if (idx >= 0 && idx < totalPages) {
                        pageIndices.push(idx);
                    }
                }
            } else if (range.startPage && range.endPage) {
                // Handle start/end range
                const startIdx = Math.max(0, range.startPage - 1);
                const endIdx = Math.min(totalPages - 1, range.endPage - 1);
                for (let i = startIdx; i <= endIdx; i++) {
                    pageIndices.push(i);
                }
            }

            if (pageIndices.length === 0) continue;

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
            const sourcePdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
            const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        } catch (e) {
            logger.error({ err: e }, `❌ Failed to add ${doc.type}`);
        }
    }

    const mergedPdfBytes = await mergedPdf.save();
    return Buffer.from(mergedPdfBytes).toString('base64');
}
