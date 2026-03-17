import { describe, it, expect } from 'vitest';
import {
    calculateRiskScore,
    extractAgeFromSAId,
    inferEmploymentStatus,
    type RiskScoreInput,
} from './risk-scoring';

// ─── extractAgeFromSAId ───────────────────────────────────────────────────────

describe('extractAgeFromSAId', () => {
    it('returns -1 for an ID shorter than 13 digits', () => {
        expect(extractAgeFromSAId('123456')).toBe(-1);
    });

    it('returns -1 for an ID with non-numeric characters', () => {
        expect(extractAgeFromSAId('8001015009A87')).toBe(-1);
    });

    it('returns -1 for an invalid month (00)', () => {
        expect(extractAgeFromSAId('8000015009087')).toBe(-1);
    });

    it('returns -1 for an invalid month (13)', () => {
        expect(extractAgeFromSAId('8013015009087')).toBe(-1);
    });

    it('returns a positive age for a valid 1980 birth ID', () => {
        // Born 1980-01-01 — age should be 45 or 46 depending on current date
        const age = extractAgeFromSAId('8001015009087');
        expect(age).toBeGreaterThan(40);
        expect(age).toBeLessThan(60);
    });

    it('returns a reasonable age for a 1990 birth year', () => {
        const age = extractAgeFromSAId('9001015009080');
        expect(age).toBeGreaterThan(30);
        expect(age).toBeLessThan(50);
    });
});

// ─── inferEmploymentStatus ────────────────────────────────────────────────────

describe('inferEmploymentStatus', () => {
    it('returns Unknown when employer and grossSalary are both absent', () => {
        expect(inferEmploymentStatus()).toBe('Unknown');
        expect(inferEmploymentStatus(null, null)).toBe('Unknown');
    });

    it('returns Pensioner for a SASSA employer', () => {
        expect(inferEmploymentStatus('SASSA Grant')).toBe('Pensioner');
    });

    it('returns Pensioner for pension in employer name', () => {
        expect(inferEmploymentStatus('Old Mutual Pension')).toBe('Pensioner');
    });

    it('returns Self-Employed for self-employed employer', () => {
        expect(inferEmploymentStatus('Self-Employed Plumber')).toBe('Self-Employed');
    });

    it('returns Self-Employed when own business is listed', () => {
        expect(inferEmploymentStatus('Own Business')).toBe('Self-Employed');
    });

    it('returns Employed when grossSalary is provided without employer', () => {
        expect(inferEmploymentStatus(undefined, 25000)).toBe('Employed');
    });

    it('returns Employed for a normal employer with salary', () => {
        expect(inferEmploymentStatus('Woolworths', 18000)).toBe('Employed');
    });
});

// ─── calculateRiskScore ───────────────────────────────────────────────────────

const baseInput: RiskScoreInput = {
    idNumber: '8001015009087', // ~45 years old
    employmentStatus: 'Employed',
    netSalary: 20000,
    totalOutstandingBalance: 80000,
    totalMonthlyInstalment: 4000, // DTI 20% — healthy
    activeAccountCount: 2,
};

describe('calculateRiskScore', () => {
    it('returns a score object with required fields', () => {
        const result = calculateRiskScore(baseInput);
        expect(result).toHaveProperty('totalScore');
        expect(result).toHaveProperty('tier');
        expect(result).toHaveProperty('factors');
        expect(result).toHaveProperty('flags');
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('scoredAt');
    });

    it('returns LOW tier for an ideal low-risk profile', () => {
        const result = calculateRiskScore(baseInput);
        expect(result.tier).toBe('LOW');
        expect(result.totalScore).toBeLessThanOrEqual(20);
    });

    it('returns VERY_HIGH tier for an unemployed, over-indebted profile', () => {
        const result = calculateRiskScore({
            ...baseInput,
            employmentStatus: 'Unemployed',
            netSalary: 5000,
            totalMonthlyInstalment: 8000, // DTI 160% — critical
            activeAccountCount: 15,
        });
        expect(result.tier).toBe('VERY_HIGH');
        expect(result.totalScore).toBeGreaterThan(65);
    });

    it('applies a -5 point bonus when client is in debt review', () => {
        const without = calculateRiskScore({ ...baseInput, employmentStatus: 'Self-Employed', netSalary: 10000, totalMonthlyInstalment: 6000 });
        const with_ = calculateRiskScore({ ...baseInput, employmentStatus: 'Self-Employed', netSalary: 10000, totalMonthlyInstalment: 6000, isInDebtReview: true });
        expect(with_.totalScore).toBeLessThan(without.totalScore);
    });

    it('clamps total score between 0 and 100', () => {
        const result = calculateRiskScore({
            ...baseInput,
            employmentStatus: 'Unemployed',
            netSalary: 0,
            totalOutstandingBalance: 5000000,
            totalMonthlyInstalment: 50000,
            activeAccountCount: 50,
        });
        expect(result.totalScore).toBeGreaterThanOrEqual(0);
        expect(result.totalScore).toBeLessThanOrEqual(100);
    });

    it('includes AGE_LIMIT_BREACH flag for client over 65', () => {
        // ID born 1950: 5001015009083
        const result = calculateRiskScore({ ...baseInput, idNumber: '5001015009083' });
        expect(result.flags).toContain('AGE_LIMIT_BREACH');
    });

    it('includes RETRENCHMENT_ILLEGAL_NCA flag for Pensioner', () => {
        const result = calculateRiskScore({ ...baseInput, employmentStatus: 'Pensioner' });
        expect(result.flags).toContain('RETRENCHMENT_ILLEGAL_NCA');
    });

    it('includes CRITICAL_DTI flag when DTI exceeds 70%', () => {
        const result = calculateRiskScore({ ...baseInput, netSalary: 10000, totalMonthlyInstalment: 8000 });
        expect(result.flags).toContain('CRITICAL_DTI');
    });

    it('scoredAt is a valid ISO datetime string', () => {
        const result = calculateRiskScore(baseInput);
        expect(() => new Date(result.scoredAt)).not.toThrow();
        expect(new Date(result.scoredAt).toISOString()).toBe(result.scoredAt);
    });
});
