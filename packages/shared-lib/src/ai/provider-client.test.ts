import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// describeAiError must not touch the DB or network, but the module imports prisma
// at the top level, so stub it to keep the import side-effect-free.
vi.mock('@zenowethu/database', () => ({ prisma: { aiProvider: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import {
    describeAiError,
    getAiClientForTask,
    getAiClientChainForTask,
    invalidateAiProviderCache,
} from './provider-client';

describe('describeAiError', () => {
    it('reports exhausted quota for insufficient_quota', () => {
        const msg = describeAiError({ status: 429, code: 'insufficient_quota' });
        expect(msg).toMatch(/quota/i);
        expect(msg).toMatch(/billing|another/i);
    });

    it('reports quota when the code is nested under error', () => {
        const msg = describeAiError({ status: 429, error: { code: 'insufficient_quota' } });
        expect(msg).toMatch(/quota/i);
    });

    it('distinguishes a plain rate-limit from a quota failure', () => {
        const msg = describeAiError({ status: 429, code: 'rate_limit_exceeded' });
        expect(msg).toMatch(/rate-limited/i);
        expect(msg).not.toMatch(/quota/i);
    });

    it('reports authentication failure for 401/403', () => {
        expect(describeAiError({ status: 401 })).toMatch(/authentication|key/i);
        expect(describeAiError({ status: 403 })).toMatch(/authentication|key/i);
    });

    it('surfaces the provider message for other errors', () => {
        const msg = describeAiError({ error: { message: 'model not found' } });
        expect(msg).toContain('model not found');
    });

    it('falls back to a generic message when nothing is available', () => {
        expect(describeAiError(undefined)).toMatch(/AI generation failed/i);
        expect(describeAiError({})).toMatch(/AI generation failed/i);
    });
});

describe('provider routing and OpenRouter failover', () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
        invalidateAiProviderCache();
        delete process.env.OPENAI_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.GOOGLE_AI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('calls OpenAI directly for a bare model when OPENAI_API_KEY is set', async () => {
        process.env.OPENAI_API_KEY = 'sk-test';
        process.env.OPENROUTER_API_KEY = 'sk-or-test';

        const resolved = await getAiClientForTask('document_analysis');

        expect(resolved.providerName).toBe('OpenAI (Env)');
        expect(resolved.model).toBe('gpt-4o');
    });

    it('fails over to OpenRouter and namespaces the model when OPENAI_API_KEY is absent', async () => {
        process.env.OPENROUTER_API_KEY = 'sk-or-test';

        const resolved = await getAiClientForTask('document_analysis');

        expect(resolved.providerName).toBe('OpenRouter (Env)');
        expect(resolved.model).toBe('openai/gpt-4o');
    });

    it('treats a whitespace-only OPENAI_API_KEY as absent', async () => {
        process.env.OPENAI_API_KEY = '   ';
        process.env.OPENROUTER_API_KEY = 'sk-or-test';

        const resolved = await getAiClientForTask('document_identification');

        expect(resolved.providerName).toBe('OpenRouter (Env)');
        expect(resolved.model).toBe('openai/gpt-4o-mini');
    });

    it('leaves an already-namespaced model id untouched', async () => {
        process.env.OPENROUTER_API_KEY = 'sk-or-test';

        const resolved = await getAiClientForTask('document_analysis', 'openai/gpt-4o-mini');

        expect(resolved.providerName).toBe('OpenRouter (Env)');
        expect(resolved.model).toBe('openai/gpt-4o-mini');
    });

    it('routes a gemini model to Google when that key is present', async () => {
        process.env.GOOGLE_AI_API_KEY = 'goog-test';
        process.env.OPENROUTER_API_KEY = 'sk-or-test';

        const resolved = await getAiClientForTask('document_analysis', 'gemini-1.5-flash');

        expect(resolved.providerName).toBe('Google Gemini (Env)');
        expect(resolved.model).toBe('gemini-1.5-flash');
    });

    it('still resolves to OpenAI when no provider key is configured at all', async () => {
        const resolved = await getAiClientForTask('document_analysis');

        expect(resolved.providerName).toBe('OpenAI (Env)');
        expect(resolved.model).toBe('gpt-4o');
    });
});

describe('getAiClientChainForTask', () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
        invalidateAiProviderCache();
        delete process.env.OPENAI_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.GOOGLE_AI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('never queues the same resolved provider/model pair twice', async () => {
        process.env.OPENROUTER_API_KEY = 'sk-or-test';

        const chain = await getAiClientChainForTask('document_identification');
        const ids = chain.map(entry => `${entry.providerName}:${entry.model}`);

        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('still offers OpenAI models via OpenRouter when only OpenRouter is configured', async () => {
        process.env.OPENROUTER_API_KEY = 'sk-or-test';

        const chain = await getAiClientChainForTask('document_analysis');

        expect(chain.every(entry => entry.providerName === 'OpenRouter (Env)')).toBe(true);
        expect(chain.map(entry => entry.model)).toContain('openai/gpt-4o');
    });

    it('is empty of OpenRouter entries when only OpenAI is configured', async () => {
        process.env.OPENAI_API_KEY = 'sk-test';

        const chain = await getAiClientChainForTask('document_analysis');

        expect(chain.every(entry => entry.providerName === 'OpenAI (Env)')).toBe(true);
        expect(chain.map(entry => entry.model)).toContain('gpt-4o-mini');
    });
});
