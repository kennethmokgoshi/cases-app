import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { generateDisputeLetter, type DisputeLetterInput } from './dispute-pdf';
import { ZENOWETHU_COMPANY_PROFILE, type CompanyProfile } from '../company/profile';

const OTHER_FIRM: CompanyProfile = {
    ...ZENOWETHU_COMPANY_PROFILE,
    legalName: 'Mokgoshi Empire (PTY) LTD',
    tradingName: 'Mokgoshi Empire',
    shortName: 'Mokgoshi',
    ncrdcNumber: null,
    dcasaNumber: null,
    registrationNumber: '2024/000001/07',
    addressLine1: '1 Example Street',
    addressLine2: null,
    city: 'Pretoria',
    postalCode: '0002',
    phone: '012 000 0000',
    email: 'hello@mokgoshiempire.co.za',
};

function input(company: CompanyProfile): DisputeLetterInput {
    return {
        company,
        clientFullName: 'Thabo Mokoena',
        clientIdNumber: '9001015009087',
        creditorName: 'Test Bank',
        accountNumber: '123456',
        adverseCode: 'Handed Over',
        adverseDate: '2024-01-15',
        lastPaymentDate: '2021-01-01',
        bureauName: 'XDS',
        disputeGrounds: ['Prescribed under the Prescription Act'],
        outstandingBalance: 1000,
    };
}

/** Extract all page text with pdf.js (content streams are Flate-compressed, so no byte search). */
async function pdfText(bytes: Uint8Array): Promise<string> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // Text extraction does not need glyph rendering; standard fonts are deliberately not loaded.
    const doc = await pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, verbosity: 0 }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        parts.push(content.items.map(item => ('str' in item ? item.str : '')).join(' '));
    }
    return parts.join(' ');
}

describe('generateDisputeLetter — company profile', () => {
    it('renders every letter type with the Zenowethu profile', async () => {
        for (const type of ['CREDIT_BUREAU_DISPUTE', 'CREDIT_PROVIDER_DISPUTE', 'SECTION_129_DEMAND', 'SETTLEMENT_NEGOTIATION', 'PAID_UP_REQUEST', 'PRESCRIBED_DEBT_NOTICE'] as const) {
            const pdf = await generateDisputeLetter(type, { ...input(ZENOWETHU_COMPANY_PROFILE), settlementOfferPercent: 40 });
            expect(pdf.byteLength).toBeGreaterThan(1000);
            expect(Buffer.from(pdf.slice(0, 5)).toString('latin1')).toBe('%PDF-');
        }
    });

    it('prints the issuing firm from the profile, never a hard-coded Zenowethu', async () => {
        const pdf = await pdfText(await generateDisputeLetter('CREDIT_BUREAU_DISPUTE', input(OTHER_FIRM)));
        expect(pdf).toContain('Mokgoshi Empire (PTY) LTD');
        expect(pdf).not.toContain('Zenowethu');
        expect(pdf).not.toContain('NCRDC3693');
        expect(pdf).not.toContain('Mabopane');
    });
});
