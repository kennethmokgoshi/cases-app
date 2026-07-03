import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { getAiClientChainForTask, describeAiError } from '@zenowethu/shared-lib/src/ai/provider-client';
import type OpenAI from 'openai';
import { z } from 'zod';

const logger = createLogger('api/cases/[id]/ai-chat');

const BodySchema = z.object({
    messages: z.array(
        z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string().min(1).max(20000),
        })
    ).min(1).max(50),
});

const SYSTEM_PROMPT = (c: CaseCtx) => `You are an expert AI assistant for Zenowethu Debt Management (PTY) LTD — a South African debt counselling firm registered as NCRDC3693 under the National Credit Regulator.

You are embedded in the case management system. You help staff with tasks such as:
- Drafting professional email, SMS, or WhatsApp replies
- Writing formal letters to debt counsellors, creditors, courts, or the NCR
- Summarising the case
- Suggesting next steps
- Answering questions about debt review law, DHS processes, credit bureaus, or NCA procedures
- Drafting Form 16 notices, rejection letters, or client communications

When drafting emails or letters, always write in a professional, warm, and legally careful tone. Never promise specific legal outcomes. Use the Zenowethu brand signature when appropriate.

STANDARD SIGNATURE:
Aaron Nzotho | NCRDC3693 | Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0190
Tel: +27 81 747 7616 | Cell: 082 363 8207 | info@zenowethu.co.za | www.zenowethu.co.za | Member of DCASA

═══════════════════════════════════════
CURRENT CASE CONTEXT
═══════════════════════════════════════
File Number       : ${c.fileNumber}
Case Status       : ${c.status}
Category          : ${c.category}
Services          : ${c.services}
Created           : ${c.createdAt}

CLIENT
Name              : ${c.clientName}
ID Number         : ${c.clientId}
Email             : ${c.clientEmail ?? 'Not on file'}
Phone             : ${c.clientPhone ?? 'Not on file'}
WhatsApp          : ${c.clientWhatsapp ?? 'Not on file'}
Employer          : ${c.employer ?? 'Not on file'}

DEBT COUNSELLOR (current / DHS)
Name              : ${c.dcName ?? 'Not on file'}
Trading As        : ${c.dcTrading ?? 'Not on file'}
Email             : ${c.dcEmail ?? 'Not on file'}
Tel               : ${c.dcTel ?? 'Not on file'}
NCRDC No          : ${c.ncrdcNo ?? 'Not on file'}
DHS Status        : ${c.dhsStatus ?? 'Not on file'}
Consumer DHS      : ${c.consumerDhsStatus ?? 'Not on file'}
DHS App Date      : ${c.dhsApplicationDate ?? 'Not on file'}

NCT
Case Number       : ${c.nctCaseNumber ?? 'Not on file'}
NCT Status        : ${c.nctStatus ?? 'Not on file'}

FINANCIAL
Total Debt        : ${c.totalDebt ?? 'Not on file'}
Monthly Instalment: ${c.totalMonthly ?? 'Not on file'}
Service Fee       : ${c.serviceFee ?? 'Not on file'}

PARTNER / ACQUISITION
Type              : ${c.acquisitionType}
Partner           : ${c.partnerName ?? 'Direct / Website'}

DESCRIPTION / NOTES
${c.description ?? 'None recorded'}
═══════════════════════════════════════

Today's date: ${new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

When the user asks you to draft an email reply and pastes the incoming email, produce a complete, ready-to-send reply — subject line first, then body, then signature. Do not add meta-commentary unless the user asks for an explanation.`;

type CaseCtx = {
    fileNumber: string;
    status: string;
    category: string;
    services: string;
    createdAt: string;
    clientName: string;
    clientId: string;
    clientEmail: string | null;
    clientPhone: string | null;
    clientWhatsapp: string | null;
    employer: string | null;
    dcName: string | null;
    dcTrading: string | null;
    dcEmail: string | null;
    dcTel: string | null;
    ncrdcNo: string | null;
    dhsStatus: string | null;
    consumerDhsStatus: string | null;
    dhsApplicationDate: string | null;
    nctCaseNumber: string | null;
    nctStatus: string | null;
    totalDebt: string | null;
    totalMonthly: string | null;
    serviceFee: string | null;
    acquisitionType: string;
    partnerName: string | null;
    description: string | null;
};

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const caseRecord = await prisma.case.findUnique({
        where: { id },
        select: {
            id: true,
            fileNumber: true,
            status: true,
            category: true,
            services: true,
            createdAt: true,
            description: true,
            acquisitionType: true,
            partnerName: true,
            ncrdcNo: true,
            dhsStatus: true,
            consumerDhsStatus: true,
            dhsApplicationDate: true,
            debtCounsellorName: true,
            dcTradingName: true,
            dcEmail: true,
            dcTel: true,
            nctCaseNumber: true,
            nctStatus: true,
            totalDebtAmount: true,
            totalMonthlyInstallment: true,
            serviceFee: true,
            client: {
                select: {
                    firstName: true,
                    lastName: true,
                    idNumber: true,
                    email: true,
                    phone: true,
                    whatsappNumber: true,
                    employer: true,
                }
            }
        }
    });

    if (!caseRecord) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const ctx: CaseCtx = {
        fileNumber: caseRecord.fileNumber,
        status: caseRecord.status,
        category: caseRecord.category ?? 'General',
        services: caseRecord.services ?? 'Not specified',
        createdAt: new Date(caseRecord.createdAt).toLocaleDateString('en-ZA'),
        clientName: `${caseRecord.client.firstName} ${caseRecord.client.lastName}`,
        clientId: caseRecord.client.idNumber,
        clientEmail: caseRecord.client.email,
        clientPhone: caseRecord.client.phone,
        clientWhatsapp: caseRecord.client.whatsappNumber,
        employer: caseRecord.client.employer,
        dcName: caseRecord.debtCounsellorName,
        dcTrading: caseRecord.dcTradingName,
        dcEmail: caseRecord.dcEmail,
        dcTel: caseRecord.dcTel,
        ncrdcNo: caseRecord.ncrdcNo,
        dhsStatus: caseRecord.dhsStatus,
        consumerDhsStatus: caseRecord.consumerDhsStatus,
        dhsApplicationDate: caseRecord.dhsApplicationDate
            ? new Date(caseRecord.dhsApplicationDate).toLocaleDateString('en-ZA')
            : null,
        nctCaseNumber: caseRecord.nctCaseNumber,
        nctStatus: caseRecord.nctStatus,
        totalDebt: caseRecord.totalDebtAmount ? `R ${Number(caseRecord.totalDebtAmount).toLocaleString('en-ZA')}` : null,
        totalMonthly: caseRecord.totalMonthlyInstallment ? `R ${Number(caseRecord.totalMonthlyInstallment).toLocaleString('en-ZA')}` : null,
        serviceFee: caseRecord.serviceFee ? `R ${Number(caseRecord.serviceFee).toLocaleString('en-ZA')}` : null,
        acquisitionType: caseRecord.acquisitionType ?? 'B2C',
        partnerName: caseRecord.partnerName,
        description: caseRecord.description,
    };

    const chatMessages = [
        { role: 'system' as const, content: SYSTEM_PROMPT(ctx) },
        ...parsed.data.messages,
    ];

    // Try each configured provider in order — the request only fails if every
    // provider fails, and the client gets the real reason (quota, auth, etc.).
    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> | null = null;
    let lastError: unknown = null;

    const chain = await getAiClientChainForTask('case_strategy');
    for (const { client, model, providerName } of chain) {
        try {
            stream = await client.chat.completions.create({
                model,
                stream: true,
                temperature: 0.5,
                max_tokens: 2048,
                messages: chatMessages,
            });
            break;
        } catch (err) {
            lastError = err;
            logger.warn('AI provider failed, trying next', { caseId: id, providerName, model, reason: describeAiError(err) });
        }
    }

    if (!stream) {
        logger.error('AI chat error — all providers failed', { caseId: id, err: lastError });
        return NextResponse.json({ error: describeAiError(lastError) }, { status: 502 });
    }

    try {
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of stream) {
                        const delta = chunk.choices[0]?.delta?.content;
                        if (delta) {
                            controller.enqueue(encoder.encode(delta));
                        }
                    }
                } catch (err) {
                    logger.error('AI stream error', { err });
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'no-cache',
            },
        });
    } catch (err) {
        logger.error('AI chat error', { caseId: id, err });
        return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }
}
