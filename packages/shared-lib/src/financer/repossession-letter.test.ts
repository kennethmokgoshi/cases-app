import { describe, expect, it } from 'vitest';
import { ZENOWETHU_COMPANY_PROFILE } from '../company/profile';
import {
    buildRepossessionEnquiryLetter,
    describeVehicle,
    formatLetterDate,
    isLikelyVehicleAccount,
    type RepossessionLetterInput,
} from './repossession-letter';

// Wednesday 7 October 2026
const ISSUED = new Date(2026, 9, 7);

const BASE: RepossessionLetterInput = {
    company: ZENOWETHU_COMPANY_PROFILE,
    clientName: 'Thabo Mokoena',
    idNumber: '8001015009087',
    financerName: 'WesBank',
    accountNumber: '1234-5678',
    vehicleDescription: 'Toyota Hilux 2.4 GD-6 2021',
    registrationNumber: 'abc123gp',
    signerName: 'Aaron Nzotho',
    issuedOn: ISSUED,
    replyWithinBusinessDays: 5,
    pauseBusinessDays: 10,
    attachedLabel: 'signed Power of Attorney and identity document',
};

describe('buildRepossessionEnquiryLetter', () => {
    it('identifies the consumer, financer, account and vehicle', () => {
        const { subject, body } = buildRepossessionEnquiryLetter(BASE);

        expect(subject).toContain('Thabo Mokoena');
        expect(subject).toContain('8001015009087');
        expect(subject).toContain('1234-5678');
        expect(body).toContain('To: WesBank');
        expect(body).toContain('Toyota Hilux 2.4 GD-6 2021, Reg ABC123GP');
    });

    it('never claims the consumer is under debt review', () => {
        const { body } = buildRepossessionEnquiryLetter(BASE);

        expect(body).toContain('No application for debt review has been lodged at this stage');
        expect(body).toContain('considering an application for debt review');
        expect(body).not.toMatch(/section 88/i);
        expect(body).not.toMatch(/interdict/i);
        expect(body).not.toMatch(/is under debt review/i);
    });

    it('asks for the court-order facts', () => {
        const { body } = buildRepossessionEnquiryLetter(BASE);

        expect(body).toContain('section 129 notice');
        expect(body).toContain('summons');
        expect(body).toContain('judgment or court order');
        expect(body).toContain('warrant or writ');
        expect(body).toContain('statement of account');
        expect(body).toContain('copy of the credit agreement');
    });

    it('treats the pause as a request, not a demand', () => {
        const { body } = buildRepossessionEnquiryLetter(BASE);

        expect(body).toContain('We request that');
        expect(body).not.toMatch(/\byou must\b|\bdemand\b/i);
    });

    it('computes reply and pause dates in business days', () => {
        const { replyBy, pauseUntil, body } = buildRepossessionEnquiryLetter(BASE);

        // Wed 7 Oct + 5 business days = Wed 14 Oct; + 10 = Wed 21 Oct
        expect(formatLetterDate(replyBy)).toBe('14 October 2026');
        expect(formatLetterDate(pauseUntil)).toBe('21 October 2026');
        expect(body).toContain('by 14 October 2026');
        expect(body).toContain('until 21 October 2026');
    });

    it('prints company details from the profile, not hard-coded text', () => {
        const other = {
            ...ZENOWETHU_COMPANY_PROFILE,
            tradingName: 'Acme Debt Solutions',
            ncrdcNumber: 'NCRDC9999',
            email: 'hello@acme.example',
        };
        const { body } = buildRepossessionEnquiryLetter({ ...BASE, company: other });

        expect(body).toContain('Acme Debt Solutions is a registered debt counsellor, NCRDC 9999');
        expect(body).toContain('hello@acme.example');
        expect(body).not.toContain('Zenowethu');
    });

    it('omits the vehicle line gracefully when staff do not have it', () => {
        const { body } = buildRepossessionEnquiryLetter({
            ...BASE,
            vehicleDescription: '',
            registrationNumber: '',
        });

        expect(body).toContain('Re: Thabo Mokoena, ID 8001015009087, Account 1234-5678');
        expect(body).not.toContain('Reg ');
    });

    it('says the account number is unconfirmed rather than printing "null"', () => {
        const { subject, body } = buildRepossessionEnquiryLetter({ ...BASE, accountNumber: null });

        expect(subject).toContain('not yet confirmed');
        expect(body).not.toContain('null');
    });

    it('only claims the attachments it is told are attached', () => {
        const { body } = buildRepossessionEnquiryLetter({ ...BASE, attachedLabel: 'signed Power of Attorney' });
        expect(body).toContain('under the attached signed Power of Attorney.');
    });
});

describe('describeVehicle', () => {
    it('combines description and upper-cased registration', () => {
        expect(describeVehicle('VW Polo', 'cy 123 gp')).toBe('VW Polo, Reg CY 123 GP');
    });
    it('handles one part only, or none', () => {
        expect(describeVehicle('VW Polo', '')).toBe('VW Polo');
        expect(describeVehicle('', 'abc1gp')).toBe('Reg ABC1GP');
        expect(describeVehicle(null, undefined)).toBeNull();
    });
});

describe('isLikelyVehicleAccount', () => {
    it('recognises vehicle finance by type or financer name', () => {
        expect(isLikelyVehicleAccount('Vehicle Finance', 'Standard Bank')).toBe(true);
        expect(isLikelyVehicleAccount('Instalment Sale', 'ABSA')).toBe(true);
        expect(isLikelyVehicleAccount('Loan', 'WesBank')).toBe(true);
        expect(isLikelyVehicleAccount('Loan', 'MFC')).toBe(true);
    });
    it('does not flag ordinary accounts or match inside longer words', () => {
        expect(isLikelyVehicleAccount('Personal Loan', 'Capitec')).toBe(false);
        expect(isLikelyVehicleAccount('Retail', 'Mr Price')).toBe(false);
        expect(isLikelyVehicleAccount('Loan', 'Okiawa Finance')).toBe(false);
    });
});
