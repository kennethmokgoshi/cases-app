import { describe, it, expect } from 'vitest';
import {
    ZENOWETHU_COMPANY_PROFILE,
    formatCompanyAddress,
    formatCompanyPhoneLine,
    formatSignatureBlock,
    formatSignatureLine,
    formatCompanyLegalLine,
    formatRegistrationStrip,
    formatCompanyWithNcrdc,
    formatNcaContact,
    isRegisteredDebtCounsellor,
    getPlatformConfig,
    type CompanyProfile,
} from './profile';

/** A credit-repair firm with no NCR registration, no DCASA, no cell number. */
const CREDIT_REPAIR_FIRM: CompanyProfile = {
    ...ZENOWETHU_COMPANY_PROFILE,
    legalName: 'Mokgoshi Empire (PTY) LTD',
    tradingName: 'Mokgoshi Empire',
    shortName: 'Mokgoshi',
    tagline: null,
    registrationNumber: '2024/000001/07',
    vatNumber: null,
    ncrdcNumber: null,
    dcasaNumber: null,
    debtCounsellorName: null,
    directorName: null,
    directorIdNumber: null,
    addressLine1: '1 Example Street',
    addressLine2: null,
    city: 'Pretoria',
    postalCode: '0002',
    phone: '012 000 0000',
    phoneInternational: '+27 12 000 0000',
    cell: null,
    email: 'hello@mokgoshiempire.co.za',
    debtReviewEmail: null,
    debtReviewPhone: null,
    website: 'www.mokgoshiempire.co.za',
    websiteUrl: 'https://www.mokgoshiempire.co.za',
    bank: null,
};

describe('company profile formatters', () => {
    it('reproduces the exact Zenowethu signature block that was previously hard-coded', () => {
        expect(formatSignatureBlock(ZENOWETHU_COMPANY_PROFILE)).toBe(
            `Zenowethu Debt Management
NCRDC3693
Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190
Tel: +27 81 747 7616 | Cell: 082 363 8207
notifications@zenowethu.co.za | www.zenowethu.co.za
Member of DCASA`,
        );
    });

    it('formats the Zenowethu address, phone line, legal line and registration strip as before', () => {
        expect(formatCompanyAddress(ZENOWETHU_COMPANY_PROFILE)).toBe(
            'Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190',
        );
        expect(formatCompanyPhoneLine(ZENOWETHU_COMPANY_PROFILE)).toBe('Tel: +27 81 747 7616 | Cell: 082 363 8207');
        expect(formatCompanyLegalLine(ZENOWETHU_COMPANY_PROFILE)).toBe(
            'Zenowethu Debt Management (PTY) LTD | Reg No: 2013/121120/07 | NCRDC3693',
        );
        expect(formatRegistrationStrip(ZENOWETHU_COMPANY_PROFILE)).toBe('NCRDC3693 | DCASA 0863 | 081 747 7616');
        expect(formatSignatureLine(ZENOWETHU_COMPANY_PROFILE)).toBe(
            'Zenowethu Debt Management | NCRDC3693 | notifications@zenowethu.co.za | www.zenowethu.co.za',
        );
        expect(formatCompanyWithNcrdc(ZENOWETHU_COMPANY_PROFILE)).toBe('Zenowethu Debt Management (NCRDC3693)');
        expect(isRegisteredDebtCounsellor(ZENOWETHU_COMPANY_PROFILE)).toBe(true);
    });

    it('omits NCRDC, DCASA and cell lines for a firm that has none — never prints Zenowethu details', () => {
        const sig = formatSignatureBlock(CREDIT_REPAIR_FIRM);
        expect(sig).toBe(
            `Mokgoshi Empire
1 Example Street, Pretoria, 0002
Tel: +27 12 000 0000
hello@mokgoshiempire.co.za | www.mokgoshiempire.co.za`,
        );
        expect(sig).not.toMatch(/Zenowethu|NCRDC|DCASA|Mabopane/);
        expect(formatCompanyLegalLine(CREDIT_REPAIR_FIRM)).toBe('Mokgoshi Empire (PTY) LTD | Reg No: 2024/000001/07');
        expect(formatRegistrationStrip(CREDIT_REPAIR_FIRM)).toBe('012 000 0000');
        expect(formatCompanyWithNcrdc(CREDIT_REPAIR_FIRM)).toBe('Mokgoshi Empire');
        expect(isRegisteredDebtCounsellor(CREDIT_REPAIR_FIRM)).toBe(false);
    });

    it('NCA contact falls back to the general email/phone when no debt-review mailbox is set', () => {
        expect(formatNcaContact(ZENOWETHU_COMPANY_PROFILE)).toEqual({
            email: 'debtreview@zenowethu.co.za',
            phone: '+27817477616 / +27813109585',
        });
        expect(formatNcaContact(CREDIT_REPAIR_FIRM)).toEqual({ email: 'hello@mokgoshiempire.co.za', phone: '+27 12 000 0000' });
    });

    it('treats a blank NCRDC as not registered', () => {
        expect(isRegisteredDebtCounsellor({ ...CREDIT_REPAIR_FIRM, ncrdcNumber: '   ' })).toBe(false);
    });
});

describe('getPlatformConfig', () => {
    it('defaults to Zenowethu until PLATFORM_* is set', () => {
        expect(getPlatformConfig({})).toEqual({
            name: 'Zenowethu',
            url: 'https://cases.zenowethu.co.za',
            supportEmail: 'notifications@zenowethu.co.za',
        });
    });

    it('reads PLATFORM_* first, then NEXT_PUBLIC_ variants', () => {
        expect(getPlatformConfig({ PLATFORM_NAME: 'Mokgoshi Cases', NEXT_PUBLIC_PLATFORM_URL: 'https://app.example' }))
            .toMatchObject({ name: 'Mokgoshi Cases', url: 'https://app.example' });
        expect(getPlatformConfig({ NEXT_PUBLIC_PLATFORM_NAME: 'Public' }).name).toBe('Public');
    });
});
