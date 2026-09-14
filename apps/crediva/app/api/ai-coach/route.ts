import { NextRequest, NextResponse } from 'next/server';
import { getAiClientForTask, checkRateLimit, clientIpFromHeaders, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';
import { auth } from '@/auth';

const logger = createLogger('crediva/api/ai-coach');

// Every call here spends OpenAI credits, so this route must never be reachable
// anonymously — an open endpoint becomes a public LLM proxy within days and gets
// the provider account suspended for "abnormal use". The consumer identity comes
// from the session, never from the request body.
const MessageSchema = z.object({
    message: z.string().min(1).max(2000),
    language: z.string().optional().default('English'),
});

// Per-consumer and per-IP ceilings. Generous for a real person chatting, tight
// enough that a scripted client cannot drain the AI budget.
const USER_LIMIT = 30;
const USER_WINDOW_MS = 10 * 60 * 1000;
const IP_LIMIT = 60;
const IP_WINDOW_MS = 10 * 60 * 1000;

const SYSTEM_PROMPT = `You are Crediva AI, a South African credit coaching assistant built by Zenowethu.

Your role is to help South African consumers understand their credit rights and improve their financial situation. You have deep knowledge of:
- The National Credit Act (NCA) — Sections 71, 72, 86, 126
- The Prescription Act 68 of 1969 (3-year prescription rule for unsecured debt)
- Credit bureau listings — TransUnion, Experian, Compuscan/CRIF, XDS
- Debt review process under the NCA
- Emolument attachment orders (EAOs) and how to challenge them
- Reckless lending and how consumers can raise it as a defence
- Credit life insurance rights
- The Credit Ombud (free dispute resolution service)
- DTIC's National Credit Regulator (NCR) role

**Communication style:**
- Use plain, friendly language — your users may not have legal backgrounds
- Be empathetic — many users are stressed about debt
- Use **bold** for key terms and action items
- Keep answers focused and practical with clear next steps
- **MANDATORY**: You MUST end every single response with this exact disclaimer (translated to the user's language if applicable): *"Disclaimer: I am an AI assistant providing general credit guidance, not formal legal advice. For complex legal matters, please consult a qualified attorney or debt counsellor."*
- If the user asks in a South African indigenous language or Afrikaans, respond in that language

**What you can help with:**
- Explaining rights under the NCA
- Checking if a debt might be prescribed
- Understanding credit report listings and how long they stay
- Disputing incorrect bureau listings (Section 72)
- Understanding debt review status
- General credit score improvement tips

**What you cannot do:**
- Access live credit bureau data (unless the system provides it)
- Give specific legal advice for court matters
- Guarantee outcomes`;

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const consumerId = session?.user?.id;
        if (!consumerId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const ip = clientIpFromHeaders(req.headers);
        const userRate = checkRateLimit(`ai-coach:user:${consumerId}`, USER_LIMIT, USER_WINDOW_MS);
        const ipRate = checkRateLimit(`ai-coach:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
        if (!userRate.allowed || !ipRate.allowed) {
            const retryAfter = Math.max(userRate.retryAfterSeconds, ipRate.retryAfterSeconds);
            logger.warn({ consumerId, ip }, 'AI coach rate limit hit');
            return NextResponse.json(
                { error: 'You are sending messages too quickly. Please wait a few minutes and try again.' },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }

        const body = await req.json();
        const parsed = MessageSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }
        const { message, language } = parsed.data;

        // Load the signed-in consumer's own context for personalised answers
        let consumerContext = '';
        {
            try {
                const consumer = await prisma.consumerAccount.findUnique({
                    where: { id: consumerId },
                    select: { 
                        firstName: true, 
                        province: true, 
                        language: true, 
                        linkedClient: { 
                            include: { 
                                cases: {
                                    orderBy: { updatedAt: 'desc' },
                                    select: { fileNumber: true, description: true, status: true }
                                },
                                creditAccounts: {
                                    select: { creditorName: true, accountType: true, outstandingBalance: true, status: true }
                                }
                            } 
                        } 
                    },
                });
                if (consumer) {
                    const client = consumer.linkedClient;
                    const caseSummary = client?.cases.map(c => `[${c.fileNumber}] ${c.description} - Status: ${c.status}`).join('\n') || 'None';
                    const accountSummary = client?.creditAccounts.map(a => `${a.creditorName} (${a.accountType}): R${a.outstandingBalance} - Status: ${a.status}`).join('\n') || 'None';

                    consumerContext = `

### Consumer Profile:
- **Name:** ${consumer.firstName}
- **Province:** ${consumer.province ?? 'Unknown'}
- **Language:** ${consumer.language}

### Active Cases:
${caseSummary}

### Credit Accounts Found:
${accountSummary}

Use this information to provide personalized advice. If the user has negative items or active disputes, reference them by name.`;
                }
            } catch (err) {
                logger.error({ err, consumerId }, 'Failed to load consumer context for AI coach');
            }
        }

        const langInstruction = language && language !== 'English'
            ? `\n\nIMPORTANT: The user has selected ${language} as their language. Please respond in ${language}.`
            : '';

        const { client, model } = await getAiClientForTask('ai_coach');

        const response = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT + consumerContext + langInstruction },
                { role: 'user', content: message },
            ],
            max_tokens: 800,
            temperature: 0.7,
        });

        const reply = response.choices[0]?.message?.content ?? 'I could not generate a response. Please try again.';

        return NextResponse.json({ reply, model: response.model });
    } catch (error) {
        logger.error({ err: error }, 'AI coach request failed');
        return NextResponse.json(
            { error: 'AI service unavailable. Please try again shortly.' },
            { status: 503 }
        );
    }
}
