import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

vi.mock('next/link', () => ({
    default: ({ href, children, className }: any) =>
        React.createElement('a', { href, className }, children),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/payments/record',
}));

import { FinanceSidebarNav } from './FinanceSidebarNav';

describe('FinanceSidebarNav', () => {
    it('renders all finance links for an admin session', () => {
        const html = renderToStaticMarkup(
            React.createElement(FinanceSidebarNav, { session: { user: { isAdmin: true } } })
        );
        for (const label of ['Record Payment', 'Payments', 'Import Batch', 'Reconciliation', 'Quotes', 'Invoices', 'Revenue', 'Financial Reports', 'Banking Settings']) {
            expect(html).toContain(label);
        }
        expect(html).toContain('Admin');
    });

    it('hides the Admin section for non-admin staff', () => {
        const html = renderToStaticMarkup(
            React.createElement(FinanceSidebarNav, { session: { user: { role: 'FINANCE' } } })
        );
        expect(html).not.toContain('Banking Settings');
        expect(html).toContain('Record Payment');
    });

    it('highlights only the most specific active link', () => {
        const html = renderToStaticMarkup(
            React.createElement(FinanceSidebarNav, { session: { user: {} } })
        );
        // pathname is /payments/record — Record Payment active, Payments not
        const activeCount = (html.match(/bg-emerald-500\/10/g) || []).length;
        expect(activeCount).toBe(1);
    });
});
