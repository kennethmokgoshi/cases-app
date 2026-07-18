/**
 * DHS Decline — Smart (AI-assisted) Classifier
 *
 * Wraps the deterministic `classifyDeclineReason()` with an AI layer that reads
 * the Debt Counsellor's DHS response the way a thoughtful human employee would —
 * interpreting the operative intent instead of keyword-matching. This stops the
 * system from mis-reacting to generic policy boilerplate (e.g. "a transfer
 * request MAY be declined IF there are any outstanding fees") as if it were an
 * actual fee demand against the consumer.
 *
 * The AI result is only trusted when it validates against the 7 known categories
 * and clears a confidence threshold. On any failure — no provider configured,
 * provider error, malformed output, low confidence — it falls back to the
 * deterministic rules, so behaviour degrades gracefully and never blocks the
 * decline response.
 */

import { z } from 'zod';
import { prisma } from '@zenowethu/database';
import { getAiClientChainForTask, describeAiError } from '../ai/provider-client';
import { logger } from '../logger';
import { classifyDeclineReason, type DeclineCategory } from './decline-handler';

export type ClassificationSource = 'ai' | 'rules';

export interface SmartDeclineClassification {
    category: DeclineCategory;
    /** 0..1 — how sure we are of the category. Rules fallback reports 0.5. */
    confidence: number;
    /** One concise sentence explaining the decision (shown to staff). */
    reasoning: string;
    /** Which path decided the category. */
    source: ClassificationSource;
}

const CATEGORY_VALUES = [
    'SEND_DOCS',
    'SEND_DOCS_WITH_NCR',
    'CLIENT_CONSENT_NEEDED',
    'OUTSTANDING_FEES',
    'CONTACT_ATTORNEY',
    'RESUBMIT_LATER',
    'UNKNOWN',
] as const;

const AiResultSchema = z.object({
    category: z.enum(CATEGORY_VALUES),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().min(1).max(500),
});

/** Below this AI confidence we defer to the deterministic rules instead. */
const CONFIDENCE_THRESHOLD = 0.55;

const SYSTEM_PROMPT = `You are an experienced debt-review transfer administrator at a South African debt counselling firm. You read a Debt Counsellor's response to a DHS (NCR Debt Help System) transfer request and decide the SINGLE most appropriate operational action, exactly as a thoughtful human employee would.

Choose exactly one category:
- SEND_DOCS: The DC is asking us to send transfer documents (POA, ID, Form 16, signed consent, etc.).
- SEND_DOCS_WITH_NCR: Same as SEND_DOCS but they specifically require our NCR registration certificate.
- CLIENT_CONSENT_NEEDED: The DC needs the consumer to personally confirm consent or to contact them directly.
- OUTSTANDING_FEES: The DC asserts that THIS consumer actually owes fees/arrears that must be settled before the transfer.
- CONTACT_ATTORNEY: The matter is with an attorney / legal department / subject to a court order.
- RESUBMIT_LATER: The request is under review, pending, being processed, acknowledged, or we are asked to allow a turnaround period / try again later. No action is needed except to wait and re-check.
- UNKNOWN: The intent is genuinely unclear and a human should review it.

CRITICAL — interpret intent, do not keyword-match:
- Ignore generic disclaimers and conditional/hypothetical statements. "A transfer request MAY be declined IF there are any outstanding fees" is boilerplate policy, NOT a statement that this consumer owes fees — do NOT choose OUTSTANDING_FEES on that basis.
- Only choose OUTSTANDING_FEES when the DC actually states this specific consumer has fees/arrears due now.
- "Transfer under review", "allow 3-7 business days", "documents received and acknowledged", and "standard turnaround" all mean the request is progressing — choose RESUBMIT_LATER.
- Base your choice on the message's operative instruction, not on incidental words.

Respond ONLY with JSON: {"category": "ONE_OF_THE_ABOVE", "confidence": 0.0-1.0, "reasoning": "one concise sentence"}.`;

function buildUserPrompt(reason: string): string {
    return `Debt Counsellor's DHS response:
"""
${reason}
"""

Return the classification JSON.`;
}

function rulesResult(category: DeclineCategory, reasoning: string): SmartDeclineClassification {
    return { category, confidence: 0.5, reasoning, source: 'rules' };
}

/** True when at least one AI provider API key is present in the environment. */
function hasEnvAiKey(): boolean {
    return !!(
        process.env.OPENAI_API_KEY ||
        process.env.OPENROUTER_API_KEY ||
        process.env.GOOGLE_AI_API_KEY ||
        process.env.ANTHROPIC_API_KEY
    );
}

/**
 * Whether any AI provider is actually configured (env key or an active DB
 * provider). When nothing is configured we skip the AI call entirely and use
 * the deterministic rules — no wasted network round-trip, and no flaky tests.
 */
async function aiIsConfigured(): Promise<boolean> {
    if (hasEnvAiKey()) return true;
    try {
        const count = await prisma.aiProvider.count({ where: { isActive: true } });
        return count > 0;
    } catch {
        return false;
    }
}

/**
 * Classify a DHS decline reason, preferring an AI interpretation and falling
 * back to the deterministic rules. Always resolves — never throws.
 */
export async function classifyDeclineReasonSmart(reason: string): Promise<SmartDeclineClassification> {
    const rulesCategory = classifyDeclineReason(reason);
    const trimmed = reason?.trim() ?? '';

    if (!trimmed) {
        return rulesResult('UNKNOWN', 'Empty decline reason.');
    }

    if (!(await aiIsConfigured())) {
        return rulesResult(rulesCategory, 'No AI provider configured — used deterministic rules.');
    }

    let chain;
    try {
        chain = await getAiClientChainForTask('dhs_parsing');
    } catch (err) {
        logger.warn(`[DeclineClassifier] No AI provider available (${describeAiError(err)}) — using deterministic rules.`);
        return rulesResult(rulesCategory, 'AI provider unavailable — used deterministic rules.');
    }

    for (const cfg of chain) {
        try {
            const completion = await cfg.client.chat.completions.create({
                model: cfg.model,
                response_format: { type: 'json_object' },
                temperature: 0,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: buildUserPrompt(reason) },
                ],
            });

            const raw = completion.choices[0]?.message?.content;
            if (!raw) continue;

            const parsed = AiResultSchema.safeParse(JSON.parse(raw));
            if (!parsed.success) {
                logger.warn(`[DeclineClassifier] ${cfg.providerName} returned invalid JSON shape — trying next provider.`);
                continue;
            }

            const { category, confidence, reasoning } = parsed.data;

            if (confidence < CONFIDENCE_THRESHOLD) {
                return rulesResult(
                    rulesCategory,
                    `AI was not confident (${Math.round(confidence * 100)}%): ${reasoning} Used deterministic rules instead.`
                );
            }

            logger.info(
                `[DeclineClassifier] AI=${category} (${Math.round(confidence * 100)}%) rules=${rulesCategory} via ${cfg.providerName}`
            );
            return { category, confidence, reasoning, source: 'ai' };
        } catch (err) {
            logger.warn(`[DeclineClassifier] Provider ${cfg.providerName} failed: ${describeAiError(err)}`);
            continue;
        }
    }

    return rulesResult(rulesCategory, 'All AI providers failed — used deterministic rules.');
}
