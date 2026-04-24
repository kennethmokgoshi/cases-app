
import { getOpenAI } from '../openai/client';
import { logger } from '../logger';

export interface CaseStrategyRequest {
    client: {
        firstName: string;
        lastName: string;
        idNumber: string;
        grossSalary?: number | null;
        netSalary?: number | null;
        type: string;
    };
    caseData: {
        fileNumber: string;
        acquisitionType: string;
        status: string;
        dhsStatus?: string | null;
        totalDebtAmount?: number | null;
        openAccounts: number;
        closedAccounts: number;
        prescribedAccounts: number;
    };
    accounts: Array<{
        creditorName: string;
        accountType: string;
        outstandingBalance: number;
        lastPaymentDate?: string | Date | null;
        isPrescribed: boolean;
        monthlyInstalment?: number | null;
    }>;
}

export interface CaseStrategyResponse {
    primaryPath: string;
    pathDescription: string;
    reasoning: string;
    recommendedStatus: string;
    nextActions: string[];
    riskScore: number; // 1-10
    successProbability: number; // 0-100
    suggestedNotifications: Array<{
        channel: 'SMS' | 'EMAIL' | 'WHATSAPP';
        templateKey: string;
        recipient: string;
    }>;
    requiredDocuments: string[]; // List of documents needed for this strategy (e.g. Form 17.W, Court Order)
}

/**
 * AI Strategy Engine (Stage 1)
 * Analyzes case data and recommends the best legal/administrative path
 */
export async function generateCaseStrategy(request: CaseStrategyRequest): Promise<CaseStrategyResponse> {
    try {
        const prompt = `
You are a Senior Legal Strategist for Zenowethu, a South African credit repair and legal services firm. 
Your goal is to analyze a client's financial and legal situation and recommend the most effective strategy for debt clearance and credit repair.

CLIENT DATA:
- Name: ${request.client.firstName} ${request.client.lastName}
- Type: ${request.client.type}
- Income: Gross: R${request.client.grossSalary || 'Unknown'}, Net: R${request.client.netSalary || 'Unknown'}

CASE DATA:
- Status: ${request.caseData.status}
- DHS Status: ${request.caseData.dhsStatus || 'None'}
- Total Debt: R${request.caseData.totalDebtAmount || 0}
- Accounts: ${request.caseData.openAccounts} open, ${request.caseData.closedAccounts} closed
- Flagged Prescribed: ${request.caseData.prescribedAccounts}

ACCOUNT DETAILS:
${request.accounts.map(acc => `- ${acc.creditorName} (${acc.accountType}): R${acc.outstandingBalance}, Last Payment: ${acc.lastPaymentDate || 'Unknown'}, Prescribed: ${acc.isPrescribed}`).join('\n')}

STRATEGY GUIDELINES:
1. PRESCRIPTION: If accounts were last paid > 3 years ago and no summons was issued, prioritize Section 126B of the NCA (Prescription).
2. DEBT REVIEW REMOVAL: If the client has paid up all accounts but is still "stuck" on DHS or has a Form 17.W, recommend the clearance path.
3. RECKLESS LENDING: If the monthly installments exceed the client's net income, flag for reckless lending forensic audit.
4. VOLUNTARY WITHDRAWAL: If the client is no longer over-indebted, suggest a court application for debt review removal.
5. ABANDONED PROCESS: If the client is under debt review (DHS Status indicates D3 or similar) but no court order exists and it has been > 4 months, flag as Abandoned Process and request Form 17.W.

For "DEBT REVIEW REMOVAL" or "ABANDONED PROCESS" strategies, always include:
- "Form 17.W" in requiredDocuments.
- "Court Order" if a court application is recommended.
- "Form 17.1" and "Form 17.2" if current status is unclear.

Output your recommendation in the following JSON format ONLY:
{
  "primaryPath": "Short title of strategy",
  "pathDescription": "Detailed overview of what this path entails",
  "reasoning": "Why this is the best option based on the data",
  "recommendedStatus": "A logical next status code from the Zenowethu system (e.g., READY_COURT_DATE, DISPUTED, etc.)",
  "nextActions": ["Action 1", "Action 2"],
  "riskScore": 1-10,
  "successProbability": 0-100,
  "suggestedNotifications": [
    { "channel": "SMS", "templateKey": "strategy_update", "recipient": "client_phone" }
  ],
  "requiredDocuments": ["Document name 1", "Document name 2"]
}
`;

        const openai = getOpenAI();
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: 'You are a professional legal strategist specializing in the National Credit Act (NCA) of South Africa.' },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');
        return result as CaseStrategyResponse;
    } catch (error) {
        logger.error(error, 'Error generating case strategy');
        throw new Error('Failed to generate AI strategy. Please check logs.');
    }
}
