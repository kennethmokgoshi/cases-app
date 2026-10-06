/**
 * Server-only loader (imports Prisma via the shared service — never import from a client component) for the tenant company profile shown on the public website.
 * Backed by the shared Company Profile (cached 60 s, falls back to defaults if
 * the database is unreachable), deduplicated per request with React `cache`.
 */

import { cache } from 'react';
import { getCompanyProfile } from '@zenowethu/shared-lib/src/company/company-profile-service';
import { isRegisteredDebtCounsellor, type CompanyProfile } from '@zenowethu/shared-lib/src/company/profile';
import type { SiteCompany } from './company-format';

export function toSiteCompany(p: CompanyProfile): SiteCompany {
    return {
        legalName: p.legalName,
        tradingName: p.tradingName,
        shortName: p.shortName,
        ncrdcNumber: p.ncrdcNumber,
        phone: p.phone,
        phoneInternational: p.phoneInternational,
        email: p.email,
        addressLine1: p.addressLine1,
        addressLine2: p.addressLine2,
        city: p.city,
        postalCode: p.postalCode,
        logoUrl: p.logoUrl,
        isRegisteredDebtCounsellor: isRegisteredDebtCounsellor(p),
    };
}

export const getSiteCompany = cache(async (): Promise<SiteCompany> => toSiteCompany(await getCompanyProfile()));
