import { describe, it, expect, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib/src/search/org-search-route', () => ({
    createOrgSearchRoute: vi.fn(() => ({
        GET: vi.fn(async () => ({
            json: async () => [{ id: 'ref-1', name: 'William', entityType: 'REFERRER' }],
            status: 200,
        })),
    })),
}));

import { GET } from './route';

describe('GET /api/projects/search', () => {
    it('returns search results from org-search handler', async () => {
        const req = new Request('http://localhost/api/projects/search?q=William');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toHaveLength(1);
        expect(data[0].name).toBe('William');
    });
});
