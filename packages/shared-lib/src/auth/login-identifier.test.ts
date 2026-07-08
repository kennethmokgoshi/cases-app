import { describe, expect, it } from 'vitest';
import { buildUserLoginLookup, normalizeLoginIdentifier } from './login-identifier';

describe('login identifier helpers', () => {
    it('normalizes email-style identifiers for case-insensitive login', () => {
        expect(normalizeLoginIdentifier(' Kenneth@Zenowethu.CO.ZA ')).toBe('kenneth@zenowethu.co.za');
    });

    it('builds a user lookup that accepts either email or username', () => {
        expect(buildUserLoginLookup('8001015009087')).toEqual({
            OR: [
                { email: '8001015009087' },
                { username: '8001015009087' },
            ],
        });
    });
});
