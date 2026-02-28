
import { openai } from '../openai';
import { logger } from '../logger';
import { CaseStrategyResponse } from './strategy-engine';

export interface DraftingRequest {
    client: {
        firstName: string;
        lastName: string;
        idNumber: string;
        address?: string | null;
    };
    caseData: {
        fileNumber: string;
    };
    matter: {
        type: string;
        creditorName: string;
        accountNumber?: string | null;
    };
    strategy?: CaseStrategyResponse;
    documentType: 'LOD' | 'RESCISSION_AFFIDAVIT' | 'PRESCRIPTION_NOTICE' | 'CLEARANCE_DEMAND';
}

export interface DraftResponse {
    subject: string;
    content: string;
    recipientName: string;
    recipientDetails: string;
}

/**
 * AI Legal Secretary (Stage 2)
 * Drafts professional legal documents based on case data and strategy
 */
export async function draftLegalDocument(request: DraftingRequest): Promise<DraftResponse> {
    try {
        const prompt = `
You are an expert Legal Secretary at Zenowethu. Your task is to draft a professional legal document for a South African credit repair case.

CLIENT: ${request.client.firstName} ${request.client.lastName} (ID: ${request.client.idNumber})
ADDRESS: ${request.client.address || 'Not Provided'}
CASE: ${request.caseData.fileNumber}
MATTER: ${request.matter.type} against ${request.matter.creditorName} ${request.matter.accountNumber ? `(Acc: ${request.matter.accountNumber})` : ''}

${request.strategy ? `AI STRATEGY: ${request.strategy.primaryPath} - ${request.strategy.pathDescription}` : ''}

DOCUMENT TYPE TO DRAFT: ${request.documentType}

INSTRUCTIONS:
1. Use professional, formal South African legal tone.
2. Reference the National Credit Act (NCA) 34 of 2005 where appropriate.
3. If it's a PRESCRIPTION_NOTICE, specifically cite Section 126B of the NCA.
4. If it's an LOD (Letter of Demand), specify the 20-business-day response period.
5. If it's a RESCISSION_AFFIDAVIT, format it as a court-ready affidavit skeleton.

Output your draft in the following JSON format:
{
  "subject": "Formal subject line",
  "content": "Full body text of the document including headers, dates [TODAY_DATE], and sign-offs.",
  "recipientName": "Name of the creditor/entity",
  "recipientDetails": "Email or address if known, otherwise placeholder"
}
`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: 'You are a professional legal secretary specializing in South African credit law.' },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');

        // Post-process: Replace [TODAY_DATE] with actual date
        if (result.content) {
            const today = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
            result.content = result.content.replace(/\[TODAY_DATE\]/g, today);
        }

        return result as DraftResponse;
    } catch (error) {
        logger.error(error, 'Error drafting legal document');
        throw new Error('Failed to draft document via AI');
    }
}
