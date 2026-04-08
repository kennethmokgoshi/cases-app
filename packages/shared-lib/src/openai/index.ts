export * from './client';
export * from './prompts';
export * from './utils';
export * from './pdf-process';
export * from './extraction';
export * from './credit-analysis';

// Legacy compatibility re-exports if needed
import { analyzeDocument, extractDocumentsFromCombinedPdf } from './extraction';
import { mergeDocuments } from './pdf-process';

export const analyzeCombinedDocument = async (base64Pdf: string, onProgress?: any, customModelId?: string) => {
    const { analysis } = await extractDocumentsFromCombinedPdf(base64Pdf, onProgress, customModelId);
    return analysis;
};

export const analyzeMultipleDocumentsAsCombined = async (documents: any[]) => {
    const merged = await mergeDocuments(documents);
    const { analysis } = await extractDocumentsFromCombinedPdf(merged);
    return analysis;
};
