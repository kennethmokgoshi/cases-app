import type OpenAI from 'openai';
import { prisma } from '@zenowethu/database';
import { logger as log } from '../logger';

export interface AiUsageContext {
    /** AiTask name or a free-form feature label, e.g. "document_analysis". */
    feature: string;
    /** Human-readable provider, e.g. "OpenAI (Env)". */
    provider: string;
}

export interface AiUsageEntry extends AiUsageContext {
    app: string;
    environment: string;
    model: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    streamed: boolean;
    success: boolean;
    errorCode: string | null;
    durationMs: number;
}

/** The app that is spending credits. Set AI_USAGE_APP in each app's .env. */
export function getUsageAppName(): string {
    return process.env.AI_USAGE_APP?.trim() || 'unknown';
}

/**
 * Which deployment made the call. Set AI_USAGE_ENV ("production", "local",
 * "staging") explicitly; without it, a production build counts as production
 * and anything else as local.
 */
export function getUsageEnvironment(): string {
    const explicit = process.env.AI_USAGE_ENV?.trim().toLowerCase();
    if (explicit) return explicit;
    return process.env.NODE_ENV === 'production' ? 'production' : 'local';
}

function isAsyncIterable(value: unknown): boolean {
    return !!value && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function';
}

/** Log every call and persist it. Never throws and never blocks the AI call. */
export function recordAiUsage(entry: AiUsageEntry): void {
    log.info(entry, 'ai call');
    if (process.env.AI_USAGE_DB === 'false') return;
    prisma.aiUsage
        .create({ data: entry })
        .catch((err: unknown) => log.warn({ err: String(err) }, 'failed to persist ai usage'));
}

const WRAPPED = Symbol.for('zenowethu.aiUsageWrapped');

/**
 * Wraps `client.chat.completions.create` so each call is recorded against the
 * current app (AI_USAGE_APP) and the given feature. Idempotent per client.
 */
export function trackAiUsage(client: OpenAI, ctx: AiUsageContext): OpenAI {
    const completions = client.chat.completions as unknown as Record<symbol, unknown> & {
        create: (...args: unknown[]) => Promise<unknown>;
    };
    if (completions[WRAPPED]) return client;

    const original = completions.create.bind(completions);
    completions.create = async (...args: unknown[]) => {
        const body = (args[0] ?? {}) as { model?: string };
        const started = Date.now();
        const base = {
            ...ctx,
            app: getUsageAppName(),
            environment: getUsageEnvironment(),
            model: body.model ?? 'unknown',
            durationMs: 0,
        };
        try {
            const result = await original(...args);
            const usage = (result as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })?.usage;
            const streamed = isAsyncIterable(result);
            recordAiUsage({
                ...base,
                promptTokens: usage?.prompt_tokens ?? null,
                completionTokens: usage?.completion_tokens ?? null,
                totalTokens: usage?.total_tokens ?? null,
                streamed,
                success: true,
                errorCode: null,
                durationMs: Date.now() - started,
            });
            return result;
        } catch (err) {
            const e = err as { code?: string; status?: number };
            recordAiUsage({
                ...base,
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
                streamed: false,
                success: false,
                errorCode: e?.code ?? (e?.status ? String(e.status) : 'error'),
                durationMs: Date.now() - started,
            });
            throw err;
        }
    };
    completions[WRAPPED] = true;
    return client;
}
