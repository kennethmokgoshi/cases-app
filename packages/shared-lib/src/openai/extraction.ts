import { logger } from '../logger';
import { convertPdfToImages, extractTextFromPdf } from '../pdf-image';
import { getAiClientForTask } from '../ai/provider-client';
import { PROMPTS } from './prompts';
import { parseAIResponse, buildVerificationReport } from './utils';
import { identifyDocumentPages, identifyDhsDocumentPages, splitPdf } from './pdf-process';

export type DocType = 'ID' | 'POA' | 'CREDIT_REPORT' | 'CREDIT_REPORT_OTHER' | 'PAYSLIP' | 'BANK_STATEMENT' | 'OTHER' | 'ZENOWETHU_POA' | 'PROOF_OF_RESIDENCE' | 'DHS_SUMMARY_REPORT';

/**
 * Analyze a document (ID, POA, or Credit Report) and extract structured data
 */
export async function analyzeDocument(
    base64Pdf: string,
    documentType: DocType,
    _mimeType?: string | ((msg: string, progress?: number) => void),
    onProgress?: (msg: string, progress?: number) => void,
    customModelId?: string,
    password?: string
): Promise<{ data: any; bureauName?: string; identifiedType?: DocType }> {
    try {
        let identifiedType = documentType;
        let bureauName = '';

        if (documentType === 'CREDIT_REPORT') {
            onProgress?.('🔍 Identifying credit report type...');
            const idResult = await identifyCreditReportType(base64Pdf, customModelId, password);
            identifiedType = idResult.type;
            bureauName = idResult.bureauName;
            onProgress?.(`📑 Identified as: ${bureauName}`);
        }

        const promptKey = identifiedType === 'ZENOWETHU_POA' ? 'POA' : identifiedType;
        const prompt = PROMPTS[promptKey as keyof typeof PROMPTS] || PROMPTS.OTHER;

        onProgress?.(`📄 Extracting text from ${documentType}...`);
        let extractedText = '';
        try {
            extractedText = await extractTextFromPdf(base64Pdf, 10, password);
        } catch (e) {
            logger.warn({ err: e }, '⚠️ Text extraction failed');
        }

        const contentParts: any[] = [{ type: 'text', text: prompt }];

        try {
            onProgress?.(`🖼️ Converting ${documentType} pages to images for OCR...`);
            const images = await convertPdfToImages(base64Pdf, 6, undefined, password);
            images.forEach((imgBase64, index) => {
                contentParts.push({ type: 'text', text: `[PAGE SCAN] Page: ${index + 1}` });
                contentParts.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imgBase64}`, detail: 'high' } });
            });
        } catch (imgError) {
            logger.warn({ err: imgError }, '⚠️ Image conversion failed — using extracted text only');
        }

        if (extractedText) {
            contentParts.push({ type: 'text', text: `[EXTRACTED TEXT CONTENT]\n\n${extractedText.substring(0, 20000)}` });
        }

        const { client, model } = await getAiClientForTask('document_analysis');
        const isComplexDoc = ['CREDIT_REPORT', 'CREDIT_REPORT_OTHER', 'DHS_SUMMARY_REPORT'].includes(documentType);
        const response = await client.chat.completions.create({
            model: customModelId || model,
            messages: [{ role: 'user', content: contentParts }],
            max_tokens: isComplexDoc ? 8000 : 4000,
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const content = response.choices[0]?.message?.content;
        return {
            data: parseAIResponse(content || ''),
            bureauName: bureauName || undefined,
            identifiedType: identifiedType !== documentType ? identifiedType : undefined
        };
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
    onProgress?: (msg: string, progress?: number) => void,
    customModelId?: string,
    password?: string
): Promise<{
    extractedDocuments: Array<any>;
    analysis: any;
}> {
    const pageInfo = await identifyDocumentPages(base64Pdf, onProgress, password);
    if (!pageInfo.documents || pageInfo.documents.length === 0) return { extractedDocuments: [], analysis: {} };

    const splitDocs = await splitPdf(base64Pdf, pageInfo.documents);
    let extractedDocuments: any[] = [];
    let analysis: any = {};

    await Promise.all(splitDocs.map(async (doc) => {
        const docInfo = pageInfo.documents.find(d => d.type === doc.type && (d.startPage - 1) <= doc.pageCount);
        try {
            const analysisType = doc.type === 'ZENOWETHU_POA' ? 'POA' : doc.type;

            const docResult = await analyzeDocument(doc.base64Pdf, analysisType as any, 'application/pdf', undefined, customModelId);
            const data = docResult.data;
            const bureauName = docResult.bureauName || docInfo?.bureauName || docInfo?.description;

            if (doc.type === 'ID') analysis.id = data;
            else if (doc.type === 'POA' || doc.type === 'ZENOWETHU_POA') analysis.poa = data;
            else if (doc.type === 'CREDIT_REPORT' || doc.type === 'CREDIT_REPORT_OTHER') analysis.creditReport = data;
            else if (doc.type === 'PAYSLIP') analysis.payslip = data;
            else if (doc.type === 'BANK_STATEMENT') analysis.bankStatement = data;
            else if (doc.type === 'PROOF_OF_RESIDENCE') analysis.proofOfResidence = data;

            extractedDocuments.push({
                ...doc,
                description: bureauName || doc.type,
                confidence: docInfo?.confidence || 0.8
            });
        } catch (err) {
            logger.error({ err, type: doc.type }, `❌ Failed to analyze document — saving with minimal data`);
            // Still include the split document so it's saved even without full analysis data
            extractedDocuments.push({
                ...doc,
                description: docInfo?.description || doc.type,
                confidence: docInfo?.confidence || 0
            });
        }
    }));

    // Build cross-document field verification report
    analysis.verification = buildVerificationReport(analysis);

    return { extractedDocuments, analysis };
}
/**
 * DHS Extraction from combined PDF (ID and Zenowethu POA only)
 */
export async function extractDhsDocuments(
    base64Pdf: string,
    onProgress?: (msg: string, progress?: number) => void,
    customModelId?: string
): Promise<{
    extractedDocuments: Array<any>;
    analysis: any;
}> {
    const pageInfo = await identifyDhsDocumentPages(base64Pdf, onProgress);
    if (!pageInfo.documents || pageInfo.documents.length === 0) return { extractedDocuments: [], analysis: {} };

    const splitDocs = await splitPdf(base64Pdf, pageInfo.documents);
    let extractedDocuments: any[] = [];
    let analysis: any = {};

    await Promise.all(splitDocs.map(async (doc, index) => {
        try {
            const docInfo = pageInfo.documents[index];
            const analysisType = doc.type === 'ZENOWETHU_POA' ? 'POA' : doc.type;

            onProgress?.(`🔍 Analyzing ${doc.type}...`);
            const docResult = await analyzeDocument(doc.base64Pdf, analysisType as any, 'application/pdf', undefined, customModelId);
            const data = docResult.data;
            const description = docInfo?.description || doc.type;

            if (doc.type === 'ID') analysis.id = data;
            else if (doc.type === 'ZENOWETHU_POA') analysis.poa = data;

            extractedDocuments.push({ 
                ...doc, 
                description: description,
                confidence: docInfo?.confidence || 0.8 
            });
        } catch (err) {
            logger.error({ err, type: doc.type }, `❌ Failed to analyze DHS document`);
        }
    }));

    return { extractedDocuments, analysis };
}


/**
 * Sequential batch analysis
 */
export async function batchAnalyzeDocuments(
    documents: Array<{ base64: string; type: DocType; mimeType?: string }>,
    onProgress?: (msg: string, progress?: number) => void,
    customModelId?: string,
    password?: string
): Promise<any> {
    const results: any = {};
    for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const progress = 10 + Math.round(((i + 1) / documents.length) * 85);
        onProgress?.(`🔍 Analyzing ${doc.type} (${i + 1}/${documents.length})...`, progress);

        try {
            const extracted = await analyzeDocument(doc.base64, doc.type, doc.mimeType, undefined, customModelId, password);
            const data = extracted.data;
            if (doc.type === 'ID') results.id = data;
            else if (doc.type === 'POA') results.poa = data;
            else if (doc.type === 'CREDIT_REPORT' || doc.type === 'CREDIT_REPORT_OTHER') results.creditReport = data;
            else if (doc.type === 'PAYSLIP') results.payslip = data;
            else if (doc.type === 'BANK_STATEMENT') results.bankStatement = data;
            else if (doc.type === 'PROOF_OF_RESIDENCE') results.proofOfResidence = data;
            
            // Re-assign refined type if identified
            if (extracted.identifiedType) {
                doc.type = extracted.identifiedType;
            }
        } catch (e) {
            logger.error({ err: e, type: doc.type }, `❌ Failed analysis`);
        }
    }
    results.verification = buildVerificationReport(results);
    return results;
}

/**
 * Specifically identifies the type of credit report (Major vs Other)
 */
export async function identifyCreditReportType(base64Pdf: string, customModelId?: string, password?: string): Promise<{ type: DocType; bureauName: string }> {
    try {
        const text = await extractTextFromPdf(base64Pdf, 5, password);
        const { client, model } = await getAiClientForTask('document_analysis');
        const response = await client.chat.completions.create({
            model: customModelId || model,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: PROMPTS.CREDIT_REPORT_TYPE_IDENTIFICATION },
                    { type: 'text', text: `[EXTRACTED TEXT CONTENT]\n\n${text}` }
                ]
            }],
            max_tokens: 500,
            temperature: 0,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0]?.message?.content || '{}');
        return {
            type: (result.type as DocType) || 'CREDIT_REPORT',
            bureauName: result.bureauName || 'Credit Report'
        };
    } catch (error) {
        logger.error({ err: error }, '❌ Error identifying credit report type');
        return { type: 'CREDIT_REPORT', bureauName: 'Credit Report' };
    }
}
