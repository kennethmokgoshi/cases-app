'use client';

import { useSession } from '@zenowethu/ui';
import { getWorkflowInfo, formatStatus } from '@/lib/workflow-progress';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';

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
        totalBalanceDue: number;
        updatesOverdue: number;
    };
    stageBreakdown: { stage: string; count: number }[];
    monthlyTrend: { month: string; label: string; count: number }[];
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

    const isManager = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager || session?.user?.role === 'MANAGER';

    useEffect(() => {
        if (status === 'authenticated' && !isManager) router.push('/');
    }, [session, status, isManager, router]);

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
            if (!q) return true;
            const haystack = [
                c.client.firstName, c.client.lastName, c.client.idNumber,
                c.client.phone ?? '', c.client.email ?? '', c.fileNumber, c.caseStatus,
                formatStatus(c.caseStatus), c.lastUpdatedBy ?? '',
            ].join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [data, search, stageFilter]);

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

    if (!isManager) return null;

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
                    {!isDiscountReferrer && (
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
                {[
                    { label: 'Clients', value: summary.totalClients, color: 'text-white' },
                    { label: 'Cases', value: summary.totalCases, color: 'text-white' },
                    { label: 'New This Month', value: summary.newThisMonth, color: 'text-zeno-cyan' },
                    { label: 'Converted', value: `${summary.conversionRate}%`, color: 'text-emerald-400' },
                    { label: 'Settled', value: summary.settled, color: 'text-emerald-400' },
                    { label: 'In Arrears', value: summary.inArrears, color: 'text-amber-400' },
                ].map((s) => (
                    <div key={s.label} className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-xl font-bold ${s.color} truncate`} title={String(s.value)}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Stat cards — money & follow-up row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7 gap-4 mb-6">
                {[
                    { label: 'Total Quoted', value: summary.totalQuoted > 0 ? formatZAR(summary.totalQuoted) : '—', color: 'text-white' },
                    { label: 'Total Collected', value: summary.totalCollected > 0 ? formatZAR(summary.totalCollected) : '—', color: 'text-emerald-400' },
                    { label: 'Client Balance Due', value: summary.totalBalanceDue > 0 ? formatZAR(summary.totalBalanceDue) : '—', color: 'text-amber-400' },
                    { label: 'Updates Overdue', value: summary.updatesOverdue, color: summary.updatesOverdue > 0 ? 'text-red-400' : 'text-gray-400' },
                    ...(referrer.referrerType === 'HYBRID'
                        ? [
                            { label: 'Client Discount', value: referrer.clientDiscountPercent != null ? `${referrer.clientDiscountPercent}%` : 'Not set', color: 'text-purple-400' },
                            { label: 'Commission Owed', value: summary.totalOwed > 0 ? formatZAR(summary.totalOwed) : '—', color: 'text-amber-400' },
                            { label: 'Commission Paid', value: summary.totalPaid > 0 ? formatZAR(summary.totalPaid) : '—', color: 'text-emerald-400' },
                        ]
                        : isDiscountReferrer
                        ? [
                            { label: 'Client Discount', value: referrer.clientDiscountPercent != null ? `${referrer.clientDiscountPercent}%` : 'Not set', color: 'text-purple-400' },
                            { label: 'Commission', value: 'None (discount)', color: 'text-gray-400' },
                        ]
                        : [
                            { label: 'Commission Owed', value: summary.totalOwed > 0 ? formatZAR(summary.totalOwed) : '—', color: 'text-amber-400' },
                            { label: 'Commission Paid', value: summary.totalPaid > 0 ? formatZAR(summary.totalPaid) : '—', color: 'text-emerald-400' },
                        ]),
                ].map((s) => (
                    <div key={s.label} className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-xl font-bold ${s.color} truncate`} title={String(s.value)}>{s.value}</p>
                    </div>
                ))}
            </div>

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
                {(search || stageFilter) && (
                    <button
                        onClick={() => { setSearch(''); setStageFilter(''); }}
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
                            <th className="text-right py-3 px-4 text-gray-400 font-medium">Quote</th>
                            <th className="text-right py-3 px-4 text-gray-400 font-medium">Paid</th>
                            <th className="text-right py-3 px-4 text-gray-400 font-medium">Balance</th>
                            <th className="text-right py-3 px-4 text-gray-400 font-medium">{isDiscountReferrer ? 'Stage' : 'Stage & Commission'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredClients.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="py-12 text-center text-gray-400">
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
                                    <td className="py-3 px-4 text-right">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${stageChipColor(stage)}`}>
                                            {STAGE_LABELS[stage] ?? stage}
                                        </span>
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
