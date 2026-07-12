import { describe, it, expect } from 'vitest';
import { generateForm19, type Form19Data } from './form19-pdf';
import { generateForm172C, type Form172CData } from './form17-2c-pdf';
import { generateSection7172Statement, type Section7172StatementData } from './section71-72-statement-pdf';

const dc = {
    dcName:    'Aaron Nzotho',
    dcNcrdcNo: 'NCRDC3693',
    dcAddress: 'Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0190',
    dcPhone:   '+27 81 747 7616',
    dcEmail:   'info@zenowethu.co.za',
};

const consumer = {
    firstName: 'Thabo',
    lastName:  'Mokoena',
    idNumber:  '8001015009087',
    address:   '12 Example Street, Mabopane, 0190',
};

const settledAccounts = [
    { creditorName: 'ABSA Bank', accountNumber: '123456', accountType: 'PERSONAL_LOAN', status: 'CLOSED', outstandingBalance: 0 },
    { creditorName: 'Truworths', accountNumber: '654321', accountType: 'RETAIL',        status: 'CLOSED', outstandingBalance: 0 },
];

function isPdf(bytes: Uint8Array): boolean {
    return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
}

describe('generateForm19', () => {
    const base: Form19Data = {
        fileNumber: 'ZW-0001',
        issueDate:  new Date('2026-07-10'),
        ...consumer,
        allObligationsSettled: true,
        mortgageCreditor:      null,
        accounts:              settledAccounts,
        ...dc,
    };

    it('renders the F2 variant (all obligations settled)', async () => {
        const bytes = await generateForm19(base);
        expect(isPdf(bytes)).toBe(true);
        expect(bytes.length).toBeGreaterThan(1000);
    });

    it('renders the F1 variant (settled except mortgage)', async () => {
        const bytes = await generateForm19({
            ...base,
            allObligationsSettled: false,
            mortgageCreditor:      'Standard Bank Home Loans',
        });
        expect(isPdf(bytes)).toBe(true);
    });

    it('renders with no accounts', async () => {
        const bytes = await generateForm19({ ...base, accounts: [] });
        expect(isPdf(bytes)).toBe(true);
    });
});

describe('generateForm172C', () => {
    const base: Form172CData = {
        fileNumber:       'ZW-0001',
        notificationDate: new Date('2026-07-10'),
        ...consumer,
        email:            'thabo@example.com',
        phone:            '0821234567',
        settledAccountCount:   5,
        mortgageCreditor:      'Standard Bank Home Loans',
        mortgageAccountNumber: 'HL-998877',
        mortgageBalance:       450000,
        mortgageInstalment:    5200,
        ...dc,
    };

    it('renders a valid PDF', async () => {
        const bytes = await generateForm172C(base);
        expect(isPdf(bytes)).toBe(true);
    });

    it('renders with missing mortgage details', async () => {
        const bytes = await generateForm172C({
            ...base,
            mortgageCreditor: null, mortgageAccountNumber: null,
            mortgageBalance: null, mortgageInstalment: null,
        });
        expect(isPdf(bytes)).toBe(true);
    });
});

describe('generateSection7172Statement', () => {
    const base: Section7172StatementData = {
        fileNumber:    'ZW-0001',
        statementDate: new Date('2026-07-10'),
        ...consumer,
        settledAccounts,
        mortgageCreditor:       'Standard Bank Home Loans',
        mortgageAccountNumber:  'HL-998877',
        mortgageBalance:        450000,
        mortgageInstalment:     5200,
        mortgageEvidenceSource: 'Credit bureau report dated 2026-07-01',
        ...dc,
    };

    it('renders a valid PDF', async () => {
        const bytes = await generateSection7172Statement(base);
        expect(isPdf(bytes)).toBe(true);
    });

    it('renders with no settled accounts and no evidence source', async () => {
        const bytes = await generateSection7172Statement({
            ...base,
            settledAccounts: [],
            mortgageEvidenceSource: null,
        });
        expect(isPdf(bytes)).toBe(true);
    });
});
