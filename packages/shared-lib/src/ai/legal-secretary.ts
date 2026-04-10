
import { getOpenAI } from '../openai';
import { logger } from '../logger';
import { CaseStrategyResponse } from './strategy-engine';

export interface DraftingAccount {
    creditorName: string;
    accountNumber?: string | null;
    accountType?: string;
    outstandingBalance?: number;
}

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
    documentType: 'LOD' | 'RESCISSION_AFFIDAVIT' | 'PRESCRIPTION_NOTICE' | 'CLEARANCE_DEMAND' | 'BUREAU_FILE_REQUEST' | 'PROVIDER_FILE_REQUEST' | 'DC_DRR_FILE_REQUEST';
    // Extra context used by BUREAU_FILE_REQUEST and PROVIDER_FILE_REQUEST
    accounts?: DraftingAccount[];
    senderName?: string;
    companyName?: string;
    companyPhone?: string;
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
function buildPrompt(request: DraftingRequest): string {
    const clientFullName = `${request.client.firstName} ${request.client.lastName}`;
    const company = request.companyName || 'Zenowethu Debt Management';
    const phone = request.companyPhone || '012 035 1824';
    const sender = request.senderName || company;

    if (request.documentType === 'DC_DRR_FILE_REQUEST') {
        return `
You are an expert Legal Secretary at ${company} in South Africa. Draft a formal letter to a Debt Counsellor requesting critical documents for a consumer who is currently under an abandoned or stagnant debt review process.

CONSUMER: ${clientFullName} (ID: ${request.client.idNumber})
DEBT COUNSELLOR: ${request.matter.creditorName}
OUR REFERENCE: ${request.caseData.fileNumber}
SENDER: ${sender}, ${company} — Tel: ${phone}

BACKGROUND:
The consumer's debt review process appears abandoned or stagnant as per DHS/NCR records. We are assisting the consumer to resolve this status.

INSTRUCTIONS:
1. Formal, authoritative, and professional South African legal tone.
2. State that we act on behalf of the consumer under a Power of Attorney.
3. MANDATORY REQUEST: Form 17.W (Withdrawal by Debt Counsellor), any Court Orders (or Draft Orders) served on creditors, and the original 17.1 and 17.2 forms.
4. Demand a response and the requested files within 2 business days, citing the Debt Counsellor's statutory duty to assist the consumer in resolving stagnant processes.
5. Use [TODAY_DATE] as the date placeholder.
6. Sign off from ${sender} on behalf of ${company}.

Output ONLY valid JSON in this format:
{
  "subject": "Urgent Request for Debt Review Documentation: ${clientFullName} (${request.client.idNumber})",
  "content": "Complete formal letter body with date, salutation, paragraphs, and sign-off",
  "recipientName": "${request.matter.creditorName}",
  "recipientDetails": "Debt Review Department"
}`;
    }

    if (request.documentType === 'BUREAU_FILE_REQUEST') {
        const accountsSummary = request.accounts && request.accounts.length > 0
            ? request.accounts.map(a =>
                `- ${a.creditorName}${a.accountNumber ? ` (Acc: ${a.accountNumber})` : ''}${a.outstandingBalance ? ` — R${a.outstandingBalance.toLocaleString()}` : ''}`
              ).join('\n')
            : 'See attached consumer profile.';

        return `
You are an expert Legal Secretary at ${company} in South Africa. Draft a formal letter to a credit bureau requesting the consumer's full credit profile and removal of a debt review flag, in compliance with the National Credit Act 34 of 2005.

CONSUMER: ${clientFullName} (ID: ${request.client.idNumber})
OUR REFERENCE: ${request.caseData.fileNumber}
ACCOUNTS ON RECORD:
${accountsSummary}
SENDER: ${sender}, ${company} — Tel: ${phone}

INSTRUCTIONS:
1. Formal, professional South African legal tone.
2. Cite Section 71(1) of the NCA: right to clearance certificate upon full repayment.
3. Cite Section 71(2): credit bureau must update records within 5 business days of receiving clearance certificate.
4. Request: full credit report, list of current flags, confirmation of debt review flag status.
5. Give a 5-business-day response deadline.
6. Use [TODAY_DATE] as the date placeholder.
7. Sign off from ${sender} on behalf of ${company}.

Output ONLY valid JSON in this format:
{
  "subject": "Formal subject line referencing consumer name and ID",
  "content": "Complete formal letter body with date, salutation, paragraphs, and sign-off",
  "recipientName": "Sir/Madam",
  "recipientDetails": "Credit Bureau Disputes Department"
}`;
    }

    if (request.documentType === 'PROVIDER_FILE_REQUEST') {
        const accountsSummary = request.accounts && request.accounts.length > 0
            ? request.accounts.map(a =>
                `- ${a.accountType || 'Account'}${a.accountNumber ? ` #${a.accountNumber}` : ''}${a.outstandingBalance ? ` — Outstanding: R${a.outstandingBalance.toLocaleString()}` : ''}`
              ).join('\n')
            : 'Refer to consumer ID number for account lookup.';

        return `
You are an expert Legal Secretary at ${company} in South Africa. Draft a formal letter to a credit provider requesting account information, statement of account, and a clearance/settlement certificate, in compliance with the National Credit Act 34 of 2005.

CONSUMER: ${clientFullName} (ID: ${request.client.idNumber})
CREDIT PROVIDER: ${request.matter.creditorName}
ACCOUNTS:
${accountsSummary}
OUR REFERENCE: ${request.caseData.fileNumber}
SENDER: ${sender}, ${company} — Tel: ${phone}

INSTRUCTIONS:
1. Formal, professional South African legal tone.
2. State that we act on behalf of the consumer under a valid Power of Attorney.
3. Request: current outstanding balance, full account statement, any Section 86 notices issued, and a clearance/settlement letter if account is paid up.
4. Cite Section 86(9) of the NCA regarding the consumer's right to request their account information.
5. Give a 5-business-day response deadline.
6. Use [TODAY_DATE] as the date placeholder.
7. Sign off from ${sender} on behalf of ${company}.

Output ONLY valid JSON in this format:
{
  "subject": "Formal subject line referencing consumer name, ID and account(s)",
  "content": "Complete formal letter body with date, salutation, paragraphs, and sign-off",
  "recipientName": "${request.matter.creditorName}",
  "recipientDetails": "Credit Collections / Legal Department"
}`;
    }

    // Original document types
    return `
You are an expert Legal Secretary at Zenowethu. Your task is to draft a professional legal document for a South African credit repair case.

CLIENT: ${clientFullName} (ID: ${request.client.idNumber})
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
}`;
}

export async function draftLegalDocument(request: DraftingRequest): Promise<DraftResponse> {
    try {
        const prompt = buildPrompt(request);
        const openai = getOpenAI();

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
