import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/company/company-profile-service', async () => {
    const { ZENOWETHU_COMPANY_PROFILE } = await import('@zenowethu/shared-lib/src/company/profile');
    const { z } = await import('zod');
    return {
        getCompanyProfile: vi.fn().mockResolvedValue(ZENOWETHU_COMPANY_PROFILE),
        saveCompanyProfile: vi.fn().mockImplementation(async (input: Record<string, unknown>) => ({ ...ZENOWETHU_COMPANY_PROFILE, ...input })),
        CompanyProfileInputSchema: z.object({
            tradingName: z.string().trim().min(1).optional(),
            ncrdcNumber: z.string().nullable().optional(),
            directorIdNumber: z.string().regex(/^\d{13}$/).nullable().optional(),
        }),
    };
});

import { auth } from '@zenowethu/shared-lib';
import { saveCompanyProfile } from '@zenowethu/shared-lib/src/company/company-profile-service';
import { GET, PUT } from './route';

const admin = { user: { id: 'u1', email: 'admin@x', isAdmin: true, isExecutive: false } };
const executive = { user: { id: 'u2', email: 'exec@x', isAdmin: false, isExecutive: true } };
const member = { user: { id: 'u3', email: 'm@x', isAdmin: false, isExecutive: false } };

function put(body: unknown) {
    return new Request('http://localhost/api/admin/settings/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/admin/settings/company-profile', () => {
    it('returns the resolved profile for admins and executives', async () => {
        (auth as ReturnType<typeof vi.fn>).mockResolvedValue(executive);
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.profile.tradingName).toBe('Zenowethu Debt Management');
        expect(json.profile.ncrdcNumber).toBe('NCRDC3693');
    });

    it('rejects members and anonymous callers', async () => {
        (auth as ReturnType<typeof vi.fn>).mockResolvedValue(member);
        expect((await GET()).status).toBe(401);
        (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        expect((await GET()).status).toBe(401);
    });
});

describe('PUT /api/admin/settings/company-profile', () => {
    it('saves a partial profile for admins', async () => {
        (auth as ReturnType<typeof vi.fn>).mockResolvedValue(admin);
        const res = await PUT(put({ tradingName: 'Mokgoshi Empire', ncrdcNumber: null }));
        expect(res.status).toBe(200);
        expect(saveCompanyProfile).toHaveBeenCalledWith({ tradingName: 'Mokgoshi Empire', ncrdcNumber: null });
        expect((await res.json()).profile.tradingName).toBe('Mokgoshi Empire');
    });

    it('executives cannot write', async () => {
        (auth as ReturnType<typeof vi.fn>).mockResolvedValue(executive);
        expect((await PUT(put({ tradingName: 'X' }))).status).toBe(401);
        expect(saveCompanyProfile).not.toHaveBeenCalled();
    });

    it('returns 422 with field errors on invalid input', async () => {
        (auth as ReturnType<typeof vi.fn>).mockResolvedValue(admin);
        const res = await PUT(put({ directorIdNumber: '12' }));
        expect(res.status).toBe(422);
        expect((await res.json()).issues.directorIdNumber).toBeDefined();
        expect(saveCompanyProfile).not.toHaveBeenCalled();
    });
});
