'use client';
// ─── Smart Multi-Zone Link Router ─────────────────────────────────────────────
const currentPort = typeof window !== 'undefined' ? window.location.port : '';
const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

const getBaseUrls = (casesUrlProp: string, insuranceUrlProp: string, financeUrlProp: string) => {
    const isProd = currentHostname.includes('zenowethu.co.za');
    return {
        cases: isProd ? 'https://cases.zenowethu.co.za' : (casesUrlProp || 'http://localhost:3000'),
        insurance: isProd ? 'https://insurance.zenowethu.co.za' : (insuranceUrlProp || 'http://localhost:3001'),
        finance: isProd ? 'https://finance.zenowethu.co.za' : (financeUrlProp || 'http://localhost:3004'),
    };
};


import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type SidebarNavProps = {
    session: any;
    /** Base URL of the cases app. Defaults to 'http://localhost:3000' (or relative when already in the cases app). */
    casesUrl?: string;
    /** Base URL of the insurance app. Defaults to '' (relative — correct when already in the insurance app). */
    insuranceUrl?: string;
    /** Base URL of the finance app. Defaults to '' (relative — correct when already in the finance app). */
    financeUrl?: string;
};

export function SidebarNav({ session, casesUrl = '', insuranceUrl = '', financeUrl = '' }: SidebarNavProps) {
    const pathname = usePathname();
    const bases = getBaseUrls(casesUrl, insuranceUrl, financeUrl);
    
    function SmartLink({ href, className, children, ...props }: { href: string; className?: string; children: React.ReactNode }) {
        let targetApp: 'cases' | 'insurance' | 'finance' = 'cases';
        if (href.startsWith('/dccp')) {
            targetApp = 'insurance';
        } else if (
            href.startsWith('/accounts') ||
            href.startsWith('/invoices') ||
            href.startsWith('/revenue') ||
            href.startsWith('/credit-accounts') ||
            href.startsWith('/insurance-assessments') ||
            href.startsWith('/legal-matters') ||
            href.startsWith('/forensic-audits') ||
            href.startsWith('/audit-trail') ||
            href.startsWith('/settings/banking')
        ) {
            targetApp = 'finance';
        }
        
        const isCurrentApp = typeof window !== 'undefined' && (
            (targetApp === 'cases' && (currentPort === '3000' || currentHostname === 'cases.zenowethu.co.za')) ||
            (targetApp === 'insurance' && (currentPort === '3001' || currentHostname === 'insurance.zenowethu.co.za')) ||
            (targetApp === 'finance' && (currentPort === '3004' || currentHostname === 'finance.zenowethu.co.za'))
        );
        
        if (!isCurrentApp) {
            const baseUrl = bases[targetApp];
            return (
                <a href={`${baseUrl}${href}`} className={className} {...props}>
                    {children}
                </a>
            );
        }
        
        return (
            <Link href={href} className={className} {...props}>
                {children}
            </Link>
        );
    }

    const searchParams = useSearchParams();
    const currentProjectId = searchParams.get('projectId');
    const newCaseHref = currentProjectId ? `/cases/new?projectId=${currentProjectId}` : '/cases/new';

    const isAdmin = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager;
    const isFinance = isAdmin || session?.user?.role === 'FINANCE' || session?.user?.role === 'ACCOUNTS';

    return (
        <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">Menu</h3>
            <ul className="space-y-1">
                <li>
                    <SmartLink href="/" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/' ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        Dashboard
                    </SmartLink>
                </li>
                <li>
                    <SmartLink href={newCaseHref} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/cases/new' ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New Case
                    </SmartLink>
                </li>
                <li>
                    <SmartLink href="/cases" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/cases') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        All Cases
                    </SmartLink>
                </li>
                <li>
                    <SmartLink href="/leads" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/leads') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        Website Leads
                    </SmartLink>
                </li>
                <li>
                    <SmartLink href="/crediva-requests" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/crediva-requests') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Crediva Requests
                    </SmartLink>
                </li>
                <li>
                    <SmartLink href="/projects" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/projects') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        Projects
                    </SmartLink>
                </li>
                <li>
                    <SmartLink href="/admin/referrers" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/referrers') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Referrers
                    </SmartLink>
                </li>
                <li>
                    <SmartLink href="/resources" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/resources') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.141.021l6.267 6.366a1 1 0 01.021.141V19a2 2 0 01-2 2z" />
                        </svg>
                        Documents
                    </SmartLink>
                </li>
                <li>
                    <SmartLink href="/shosholoza" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/shosholoza') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                        </svg>
                        Shosholoza
                    </SmartLink>
                </li>
                {/* Visible to ALL staff (view-only for non-admins); editing on the page is gated server-side */}
                <li>
                    <SmartLink href="/admin/debt-counsellors" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/debt-counsellors') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        Debt Counsellors
                    </SmartLink>
                </li>
                {/* Visible to ALL staff (view-only for non-admins); editing on the page is gated server-side.
                    Deliberately not under /admin — see middleware.ts and the route's own comment. */}
                <li>
                    <SmartLink href="/credit-providers" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/credit-providers') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Credit Providers
                    </SmartLink>
                </li>
                {isAdmin && (
                    <>
                        <li className="mt-4 mb-2 px-2">
                            <div className="h-px bg-white/5"></div>
                            <h3 className="mt-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin</h3>
                        </li>
                        <li>
                            <SmartLink href="/admin" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/admin' ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                </svg>
                                Dashboard
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/admin/automations" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/automations') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Automations
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/admin/communications" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/communications') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                Failed Comms
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/admin/unanswered-emails" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/unanswered-emails') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                Unanswered Msgs
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/admin/partners" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/partners') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                Partners
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/admin/users" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/users') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                Users
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/compliance" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/compliance') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                </svg>
                                Compliance
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/admin/rate-tables" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/rate-tables') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                Rate Tables
                            </SmartLink>
                        </li>
                        {(session?.user?.isAdmin || session?.user?.isExecutive) && (
                            <li>
                                <SmartLink href="/admin/dhs-import" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/dhs-import') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    DHS Import
                                </SmartLink>
                            </li>
                        )}
                    </>
                )}
                {isFinance && (
                    <>
                        <li className="mt-4 mb-2 px-2">
                            <div className="h-px bg-white/5"></div>
                            <h3 className="mt-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Finance</h3>
                        </li>
                        <li>
                            <SmartLink href="/accounts" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/accounts' || pathname === '/accounts/dashboard' ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Payments
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/accounts/import" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/accounts/import') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Import Excel
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/invoices" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/invoices') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Invoices
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/revenue" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/revenue') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                                Revenue
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/credit-accounts" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/credit-accounts') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                                Credit Accounts
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/dccp" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/dccp') ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                DC Credit Protect
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/insurance-assessments" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/insurance-assessments') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Insurance
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/legal-matters" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/legal-matters') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                                </svg>
                                Legal Matters
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/forensic-audits" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/forensic-audits') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                Forensic Audits
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/audit-trail" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/audit-trail') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                Audit Trail
                            </SmartLink>
                        </li>
                        <li>
                            <SmartLink href="/settings/banking" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/settings/banking') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                                Banking Settings
                            </SmartLink>
                        </li>
                    </>
                )}
            </ul>
        </div>
    );
}
