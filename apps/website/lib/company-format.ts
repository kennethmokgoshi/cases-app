/**
 * Browser-safe view of the tenant company profile for the public website, plus
 * pure formatters. Every company-specific detail on the site (name, NCR number,
 * phone, address…) comes from the Company Profile in Cases → Admin → Settings —
 * never hard-code them in pages.
 */

export interface SiteCompany {
    legalName: string;
    tradingName: string;
    shortName: string;
    ncrdcNumber: string | null;
    phone: string;
    phoneInternational: string;
    email: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    postalCode: string;
    logoUrl: string | null;
    /** True when the firm holds an NCR debt-counsellor registration. */
    isRegisteredDebtCounsellor: boolean;
}

/** Digits of an international number, e.g. "+27 12 345 6789" → "27123456789". */
function internationalDigits(phoneInternational: string): string {
    return phoneInternational.replace(/\D/g, '');
}

export function telHref(company: Pick<SiteCompany, 'phoneInternational'>): string {
    return `tel:+${internationalDigits(company.phoneInternational)}`;
}

export function whatsAppHref(company: Pick<SiteCompany, 'phoneInternational'>): string {
    return `https://wa.me/${internationalDigits(company.phoneInternational)}`;
}

/** "Registered with the National Credit Regulator (NCRDC…)", or null for non-DC firms. */
export function ncrRegistrationLine(company: Pick<SiteCompany, 'ncrdcNumber' | 'isRegisteredDebtCounsellor'>): string | null {
    return company.isRegisteredDebtCounsellor
        ? `Registered with the National Credit Regulator (${company.ncrdcNumber})`
        : null;
}

/** "Name (NCRDC…)" for DCs, plain name otherwise. */
export function nameWithRegistration(company: Pick<SiteCompany, 'tradingName' | 'ncrdcNumber' | 'isRegisteredDebtCounsellor'>): string {
    return company.isRegisteredDebtCounsellor
        ? `${company.tradingName} (${company.ncrdcNumber})`
        : company.tradingName;
}

/** Wording for the people who handle a client's case. */
export function professionalsLabel(company: Pick<SiteCompany, 'isRegisteredDebtCounsellor'>): string {
    return company.isRegisteredDebtCounsellor ? 'NCR-registered debt counsellors' : 'experienced consultants';
}

export function addressLines(company: Pick<SiteCompany, 'addressLine1' | 'addressLine2' | 'city' | 'postalCode'>): string[] {
    return [
        company.addressLine1,
        company.addressLine2,
        [company.city, company.postalCode].filter(Boolean).join(', '),
    ].filter((line): line is string => Boolean(line && line.trim()));
}

/** Monogram for the nav badge when no logo is uploaded. */
export function monogram(company: Pick<SiteCompany, 'shortName'>): string {
    return company.shortName.trim().charAt(0).toUpperCase() || '•';
}
