/**
 * Company profile — the tenant-level identity that appears on every outbound
 * artefact (letters, PDFs, emails, SMS, consent text, AI prompts).
 *
 * This file is PURE (no Prisma, no Node APIs) so it can be imported anywhere,
 * including client components and the package index. The Prisma-backed
 * resolver lives in `./company-profile-service` and is deep-imported by
 * server code only.
 *
 * Two levels of branding exist on the platform:
 *
 *   - **Company profile** (this file) — the firm doing the work: name, NCRDC,
 *     address, banking, DC name. Differs per tenant.
 *   - **Platform config** (`getPlatformConfig`) — the product/operator itself:
 *     what the app is called, its support address. Same for every tenant.
 *
 * Nothing outside this module may hard-code "Zenowethu", "NCRDC3693", the
 * Mabopane address, the company phone numbers or banking details. Resolve the
 * profile and format from it instead.
 */

export interface CompanyBankDetails {
    bankName: string;
    accountHolder: string;
    accountNumber: string;
    branchCode: string | null;
    accountType: string | null;
}

export interface CompanyProfile {
    /** Registered legal name, e.g. "Zenowethu Debt Management (PTY) LTD". */
    legalName: string;
    /** Trading name used in prose and signatures, e.g. "Zenowethu Debt Management". */
    tradingName: string;
    /** One-word brand used in UI and short SMS copy, e.g. "Zenowethu". */
    shortName: string;
    /** Marketing tagline shown under the logo in branded emails. */
    tagline: string | null;
    /** CIPC registration number, e.g. "2013/121120/07". */
    registrationNumber: string | null;
    vatNumber: string | null;
    /** NCR debt-counsellor registration, e.g. "NCRDC3693". Null for firms that are not registered DCs. */
    ncrdcNumber: string | null;
    /** DCASA membership number, e.g. "0863". */
    dcasaNumber: string | null;
    /** The registered debt counsellor / responsible person named on NCA documents. */
    debtCounsellorName: string | null;
    /** Director named in the Power of Attorney preamble. */
    directorName: string | null;
    directorIdNumber: string | null;

    addressLine1: string;
    addressLine2: string | null;
    city: string;
    postalCode: string;

    /** Local format, e.g. "081 747 7616". */
    phone: string;
    /** International format, e.g. "+27 81 747 7616". */
    phoneInternational: string;
    cell: string | null;
    /** Address outbound notifications are sent from / replied to. */
    email: string;
    /** Dedicated debt-review mailbox printed on NCA forms (Form 16/17/86). Falls back to `email`. */
    debtReviewEmail: string | null;
    /** Contact number(s) printed on NCA forms. Falls back to `phoneInternational`. */
    debtReviewPhone: string | null;
    /** Display form, e.g. "www.zenowethu.co.za". */
    website: string;
    /** Absolute URL, e.g. "https://www.zenowethu.co.za". */
    websiteUrl: string;

    primaryColor: string;
    accentColor: string;
    logoUrl: string | null;

    bank: CompanyBankDetails | null;
}

/**
 * Zenowethu's details — the values that were hard-coded across the codebase
 * before the company profile existed. They remain the fallback when no
 * profile has been saved so tenant #1's output is unchanged.
 */
export const ZENOWETHU_COMPANY_PROFILE: CompanyProfile = Object.freeze({
    legalName: 'Zenowethu Debt Management (PTY) LTD',
    tradingName: 'Zenowethu Debt Management',
    shortName: 'Zenowethu',
    tagline: 'Debt Management | Insurance | Financial Services',
    registrationNumber: '2013/121120/07',
    vatNumber: '4590307072',
    ncrdcNumber: 'NCRDC3693',
    dcasaNumber: '0863',
    debtCounsellorName: 'Aaron Nzotho',
    directorName: 'Aaron Nzotho',
    directorIdNumber: '7809065687086',
    addressLine1: 'Suite 2, 2nd Floor, Central House',
    addressLine2: '17 Central Road',
    city: 'Mabopane',
    postalCode: '0190',
    phone: '081 747 7616',
    phoneInternational: '+27 81 747 7616',
    cell: '082 363 8207',
    email: 'notifications@zenowethu.co.za',
    debtReviewEmail: 'debtreview@zenowethu.co.za',
    debtReviewPhone: '+27817477616 / +27813109585',
    website: 'www.zenowethu.co.za',
    websiteUrl: 'https://www.zenowethu.co.za',
    primaryColor: '#0B1D35',
    accentColor: '#C4953A',
    logoUrl: null,
    bank: Object.freeze({
        bankName: 'FNB',
        accountHolder: 'Zenowethu Trading Debt Management (PTY) LTD',
        accountNumber: '62867268635',
        branchCode: '250655',
        accountType: null,
    }),
}) as CompanyProfile;

// ─── Formatters ──────────────────────────────────────────────────────────────

/** "Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190" */
export function formatCompanyAddress(profile: CompanyProfile): string {
    return [profile.addressLine1, profile.addressLine2, profile.city, profile.postalCode]
        .filter((part): part is string => !!part && part.trim().length > 0)
        .join(', ');
}

/** "Tel: +27 81 747 7616 | Cell: 082 363 8207" (cell omitted when absent). */
export function formatCompanyPhoneLine(profile: CompanyProfile): string {
    const parts = [`Tel: ${profile.phoneInternational}`];
    if (profile.cell) parts.push(`Cell: ${profile.cell}`);
    return parts.join(' | ');
}

/**
 * Plain-text email signature used on consumer and debt-counsellor emails.
 *
 * Zenowethu Debt Management
 * NCRDC3693
 * Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190
 * Tel: +27 81 747 7616 | Cell: 082 363 8207
 * notifications@zenowethu.co.za | www.zenowethu.co.za
 * Member of DCASA
 */
export function formatSignatureBlock(profile: CompanyProfile): string {
    const lines = [profile.tradingName];
    if (profile.ncrdcNumber) lines.push(profile.ncrdcNumber);
    lines.push(formatCompanyAddress(profile));
    lines.push(formatCompanyPhoneLine(profile));
    lines.push(`${profile.email} | ${profile.website}`);
    if (profile.dcasaNumber) lines.push('Member of DCASA');
    return lines.join('\n');
}

/** Single-line version for HTML footers: "Zenowethu Debt Management | NCRDC3693 | notifications@… | www.…" */
export function formatSignatureLine(profile: CompanyProfile): string {
    return [profile.tradingName, profile.ncrdcNumber, profile.email, profile.website]
        .filter((part): part is string => !!part)
        .join(' | ');
}

/** "Zenowethu Debt Management (PTY) LTD | Reg No: 2013/121120/07 | NCRDC3693" */
export function formatCompanyLegalLine(profile: CompanyProfile): string {
    const parts = [profile.legalName];
    if (profile.registrationNumber) parts.push(`Reg No: ${profile.registrationNumber}`);
    if (profile.ncrdcNumber) parts.push(profile.ncrdcNumber);
    return parts.join(' | ');
}

/** "NCRDC3693 | DCASA 0863 | 081 747 7616" — the small registration strip under the email logo. */
export function formatRegistrationStrip(profile: CompanyProfile): string {
    const parts: string[] = [];
    if (profile.ncrdcNumber) parts.push(profile.ncrdcNumber);
    if (profile.dcasaNumber) parts.push(`DCASA ${profile.dcasaNumber}`);
    parts.push(profile.phone);
    return parts.join(' | ');
}

/** "Zenowethu Debt Management (NCRDC3693)" — or just the trading name for non-DC firms. */
export function formatCompanyWithNcrdc(profile: CompanyProfile): string {
    return profile.ncrdcNumber ? `${profile.tradingName} (${profile.ncrdcNumber})` : profile.tradingName;
}

/** Contact details printed on NCA statutory forms. */
export function formatNcaContact(profile: CompanyProfile): { email: string; phone: string } {
    return {
        email: profile.debtReviewEmail ?? profile.email,
        phone: profile.debtReviewPhone ?? profile.phoneInternational,
    };
}

/** True when the firm holds an NCR debt-counsellor registration (and may therefore act on DHS). */
export function isRegisteredDebtCounsellor(profile: CompanyProfile): boolean {
    return !!profile.ncrdcNumber && profile.ncrdcNumber.trim().length > 0;
}

// ─── Platform (operator) config ──────────────────────────────────────────────

export interface PlatformConfig {
    /** Product name shown in app chrome, PWA prompt, AI system prompts. */
    name: string;
    /** Public URL of the platform's primary app. */
    url: string;
    supportEmail: string;
}

/**
 * Platform-level identity. Read from env so a rebrand (e.g. to the Mokgoshi
 * Empire product name) is a config change. Defaults keep today's behaviour.
 *
 * Client components must use the NEXT_PUBLIC_ variants.
 */
export function getPlatformConfig(env: Record<string, string | undefined> = process.env): PlatformConfig {
    return {
        name: env.PLATFORM_NAME || env.NEXT_PUBLIC_PLATFORM_NAME || 'Zenowethu',
        url: env.PLATFORM_URL || env.NEXT_PUBLIC_PLATFORM_URL || 'https://cases.zenowethu.co.za',
        supportEmail: env.PLATFORM_SUPPORT_EMAIL || 'notifications@zenowethu.co.za',
    };
}
