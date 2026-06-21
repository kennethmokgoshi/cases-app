import { describe, it, expect, vi } from 'vitest';

// describeAiError must not touch the DB or network, but the module imports prisma
// at the top level, so stub it to keep the import side-effect-free.
vi.mock('@zenowethu/database', () => ({ prisma: { aiProvider: { findMany: vi.fn() } } }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { describeAiError } from './provider-client';

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
