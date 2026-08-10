import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/b2b-case-access', () => ({
    canB2BAccessCase: vi.fn(),
    getMentionableUsersForB2B: vi.fn(),
}));

import { GET } from './route';
import { auth } from '@zenowethu/shared-lib';
import { canB2BAccessCase, getMentionableUsersForB2B } from '@/lib/b2b-case-access';

const params = Promise.resolve({ id: 'case-1' });
const request = (q = '') => new Request(`https://app.zenowethu.co.za/api/b2b/cases/case-1/mentionable-users?q=${q}`);

beforeEach(() => vi.clearAllMocks());

describe('GET /api/b2b/cases/[id]/mentionable-users', () => {
    it('rejects unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);

        const res = await GET(request(), { params });

        expect(res.status).toBe(401);
        expect(getMentionableUsersForB2B).not.toHaveBeenCalled();
    });

    it('rejects staff users - this endpoint is B2B-only', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } } as never);

        const res = await GET(request(), { params });

        expect(res.status).toBe(403);
        expect(getMentionableUsersForB2B).not.toHaveBeenCalled();
    });

    it('returns 404 when the case is outside the partner hierarchy', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'p-1', userType: 'B2B_PARTNER', b2bPartnerId: 'partner-1' } } as never);
        vi.mocked(canB2BAccessCase).mockResolvedValue(false);

        const res = await GET(request(), { params });

        expect(res.status).toBe(404);
        expect(getMentionableUsersForB2B).not.toHaveBeenCalled();
    });

    it('filters candidates by query, excludes self, and strips sensitive fields', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'p-1', userType: 'B2B_PARTNER', b2bPartnerId: 'partner-1' } } as never);
        vi.mocked(canB2BAccessCase).mockResolvedValue(true);
        vi.mocked(getMentionableUsersForB2B).mockResolvedValue([
            { id: 'p-1', email: 'self@partner.co.za', firstName: 'Self', lastName: 'User', username: 'self', userType: 'B2B_PARTNER', emailNotificationsEnabled: true },
            { id: 'staff-1', email: 'jane@zenowethu.co.za', firstName: 'Jane', lastName: 'Doe', username: 'jane.doe', userType: 'STAFF', emailNotificationsEnabled: true },
            { id: 'staff-2', email: 'sam@zenowethu.co.za', firstName: 'Sam', lastName: 'Ndlovu', username: 'sam.n', userType: 'STAFF', emailNotificationsEnabled: true },
        ] as never);

        const res = await GET(request('jane'), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toEqual([{ id: 'staff-1', firstName: 'Jane', lastName: 'Doe', username: 'jane.doe' }]);
    });
});
