import { describe, it, expect } from 'vitest';
import { buildFinanceNav, findActiveHref } from './finance-nav-items';

const adminSession = { user: { isAdmin: true } };
const staffSession = { user: { role: 'FINANCE' } };

describe('buildFinanceNav', () => {
    it('returns Finance and Operations sections for non-admin staff', () => {
        const sections = buildFinanceNav(staffSession);
        expect(sections.map(s => s.title)).toEqual(['Finance', 'Operations']);
    });

    it('includes the Admin section for admins, executives and senior managers', () => {
        for (const user of [{ isAdmin: true }, { isExecutive: true }, { isSeniorManager: true }]) {
            const sections = buildFinanceNav({ user });
            expect(sections.map(s => s.title)).toContain('Admin');
        }
    });

    it('contains the core finance actions: record payment, payments, batches, reports', () => {
        const hrefs = buildFinanceNav(adminSession).flatMap(s => s.items.map(i => i.href));
        expect(hrefs).toEqual(expect.arrayContaining([
            '/',
            '/payments/record',
            '/payments',
            '/batches/upload',
            '/batches',
            '/reconciliation',
            '/invoices',
            '/revenue',
            '/reports',
        ]));
    });

    it('handles a null session without crashing', () => {
        const sections = buildFinanceNav(null);
        expect(sections.map(s => s.title)).toEqual(['Finance', 'Operations']);
    });

    it('has no duplicate hrefs', () => {
        const hrefs = buildFinanceNav(adminSession).flatMap(s => s.items.map(i => i.href));
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });
});

describe('findActiveHref', () => {
    const sections = buildFinanceNav(adminSession);

    it('matches the dashboard only on the exact root path', () => {
        expect(findActiveHref(sections, '/')).toBe('/');
        expect(findActiveHref(sections, '/payments')).not.toBe('/');
    });

    it('prefers the most specific match — /payments/record over /payments', () => {
        expect(findActiveHref(sections, '/payments/record')).toBe('/payments/record');
        expect(findActiveHref(sections, '/payments')).toBe('/payments');
    });

    it('matches child routes by prefix — /invoices/abc123 highlights Invoices', () => {
        expect(findActiveHref(sections, '/invoices/abc123')).toBe('/invoices');
    });

    it('does not false-match sibling prefixes — /batches-x is not /batches', () => {
        expect(findActiveHref(sections, '/batches-x')).toBeNull();
    });

    it('returns null for unknown paths', () => {
        expect(findActiveHref(sections, '/no-such-page')).toBeNull();
    });
});
