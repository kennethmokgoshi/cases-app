import { logger } from '../logger';
import { convertPdfToImages, extractTextFromPdf } from '../pdf-image';
import { openai } from './client';
import { PROMPTS } from './prompts';
import { parseAIResponse } from './utils';
import { identifyDocumentPages, splitPdf } from './pdf-process';

export type DocType = 'ID' | 'POA' | 'CREDIT_REPORT' | 'PAYSLIP' | 'BANK_STATEMENT' | 'OTHER' | 'ZENOWETHU_POA';

/**
 * Analyze a document (ID, POA, or Credit Report) and extract structured data
 */
export async function analyzeDocument(
    base64Image: string,
    documentType: DocType,
    mimeType?: string,
    onProgress?: (msg: string, progress?: number) => void
): Promise<any> {
    try {
        const isPdf = base64Image.startsWith('JVBERi0') || mimeType === 'application/pdf';
        const promptKey = documentType === 'ZENOWETHU_POA' ? 'POA' : documentType;
        const prompt = PROMPTS[promptKey as keyof typeof PROMPTS] || PROMPTS.OTHER;

        let response;

        if (isPdf) {
            onProgress?.(`📄 Extracting text from ${documentType}...`);
            let extractedText = '';
            try {
                extractedText = await extractTextFromPdf(base64Image, 10);
            } catch (e) {
                logger.warn({ err: e }, '⚠️ Text extraction failed');
            }

            const contentParts: any[] = [{ type: 'text', text: prompt }];

            try {
                onProgress?.(`🖼️ Converting ${documentType} pages to images for OCR...`);
                const images = await convertPdfToImages(base64Image, 6);
                images.forEach((imgBase64, index) => {
                    contentParts.push({ type: 'text', text: `[PAGE SCAN] Page: ${index + 1}` });
                    contentParts.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imgBase64}`, detail: 'high' } });
                });
            } catch (imgError) {
                logger.error({ err: imgError }, '⚠️ Image fallback failed');
                contentParts.push({ type: 'file', file: { filename: `${documentType.toLowerCase()}.pdf`, file_data: `data:application/pdf;base64,${base64Image}` } });
            }

            if (extractedText) {
                contentParts.push({ type: 'text', text: `[EXTRACTED TEXT CONTENT]\n\n${extractedText.substring(0, 20000)}` });
            }

            response = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: contentParts }],
                max_tokens: 2000,
                temperature: 0.1,
                response_format: { type: "json_object" }
            });
        } else {
            logger.info(`🖼️ Analyzing ${documentType} as image...`);
            response = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                    ]
                }],
                max_tokens: 1000,
                temperature: 0.1,
                response_format: { type: "json_object" }
            });
        }

        const content = response.choices[0]?.message?.content;
        return parseAIResponse(content || '');
    } catch (error) {
        logger.error({ err: error }, '❌ Error analyzing document');
        throw error;
    }
}

/**
 * Extraction from combined PDF
 */
export async function extractDocumentsFromCombinedPdf(
    base64Pdf: string,
    onProgress?: (msg: string, progress?: number) => void
): Promise<{
    extractedDocuments: Array<any>;
    analysis: any;
}> {
    const pageInfo = await identifyDocumentPages(base64Pdf, onProgress);
    if (!pageInfo.documents || pageInfo.documents.length === 0) return { extractedDocuments: [], analysis: {} };

    const splitDocs = await splitPdf(base64Pdf, pageInfo.documents);
    let extractedDocuments: any[] = [];
    let analysis: any = {};

    await Promise.all(splitDocs.map(async (doc) => {
        try {
            const docInfo = pageInfo.documents.find(d => d.type === doc.type && (d.startPage - 1) <= doc.pageCount);
            const analysisType = doc.type === 'ZENOWETHU_POA' ? 'POA' : doc.type;

            const docResult = await analyzeDocument(doc.base64Pdf, analysisType as any, 'application/pdf');

            if (doc.type === 'ID') analysis.id = docResult;
            else if (doc.type === 'POA' || doc.type === 'ZENOWETHU_POA') analysis.poa = docResult;
            else if (doc.type === 'CREDIT_REPORT') analysis.creditReport = docResult;
            else if (doc.type === 'PAYSLIP') analysis.payslip = docResult;
            else if (doc.type === 'BANK_STATEMENT') analysis.bankStatement = docResult;

            extractedDocuments.push({ ...doc, confidence: docInfo?.confidence || 0.8 });
        } catch (err) {
            logger.error({ err, type: doc.type }, `❌ Failed to analyze document`);
        }
    }));

    return { extractedDocuments, analysis };
}

/**
 * Sequential batch analysis
 */
export async function batchAnalyzeDocuments(
    documents: Array<{ base64: string; type: DocType; mimeType?: string }>,
    onProgress?: (msg: string, progress?: number) => void
): Promise<any> {
    const results: any = {};
    for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const progress = 10 + Math.round(((i + 1) / documents.length) * 85);
        onProgress?.(`🔍 Analyzing ${doc.type} (${i + 1}/${documents.length})...`, progress);

        try {
            const extracted = await analyzeDocument(doc.base64, doc.type, doc.mimeType);
            if (doc.type === 'ID') results.id = extracted;
            else if (doc.type === 'POA') results.poa = extracted;
            else if (doc.type === 'CREDIT_REPORT') results.creditReport = extracted;
            else if (doc.type === 'PAYSLIP') results.payslip = extracted;
            else if (doc.type === 'BANK_STATEMENT') results.bankStatement = extracted;
        } catch (e) {
            logger.error({ err: e, type: doc.type }, `❌ Failed analysis`);
        }
    }
    return results;
}
