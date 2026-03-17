import { describe, it, expect } from 'vitest';
import { checkPrescription, getRetentionExpiry, RETENTION_PERIODS } from './legal-engine';

// ─── checkPrescription ────────────────────────────────────────────────────────

describe('checkPrescription', () => {
    const yearsAgo = (n: number) => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - n);
        return d;
    };

    it('returns isPrescribed=true when last payment was more than 3 years ago with no summons', () => {
        const result = checkPrescription(yearsAgo(4));
        expect(result.isPrescribed).toBe(true);
        expect(result.reason).toContain('3 years');
    });

    it('returns isPrescribed=false when last payment was less than 3 years ago', () => {
        const result = checkPrescription(yearsAgo(1));
        expect(result.isPrescribed).toBe(false);
    });

    it('returns isPrescribed=false when debt is exactly at the 3-year boundary (2 years 11 months)', () => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 2);
        d.setMonth(d.getMonth() - 11);
        const result = checkPrescription(d);
        expect(result.isPrescribed).toBe(false);
    });

    it('is NOT prescribed when summons was issued before the prescription date', () => {
        const lastPayment = yearsAgo(4);
        const summonsDate = yearsAgo(2); // summons at 2 years — within 3-year window from payment
        const result = checkPrescription(lastPayment, summonsDate);
        expect(result.isPrescribed).toBe(false);
        expect(result.reason).toContain('Summons');
    });

    it('IS prescribed when summons was issued after the prescription date', () => {
        const lastPayment = yearsAgo(5);
        // Prescription date = 5 years ago + 3 years = 2 years ago
        // Summons issued 1 year ago — after prescription
        const summonsDate = yearsAgo(1);
        const result = checkPrescription(lastPayment, summonsDate);
        expect(result.isPrescribed).toBe(true);
    });
});

// ─── getRetentionExpiry ───────────────────────────────────────────────────────

describe('getRetentionExpiry', () => {
    it('adds 1 year for ADVERSE category', () => {
        const listing = new Date('2022-06-15');
        const expiry = getRetentionExpiry('ADVERSE', listing);
        expect(expiry.getFullYear()).toBe(2023);
        expect(expiry.getMonth()).toBe(listing.getMonth());
        expect(expiry.getDate()).toBe(listing.getDate());
    });

    it('adds 5 years for JUDGMENT category', () => {
        const listing = new Date('2020-01-01');
        const expiry = getRetentionExpiry('JUDGMENT', listing);
        expect(expiry.getFullYear()).toBe(2025);
    });

    it('adds 5 years for ADMINISTRATION category', () => {
        const listing = new Date('2019-03-10');
        const expiry = getRetentionExpiry('ADMINISTRATION', listing);
        expect(expiry.getFullYear()).toBe(2024);
    });

    it('adds 5 years for SEQUESTRATION category', () => {
        const listing = new Date('2018-12-01');
        const expiry = getRetentionExpiry('SEQUESTRATION', listing);
        expect(expiry.getFullYear()).toBe(2023);
    });

    it('adds 1 year for ENQUIRY category', () => {
        const listing = new Date('2023-07-20');
        const expiry = getRetentionExpiry('ENQUIRY', listing);
        expect(expiry.getFullYear()).toBe(2024);
    });

    it('adds 5 years for PAYMENT_PROFILE category', () => {
        const listing = new Date('2021-11-05');
        const expiry = getRetentionExpiry('PAYMENT_PROFILE', listing);
        expect(expiry.getFullYear()).toBe(2026);
    });

    it('does not mutate the original listing date', () => {
        const listing = new Date('2022-06-15');
        const originalTime = listing.getTime();
        getRetentionExpiry('ADVERSE', listing);
        expect(listing.getTime()).toBe(originalTime);
    });
});

// ─── RETENTION_PERIODS constants ──────────────────────────────────────────────

describe('RETENTION_PERIODS', () => {
    it('ADVERSE is 1 year', () => expect(RETENTION_PERIODS.ADVERSE).toBe(1));
    it('JUDGMENT is 5 years', () => expect(RETENTION_PERIODS.JUDGMENT).toBe(5));
    it('ADMINISTRATION is 5 years', () => expect(RETENTION_PERIODS.ADMINISTRATION).toBe(5));
    it('SEQUESTRATION is 5 years', () => expect(RETENTION_PERIODS.SEQUESTRATION).toBe(5));
    it('ENQUIRY is 1 year', () => expect(RETENTION_PERIODS.ENQUIRY).toBe(1));
    it('PAYMENT_PROFILE is 5 years', () => expect(RETENTION_PERIODS.PAYMENT_PROFILE).toBe(5));
});
