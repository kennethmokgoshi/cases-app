import { describe, it, expect } from 'vitest';
import { normalisePhone, phoneVariants } from './leads';

describe('normalisePhone', () => {
    it('keeps a local number and strips formatting', () => {
        expect(normalisePhone('082 123 4567')).toBe('0821234567');
        expect(normalisePhone('(082) 123-4567')).toBe('0821234567');
    });

    it('converts +27 and 27 prefixes to local format', () => {
        expect(normalisePhone('+27 82 123 4567')).toBe('0821234567');
        expect(normalisePhone('27821234567')).toBe('0821234567');
    });

    it('leaves non-South-African numbers as digits only', () => {
        expect(normalisePhone('+44 20 7946 0958')).toBe('+442079460958');
    });
});

describe('phoneVariants', () => {
    it('returns local, +27 and 27 forms for a local number', () => {
        expect(phoneVariants('0821234567')).toEqual(['0821234567', '+27821234567', '27821234567']);
    });

    it('returns the input alone when it is not a local SA number', () => {
        expect(phoneVariants('+442079460958')).toEqual(['+442079460958']);
    });
});
