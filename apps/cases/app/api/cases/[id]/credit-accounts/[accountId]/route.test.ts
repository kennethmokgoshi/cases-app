import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        creditAccount: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        creditProvider: {
            findUnique: vi.fn(),
        },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { PATCH } from './route';

const session = { user: { id: 'user-1', email: 'staff@example.com' } };

function req(body: unknown) {
    return new Request('http://localhost/api/cases/case-1/credit-accounts/acc-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function ctx() {
    return { params: Promise.resolve({ id: 'case-1', accountId: 'acc-1' }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(session as never);
});

describe('PATCH /api/cases/[id]/credit-accounts/[accountId]', () => {
    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await PATCH(req({ creditProviderId: 'cp-1' }), ctx());
        expect(res.status).toBe(401);
    });

    it('returns 404 when the account does not belong to the case', async () => {
        vi.mocked(prisma.creditAccount.findUnique).mockResolvedValue({ id: 'acc-1', caseId: 'other-case' } as never);
        const res = await PATCH(req({ creditProviderId: 'cp-1' }), ctx());
        expect(res.status).toBe(404);
    });

    it('returns 404 when the target credit provider does not exist', async () => {
        vi.mocked(prisma.creditAccount.findUnique).mockResolvedValue({ id: 'acc-1', caseId: 'case-1' } as never);
        vi.mocked(prisma.creditProvider.findUnique).mockResolvedValue(null);

        const res = await PATCH(req({ creditProviderId: 'cp-missing' }), ctx());

        expect(res.status).toBe(404);
        expect(prisma.creditAccount.update).not.toHaveBeenCalled();
    });

    it('links the account to an existing provider', async () => {
        vi.mocked(prisma.creditAccount.findUnique).mockResolvedValue({ id: 'acc-1', caseId: 'case-1' } as never);
        vi.mocked(prisma.creditProvider.findUnique).mockResolvedValue({ id: 'cp-1', name: 'FNB' } as never);
        vi.mocked(prisma.creditAccount.update).mockResolvedValue({
            id: 'acc-1',
            creditProviderId: 'cp-1',
            creditProvider: { id: 'cp-1', name: 'FNB', email: 'e@fnb.co.za', phone: '0800', address: '1 Fnb St' },
        } as never);

        const res = await PATCH(req({ creditProviderId: 'cp-1' }), ctx());

        expect(res.status).toBe(200);
        expect(prisma.creditAccount.update).toHaveBeenCalledWith({
            where: { id: 'acc-1' },
            data: { creditProviderId: 'cp-1' },
            select: expect.any(Object),
        });
        const body = await res.json();
        expect(body.creditProviderId).toBe('cp-1');
    });

    it('unlinks the account when creditProviderId is null', async () => {
        vi.mocked(prisma.creditAccount.findUnique).mockResolvedValue({ id: 'acc-1', caseId: 'case-1' } as never);
        vi.mocked(prisma.creditAccount.update).mockResolvedValue({ id: 'acc-1', creditProviderId: null, creditProvider: null } as never);

        const res = await PATCH(req({ creditProviderId: null }), ctx());

        expect(res.status).toBe(200);
        expect(prisma.creditProvider.findUnique).not.toHaveBeenCalled();
        expect(prisma.creditAccount.update).toHaveBeenCalledWith({
            where: { id: 'acc-1' },
            data: { creditProviderId: null },
            select: expect.any(Object),
        });
    });

    it('returns 422 for an invalid body', async () => {
        vi.mocked(prisma.creditAccount.findUnique).mockResolvedValue({ id: 'acc-1', caseId: 'case-1' } as never);
        const res = await PATCH(req({ creditProviderId: 123 }), ctx());
        expect(res.status).toBe(422);
    });
});
