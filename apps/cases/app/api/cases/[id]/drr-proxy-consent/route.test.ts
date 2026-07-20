import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/dhs', () => ({
    recordDrrProxyConsent: vi.fn(),
    runDrrDocumentReadiness: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/auth', () => ({
    auth: vi.fn(),
}));

import { POST } from './route';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { recordDrrProxyConsent, runDrrDocumentReadiness } from '@zenowethu/shared-lib/src/dhs';

const recordMock = recordDrrProxyConsent as unknown as ReturnType<typeof vi.fn>;
const readinessMock = runDrrDocumentReadiness as unknown as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ id: 'case1' });
const makeRequest = (bodyObj: any) =>
    new NextRequest('https://cases.zenowethu.co.za/api/cases/case1/drr-proxy-consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bodyObj),
    });

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
        user: { id: 'u-staff-1', firstName: 'Sarah', lastName: 'Connor', email: 'sarah@zenowethu.co.za' },
    } as never);
    recordMock.mockResolvedValue({ ok: true, caseId: 'case1' });
    readinessMock.mockResolvedValue({});
});

describe('POST /api/cases/[id]/drr-proxy-consent', () => {
    it('returns 401 Unauthorized when no user session exists', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await POST(makeRequest({ role: 'STAFF' }), { params });
        expect(res.status).toBe(401);
    });

    it('successfully records proxy consent and triggers document readiness', async () => {
        const res = await POST(makeRequest({ role: 'STAFF', notes: 'Client confirmed via telephone' }), { params });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.message).toContain('Proxy consent successfully recorded');

        expect(recordMock).toHaveBeenCalledWith(
            expect.objectContaining({
                caseId: 'case1',
                userId: 'u-staff-1',
                userName: 'Sarah Connor',
                userEmail: 'sarah@zenowethu.co.za',
                userRole: 'STAFF',
                notes: 'Client confirmed via telephone',
            })
        );
        expect(readinessMock).toHaveBeenCalledWith({ caseId: 'case1', triggeredByUserId: 'u-staff-1' });
    });

    it('locks role to B2B or REFERRER based on authenticated session userType', async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            user: { id: 'u-b2b-1', firstName: 'Partner', email: 'b2b@agency.co.za', userType: 'B2B_PARTNER' },
        } as never);

        const res = await POST(makeRequest({ notes: 'B2B partner direct submission' }), { params });
        expect(res.status).toBe(200);

        expect(recordMock).toHaveBeenCalledWith(
            expect.objectContaining({
                userRole: 'B2B',
            })
        );
    });

    it('returns error when recordDrrProxyConsent fails', async () => {
        recordMock.mockResolvedValueOnce({ ok: false, error: 'Case not found', status: 404 });
        const res = await POST(makeRequest({ role: 'STAFF' }), { params });
        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.error).toBe('Case not found');
    });
});
