/**
 * Company profile resolver — Prisma-backed (server-only).
 *
 * Deep-import this file from server code only:
 *   import { getCompanyProfile } from '@zenowethu/shared-lib/src/company/company-profile-service'
 * It must never be re-exported from the package index (it pulls in Prisma).
 *
 * Resolution order per field:
 *   1. `SystemSettings` rows in category "company_profile" (Admin → Settings → Company)
 *   2. Legacy `dc_profile` rows (dc_ncrdcNo / dc_name / dc_organisation) — kept so
 *      existing installs keep working until they save the full profile
 *   3. `COMPANY_*` environment variables (local dev / container fallback)
 *   4. `ZENOWETHU_COMPANY_PROFILE` defaults
 *
 * Cached for 60 s like `getDHSCredentials()`. When multi-tenancy lands the
 * lookup becomes per-organisation; callers will not change.
 */

import { z } from 'zod';
import { prisma } from '@zenowethu/database';
import { logger } from '../logger';
import { type CompanyProfile, ZENOWETHU_COMPANY_PROFILE } from './profile';

export const COMPANY_PROFILE_CATEGORY = 'company_profile';
const KEY_PREFIX = 'company_';
const CACHE_TTL_MS = 60_000;

const optionalText = z.string().trim().max(200).nullable().optional();

/** Zod schema for the admin save route. Every field optional so partial saves work. */
export const CompanyProfileInputSchema = z.object({
    legalName: z.string().trim().min(1).max(200).optional(),
    tradingName: z.string().trim().min(1).max(200).optional(),
    shortName: z.string().trim().min(1).max(60).optional(),
    tagline: optionalText,
    registrationNumber: optionalText,
    vatNumber: optionalText,
    ncrdcNumber: optionalText,
    dcasaNumber: optionalText,
    debtCounsellorName: optionalText,
    directorName: optionalText,
    directorIdNumber: z.string().trim().regex(/^\d{13}$/, 'ID number must be 13 digits').nullable().optional(),
    addressLine1: z.string().trim().min(1).max(200).optional(),
    addressLine2: optionalText,
    city: z.string().trim().min(1).max(100).optional(),
    postalCode: z.string().trim().min(1).max(10).optional(),
    phone: z.string().trim().min(1).max(30).optional(),
    phoneInternational: z.string().trim().min(1).max(30).optional(),
    cell: optionalText,
    email: z.string().trim().email().optional(),
    debtReviewEmail: z.string().trim().email().nullable().optional(),
    debtReviewPhone: optionalText,
    website: z.string().trim().min(1).max(200).optional(),
    websiteUrl: z.string().trim().url().optional(),
    primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    logoUrl: z.string().trim().max(500).nullable().optional(),
    bankName: optionalText,
    bankAccountHolder: optionalText,
    bankAccountNumber: optionalText,
    bankBranchCode: optionalText,
    bankAccountType: optionalText,
});
export type CompanyProfileInput = z.infer<typeof CompanyProfileInputSchema>;

/** Flat setting keys — one SystemSettings row each. */
type FlatKey = keyof CompanyProfileInput;
const FLAT_KEYS = Object.keys(CompanyProfileInputSchema.shape) as FlatKey[];

let cache: CompanyProfile | null = null;
let cachedAt = 0;

function readEnvFallbacks(env: NodeJS.ProcessEnv): Partial<Record<FlatKey, string>> {
    const out: Partial<Record<FlatKey, string>> = {};
    if (env.COMPANY_NAME) out.tradingName = env.COMPANY_NAME;
    if (env.COMPANY_PHONE) out.phone = env.COMPANY_PHONE;
    if (env.COMPANY_VAT_NUMBER) out.vatNumber = env.COMPANY_VAT_NUMBER;
    if (env.COMPANY_BANK_NAME) out.bankName = env.COMPANY_BANK_NAME;
    if (env.COMPANY_BANK_ACCOUNT) out.bankAccountNumber = env.COMPANY_BANK_ACCOUNT;
    if (env.COMPANY_BRANCH_CODE) out.bankBranchCode = env.COMPANY_BRANCH_CODE;
    return out;
}

/**
 * Merge flat setting values over the defaults into a full profile.
 * Exported for tests; production code calls `getCompanyProfile()`.
 */
export function buildCompanyProfile(
    flat: Partial<Record<FlatKey, string | null>>,
    base: CompanyProfile = ZENOWETHU_COMPANY_PROFILE,
): CompanyProfile {
    const pick = (key: FlatKey, fallback: string | null): string | null => {
        const v = flat[key];
        if (v === undefined) return fallback;
        if (v === null) return null;
        const trimmed = v.trim();
        return trimmed.length === 0 ? null : trimmed;
    };
    const req = (key: FlatKey, fallback: string): string => pick(key, fallback) ?? fallback;

    const legalName = req('legalName', base.legalName);
    const bankAccountNumber = pick('bankAccountNumber', base.bank?.accountNumber ?? null);
    const bankName = pick('bankName', base.bank?.bankName ?? null);
    const bank = bankAccountNumber && bankName
        ? {
            bankName,
            accountHolder: pick('bankAccountHolder', base.bank?.accountHolder ?? null) ?? legalName,
            accountNumber: bankAccountNumber,
            branchCode: pick('bankBranchCode', base.bank?.branchCode ?? null),
            accountType: pick('bankAccountType', base.bank?.accountType ?? null),
        }
        : null;

    return {
        legalName,
        tradingName: req('tradingName', base.tradingName),
        shortName: req('shortName', base.shortName),
        tagline: pick('tagline', base.tagline),
        registrationNumber: pick('registrationNumber', base.registrationNumber),
        vatNumber: pick('vatNumber', base.vatNumber),
        ncrdcNumber: pick('ncrdcNumber', base.ncrdcNumber),
        dcasaNumber: pick('dcasaNumber', base.dcasaNumber),
        debtCounsellorName: pick('debtCounsellorName', base.debtCounsellorName),
        directorName: pick('directorName', base.directorName),
        directorIdNumber: pick('directorIdNumber', base.directorIdNumber),
        addressLine1: req('addressLine1', base.addressLine1),
        addressLine2: pick('addressLine2', base.addressLine2),
        city: req('city', base.city),
        postalCode: req('postalCode', base.postalCode),
        phone: req('phone', base.phone),
        phoneInternational: req('phoneInternational', base.phoneInternational),
        cell: pick('cell', base.cell),
        email: req('email', base.email),
        debtReviewEmail: pick('debtReviewEmail', base.debtReviewEmail),
        debtReviewPhone: pick('debtReviewPhone', base.debtReviewPhone),
        website: req('website', base.website),
        websiteUrl: req('websiteUrl', base.websiteUrl),
        primaryColor: req('primaryColor', base.primaryColor),
        accentColor: req('accentColor', base.accentColor),
        logoUrl: pick('logoUrl', base.logoUrl),
        bank,
    };
}

/**
 * Resolve the company profile (cached 60 s). Never throws — on a DB error it
 * logs and falls back to env + defaults so document generation keeps working.
 */
export async function getCompanyProfile(): Promise<CompanyProfile> {
    const now = Date.now();
    if (cache && now - cachedAt < CACHE_TTL_MS) return cache;

    const flat: Partial<Record<FlatKey, string>> = readEnvFallbacks(process.env);

    try {
        const rows = await prisma.systemSettings.findMany({
            where: { category: { in: [COMPANY_PROFILE_CATEGORY, 'dc_profile'] } },
            select: { key: true, value: true, category: true },
        });

        // Legacy dc_profile keys first so a saved company_profile row wins.
        for (const row of rows) {
            if (row.category !== 'dc_profile') continue;
            if (row.key === 'dc_ncrdcNo' && row.value.trim()) flat.ncrdcNumber = row.value;
            if (row.key === 'dc_name' && row.value.trim()) flat.debtCounsellorName = row.value;
            if (row.key === 'dc_organisation' && row.value.trim()) flat.tradingName = row.value;
        }
        for (const row of rows) {
            if (row.category !== COMPANY_PROFILE_CATEGORY || !row.key.startsWith(KEY_PREFIX)) continue;
            const field = row.key.slice(KEY_PREFIX.length) as FlatKey;
            if (FLAT_KEYS.includes(field)) flat[field] = row.value;
        }
    } catch (error) {
        logger.error('[Company Profile] Failed to load from DB; using env/defaults:', error);
    }

    cache = buildCompanyProfile(flat);
    cachedAt = now;
    return cache;
}

/** Persist a partial profile. Empty strings clear a field back to default. */
export async function saveCompanyProfile(input: CompanyProfileInput): Promise<CompanyProfile> {
    const entries = Object.entries(input) as [FlatKey, string | null | undefined][];
    for (const [field, value] of entries) {
        if (value === undefined) continue;
        const key = `${KEY_PREFIX}${field}`;
        if (value === null || value.trim().length === 0) {
            await prisma.systemSettings.deleteMany({ where: { key } });
            continue;
        }
        await prisma.systemSettings.upsert({
            where: { key },
            update: { value: value.trim(), updatedAt: new Date() },
            create: {
                key,
                value: value.trim(),
                category: COMPANY_PROFILE_CATEGORY,
                description: `Company profile: ${field}`,
                isEncrypted: false,
            },
        });
    }

    // Keep the legacy dc_profile rows in step so older readers see the same values.
    const legacy: Array<[string, string | null | undefined, string]> = [
        ['dc_ncrdcNo', input.ncrdcNumber, 'Portal DC NCRDC registration number'],
        ['dc_name', input.debtCounsellorName, 'Portal DC full name'],
        ['dc_organisation', input.tradingName, 'Portal DC trading / organisation name'],
    ];
    for (const [key, value, description] of legacy) {
        if (!value || !value.trim()) continue;
        await prisma.systemSettings.upsert({
            where: { key },
            update: { value: value.trim(), updatedAt: new Date() },
            create: { key, value: value.trim(), category: 'dc_profile', description, isEncrypted: false },
        });
    }

    invalidateCompanyProfileCache();
    logger.info('[Company Profile] Saved', { fields: entries.filter(([, v]) => v !== undefined).map(([k]) => k) });
    return getCompanyProfile();
}

export function invalidateCompanyProfileCache(): void {
    cache = null;
    cachedAt = 0;
}
