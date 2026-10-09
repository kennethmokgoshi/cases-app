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
    document_analysis:        'gpt-4o',           // Precise extraction of names, IDs, amounts
    document_reanalysis:      'gpt-4o',
    legal_drafting:           'gpt-4o',
    case_strategy:            'gpt-4o',
    plan_generation:          'gpt-4o',
    contract_analysis:        'gpt-4o',
    dhs_parsing:              'gpt-4o',
    ai_coach:                 'gpt-4o',
};

// ─── Direct build of OpenAI client from environment variables ─────────────────

/** Read an env var, treating blank or whitespace-only values as absent. */
function envKey(name: string): string | undefined {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_NAME = 'OpenRouter (Env)';

let _failoverLogged = false;

function openRouterClient(apiKey: string): OpenAI {
    return new OpenAI({
        apiKey,
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: { 'HTTP-Referer': 'https://zenowethu.co.za', 'X-Title': 'Zenowethu Cases' },
        timeout: 120 * 1000,
    });
}

/**
 * Resolve a model id to a concrete client. The provider is chosen from the shape
 * of the model id: `google/…` or `…gemini…` → Google, `anthropic/…` or `claude…`
 * → Anthropic, anything else containing a `/` → OpenRouter, a bare name → OpenAI.
 *
 * When a bare OpenAI model is requested but OPENAI_API_KEY is absent, the call
 * fails over to OpenRouter, which serves the same models under an `openai/`
 * namespace. Setting a working OPENAI_API_KEY restores direct OpenAI calls with
 * no code change. The resolved model id is returned because failover rewrites it.
 */
function buildClientFromEnv(modelId: string): { client: OpenAI; name: string; model: string } {
    const isGoogle = modelId.startsWith('google/') || modelId.includes('gemini');
    const isAnthropic = modelId.startsWith('anthropic/') || modelId.startsWith('claude');
    const isNamespaced = modelId.includes('/');

    const googleKey = envKey('GOOGLE_AI_API_KEY');
    const anthropicKey = envKey('ANTHROPIC_API_KEY');
    const openRouterKey = envKey('OPENROUTER_API_KEY');
    const openAiKey = envKey('OPENAI_API_KEY');

    // Google Gemini (direct)
    if (isGoogle && googleKey) {
        return {
            name: 'Google Gemini (Env)',
            model: modelId,
            client: new OpenAI({
                apiKey: googleKey,
                baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
                timeout: 120 * 1000,
            }),
        };
    }

    // Anthropic Claude (direct)
    if (isAnthropic && anthropicKey) {
        return {
            name: 'Anthropic Claude (Env)',
            model: modelId,
            client: new OpenAI({
                apiKey: anthropicKey,
                baseURL: 'https://api.anthropic.com/v1/messages/openai-compat',
                timeout: 120 * 1000,
            }),
        };
    }

    // Already namespaced (e.g. `openai/gpt-4o-mini`) → OpenRouter
    if (isNamespaced && openRouterKey) {
        return { name: OPENROUTER_NAME, model: modelId, client: openRouterClient(openRouterKey) };
    }

    // Bare OpenAI model with no usable OpenAI key → fail over to OpenRouter.
    if (!isNamespaced && !openAiKey && openRouterKey) {
        if (!_failoverLogged) {
            _failoverLogged = true;
            logger.warn('OPENAI_API_KEY is not set — failing AI calls over to OpenRouter');
        }
        return {
            name: OPENROUTER_NAME,
            model: `openai/${modelId}`,
            client: openRouterClient(openRouterKey),
        };
    }

    // Default: OpenAI direct
    return {
        name: 'OpenAI (Env)',
        model: modelId,
        client: new OpenAI({ apiKey: openAiKey ?? 'missing_key', timeout: 120 * 1000 }),
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
    const { client, name, model } = buildClientFromEnv(targetModel);
    return {
        client,
        model,
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
    const seen = new Set<string>([`${primary.providerName}:${primary.model}`]);

    const openAiKey = envKey('OPENAI_API_KEY');
    const openRouterKey = envKey('OPENROUTER_API_KEY');
    const googleKey = envKey('GOOGLE_AI_API_KEY');

    // A bare OpenAI model is still reachable when only OpenRouter is configured,
    // because buildClientFromEnv fails it over and rewrites the model id.
    const candidates: Array<{ enabled: boolean; model: string }> = [
        { enabled: !!openAiKey || !!openRouterKey, model: 'gpt-4o' },
        { enabled: !!openAiKey || !!openRouterKey, model: 'gpt-4o-mini' },
        { enabled: !!openRouterKey,                model: 'openai/gpt-4o-mini' },
        { enabled: !!googleKey,                    model: 'gemini-1.5-flash' },
    ];

    for (const c of candidates) {
        if (!c.enabled) continue;
        const { client, name, model } = buildClientFromEnv(c.model);
        // Dedupe on the *resolved* model so failover cannot queue the same
        // OpenRouter model twice.
        const key = `${name}:${model}`;
        if (seen.has(key)) continue;
        seen.add(key);
        chain.push({ client, model, providerName: name });
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
    let msg = e?.error?.message ?? e?.message;
    if (msg?.includes('400 status code (no body)')) {
        msg = 'HTTP 400 Bad Request from AI provider (invalid model name or unsupported request payload).';
    }
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
