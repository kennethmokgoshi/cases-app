import OpenAI from 'openai';
import { prisma } from '@zenowethu/database';
import { logger } from '../logger';

// ─── Task types ────────────────────────────────────────────────────────────────
export type AiTask =
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
    document_analysis:    'gpt-4o',
    document_reanalysis:  'google/gemini-pro-1.5', // For side-by-side audits
    legal_drafting:       'anthropic/claude-3.5-sonnet', // High-quality legal tone
    case_strategy:        'gpt-4o',
    plan_generation:      'gpt-4o',
    contract_analysis:    'google/gemini-pro-1.5', // Gemini is better for long contracts
    dhs_parsing:          'gpt-4o',
    ai_coach:             'gpt-4o',
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

// ─── Convenience ─────────────────────────────────────────────────────────────
export async function getClientForTask(task: AiTask): Promise<OpenAI> {
    return (await getAiClientForTask(task)).client;
}

export function maskApiKey(key: string): string {
    if (!key || key.length < 8) return '••••••••';
    return key.slice(0, 8) + '••••••••';
}
