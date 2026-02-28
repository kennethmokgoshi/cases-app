import { logger } from '@zenowethu/shared-lib';

export interface OCRResult {
    caseNumber?: string;
    courtName?: string;
    plaintiff?: string; // Creditor
    judgmentDate?: string;
    judgmentAmount?: number;
    confidence: number;
}

/**
 * Simulates an AI OCR agent parsing a Court Order PDF.
 * In a real implementation, this would call Tesseract.js, Google Vision API, or AWS Textract.
 */
export async function parseCourtOrder(file: File): Promise<OCRResult> {
    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock Logic: Check file name for "keywords" to simulate "finding" data
    // Or just return a standard mock for demo purposes
    logger.info(`Analyzing file: ${file.name} (${file.size} bytes)`);

    // We'll return a high-confidence result as if the AI successfully read the doc
    return {
        caseNumber: '1234/2023',
        courtName: 'Randburg',
        plaintiff: 'Capitec Bank Ltd',
        judgmentDate: '2023-05-15',
        judgmentAmount: 15400.50,
        confidence: 0.92
    };
}
