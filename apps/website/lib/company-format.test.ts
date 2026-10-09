import { describe, it, expect } from 'vitest';
import {
    addressLines,
    monogram,
    nameWithRegistration,
    ncrRegistrationLine,
    professionalsLabel,
    telHref,
    whatsAppHref,
    type SiteCompany,
} from './company-format';

const debtCounsellor: SiteCompany = {
    legalName: 'Acme Debt Counselling (Pty) Ltd',
    tradingName: 'Acme Debt Counselling',
    shortName: 'Acme',
    ncrdcNumber: 'NCRDC0001',
    phone: '012 345 6789',
    phoneInternational: '+27 12 345 6789',
    email: 'hello@acme.test',
    addressLine1: '1 Main Road',
    addressLine2: null,
    city: 'Pretoria',
    postalCode: '0001',
    logoUrl: null,
    isRegisteredDebtCounsellor: true,
};

// A credit-repair firm with no NCR debt-counsellor registration.
const creditRepair: SiteCompany = {
    ...debtCounsellor,
    tradingName: 'Beta Credit Repair',
    shortName: 'beta',
    ncrdcNumber: null,
    isRegisteredDebtCounsellor: false,
};

describe('phone links', () => {
    it('builds tel: and wa.me links from the international number', () => {
        expect(telHref(debtCounsellor)).toBe('tel:+27123456789');
        expect(whatsAppHref(debtCounsellor)).toBe('https://wa.me/27123456789');
    });
});

describe('NCR wording follows the registration', () => {
    it('mentions the NCRDC number for a registered debt counsellor', () => {
        expect(ncrRegistrationLine(debtCounsellor)).toBe('Registered with the National Credit Regulator (NCRDC0001)');
        expect(nameWithRegistration(debtCounsellor)).toBe('Acme Debt Counselling (NCRDC0001)');
        expect(professionalsLabel(debtCounsellor)).toBe('NCR-registered debt counsellors');
    });

    it('never claims NCR registration for an unregistered firm', () => {
        expect(ncrRegistrationLine(creditRepair)).toBeNull();
        expect(nameWithRegistration(creditRepair)).toBe('Beta Credit Repair');
        expect(professionalsLabel(creditRepair)).not.toMatch(/NCR/);
    });
});

describe('addressLines', () => {
    it('skips empty lines and joins city with postal code', () => {
        expect(addressLines(debtCounsellor)).toEqual(['1 Main Road', 'Pretoria, 0001']);
        expect(addressLines({ ...debtCounsellor, addressLine2: 'Suite 2', postalCode: '' }))
            .toEqual(['1 Main Road', 'Suite 2', 'Pretoria']);
    });
});

describe('monogram', () => {
    it('uses the upper-cased first letter of the short name', () => {
        expect(monogram(creditRepair)).toBe('B');
        expect(monogram({ shortName: '  ' })).toBe('•');
    });
});
