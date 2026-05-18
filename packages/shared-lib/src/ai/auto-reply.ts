import { getOpenAI } from '../openai/client';
import { logger } from '../logger';

export interface AutoReplyRequest {
    inboundMessage: string;
    channel: 'SMS' | 'EMAIL' | 'WHATSAPP';
    senderType: 'CLIENT' | 'DEBT_COUNSELLOR';
    caseContext: {
        fileNumber: string;
        statusLabel: string;
        nextUpdate?: string | null;
        clientFirstName: string;
        clientFullName: string;
        dcName?: string | null;
        recentActivity?: string;
    };
    companyName?: string;
    companyPhone?: string;
}

export interface AutoReplyResponse {
    subject: string;   // populated for EMAIL; empty string for SMS / WhatsApp
    body: string;
    shouldSend: boolean;
    reasoning: string;
}

const COMPANY = 'Zenowethu Debt Management';
const PHONE   = '012 035 1824';

function buildPrompt(req: AutoReplyRequest): string {
    const { inboundMessage, channel, senderType, caseContext } = req;
    const company = req.companyName || COMPANY;
    const phone   = req.companyPhone || PHONE;
    const today   = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

    const channelNote =
        channel === 'SMS'
            ? 'This is an SMS reply. Keep the body under 160 characters. No subject needed.'
            : channel === 'WHATSAPP'
            ? 'This is a WhatsApp reply. Keep the body conversational and under 400 characters. No subject needed.'
            : 'This is an email reply. Include a short, professional subject line and a full email body.';

    const senderNote =
        senderType === 'DEBT_COUNSELLOR'
            ? `The sender is the Debt Counsellor${caseContext.dcName ? ` (${caseContext.dcName})` : ''} — use formal, professional language.`
            : `The sender is the client (${caseContext.clientFirstName}) — use warm, reassuring language.`;

    const nextUpdateText = caseContext.nextUpdate
        ? `Next scheduled update: ${new Date(caseContext.nextUpdate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : 'No next update date set.';

    return `You are a professional client-services representative at ${company}, a South African debt counselling firm.

Today's date: ${today}

CASE CONTEXT:
- File number: ${caseContext.fileNumber}
- Client: ${caseContext.clientFullName}
- Case status: ${caseContext.statusLabel}
- ${nextUpdateText}
${caseContext.recentActivity ? `- Recent activity: ${caseContext.recentActivity}` : ''}
- Company phone: ${phone}

INBOUND MESSAGE (from ${senderType === 'DEBT_COUNSELLOR' ? 'Debt Counsellor' : 'Client'}):
"${inboundMessage}"

${senderNote}
${channelNote}

INSTRUCTIONS:
1. Decide if an automated reply is appropriate (shouldSend: true/false).
   - Set shouldSend to FALSE if the message requires a human decision, legal advice, or you lack enough information to answer accurately.
   - Set shouldSend to TRUE for: status queries, general acknowledgements, document receipt confirmations, timeline questions, or reassurance.
2. If shouldSend is true, draft a response that:
   - Acknowledges their message directly.
   - Answers the specific question if the case context provides enough information.
   - If uncertain, acknowledges receipt and says a team member will follow up within 1–2 business days.
   - Never makes promises about legal outcomes or specific payment amounts.
   - Closes with the company name and phone number.
   - Matches the tone and length requirements for the channel (${channel}).
3. Provide brief reasoning for your decision.

Respond ONLY with valid JSON:
{
  "shouldSend": true,
  "subject": "Re: Your Debt Review Enquiry — [File Number]",
  "body": "The full message body here",
  "reasoning": "One sentence explaining the decision"
}
For SMS and WhatsApp, set "subject" to "".`;
}

export async function generateAutoReply(request: AutoReplyRequest): Promise<AutoReplyResponse> {
    const fallback: AutoReplyResponse = {
        shouldSend: false,
        subject: '',
        body: '',
        reasoning: 'AI generation failed — no auto-reply sent',
    };

    try {
        const openai = getOpenAI();
        const prompt = buildPrompt(request);

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            temperature: 0.4,
            messages: [
                {
                    role: 'system',
                    content: 'You are a professional debt counselling client-services representative in South Africa. You respond to client and debt counsellor messages on behalf of Zenowethu Debt Management. Always respond with valid JSON.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) return fallback;

        const parsed = JSON.parse(raw) as AutoReplyResponse;

        // Safety checks
        if (typeof parsed.shouldSend !== 'boolean') return fallback;
        if (parsed.shouldSend && !parsed.body?.trim()) return fallback;

        // Enforce SMS length
        if (request.channel === 'SMS' && parsed.body.length > 160) {
            parsed.body = parsed.body.substring(0, 157) + '...';
        }

        logger.info(`[AutoReply] shouldSend=${parsed.shouldSend} channel=${request.channel} reason="${parsed.reasoning}"`);
        return parsed;

    } catch (err) {
        logger.error('[AutoReply] Generation failed:', err);
        return fallback;
    }
}
