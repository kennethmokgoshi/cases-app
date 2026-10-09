import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../auth', () => ({ auth: vi.fn() }));
vi.mock('../logger', () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) }));
vi.mock('./company-profile-service', async () => {
    const { ZENOWETHU_COMPANY_PROFILE } = await import('./profile');
    return { getCompanyProfile: vi.fn().mockResolvedValue(ZENOWETHU_COMPANY_PROFILE) };
});

import { auth } from '../auth';
import { createCompanyProfileRoute, toPublicCompanyProfile } from './company-profile-route';
import { ZENOWETHU_COMPANY_PROFILE } from './profile';

const { GET } = createCompanyProfileRoute();

beforeEach(() => vi.clearAllMocks());

describe('GET /api/company-profile', () => {
    it('returns display fields to any signed-in user and never the bank block or director ID', async () => {
        (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1', isAdmin: false } });
        const res = await GET();
        expect(res.status).toBe(200);
        const { profile } = await res.json();
        expect(profile.tradingName).toBe('Zenowethu Debt Management');
        expect(profile.vatNumber).toBe('4590307072');
        expect(profile).not.toHaveProperty('bank');
        expect(profile).not.toHaveProperty('directorIdNumber');
    });

    it('rejects anonymous callers', async () => {
        (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        expect((await GET()).status).toBe(401);
    });
});

describe('toPublicCompanyProfile', () => {
    it('strips sensitive fields', () => {
        const pub = toPublicCompanyProfile(ZENOWETHU_COMPANY_PROFILE) as Record<string, unknown>;
        expect(pub.bank).toBeUndefined();
        expect(pub.directorIdNumber).toBeUndefined();
        expect(pub.ncrdcNumber).toBe('NCRDC3693');
    });
});
