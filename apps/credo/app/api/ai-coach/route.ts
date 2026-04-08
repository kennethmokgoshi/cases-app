import { NextRequest, NextResponse } from 'next/server';
import { getAiClientForTask } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const MessageSchema = z.object({
    message: z.string().min(1).max(2000),
    language: z.string().optional().default('English'),
    consumerId: z.string().optional(),
});

const SYSTEM_PROMPT = `You are Credo AI, a South African credit coaching assistant built by Zenowethu.

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
- Always add a brief disclaimer: this is general guidance, not legal advice
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
        const body = await req.json();
        const parsed = MessageSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }
        const { message, language, consumerId } = parsed.data;

        // Optionally load consumer context if logged in
        let consumerContext = '';
        if (consumerId) {
            try {
                const consumer = await prisma.consumerAccount.findUnique({
                    where: { id: consumerId },
                    select: { firstName: true, province: true, language: true, linkedClient: { select: { grossSalary: true, netSalary: true } } },
                });
                if (consumer) {
                    consumerContext = `\n\nConsumer context: Name is ${consumer.firstName}, province: ${consumer.province ?? 'unknown'}, preferred language: ${consumer.language}.`;
                }
            } catch {
                // Non-fatal — proceed without context
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
    } catch (error: any) {
        console.error('AI Coach error:', error?.message);
        return NextResponse.json(
            { error: 'AI service unavailable. Please try again shortly.' },
            { status: 503 }
        );
    }
}
