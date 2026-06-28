import { describe, it, expect } from 'vitest';
import { buildAcceptedViaDhsEmail, ACCEPTED_VIA_DHS_SUBJECT } from './accepted-email';

describe('buildAcceptedViaDhsEmail', () => {
    const email = buildAcceptedViaDhsEmail({
        clientFirstName: 'Thabo',
        fileNumber: 'ZDM-2026-096',
        consentLink: 'https://cases.zenowethu.co.za/consent/debt-review-removal/abc123',
    });

    it('greets the consumer and confirms acceptance via DHS', () => {
        expect(email).toContain('Dear Thabo');
        expect(email).toContain('ACCEPTED');
        expect(email).toContain('Debt Help System (DHS)');
        expect(email).toContain('ZDM-2026-096');
    });

    it('includes the consent link and asks for consent', () => {
        expect(email).toContain('https://cases.zenowethu.co.za/consent/debt-review-removal/abc123');
        expect(email).toMatch(/your consent/i);
    });

    it('tells the consumer we are starting the flag removal process', () => {
        expect(email).toMatch(/removing the debt review flag/i);
    });

    it('avoids overpromising — no guarantees or fixed timelines', () => {
        expect(email).not.toMatch(/guarantee/i);
        expect(email).toMatch(/timelines depend on/i);
    });

    it('includes the Zenowethu signature block', () => {
        expect(email).toContain('Aaron Nzotho | NCRDC3693');
        expect(email).toContain('Member of DCASA');
    });

    it('builds a branded subject line with the file number', () => {
        expect(ACCEPTED_VIA_DHS_SUBJECT('ZDM-2026-096')).toBe(
            'Good News – Your Debt Review File Has Been Accepted (File: ZDM-2026-096)'
        );
    });
});
