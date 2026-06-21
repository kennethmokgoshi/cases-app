import OpenAI from 'openai';
import { prisma } from '@zenowethu/database';
import { logger } from '../logger';

// ─── Task types ────────────────────────────────────────────────────────────────
export type AiTask =
    | 'document_identification'  // Fast scanning - uses gpt-4o-mini (200k TPM)
    | 'document_analysis'
    | 'document_reanalysis'
    | 'legal_drafting'
    | 'case_strategy'
    | 'plan_generation'
    | 'contract_analysis'
    | 'dhs_parsing'
    | 'ai_coach';

export interface AiClientConfig {
    client: OpenAI;
    model: string;
    providerName: string;
}

// ─── In-memory cache ───────────────────────────────────────────────────────────
let _cache: Map<AiTask, AiClientConfig> | null = null;

export function invalidateAiProviderCache(): void {
    _cache = null;
    logger.info('AI provider cache invalidated');
}

// ─── Default model assignments ────────────────────────────────────────────────
const DEFAULT_MODELS: Record<AiTask, string> = {
    document_identification:  'gpt-4o-mini',      // High TPM (200k) — used for scanning 100-page docs
    document_analysis:        'gpt-4.1',           // Precise extraction of names, IDs, amounts
    document_reanalysis:      'google/gemini-pro-1.5',
    legal_drafting:           'anthropic/claude-3.5-sonnet',
    case_strategy:            'gpt-4.1',
    plan_generation:          'gpt-4.1',
    contract_analysis:        'google/gemini-pro-1.5',
    dhs_parsing:              'gpt-4.1',
    ai_coach:                 'gpt-4.1',
};

// ─── Direct build of OpenAI client from environment variables ─────────────────
function buildClientFromEnv(modelId: string): { client: OpenAI, name: string } {
    const isGoogle = modelId.startsWith('google/') || modelId.includes('gemini');
    const isAnthropic = modelId.startsWith('anthropic/') || modelId.startsWith('claude');
    const isOpenRouter = modelId.includes('/'); // Generic fallback for OR

    // Google Gemini (Direct)
    if (isGoogle && process.env.GOOGLE_AI_API_KEY) {
        return {
            name: 'Google Gemini (Env)',
            client: new OpenAI({
                apiKey: process.env.GOOGLE_AI_API_KEY,
                baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
                timeout: 120 * 1000,
            })
        };
    }

    // Anthropic Claude (Direct)
    if (isAnthropic && process.env.ANTHROPIC_API_KEY) {
        return {
            name: 'Anthropic Claude (Env)',
            client: new OpenAI({
                apiKey: process.env.ANTHROPIC_API_KEY,
                baseURL: 'https://api.anthropic.com/v1/messages/openai-compat', // Use shim if needed or specialized client
                timeout: 120 * 1000,
            })
        };
    }

    // OpenRouter fallback
    if (isOpenRouter && process.env.OPENROUTER_API_KEY) {
        return {
            name: 'OpenRouter (Env)',
            client: new OpenAI({
                apiKey: process.env.OPENROUTER_API_KEY,
                baseURL: 'https://openrouter.ai/api/v1',
                defaultHeaders: { 'HTTP-Referer': 'https://zenowethu.co.za', 'X-Title': 'Zenowethu Cases' },
                timeout: 120 * 1000,
            })
        };
    }

    // Default OpenAI
    return {
        name: 'OpenAI (Env)',
        client: new OpenAI({
            apiKey: process.env.OPENAI_API_KEY ?? 'missing_key',
            timeout: 120 * 1000,
        })
    };
}

// ─── Build OpenAI-compatible client from a provider record ───────────────────
function buildClientFromDb(provider: { apiKey: string; baseUrl: string | null }): OpenAI {
    return new OpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl ?? undefined,
        timeout: 120 * 1000,
        defaultHeaders: provider.baseUrl?.includes('openrouter.ai')
            ? { 'HTTP-Referer': 'https://zenowethu.co.za', 'X-Title': 'Zenowethu Cases' }
            : undefined,
    });
}

// ─── Get the right AI client + model for a given task ────────────────────────
export async function getAiClientForTask(task: AiTask, customModelId?: string): Promise<AiClientConfig> {
    const targetModel = customModelId || DEFAULT_MODELS[task];

    // Build cache from DB on first call if needed (optional override)
    if (!_cache) {
        _cache = new Map();
        try {
            const providers = await prisma.aiProvider.findMany({ where: { isActive: true } });
            for (const provider of providers) {
                const assignments = (provider.taskAssignments ?? {}) as Record<string, string>;
                for (const [taskKey, modelId] of Object.entries(assignments)) {
                    _cache.set(taskKey as AiTask, {
                        client: buildClientFromDb(provider),
                        model: modelId,
                        providerName: provider.name,
                    });
                }
            }
        } catch (err) {
            // DB fail is fine, we rely on ENV
        }
    }

    // 1. Task-specific override from DB cache
    if (!customModelId && _cache.has(task)) {
        return _cache.get(task)!;
    }

    // 2. Direct ENV resolution (Primary for Gemini/Claude)
    const { client, name } = buildClientFromEnv(targetModel);
    return {
        client,
        model: targetModel,
        providerName: name,
    };
}

// ─── Ordered fallback chain for a task ───────────────────────────────────────
// Returns the primary client/model first, then every *other* provider that has a
// usable API key configured, so a transient failure (quota, auth, rate-limit) on
// one provider can be retried on the next instead of failing the whole request.
export async function getAiClientChainForTask(task: AiTask): Promise<AiClientConfig[]> {
    const primary = await getAiClientForTask(task);
    const chain: AiClientConfig[] = [primary];
    const seen = new Set<string>([primary.providerName]);

    const candidates: Array<{ enabled: boolean; model: string }> = [
        { enabled: !!process.env.OPENAI_API_KEY,     model: 'gpt-4o-mini' },
        { enabled: !!process.env.OPENROUTER_API_KEY, model: 'openai/gpt-4o-mini' },
        { enabled: !!process.env.GOOGLE_AI_API_KEY,  model: 'google/gemini-1.5-flash' },
        { enabled: !!process.env.ANTHROPIC_API_KEY,  model: 'anthropic/claude-3.5-sonnet' },
    ];

    for (const c of candidates) {
        if (!c.enabled) continue;
        const { client, name } = buildClientFromEnv(c.model);
        if (seen.has(name)) continue;
        seen.add(name);
        chain.push({ client, model: c.model, providerName: name });
    }

    return chain;
}

// ─── Human-readable reason for an AI provider failure ────────────────────────
export function describeAiError(err: unknown): string {
    const e = err as { status?: number; code?: string; error?: { code?: string; message?: string }; message?: string };
    const code = e?.code ?? e?.error?.code;
    const status = e?.status;

    if (code === 'insufficient_quota' || (status === 429 && code !== 'rate_limit_exceeded')) {
        return 'The AI provider account has no remaining quota (billing exhausted). Top up the provider or configure another one.';
    }
    if (status === 429) {
        return 'The AI provider is rate-limited right now. Please try again in a moment.';
    }
    if (status === 401 || status === 403) {
        return 'The AI provider rejected the API key (authentication failed). Check the configured key.';
    }
    const msg = e?.error?.message ?? e?.message;
    return msg ? `AI provider error: ${msg}` : 'AI generation failed.';
}

// ─── Convenience ─────────────────────────────────────────────────────────────
export async function getClientForTask(task: AiTask): Promise<OpenAI> {
    return (await getAiClientForTask(task)).client;
}

export function maskApiKey(key: string): string {
    if (!key || key.length < 8) return '••••••••';
    return key.slice(0, 8) + '••••••••';
}
