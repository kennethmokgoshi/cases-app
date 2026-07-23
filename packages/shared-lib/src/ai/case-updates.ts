import { getAiClientForTask } from './provider-client';
import { logger } from '../logger';

export interface CaseUpdateAnalysis {
    isRelevant: boolean;
    hasUpdate: boolean;
    updateSummary: string;
    counsellorRequestedForm?: boolean;
    counsellorAcknowledgement?: boolean;
    providerAcknowledgement?: boolean;
    consumerNotificationMsg: string | null;
}

export async function analyzeEmailForCaseUpdate(emailContent: {
    from: string;
    to: string;
    subject: string;
    date: string | null;
    body: string;
}): Promise<CaseUpdateAnalysis> {
    const fallback: CaseUpdateAnalysis = {
        isRelevant: false,
        hasUpdate: false,
        updateSummary: 'Failed to analyze due to fallback/error.',
        consumerNotificationMsg: null,
    };

    try {
        const { client, model } = await getAiClientForTask('document_analysis');
        
        const systemPrompt = `You are ZenoCasesSystem AI, an expert South African debt review case management assistant.
Analyze the provided email content to determine if it is relevant to the client/case, if it contains an update, and extract key information.

You must respond with a JSON object containing the following keys:
- "isRelevant": boolean (is this email actually related to this client/case? Or is it a generic newsletter, spam, auto-reply, or unrelated notification?)
- "hasUpdate": boolean (does this email contain an important status update, client message, debt counsellor message, clearance update, form request, or acknowledgment related to the case?)
- "updateSummary": string (a concise, professional summary of the update found in the email. Keep it under 2-3 sentences. If no update, explain why shortly, e.g. "Spam/Unrelated")
- "counsellorRequestedForm": boolean (true if the email mentions a request for the debt counsellor to request or sign a form, e.g., Form 17.W, clearance certificates, consent, power of attorney, etc.)
- "counsellorAcknowledgement": boolean (true if the email is from a debt counsellor acknowledging receipt of a request, document, or transfer)
- "providerAcknowledgement": boolean (true if the email is from a credit provider/bureau acknowledging receipt of a clearance or dispute request)
- "consumerNotificationMsg": string | null (if hasUpdate is true, write a friendly, plain-language message summarizing this update to be sent to the consumer. Avoid jargon, keep it professional and reassuring. If no update or notification is not needed, set to null)

Strictly return ONLY a valid JSON object in JSON format. Do not wrap it in markdown blocks or write any conversational text.`;

        const userPrompt = `Email Details:
From: ${emailContent.from}
To: ${emailContent.to}
Subject: ${emailContent.subject}
Date: ${emailContent.date || 'Unknown'}

Email Body:
${emailContent.body || '(no body content)'}`;

        const response = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
        });

        const raw = response.choices[0]?.message?.content || '';
        const parsed = JSON.parse(raw);

        return {
            isRelevant: Boolean(parsed.isRelevant),
            hasUpdate: Boolean(parsed.hasUpdate),
            updateSummary: String(parsed.updateSummary || ''),
            counsellorRequestedForm: Boolean(parsed.counsellorRequestedForm),
            counsellorAcknowledgement: Boolean(parsed.counsellorAcknowledgement),
            providerAcknowledgement: Boolean(parsed.providerAcknowledgement),
            consumerNotificationMsg: parsed.consumerNotificationMsg ? String(parsed.consumerNotificationMsg) : null,
        };
    } catch (err: any) {
        logger.error('Error analyzing email for case update:', err);
        return fallback;
    }
}
