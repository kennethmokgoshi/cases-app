import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const update = vi.fn().mockResolvedValue({});
vi.mock('@zenowethu/database', () => ({ prisma: { apiKey: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } } }));
vi.mock('next/server', () => ({ NextResponse: { json: vi.fn() } }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { validateApiKey, hashApiKey } from './api-auth';

const record = (over = {}) => ({
    id: 'k1', name: 'n', key: 'x', permissions: 'read', projectId: null, rateLimit: 10,
    isActive: true, expiresAt: null, createdBy: null, ...over,
});
const req = (key: string) => new Request('http://x', { headers: { 'X-API-Key': key } });

describe('validateApiKey hashing', () => {
    beforeEach(() => { findUnique.mockReset(); update.mockClear(); });

    it('authenticates a hashed key by looking up its SHA-256', async () => {
        findUnique.mockResolvedValueOnce(record());
        const res = await validateApiKey(req('zeno_abc'));
        expect(res.valid).toBe(true);
        expect(findUnique.mock.calls[0][0].where.key).toBe(hashApiKey('zeno_abc'));
    });

    it('accepts a legacy plaintext key and upgrades it to a hash', async () => {
        findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(record({ key: 'zeno_old' }));
        const res = await validateApiKey(req('zeno_old'));
        expect(res.valid).toBe(true);
        expect(update.mock.calls[0][0].data).toEqual({ key: hashApiKey('zeno_old') });
    });

    it('rejects an unknown key', async () => {
        findUnique.mockResolvedValue(null);
        const res = await validateApiKey(req('nope'));
        expect(res.valid).toBe(false);
        expect(res.status).toBe(401);
    });
});
