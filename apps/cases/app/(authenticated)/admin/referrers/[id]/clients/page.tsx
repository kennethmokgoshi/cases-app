'use client';

import { useSession } from '@zenowethu/ui';
import { getWorkflowInfo, formatStatus } from '@/lib/workflow-progress';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { portalStatusTone } from '@/lib/referrer-portal';

type ReferralFilterId =
    | ''
    | 'clients'
    | 'in-progress'
    | 'completed'
    | 'settled'
    | 'lost'
    | 'total-cases'
    | 'new-this-month'
    | 'converted'
    | 'in-arrears'
    // money filters
    | 'quoted'
    | 'expected-revenue'
    | 'completed-outstanding'
    | 'paid'
    | 'settled-paid'
    // quote stats filters
    | 'not-quoted'
    | 'total-quotes'
    | 'accepted-quotes'
    | 'pending-quotes'
    | 'declined-quotes';

type CommissionStage =
    | 'NEW_LEAD' | 'ADMIN_FEE_PAID' | 'QUOTE_SUBMITTED' | 'QUOTE_ACCEPTED'
    | 'DEPOSIT_PAID' | 'PAYING_INSTALMENTS' | 'UP_TO_DATE'
    | 'ARREARS_1M' | 'ARREARS_2M' | 'ARREARS_3M' | 'ARREARS_4M_PLUS'
    | 'HANDED_OVER' | 'SETTLED';

const STAGE_LABELS: Record<string, string> = {
    NO_RECORD:         'Intake',
    NEW_LEAD:          'New Lead',
    ADMIN_FEE_PAID:    'Admin Fee Paid',
    QUOTE_SUBMITTED:   'Quote Submitted',
    QUOTE_ACCEPTED:    'Quote Accepted',
    DEPOSIT_PAID:      'Deposit Paid',
    PAYING_INSTALMENTS:'Paying Instalments',
    UP_TO_DATE:        'Up to Date',
    ARREARS_1M:        '1 Month in Arrears',
    ARREARS_2M:        '2 Months in Arrears',
    ARREARS_3M:        '3 Months in Arrears',
    ARREARS_4M_PLUS:   '4+ Months in Arrears',
    HANDED_OVER:       'Handed Over',
    SETTLED:           'Settled',
};

const STAGE_ORDER = [
    'NO_RECORD', 'NEW_LEAD', 'ADMIN_FEE_PAID', 'QUOTE_SUBMITTED', 'QUOTE_ACCEPTED',
    'DEPOSIT_PAID', 'PAYING_INSTALMENTS', 'UP_TO_DATE',
    'ARREARS_1M', 'ARREARS_2M', 'ARREARS_3M', 'ARREARS_4M_PLUS',
    'HANDED_OVER', 'SETTLED',
];

const GOOD_STAGES = new Set(['DEPOSIT_PAID', 'PAYING_INSTALMENTS', 'UP_TO_DATE', 'SETTLED']);
const RISK_STAGES = new Set(['ARREARS_1M', 'ARREARS_2M', 'ARREARS_3M', 'ARREARS_4M_PLUS', 'HANDED_OVER']);

function stageChipColor(stage: string) {
    if (GOOD_STAGES.has(stage)) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (RISK_STAGES.has(stage)) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-blue-300 bg-blue-500/10 border-blue-500/30';
}

const CONVERTED_STAGES = new Set<CommissionStage>(['DEPOSIT_PAID', 'PAYING_INSTALMENTS', 'UP_TO_DATE', 'SETTLED']);
const ARREARS_STAGES = new Set<CommissionStage>(['ARREARS_1M', 'ARREARS_2M', 'ARREARS_3M', 'ARREARS_4M_PLUS']);

function isInCalendarMonth(value: string | null, monthOffset: 0 | 1): boolean {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
}

const REFERRAL_FILTERS: Record<Exclude<ReferralFilterId, ''>, { label: string; matches: (row: ReferredClient) => boolean }> = {
    'clients': { label: 'Clients', matches: () => true },
    'in-progress': { label: 'In Progress', matches: (row) => {
        const tone = portalStatusTone(row.caseStatus);
        return tone !== 'settled' && tone !== 'completed' && tone !== 'lost';
    }},
    'completed': { label: 'Completed', matches: (row) => portalStatusTone(row.caseStatus) === 'completed' },
    'settled': { label: 'Settled', matches: (row) => portalStatusTone(row.caseStatus) === 'settled' },
    'lost': { label: 'Lost', matches: (row) => portalStatusTone(row.caseStatus) === 'lost' },
    'total-cases': { label: 'Total Cases', matches: () => true },
    'new-this-month': { label: 'New This Month', matches: (row) => isInCalendarMonth(row.referredAt, 0) },
    'converted': { label: 'Converted', matches: (row) => row.commission != null && CONVERTED_STAGES.has(row.commission.stage) },
    'in-arrears': { label: 'In Arrears', matches: (row) => row.commission != null && ARREARS_STAGES.has(row.commission.stage) },

    // money filters
    'quoted': { label: 'Quoted', matches: (row) => row.financials.quoteTotal != null && row.financials.quoteTotal > 0 },
    'expected-revenue': { label: 'Expected Revenue', matches: (row) => {
        const hasAccepted = row.financials.acceptedQuotesTotal != null && row.financials.acceptedQuotesTotal > 0;
        const hasCompletedOutstanding = portalStatusTone(row.caseStatus) === 'completed' && (row.financials.balance ?? 0) > 0;
        return hasAccepted || hasCompletedOutstanding;
    }},
    'completed-outstanding': { label: 'Outstanding Balance (Completed files)', matches: (row) => portalStatusTone(row.caseStatus) === 'completed' && (row.financials.balance ?? 0) > 0 },
    'paid': { label: 'Total Paid', matches: (row) => row.financials.totalPaid > 0 },
    'settled-paid': { label: 'Settled Amount', matches: (row) => portalStatusTone(row.caseStatus) === 'settled' && row.financials.totalPaid > 0 },

    // quote filters
    'not-quoted': { label: 'Not Quoted', matches: (row) => row.financials.quoteSource == null },
    'total-quotes': { label: 'Total Quotes', matches: (row) => row.financials.quoteSource === 'ACCEPTED_QUOTE' || row.financials.quoteTotal != null },
    'accepted-quotes': { label: 'Accepted Quotes', matches: (row) => row.financials.quoteSource === 'ACCEPTED_QUOTE' },
    'pending-quotes': { label: 'Pending Quotes', matches: (row) => row.financials.quoteSource === 'ACCEPTED_QUOTE' && (row.financials.balance ?? 0) > 0 },
    'declined-quotes': { label: 'Declined Quotes', matches: () => false },
};

type ReferredClient = {
    caseId: string;
    fileNumber: string;
    caseStatus: string;
    referredAt: string;
    lastUpdatedAt: string;
    lastUpdatedBy: string | null;
    nextUpdate: string | null;
    client: { id: string; firstName: string; lastName: string; idNumber: string; phone: string | null; email: string | null };
    financials: {
        quoteTotal: number | null;
        quoteSource: 'CASE_SERVICE_FEE' | 'ACCEPTED_QUOTE' | null;
        totalPaid: number;
        balance: number | null;
        overpaid: number;
        percentCollected: number | null;
        acceptedQuotesTotal?: number;
    };
    commission: {
        stage: CommissionStage;
        isEligible: boolean;
        isPaid: boolean;
        commissionAmount: number | null;
        paidAt: string | null;
    } | null;
};

type DashboardData = {
    canViewFinancials?: boolean;
    referrer: {
        id: string;
        firstName: string;
        lastName: string;
        isActive: boolean;
        cellNumber: string | null;
        email: string | null;
        referrerType: string;
        clientDiscountPercent: number | null;
        commissionType: string;
        fixedCommissionAmount: number | null;
        project: { id: string; name: string } | null;
    };
    clients: ReferredClient[];
    summary: {
        totalClients: number;
        totalCases: number;
        settled: number;
        lost: number;
        inArrears: number;
        newThisMonth: number;
        eligible: number;
        paid: number;
        unpaidEligible: number;
        totalOwed: number;
        totalPaid: number;
        conversionRate: number;
        totalQuoted: number;
        totalCollected: number;
        totalSettledPaid: number;
        updatesOverdue: number;
        inProgress: number;
        completed: number;
        totalCompletedOutstanding: number;
        totalExpectedRevenue: number;
    };
    stageBreakdown: { stage: string; count: number }[];
    monthlyTrend: { month: string; label: string; count: number }[];
    quoteStats?: {
        notQuotedCount: number;
        totalCount: number;
        totalAmount: number;
        acceptedCount: number;
        acceptedAmount: number;
        pendingCount: number;
        pendingAmount: number;
        rejectedCount: number;
        rejectedAmount: number;
    };
};

function formatZAR(amount: number) {
    return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

export default function ReferrerClientsDashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const params = useParams();
    const referrerId = params.id as string;

    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [search, setSearch] = useState('');
    const [stageFilter, setStageFilter] = useState('');
    const [filterId, setFilterId] = useState<ReferralFilterId>('');

    const isManager = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager || session?.user?.role === 'MANAGER';
    const canViewFinancials = Boolean(data?.canViewFinancials ?? isManager);

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/login');
    }, [status, router]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const res = await fetch(`/api/admin/referrers/${referrerId}/clients`);
            const json = await res.json();
            if (!res.ok) {
                setLoadError(json.error ?? 'Failed to load referrer clients');
                return;
            }
            setData(json);
        } catch {
            setLoadError('Network error while loading referrer clients');
        } finally {
            setLoading(false);
        }
    }, [referrerId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filteredClients = useMemo(() => {
        if (!data) return [];
        const q = search.trim().toLowerCase();
        return data.clients.filter((c) => {
            const stage = c.commission?.stage ?? 'NO_RECORD';
            if (stageFilter && stage !== stageFilter) return false;
            if (filterId) {
                const matcher = REFERRAL_FILTERS[filterId];
                if (matcher && !matcher.matches(c)) return false;
            }
            if (!q) return true;
            const haystack = [
                c.client.firstName, c.client.lastName, c.client.idNumber,
                c.client.phone ?? '', c.client.email ?? '', c.fileNumber, c.caseStatus,
                formatStatus(c.caseStatus), c.lastUpdatedBy ?? '',
            ].join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [data, search, stageFilter, filterId]);

    const maxTrend = useMemo(
        () => Math.max(1, ...(data?.monthlyTrend.map((m) => m.count) ?? [1])),
        [data]
    );

    if (status === 'loading' || loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="max-w-7xl mx-auto">
                <Link href="/admin/referrers" className="text-gray-400 hover:text-white text-sm transition-colors">← Referrer Registry</Link>
                <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-xl px-6 py-8 text-center">
                    <p className="text-red-400 text-sm mb-4">{loadError}</p>
                    <button onClick={fetchData} className="bg-zeno-cyan text-zeno-dark font-semibold px-4 py-2 rounded-lg hover:bg-zeno-cyan/90 transition-colors text-sm">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const { referrer, summary, stageBreakdown, monthlyTrend } = data;
    const isDiscountReferrer = referrer.referrerType === 'DISCOUNT';
    const orderedBreakdown = [...stageBreakdown].sort(
        (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
    );
    const maxStageCount = Math.max(1, ...stageBreakdown.map((s) => s.count));

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <Link href="/admin/referrers" className="text-gray-400 hover:text-white text-sm transition-colors">← Referrer Registry</Link>
                    </div>
                    <h1 className="text-2xl font-bold text-white">
                        {referrer.project?.name ?? `${referrer.firstName} ${referrer.lastName}`}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Referred clients dashboard for <span className="text-white">{referrer.firstName} {referrer.lastName}</span>
                        {referrer.cellNumber && <span className="ml-2 text-gray-500">· {referrer.cellNumber}</span>}
                        {referrer.email && <span className="ml-2 text-gray-500">· {referrer.email}</span>}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${referrer.referrerType === 'HYBRID' ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' : isDiscountReferrer ? 'text-purple-400 bg-purple-500/10 border-purple-500/30' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'}`}>
                        {referrer.referrerType === 'HYBRID'
                            ? `Hybrid referrer · ${referrer.clientDiscountPercent != null ? `${referrer.clientDiscountPercent}% discount` : '0% discount'}`
                            : isDiscountReferrer
                            ? `Discount referrer${referrer.clientDiscountPercent != null ? ` · ${referrer.clientDiscountPercent}% for clients` : ''}`
                            : 'Commission referrer'}
                    </span>
                    {!isDiscountReferrer && canViewFinancials && (
                        <>
                            <Link href={`/admin/referrers/${referrer.id}`} className="bg-white/5 border border-white/10 text-white font-medium px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm">
                                Commission Tracker
                            </Link>
                            <a
                                href={`/api/admin/referrers/${referrer.id}/statement`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-white/5 border border-white/10 text-white font-medium px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm"
                            >
                                Download Statement
                            </a>
                        </>
                    )}
                    {referrer.project && (
                        <Link href={`/projects?id=${referrer.project.id}`} className="bg-white/5 border border-white/10 text-white font-medium px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm">
                            Project Folder
                        </Link>
                    )}
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${referrer.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {referrer.isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </div>

            {/* Stat cards — pipeline row */}
            <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                        { id: 'clients' as ReferralFilterId, label: 'Clients', value: summary.totalClients, color: 'text-white', border: 'border-l-4 border-l-cyan-400' },
                        { id: 'in-progress' as ReferralFilterId, label: 'In Progress', value: summary.inProgress, color: 'text-sky-300', border: 'border-l-4 border-l-sky-400' },
                        { id: 'completed' as ReferralFilterId, label: 'Completed', value: summary.completed, color: 'text-yellow-300', border: 'border-l-4 border-l-yellow-400' },
                        { id: 'settled' as ReferralFilterId, label: 'Settled', value: summary.settled, color: 'text-emerald-400', border: 'border-l-4 border-l-emerald-400' },
                        { id: 'lost' as ReferralFilterId, label: 'Lost', value: summary.lost, color: 'text-slate-400', border: 'border-l-4 border-l-slate-500' },
                    ].map((s) => {
                        const active = filterId === s.id;
                        return (
                            <button
                                key={s.label}
                                onClick={() => setFilterId(active ? '' : s.id)}
                                className={`text-left bg-zeno-blue/30 border rounded-xl p-5 transition-all ${
                                    active
                                        ? 'border-zeno-cyan/50 ring-2 ring-zeno-cyan/35 bg-zeno-cyan/5'
                                        : 'border-zeno-blue/50 hover:bg-zeno-blue/40'
                                } ${s.border}`}
                            >
                                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">{s.label}</p>
                                <p className={`text-2xl font-extrabold ${s.color} truncate`} title={String(s.value)}>{s.value}</p>
                            </button>
                        );
                    })}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { id: 'total-cases' as ReferralFilterId, label: 'Total Cases', value: summary.totalCases, color: 'text-white' },
                        { id: 'new-this-month' as ReferralFilterId, label: 'New This Month', value: summary.newThisMonth, color: 'text-zeno-cyan' },
                        { id: 'converted' as ReferralFilterId, label: 'Converted', value: `${summary.conversionRate}%`, color: 'text-emerald-400' },
                        { id: 'in-arrears' as ReferralFilterId, label: 'In Arrears', value: summary.inArrears, color: 'text-amber-400' },
                    ].map((s) => {
                        const active = filterId === s.id;
                        return (
                            <button
                                key={s.label}
                                onClick={() => setFilterId(active ? '' : s.id)}
                                className={`text-left bg-zeno-blue/15 border border-zeno-blue/30 rounded-xl p-4 transition-all ${
                                    active
                                        ? 'border-zeno-cyan/50 ring-2 ring-zeno-cyan/35 bg-zeno-cyan/5'
                                        : 'hover:bg-zeno-blue/20'
                                }`}
                            >
                                <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">{s.label}</p>
                                <p className={`text-lg font-bold ${s.color} truncate`} title={String(s.value)}>{s.value}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Stat cards — money & follow-up row */}
            <div className="space-y-4 mb-6">
                {canViewFinancials && (
                    (isDiscountReferrer || referrer.referrerType === 'HYBRID') ? (
                        <>
                            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Client Finance Metrics</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                                {[
                                    { id: 'quoted' as ReferralFilterId, label: 'Total Quoted', value: summary.totalQuoted > 0 ? formatZAR(summary.totalQuoted) : '—', color: 'text-white', border: 'border-l-4 border-l-violet-400' },
                                    { id: 'expected-revenue' as ReferralFilterId, label: 'Expected Revenue', value: summary.totalExpectedRevenue > 0 ? formatZAR(summary.totalExpectedRevenue) : '—', color: 'text-indigo-300', border: 'border-l-4 border-l-indigo-400' },
                                    { id: 'completed-outstanding' as ReferralFilterId, label: 'Out Standing Balance', value: summary.totalCompletedOutstanding > 0 ? formatZAR(summary.totalCompletedOutstanding) : '—', color: 'text-yellow-300', border: 'border-l-4 border-l-yellow-400' },
                                    { id: 'paid' as ReferralFilterId, label: 'Total Paid', value: summary.totalCollected > 0 ? formatZAR(summary.totalCollected) : '—', color: 'text-emerald-400', border: 'border-l-4 border-l-emerald-400' },
                                    { id: 'settled-paid' as ReferralFilterId, label: 'Settled', value: summary.totalSettledPaid > 0 ? formatZAR(summary.totalSettledPaid) : '—', color: 'text-teal-300', border: 'border-l-4 border-l-teal-400' },
                                ].map((s) => {
                                    const active = filterId === s.id;
                                    return (
                                        <button
                                            key={s.label}
                                            onClick={() => setFilterId(active ? '' : s.id)}
                                            className={`text-left bg-zeno-blue/30 border rounded-xl p-5 transition-all ${
                                                active
                                                    ? 'border-zeno-cyan/50 ring-2 ring-zeno-cyan/35 bg-zeno-cyan/5'
                                                    : 'border-zeno-blue/50 hover:bg-zeno-blue/40'
                                            } ${s.border}`}
                                        >
                                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">{s.label}</p>
                                            <p className={`text-2xl font-extrabold ${s.color} truncate`} title={String(s.value)}>{s.value}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[
                                { id: 'quoted' as ReferralFilterId, label: 'Total Quoted', value: summary.totalQuoted > 0 ? formatZAR(summary.totalQuoted) : '—', color: 'text-white', border: 'border-l-4 border-l-violet-400' },
                                { id: 'paid' as ReferralFilterId, label: 'Total Paid', value: summary.totalCollected > 0 ? formatZAR(summary.totalCollected) : '—', color: 'text-emerald-400', border: 'border-l-4 border-l-emerald-400' },
                                { id: 'settled-paid' as ReferralFilterId, label: 'Settled', value: summary.totalSettledPaid > 0 ? formatZAR(summary.totalSettledPaid) : '—', color: 'text-teal-300', border: 'border-l-4 border-l-teal-400' },
                            ].map((s) => {
                                const active = filterId === s.id;
                                return (
                                    <button
                                        key={s.label}
                                        onClick={() => setFilterId(active ? '' : s.id)}
                                        className={`text-left bg-zeno-blue/30 border rounded-xl p-5 transition-all ${
                                            active
                                                ? 'border-zeno-cyan/50 ring-2 ring-zeno-cyan/35 bg-zeno-cyan/5'
                                                : 'border-zeno-blue/50 hover:bg-zeno-blue/40'
                                        } ${s.border}`}
                                    >
                                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">{s.label}</p>
                                        <p className={`text-2xl font-extrabold ${s.color} truncate`} title={String(s.value)}>{s.value}</p>
                                    </button>
                                );
                            })}
                        </div>
                    )
                )}

                {/* Configuration / Alerts Row */}
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4">Referrer Config & follow-ups</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Updates Overdue', value: summary.updatesOverdue, color: summary.updatesOverdue > 0 ? 'text-red-400' : 'text-gray-400', border: summary.updatesOverdue > 0 ? 'border-red-500/30' : 'border-zeno-blue/30' },
                        ...(referrer.referrerType === 'HYBRID'
                            ? [
                                { label: 'Client Discount', value: referrer.clientDiscountPercent != null ? `${referrer.clientDiscountPercent}%` : 'Not set', color: 'text-purple-400' },
                                ...(canViewFinancials ? [
                                    { label: 'Commission Owed', value: summary.totalOwed > 0 ? formatZAR(summary.totalOwed) : '—', color: 'text-amber-400' },
                                    { label: 'Commission Paid', value: summary.totalPaid > 0 ? formatZAR(summary.totalPaid) : '—', color: 'text-emerald-400' },
                                ] : []),
                            ]
                            : isDiscountReferrer
                            ? [
                                { label: 'Client Discount', value: referrer.clientDiscountPercent != null ? `${referrer.clientDiscountPercent}%` : 'Not set', color: 'text-purple-400' },
                                { label: 'Commission', value: 'None (discount)', color: 'text-gray-400' },
                            ]
                            : canViewFinancials
                            ? [
                                { label: 'Commission Owed', value: summary.totalOwed > 0 ? formatZAR(summary.totalOwed) : '—', color: 'text-amber-400' },
                                { label: 'Commission Paid', value: summary.totalPaid > 0 ? formatZAR(summary.totalPaid) : '—', color: 'text-emerald-400' },
                            ]
                            : []),
                    ].map((s) => (
                        <div key={s.label} className={`bg-zeno-blue/15 border rounded-xl p-4 ${'border' in s ? s.border : 'border-zeno-blue/30'}`}>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">{s.label}</p>
                            <p className={`text-lg font-bold ${s.color} truncate`} title={String(s.value)}>{s.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quotes Scoreboard */}
            {isDiscountReferrer && data.quoteStats && (
                <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl p-5 mb-6">
                    <h2 className="text-sm font-semibold text-white mb-1">Quotes</h2>
                    <p className="text-xs text-gray-400 mb-4">Quotations issued for your referred clients</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {[
                            { id: 'not-quoted' as ReferralFilterId, label: 'Not Quoted', value: `${data.quoteStats.notQuotedCount} Clients`, accent: 'text-gray-300', caption: 'No quotation created yet' },
                            { id: 'total-quotes' as ReferralFilterId, label: 'Total Quotes', value: `${data.quoteStats.totalCount} Quotes`, accent: 'text-purple-300', caption: canViewFinancials ? `Total value: ${formatZAR(data.quoteStats.totalAmount)}` : undefined },
                            { id: 'accepted-quotes' as ReferralFilterId, label: 'Accepted Quotes', value: `${data.quoteStats.acceptedCount} Accepted`, accent: 'text-emerald-400', caption: canViewFinancials ? `Value: ${formatZAR(data.quoteStats.acceptedAmount)}` : undefined },
                            { id: 'pending-quotes' as ReferralFilterId, label: 'Pending Quotes', value: `${data.quoteStats.pendingCount} Pending`, accent: 'text-amber-400', caption: canViewFinancials ? `Value: ${formatZAR(data.quoteStats.pendingAmount)}` : undefined },
                            { id: 'declined-quotes' as ReferralFilterId, label: 'Declined Quotes', value: `${data.quoteStats.rejectedCount} Declined`, accent: 'text-rose-300', caption: canViewFinancials ? `Value: ${formatZAR(data.quoteStats.rejectedAmount)}` : undefined },
                        ].map((q) => {
                            const active = filterId === q.id;
                            return (
                                <button
                                    key={q.label}
                                    onClick={() => setFilterId(active ? '' : q.id)}
                                    className={`text-left rounded-xl p-4 border transition-all ${
                                        active
                                            ? 'bg-zeno-cyan/15 border-zeno-cyan/50 ring-1 ring-zeno-cyan/35'
                                            : 'bg-zeno-blue/30 border-zeno-blue/50 hover:bg-zeno-blue/40'
                                    }`}
                                >
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-semibold">{q.label}</p>
                                    <p className={`text-2xl font-extrabold ${q.accent}`}>{q.value}</p>
                                    {q.caption && <p className="text-[10px] text-gray-500 mt-1 font-medium">{q.caption}</p>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Pipeline + trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Commission pipeline breakdown */}
                <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-1">Client Pipeline</h2>
                    <p className="text-xs text-gray-400 mb-4">Where this referrer&apos;s clients are in the journey</p>
                    {orderedBreakdown.length === 0 ? (
                        <p className="text-gray-500 text-sm py-6 text-center">No referred clients yet</p>
                    ) : (
                        <div className="space-y-2">
                            {orderedBreakdown.map((s) => (
                                <button
                                    key={s.stage}
                                    onClick={() => setStageFilter(stageFilter === s.stage ? '' : s.stage)}
                                    className={`w-full flex items-center gap-3 rounded-lg px-2 py-1 transition-colors ${stageFilter === s.stage ? 'bg-zeno-cyan/10' : 'hover:bg-zeno-blue/20'}`}
                                    title={`Filter table by ${STAGE_LABELS[s.stage] ?? s.stage}`}
                                >
                                    <span className="text-xs text-gray-300 w-40 text-left shrink-0">{STAGE_LABELS[s.stage] ?? s.stage}</span>
                                    <div className="flex-1 h-2.5 bg-zeno-blue/30 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${GOOD_STAGES.has(s.stage) ? 'bg-emerald-400/70' : RISK_STAGES.has(s.stage) ? 'bg-amber-400/70' : 'bg-blue-400/60'}`}
                                            style={{ width: `${(s.count / maxStageCount) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-white font-semibold w-8 text-right">{s.count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Monthly referral trend */}
                <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-1">Referral Trend</h2>
                    <p className="text-xs text-gray-400 mb-4">New referrals per month, last 6 months</p>
                    <div className="flex items-end justify-between gap-3 h-36 px-2">
                        {monthlyTrend.map((m) => (
                            <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                                <span className="text-xs text-white font-semibold">{m.count}</span>
                                <div
                                    className="w-full max-w-[3rem] bg-zeno-cyan/60 rounded-t"
                                    style={{ height: `${Math.max(4, (m.count / maxTrend) * 100)}%` }}
                                />
                                <span className="text-xs text-gray-400">{m.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <input
                    type="text"
                    placeholder="Search client name, ID, file #, contact..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 w-80"
                />
                <select
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}
                    className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zeno-cyan/50"
                >
                    <option value="">All Stages</option>
                    {STAGE_ORDER.map((s) => (
                        <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                    ))}
                </select>
                {(search || stageFilter || filterId) && (
                    <button
                        onClick={() => { setSearch(''); setStageFilter(''); setFilterId(''); }}
                        className="text-xs text-gray-400 hover:text-white transition-colors px-2"
                    >
                        Clear filters
                    </button>
                )}
                <span className="text-xs text-gray-500 self-center ml-auto">
                    Showing {filteredClients.length} of {data.clients.length}
                </span>
            </div>

            {/* Clients table */}
            <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zeno-blue/40">
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Client</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">File # / Workflow Status</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Referred</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Last Updated</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Next Update</th>
                            {canViewFinancials && <th className="text-right py-3 px-4 text-gray-400 font-medium">Quote</th>}
                            {canViewFinancials && <th className="text-right py-3 px-4 text-gray-400 font-medium">Paid</th>}
                            {canViewFinancials && <th className="text-right py-3 px-4 text-gray-400 font-medium">Balance</th>}
                            <th className="text-right py-3 px-4 text-gray-400 font-medium">{!canViewFinancials || isDiscountReferrer ? 'Stage' : 'Stage & Commission'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredClients.length === 0 ? (
                            <tr>
                                <td colSpan={canViewFinancials ? 9 : 6} className="py-12 text-center text-gray-400">
                                    {data.clients.length === 0
                                        ? 'No clients referred yet. Cases created under this referrer’s sub-project will appear here.'
                                        : 'No clients match the current filters.'}
                                </td>
                            </tr>
                        ) : filteredClients.map((c) => {
                            const stage = c.commission?.stage ?? 'NO_RECORD';
                            const nextUpdateOverdue = c.nextUpdate != null && new Date(c.nextUpdate) < new Date();
                            const workflow = getWorkflowInfo(c.caseStatus);
                            return (
                                <tr key={c.caseId} className="border-b border-zeno-blue/20 hover:bg-zeno-blue/20 transition-colors">
                                    <td className="py-3 px-4">
                                        <Link href={`/cases/${c.caseId}`} className="text-white font-medium hover:text-zeno-cyan transition-colors">
                                            {c.client.firstName} {c.client.lastName}
                                        </Link>
                                        <div className="text-gray-500 text-xs font-mono">{c.client.idNumber}</div>
                                        <div className="text-gray-500 text-xs">{c.client.phone ?? c.client.email ?? '—'}</div>
                                    </td>
                                    <td className="py-3 px-4 min-w-[11rem]" title={workflow.description ?? undefined}>
                                        <div className="text-gray-300 font-mono text-xs">{c.fileNumber}</div>
                                        <div className={`text-xs font-medium mt-0.5 ${workflow.isOverdue ? 'text-red-400' : workflow.isLost ? 'text-gray-500' : 'text-white'}`}>
                                            {workflow.label}
                                        </div>
                                        <div className="h-1.5 bg-zeno-blue/40 rounded-full overflow-hidden mt-1.5">
                                            <div
                                                className={`h-full rounded-full ${workflow.barClass}`}
                                                style={{ width: `${workflow.isLost ? 100 : workflow.percent}%` }}
                                            />
                                        </div>
                                        <div className="text-gray-500 text-xs mt-1">
                                            {workflow.isLost
                                                ? 'Lost case'
                                                : workflow.stageNumber != null
                                                    ? `Stage ${workflow.stageNumber} of 10 · ${workflow.categoryName}`
                                                    : c.caseStatus}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-gray-400 text-xs whitespace-nowrap">
                                        {new Date(c.referredAt).toLocaleDateString('en-ZA')}
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        <div className="text-gray-300 text-xs">{new Date(c.lastUpdatedAt).toLocaleDateString('en-ZA')}</div>
                                        <div className="text-gray-500 text-xs">{c.lastUpdatedBy ? `by ${c.lastUpdatedBy}` : '—'}</div>
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        {c.nextUpdate ? (
                                            <span className={`text-xs font-medium ${nextUpdateOverdue ? 'text-red-400' : 'text-gray-300'}`}>
                                                {new Date(c.nextUpdate).toLocaleDateString('en-ZA')}
                                                {nextUpdateOverdue && <span className="block text-red-400/80 font-normal">overdue</span>}
                                            </span>
                                        ) : (
                                            <span className="text-gray-600 text-xs">—</span>
                                        )}
                                    </td>
                                    {canViewFinancials && (
                                        <td className="py-3 px-4 text-right whitespace-nowrap">
                                            {c.financials.quoteTotal != null ? (
                                                <div>
                                                    <span className="text-gray-200 text-xs font-medium">{formatZAR(c.financials.quoteTotal)}</span>
                                                    <div className="text-gray-600 text-xs">
                                                        {c.financials.quoteSource === 'ACCEPTED_QUOTE' ? 'accepted quote' : 'service fee'}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-gray-600 text-xs">No quote</span>
                                            )}
                                        </td>
                                    )}
                                    {canViewFinancials && (
                                        <td className="py-3 px-4 text-right whitespace-nowrap">
                                            {c.financials.totalPaid > 0 ? (
                                                <div>
                                                    <span className="text-emerald-400 text-xs font-medium">{formatZAR(c.financials.totalPaid)}</span>
                                                    {c.financials.percentCollected != null && (
                                                        <div className="text-gray-600 text-xs">{c.financials.percentCollected}% collected</div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-gray-600 text-xs">—</span>
                                            )}
                                        </td>
                                    )}
                                    {canViewFinancials && (
                                        <td className="py-3 px-4 text-right whitespace-nowrap">
                                            {c.financials.overpaid > 0 ? (
                                                <span className="text-emerald-400 text-xs font-semibold">Overpaid {formatZAR(c.financials.overpaid)}</span>
                                            ) : c.financials.balance != null && c.financials.balance > 0 ? (
                                                <span className="text-amber-400 text-xs font-semibold">{formatZAR(c.financials.balance)}</span>
                                            ) : c.financials.balance === 0 ? (
                                                <span className="text-emerald-400 text-xs font-semibold">Settled</span>
                                            ) : (
                                                <span className="text-gray-600 text-xs">—</span>
                                            )}
                                        </td>
                                    )}
                                    <td className="py-3 px-4 text-right">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${stageChipColor(stage)}`}>
                                            {STAGE_LABELS[stage] ?? stage}
                                        </span>
                                        {canViewFinancials && (
                                            <div className="mt-1">
                                                {isDiscountReferrer ? (
                                                    <span className="text-purple-400/80 text-xs">Discount client</span>
                                                ) : c.commission?.isPaid ? (
                                                    <span className="text-emerald-400 text-xs font-semibold">
                                                        Paid {c.commission.commissionAmount != null ? formatZAR(c.commission.commissionAmount) : ''}
                                                        {c.commission.paidAt && (
                                                            <span className="block text-gray-500 font-normal">{new Date(c.commission.paidAt).toLocaleDateString('en-ZA')}</span>
                                                        )}
                                                    </span>
                                                ) : c.commission?.isEligible ? (
                                                    <span className="text-amber-400 text-xs font-semibold">
                                                        Due {c.commission.commissionAmount != null ? formatZAR(c.commission.commissionAmount) : ''}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-600 text-xs">Not yet due</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
