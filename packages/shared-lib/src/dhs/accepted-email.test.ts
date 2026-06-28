import { describe, it, expect } from 'vitest';
import { buildAcceptedViaDhsEmail, ACCEPTED_VIA_DHS_SUBJECT } from './accepted-email';

describe('buildAcceptedViaDhsEmail', () => {
    const email = buildAcceptedViaDhsEmail({
        clientFirstName: 'Thabo',
        fileNumber: 'ZDM-2026-096',
        consentLink: 'https://cases.zenowethu.co.za/consent/debt-review-removal/abc123',
        previousDcName: 'Debt Busters',
        previousDcTradingName: 'DebtBusters (Pty) Ltd',
    });

    it('greets the consumer and confirms the transfer was accepted', () => {
        expect(email).toContain('Dear Thabo');
        expect(email).toMatch(/transfer .*has been accepted/i);
        expect(email).toContain('ZDM-2026-096');
    });

    it('names the previous debt counsellor (and trading name) the file moved from', () => {
        expect(email).toContain('Debt Busters');
        expect(email).toContain('DebtBusters (Pty) Ltd');
        expect(email).toMatch(/from Debt Busters .*to Zenowethu Debt Management/i);
    });

    it('does not use DHS / Debt Help System jargon', () => {
        expect(email).not.toMatch(/DHS/);
        expect(email).not.toMatch(/Debt Help System/i);
    });

    it('includes the consent link and asks for consent', () => {
        expect(email).toContain('https://cases.zenowethu.co.za/consent/debt-review-removal/abc123');
        expect(email).toMatch(/your consent/i);
    });

    it('acknowledges the signed POA and frames consent via POPIA', () => {
        expect(email).toMatch(/Power of Attorney/i);
        expect(email).toContain('POPIA');
    });

    it('tells the consumer we will remove the flag at all major credit bureaus', () => {
        expect(email).toMatch(/removing the debt review flag/i);
        expect(email).toMatch(/all major credit bureaus/i);
    });

    it('kindly warns that without consent the file will be parked', () => {
        expect(email).toMatch(/parked/i);
        expect(email).toMatch(/cannot be attended to/i);
    });

    it('avoids overpromising — no guarantees or fixed timelines', () => {
        expect(email).not.toMatch(/guarantee/i);
        expect(email).toMatch(/timelines depend on/i);
    });

    it('includes the Zenowethu signature block without the personal counsellor name', () => {
        expect(email).not.toMatch(/Aaron Nzotho/);
        expect(email).toMatch(/Yours sincerely,\s*\n+NCRDC3693/);
        expect(email).toContain('Member of DCASA');
    });

    it('falls back to a generic phrase when the previous DC is unknown', () => {
        const e = buildAcceptedViaDhsEmail({
            clientFirstName: 'Sipho',
            fileNumber: 'ZDM-2026-1009',
            consentLink: 'https://x/y',
            previousDcName: '',
            previousDcTradingName: '',
        });
        expect(e).toMatch(/from your previous debt counsellor on record to Zenowethu Debt Management/i);
    });

    it('trims a padded first name', () => {
        const e = buildAcceptedViaDhsEmail({
            clientFirstName: 'SIPHO PHILLIPH ',
            fileNumber: 'ZDM-2026-1009',
            consentLink: 'https://x/y',
        });
        expect(e).toContain('Dear SIPHO PHILLIPH,');
    });

    it('builds a branded subject line with the file number', () => {
        expect(ACCEPTED_VIA_DHS_SUBJECT('ZDM-2026-096')).toBe(
            'Good News – Your Debt Review File Transfer Has Been Accepted (File: ZDM-2026-096)'
        );
    });
});
