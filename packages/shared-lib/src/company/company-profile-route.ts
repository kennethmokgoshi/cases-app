// Reusable Next.js route handler: the tenant's public-facing company details
// for any signed-in user (staff, referrer, B2B partner). Node-only — do not
// import from the package root.
//
// Returns only display fields (names, registrations, contact, brand). Banking,
// director ID and other sensitive values stay behind the admin-only
// /api/admin/settings/company-profile route.

import { NextResponse } from 'next/server';
import { auth } from '../auth';
import { createLogger } from '../logger';
import { getCompanyProfile } from './company-profile-service';
import type { CompanyProfile } from './profile';

const logger = createLogger('api/company-profile');

export type PublicCompanyProfile = Pick<
    CompanyProfile,
    | 'legalName' | 'tradingName' | 'shortName' | 'tagline'
    | 'registrationNumber' | 'vatNumber' | 'ncrdcNumber' | 'dcasaNumber' | 'debtCounsellorName'
    | 'addressLine1' | 'addressLine2' | 'city' | 'postalCode'
    | 'phone' | 'phoneInternational' | 'cell' | 'email' | 'website' | 'websiteUrl'
    | 'primaryColor' | 'accentColor' | 'logoUrl'
>;

export function toPublicCompanyProfile(p: CompanyProfile): PublicCompanyProfile {
    return {
        legalName: p.legalName,
        tradingName: p.tradingName,
        shortName: p.shortName,
        tagline: p.tagline,
        registrationNumber: p.registrationNumber,
        vatNumber: p.vatNumber,
        ncrdcNumber: p.ncrdcNumber,
        dcasaNumber: p.dcasaNumber,
        debtCounsellorName: p.debtCounsellorName,
        addressLine1: p.addressLine1,
        addressLine2: p.addressLine2,
        city: p.city,
        postalCode: p.postalCode,
        phone: p.phone,
        phoneInternational: p.phoneInternational,
        cell: p.cell,
        email: p.email,
        website: p.website,
        websiteUrl: p.websiteUrl,
        primaryColor: p.primaryColor,
        accentColor: p.accentColor,
        logoUrl: p.logoUrl,
    };
}

export function createCompanyProfileRoute() {
    async function GET() {
        try {
            const session = await auth();
            if (!session?.user?.id) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const profile = await getCompanyProfile();
            return NextResponse.json({ profile: toPublicCompanyProfile(profile) });
        } catch (error) {
            logger.error('Failed to load company profile', error);
            return NextResponse.json({ error: 'Failed to load company profile' }, { status: 500 });
        }
    }
    return { GET };
}
