// Finance app sidebar navigation — pure data + active-state logic so it can be
// unit-tested without rendering. All hrefs are relative: every page listed here
// exists inside apps/finance.

export type FinanceNavItem = {
    label: string;
    href: string;
    /** SVG path `d` for the 24x24 outline icon */
    iconPath: string;
    /** Tailwind accent for the active state */
    accent: 'cyan' | 'emerald' | 'orange';
};

export type FinanceNavSection = {
    title: string;
    items: FinanceNavItem[];
};

type SessionLike = {
    user?: {
        isAdmin?: boolean;
        isExecutive?: boolean;
        isSeniorManager?: boolean;
        role?: string;
    } | null;
} | null;

const ICONS = {
    home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    plus: 'M12 4v16m8-8H4',
    currency: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    upload: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
    clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    checkCircle: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    document: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    trendUp: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    chartBar: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2',
    folder: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    card: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
    shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    scales: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    building: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    briefcase: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    grid: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
    users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    rateTable: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    compliance: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
} as const;

export function buildFinanceNav(session: SessionLike): FinanceNavSection[] {
    const isAdmin = Boolean(
        session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager
    );

    const sections: FinanceNavSection[] = [
        {
            title: 'Finance',
            items: [
                { label: 'Dashboard', href: '/', iconPath: ICONS.home, accent: 'cyan' },
                { label: 'Record Payment', href: '/payments/record', iconPath: ICONS.plus, accent: 'emerald' },
                { label: 'Payments', href: '/payments', iconPath: ICONS.currency, accent: 'emerald' },
                { label: 'Import Batch', href: '/batches/upload', iconPath: ICONS.upload, accent: 'emerald' },
                { label: 'Payment Batches', href: '/batches', iconPath: ICONS.clipboard, accent: 'emerald' },
                { label: 'Reconciliation', href: '/reconciliation', iconPath: ICONS.checkCircle, accent: 'emerald' },
                { label: 'Quotes', href: '/quotes', iconPath: ICONS.clipboard, accent: 'emerald' },
                { label: 'Invoices', href: '/invoices', iconPath: ICONS.document, accent: 'emerald' },
                { label: 'Outstanding Fees', href: '/outstanding-fees', iconPath: ICONS.document, accent: 'emerald' },
                { label: 'Revenue', href: '/revenue', iconPath: ICONS.trendUp, accent: 'emerald' },
                { label: 'Financial Reports', href: '/reports', iconPath: ICONS.chartBar, accent: 'emerald' },
            ],
        },
        {
            title: 'Operations',
            items: [
                { label: 'Cases', href: '/cases', iconPath: ICONS.folder, accent: 'cyan' },
                { label: 'Credit Accounts', href: '/credit-accounts', iconPath: ICONS.card, accent: 'cyan' },
                { label: 'Insurance Assessments', href: '/insurance-assessments', iconPath: ICONS.shield, accent: 'cyan' },
                { label: 'Legal Matters', href: '/legal-matters', iconPath: ICONS.scales, accent: 'cyan' },
                { label: 'Forensic Audits', href: '/forensic-audits', iconPath: ICONS.search, accent: 'cyan' },
                { label: 'B2B Portal', href: '/b2b-portal', iconPath: ICONS.building, accent: 'cyan' },
                { label: 'Projects', href: '/projects', iconPath: ICONS.briefcase, accent: 'cyan' },
                { label: 'Documents', href: '/resources', iconPath: ICONS.document, accent: 'cyan' },
            ],
        },
    ];

    if (isAdmin) {
        sections.push({
            title: 'Admin',
            items: [
                { label: 'Admin Dashboard', href: '/admin', iconPath: ICONS.grid, accent: 'orange' },
                { label: 'Partners', href: '/admin/partners', iconPath: ICONS.building, accent: 'orange' },
                { label: 'Rate Tables', href: '/admin/rate-tables', iconPath: ICONS.rateTable, accent: 'orange' },
                { label: 'Users', href: '/admin/users', iconPath: ICONS.users, accent: 'orange' },
                { label: 'Audit Trail', href: '/audit-trail', iconPath: ICONS.clipboard, accent: 'orange' },
                { label: 'Compliance', href: '/compliance', iconPath: ICONS.compliance, accent: 'orange' },
                { label: 'Banking Settings', href: '/settings/banking', iconPath: ICONS.card, accent: 'orange' },
            ],
        });
    }

    return sections;
}

/**
 * Returns the href of the single nav item that should be highlighted for the
 * current pathname: the longest href that is the pathname itself or one of its
 * ancestors. Prevents '/payments' and '/payments/record' both lighting up.
 */
export function findActiveHref(sections: FinanceNavSection[], pathname: string): string | null {
    let best: string | null = null;
    for (const section of sections) {
        for (const item of section.items) {
            const matches =
                item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
            if (matches && (best === null || item.href.length > best.length)) {
                best = item.href;
            }
        }
    }
    return best;
}
