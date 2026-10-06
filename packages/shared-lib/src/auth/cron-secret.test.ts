import { describe, it, expect, afterEach } from 'vitest';
import { secretsMatch, isValidCronSecret, isValidCronBearer } from './cron-secret';

const original = process.env.CRON_SECRET;
afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
});

describe('secretsMatch', () => {
    it('matches identical secrets', () => {
        expect(secretsMatch('s3cret-value', 's3cret-value')).toBe(true);
    });

    it.each([
        ['s3cret-valuE', 's3cret-value'],
        ['s3cret', 's3cret-value'],
        ['s3cret-value-and-more', 's3cret-value'],
        ['', 's3cret'],
        [null, 's3cret'],
        ['s3cret', undefined],
        ['', ''],
    ])('rejects %j vs %j', (a, b) => {
        expect(secretsMatch(a, b)).toBe(false);
    });
});

describe('isValidCronSecret', () => {
    it('accepts the configured secret', () => {
        process.env.CRON_SECRET = 'abc123';
        expect(isValidCronSecret('abc123')).toBe(true);
        expect(isValidCronSecret('abc124')).toBe(false);
    });

    it('never passes when CRON_SECRET is unset', () => {
        delete process.env.CRON_SECRET;
        expect(isValidCronSecret('undefined')).toBe(false);
        expect(isValidCronSecret('')).toBe(false);
    });
});

describe('isValidCronBearer', () => {
    it('requires the Bearer prefix and the right secret', () => {
        process.env.CRON_SECRET = 'abc123';
        expect(isValidCronBearer('Bearer abc123')).toBe(true);
        expect(isValidCronBearer('abc123')).toBe(false);
        expect(isValidCronBearer('Bearer wrong')).toBe(false);
        expect(isValidCronBearer(null)).toBe(false);
    });

    it('rejects "Bearer undefined" when CRON_SECRET is unset', () => {
        delete process.env.CRON_SECRET;
        expect(isValidCronBearer('Bearer undefined')).toBe(false);
    });
});
