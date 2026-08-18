import { describe, it, expect } from 'vitest';
import { CaseCreateSchema, CasePatchSchema, isProvisionalIdNumber } from './schemas';

// ─── CaseCreateSchema ─────────────────────────────────────────────────────────

describe('CaseCreateSchema', () => {
    const validClient = {
        firstName: 'Jane',
        lastName: 'Smith',
        idNumber: '9001015009087',
        email: 'jane@example.com' };
    const valid = { client: validClient, projectId: 'proj-123' };

    it('passes with a client that has an email address', () => {
        expect(CaseCreateSchema.safeParse(valid).success).toBe(true);
    });

    it('fails when the client has no email address', () => {
        const { email, ...clientWithoutEmail } = validClient;
        const result = CaseCreateSchema.safeParse({ client: clientWithoutEmail, projectId: 'proj-123' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(i => i.path.join('.') === 'client.email')).toBe(true);
        }
    });

    it('fails when the client email is null', () => {
        const result = CaseCreateSchema.safeParse({
            client: { ...validClient, email: null },
            projectId: 'proj-123' });
        expect(result.success).toBe(false);
    });

    it('fails when the client email is malformed', () => {
        const result = CaseCreateSchema.safeParse({
            client: { ...validClient, email: 'not-an-email' },
            projectId: 'proj-123' });
        expect(result.success).toBe(false);
    });

    it('allows a provisional shell through without an email', () => {
        const result = CaseCreateSchema.safeParse({
            client: { firstName: 'Temp', lastName: 'Processing', idNumber: 'TEMP-1712345678901' },
            projectId: 'proj-123' });
        expect(result.success).toBe(true);
    });
});

// ─── CasePatchSchema ──────────────────────────────────────────────────────────

describe('CasePatchSchema', () => {
    it('allows a client patch that does not touch the email address', () => {
        expect(CasePatchSchema.safeParse({ client: { phone: '0821234567' } }).success).toBe(true);
    });

    it('allows a client patch that sets a valid email address', () => {
        expect(CasePatchSchema.safeParse({ client: { email: 'jane@example.com' } }).success).toBe(true);
    });

    it('refuses to blank out an email address', () => {
        expect(CasePatchSchema.safeParse({ client: { email: '' } }).success).toBe(false);
        expect(CasePatchSchema.safeParse({ client: { email: null } }).success).toBe(false);
    });
});

// ─── isProvisionalIdNumber ────────────────────────────────────────────────────

describe('isProvisionalIdNumber', () => {
    it('recognises the shell ID numbers the new-case flow generates', () => {
        expect(isProvisionalIdNumber('TEMP-1712345678901')).toBe(true);
        expect(isProvisionalIdNumber('MANUAL-1')).toBe(true);
    });

    it('does not misread real or absent ID numbers as provisional', () => {
        expect(isProvisionalIdNumber('9001015009087')).toBe(false);
        expect(isProvisionalIdNumber('TEMPORARY-1')).toBe(false);
        expect(isProvisionalIdNumber(null)).toBe(false);
        expect(isProvisionalIdNumber(undefined)).toBe(false);
    });
});
