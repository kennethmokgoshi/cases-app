import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        systemSettings: {
            findMany: vi.fn(),
            upsert: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

vi.mock('../logger', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { prisma } from '@zenowethu/database';
import {
    getCompanyProfile,
    saveCompanyProfile,
    invalidateCompanyProfileCache,
    buildCompanyProfile,
    CompanyProfileInputSchema,
} from './company-profile-service';
import { ZENOWETHU_COMPANY_PROFILE } from './profile';

const findMany = prisma.systemSettings.findMany as unknown as ReturnType<typeof vi.fn>;
const upsert = prisma.systemSettings.upsert as unknown as ReturnType<typeof vi.fn>;
const deleteMany = prisma.systemSettings.deleteMany as unknown as ReturnType<typeof vi.fn>;

const ENV_KEYS = ['COMPANY_NAME', 'COMPANY_PHONE', 'COMPANY_VAT_NUMBER', 'COMPANY_BANK_NAME', 'COMPANY_BANK_ACCOUNT', 'COMPANY_BRANCH_CODE'];

beforeEach(() => {
    vi.clearAllMocks();
    invalidateCompanyProfileCache();
    for (const k of ENV_KEYS) delete process.env[k];
});

describe('getCompanyProfile', () => {
    it('returns the Zenowethu defaults when nothing is stored (tenant #1 output unchanged)', async () => {
        findMany.mockResolvedValue([]);
        const profile = await getCompanyProfile();
        expect(profile).toEqual(ZENOWETHU_COMPANY_PROFILE);
    });

    it('overlays company_profile rows and maps legacy dc_profile rows', async () => {
        findMany.mockResolvedValue([
            { category: 'dc_profile', key: 'dc_ncrdcNo', value: 'NCRDC9999' },
            { category: 'dc_profile', key: 'dc_name', value: 'Jane Counsellor' },
            { category: 'company_profile', key: 'company_tradingName', value: 'Mokgoshi Empire' },
            { category: 'company_profile', key: 'company_cell', value: '' },
            { category: 'company_profile', key: 'company_unknownField', value: 'ignored' },
        ]);
        const profile = await getCompanyProfile();
        expect(profile.tradingName).toBe('Mokgoshi Empire');
        expect(profile.ncrdcNumber).toBe('NCRDC9999');
        expect(profile.debtCounsellorName).toBe('Jane Counsellor');
        expect(profile.cell).toBeNull(); // blank stored value clears the default
        expect(profile.legalName).toBe(ZENOWETHU_COMPANY_PROFILE.legalName); // untouched fields keep defaults
    });

    it('a saved company_profile row beats a legacy dc_profile row for the same field', async () => {
        findMany.mockResolvedValue([
            { category: 'dc_profile', key: 'dc_organisation', value: 'Old Name' },
            { category: 'company_profile', key: 'company_tradingName', value: 'New Name' },
        ]);
        expect((await getCompanyProfile()).tradingName).toBe('New Name');
    });

    it('falls back to COMPANY_* env vars, and DB rows beat env', async () => {
        process.env.COMPANY_NAME = 'Env Firm';
        process.env.COMPANY_PHONE = '011 111 1111';
        process.env.COMPANY_BANK_ACCOUNT = '123';
        findMany.mockResolvedValue([{ category: 'company_profile', key: 'company_phone', value: '022 222 2222' }]);
        const profile = await getCompanyProfile();
        expect(profile.tradingName).toBe('Env Firm');
        expect(profile.phone).toBe('022 222 2222');
        expect(profile.bank?.accountNumber).toBe('123');
    });

    it('never throws on a DB failure — logs and uses env/defaults', async () => {
        findMany.mockRejectedValue(new Error('db down'));
        await expect(getCompanyProfile()).resolves.toEqual(ZENOWETHU_COMPANY_PROFILE);
    });

    it('caches for 60 s and invalidateCompanyProfileCache() forces a reload', async () => {
        findMany.mockResolvedValue([]);
        await getCompanyProfile();
        await getCompanyProfile();
        expect(findMany).toHaveBeenCalledTimes(1);
        invalidateCompanyProfileCache();
        await getCompanyProfile();
        expect(findMany).toHaveBeenCalledTimes(2);
    });
});

describe('buildCompanyProfile', () => {
    it('defaults the legal fee to R1,700 and reads a saved amount', () => {
        expect(buildCompanyProfile({}).legalFeeAmount).toBe(1700);
        expect(buildCompanyProfile({ legalFeeAmount: '2500.50' }).legalFeeAmount).toBe(2500.5);
        expect(buildCompanyProfile({ legalFeeAmount: 'abc' }).legalFeeAmount).toBe(1700);
        expect(buildCompanyProfile({ legalFeeAmount: null }).legalFeeAmount).toBe(1700);
    });

    it('drops the bank block when no account number remains', () => {
        const profile = buildCompanyProfile({ bankAccountNumber: null });
        expect(profile.bank).toBeNull();
    });

    it('uses the legal name as account holder when none is given', () => {
        const profile = buildCompanyProfile(
            { bankName: 'Capitec', bankAccountNumber: '999', legalName: 'Firm (PTY) LTD' },
            { ...ZENOWETHU_COMPANY_PROFILE, bank: null },
        );
        expect(profile.bank).toEqual({
            bankName: 'Capitec',
            accountHolder: 'Firm (PTY) LTD',
            accountNumber: '999',
            branchCode: null,
            accountType: null,
        });
    });
});

describe('saveCompanyProfile', () => {
    it('upserts provided fields, deletes cleared ones, mirrors legacy dc_profile keys and returns the fresh profile', async () => {
        upsert.mockResolvedValue({});
        deleteMany.mockResolvedValue({ count: 1 });
        findMany.mockResolvedValue([{ category: 'company_profile', key: 'company_tradingName', value: 'Mokgoshi Empire' }]);

        const result = await saveCompanyProfile({ tradingName: 'Mokgoshi Empire', ncrdcNumber: '', cell: null });

        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'company_tradingName' } }));
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'dc_organisation' } }));
        expect(deleteMany).toHaveBeenCalledWith({ where: { key: 'company_ncrdcNumber' } });
        expect(deleteMany).toHaveBeenCalledWith({ where: { key: 'company_cell' } });
        // Blank NCRDC is not mirrored into dc_profile (would be an invalid registration).
        expect(upsert).not.toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'dc_ncrdcNo' } }));
        expect(result.tradingName).toBe('Mokgoshi Empire');
    });
});

describe('CompanyProfileInputSchema', () => {
    it('accepts a Rand legal fee and rejects anything else', () => {
        expect(CompanyProfileInputSchema.safeParse({ legalFeeAmount: '1700' }).success).toBe(true);
        expect(CompanyProfileInputSchema.safeParse({ legalFeeAmount: '1700.50' }).success).toBe(true);
        expect(CompanyProfileInputSchema.safeParse({ legalFeeAmount: 'R1700' }).success).toBe(false);
        expect(CompanyProfileInputSchema.safeParse({ legalFeeAmount: '-5' }).success).toBe(false);
    });

    it('rejects a malformed director ID and colour, accepts a partial valid payload', () => {
        expect(CompanyProfileInputSchema.safeParse({ directorIdNumber: '123' }).success).toBe(false);
        expect(CompanyProfileInputSchema.safeParse({ primaryColor: 'navy' }).success).toBe(false);
        expect(CompanyProfileInputSchema.safeParse({ tradingName: 'X', ncrdcNumber: null }).success).toBe(true);
    });
});
