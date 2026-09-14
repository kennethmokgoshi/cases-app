import { describe, it, expect } from 'vitest';
import { resolveContact, describeContactFallback } from './branch-contact';

const branch = {
    name: 'Mthata',
    email: 'mthata@partner.example',
    phone: '047 000 0000',
    alternatePhone: '047 111 1111',
    whatsappNumber: '082 000 0000',
    isActive: true };

const referrer = {
    firstName: 'Nomsa',
    lastName: 'Dlamini',
    email: 'nomsa@partner.example',
    cellNumber: '083 555 4444',
    isActive: true };

describe('resolveContact — consumer tier', () => {
    it('uses the consumer’s own details when they have them', () => {
        const resolved = resolveContact(
            { email: 'consumer@example.com', phone: '0821234567', whatsapp: '0821234567' },
            branch,
            referrer
        );

        expect(resolved.email).toBe('consumer@example.com');
        expect(resolved.emailSource).toBe('CONSUMER');
        expect(resolved.phone).toBe('0821234567');
        expect(resolved.phoneSource).toBe('CONSUMER');
        expect(resolved.usedFallback).toBe(false);
        expect(resolved.branchName).toBeNull();
        expect(resolved.referrerName).toBeNull();
    });

    it('treats blank and whitespace-only values as missing', () => {
        const resolved = resolveContact({ email: '   ', phone: '\t' }, branch);

        expect(resolved.emailSource).toBe('BRANCH');
        expect(resolved.phoneSource).toBe('BRANCH');
    });

    it('trims stored values so a padded detail is still usable', () => {
        expect(resolveContact({ email: '  consumer@example.com  ' }, null).email).toBe('consumer@example.com');
    });
});

describe('resolveContact — branch tier', () => {
    it('falls back to the branch when the consumer has nothing', () => {
        const resolved = resolveContact({ email: null, phone: null }, branch);

        expect(resolved.email).toBe('mthata@partner.example');
        expect(resolved.emailSource).toBe('BRANCH');
        expect(resolved.phone).toBe('047 000 0000');
        expect(resolved.phoneSource).toBe('BRANCH');
        expect(resolved.whatsapp).toBe('082 000 0000');
        expect(resolved.usedFallback).toBe(true);
        expect(resolved.branchName).toBe('Mthata');
    });

    it('falls back per channel — a consumer with a cell but no email keeps their cell', () => {
        const resolved = resolveContact({ email: '', phone: '0821234567' }, branch);

        expect(resolved.email).toBe('mthata@partner.example');
        expect(resolved.emailSource).toBe('BRANCH');
        expect(resolved.phone).toBe('0821234567');
        expect(resolved.phoneSource).toBe('CONSUMER');
    });

    it('uses the branch alternate phone when it has no primary phone', () => {
        const resolved = resolveContact(
            { phone: null },
            { name: 'Bree', phone: null, alternatePhone: '011 222 3333', isActive: true }
        );

        expect(resolved.phone).toBe('011 222 3333');
        expect(resolved.phoneSource).toBe('BRANCH');
    });

    it('never falls back to an inactive branch', () => {
        const resolved = resolveContact({ email: null, phone: null }, { ...branch, isActive: false });

        expect(resolved.email).toBeNull();
        expect(resolved.emailSource).toBe('NONE');
        expect(resolved.usedFallback).toBe(false);
    });
});

describe('resolveContact — referrer tier', () => {
    it('falls through to the referrer when there is no branch', () => {
        const resolved = resolveContact({ email: null, phone: null }, null, referrer);

        expect(resolved.email).toBe('nomsa@partner.example');
        expect(resolved.emailSource).toBe('REFERRER');
        expect(resolved.phone).toBe('083 555 4444');
        expect(resolved.phoneSource).toBe('REFERRER');
        expect(resolved.referrerName).toBe('Nomsa Dlamini');
        expect(resolved.usedFallback).toBe(true);
    });

    it('prefers the branch over the referrer — a branch is always a business office', () => {
        const resolved = resolveContact({ email: null, phone: null }, branch, referrer);

        expect(resolved.emailSource).toBe('BRANCH');
        expect(resolved.email).toBe('mthata@partner.example');
        expect(resolved.branchName).toBe('Mthata');
        expect(resolved.referrerName).toBeNull();
    });

    it('reaches the referrer for channels the branch cannot cover', () => {
        const emailOnlyBranch = { name: 'Bree', email: 'bree@partner.example', phone: null, isActive: true };
        const resolved = resolveContact({ email: null, phone: null }, emailOnlyBranch, referrer);

        expect(resolved.emailSource).toBe('BRANCH');
        expect(resolved.phone).toBe('083 555 4444');
        expect(resolved.phoneSource).toBe('REFERRER');
        expect(resolved.branchName).toBe('Bree');
        expect(resolved.referrerName).toBe('Nomsa Dlamini');
    });

    it('uses the referrer cell number for WhatsApp too', () => {
        const resolved = resolveContact({}, null, referrer);
        expect(resolved.whatsapp).toBe('083 555 4444');
        expect(resolved.whatsappSource).toBe('REFERRER');
    });

    it('never falls back to an inactive referrer', () => {
        const resolved = resolveContact({ email: null, phone: null }, null, { ...referrer, isActive: false });

        expect(resolved.emailSource).toBe('NONE');
        expect(resolved.usedFallback).toBe(false);
    });

    it('handles a referrer recorded with only a first name', () => {
        const resolved = resolveContact({}, null, { firstName: 'Athlone', email: 'athlone@partner.example' });
        expect(resolved.referrerName).toBe('Athlone');
    });
});

describe('resolveContact — nothing available', () => {
    it('defaults WhatsApp to the consumer phone number', () => {
        const resolved = resolveContact({ phone: '0821234567' }, null);
        expect(resolved.whatsapp).toBe('0821234567');
        expect(resolved.whatsappSource).toBe('CONSUMER');
    });

    it('reports NONE when no tier can be reached', () => {
        const resolved = resolveContact({ email: null, phone: null }, null, null);

        expect(resolved.email).toBeNull();
        expect(resolved.phone).toBeNull();
        expect(resolved.emailSource).toBe('NONE');
        expect(resolved.phoneSource).toBe('NONE');
        expect(resolved.usedFallback).toBe(false);
    });
});

describe('describeContactFallback', () => {
    it('returns null when nothing fell back', () => {
        expect(describeContactFallback(resolveContact({ email: 'a@b.com', phone: '0821234567' }, branch))).toBeNull();
    });

    it('names the branch and the channels that fell back', () => {
        expect(describeContactFallback(resolveContact({ phone: '0821234567' }, branch))).toBe(
            'Consumer has no email contact — sent to Mthata instead.'
        );
    });

    it('names both sources when the chain used each of them', () => {
        const emailOnlyBranch = { name: 'Bree', email: 'bree@partner.example', phone: null, isActive: true };
        const described = describeContactFallback(resolveContact({}, emailOnlyBranch, referrer));

        expect(described).toContain('sent to Bree instead');
        expect(described).toContain('sent to Nomsa Dlamini instead');
    });
});
