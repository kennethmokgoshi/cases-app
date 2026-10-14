import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn().mockResolvedValue({});
vi.mock('@zenowethu/database', () => ({ prisma: { aiUsage: { create: (...a: unknown[]) => create(...a) } } }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { trackAiUsage } from './usage-tracker';

function fakeClient(impl: (...args: unknown[]) => Promise<unknown>) {
    return { chat: { completions: { create: vi.fn(impl) } } } as never;
}

describe('trackAiUsage', () => {
    beforeEach(() => {
        create.mockClear();
        process.env.AI_USAGE_APP = 'crediva';
        delete process.env.AI_USAGE_DB;
    });

    it('records tokens against the app and feature, and returns the result untouched', async () => {
        const result = { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
        const client = trackAiUsage(fakeClient(async () => result), { feature: 'ai_coach', provider: 'OpenAI (Env)' });

        await expect(client.chat.completions.create({ model: 'gpt-4o' } as never)).resolves.toBe(result);

        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][0].data).toMatchObject({
            app: 'crediva', feature: 'ai_coach', model: 'gpt-4o',
            promptTokens: 10, completionTokens: 5, totalTokens: 15, success: true,
        });
    });

    it('records a failed call and rethrows the original error', async () => {
        const err = Object.assign(new Error('quota'), { code: 'insufficient_quota' });
        const client = trackAiUsage(fakeClient(async () => { throw err; }), { feature: 'x', provider: 'p' });

        await expect(client.chat.completions.create({ model: 'gpt-4o' } as never)).rejects.toBe(err);
        expect(create.mock.calls[0][0].data).toMatchObject({ success: false, errorCode: 'insufficient_quota' });
    });

    it('does not wrap the same client twice', async () => {
        const raw = fakeClient(async () => ({}));
        trackAiUsage(trackAiUsage(raw, { feature: 'a', provider: 'p' }), { feature: 'b', provider: 'p' });
        await (raw as never as { chat: { completions: { create: (b: unknown) => Promise<unknown> } } })
            .chat.completions.create({ model: 'm' });
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('does not fail the AI call when persisting fails', async () => {
        create.mockRejectedValueOnce(new Error('db down'));
        const client = trackAiUsage(fakeClient(async () => ({ ok: true })), { feature: 'a', provider: 'p' });
        await expect(client.chat.completions.create({ model: 'm' } as never)).resolves.toEqual({ ok: true });
    });
});

describe('usage environment', () => {
    it('uses AI_USAGE_ENV when set, lowercased', async () => {
        process.env.AI_USAGE_ENV = ' Local ';
        const client = trackAiUsage(fakeClient(async () => ({})), { feature: 'a', provider: 'p' });
        create.mockClear();
        await client.chat.completions.create({ model: 'm' } as never);
        expect(create.mock.calls[0][0].data.environment).toBe('local');
        delete process.env.AI_USAGE_ENV;
    });

    it('defaults to production in a production build and local otherwise', async () => {
        const env = process.env as Record<string, string | undefined>;
        const original = env.NODE_ENV;
        delete env.AI_USAGE_ENV;

        env.NODE_ENV = 'production';
        const prod = trackAiUsage(fakeClient(async () => ({})), { feature: 'a', provider: 'p' });
        create.mockClear();
        await prod.chat.completions.create({ model: 'm' } as never);
        expect(create.mock.calls[0][0].data.environment).toBe('production');

        env.NODE_ENV = 'development';
        const dev = trackAiUsage(fakeClient(async () => ({})), { feature: 'a', provider: 'p' });
        create.mockClear();
        await dev.chat.completions.create({ model: 'm' } as never);
        expect(create.mock.calls[0][0].data.environment).toBe('local');

        env.NODE_ENV = original;
    });
});
