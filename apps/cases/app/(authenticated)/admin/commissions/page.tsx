'use client';

import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type CommissionStage =
    | 'NEW_LEAD' | 'ADMIN_FEE_PAID' | 'QUOTE_SUBMITTED' | 'QUOTE_ACCEPTED'
    | 'DEPOSIT_PAID' | 'PAYING_INSTALMENTS' | 'UP_TO_DATE'
    | 'ARREARS_1M' | 'ARREARS_2M' | 'ARREARS_3M' | 'ARREARS_4M_PLUS'
    | 'HANDED_OVER' | 'SETTLED';

const STAGE_LABELS: Record<CommissionStage, string> = {
    NEW_LEAD:          'New Lead',
    ADMIN_FEE_PAID:    'Admin Fee Paid',
    QUOTE_SUBMITTED:   'Quote Submitted',
    QUOTE_ACCEPTED:    'Quote Accepted',
    DEPOSIT_PAID:      'Deposit Paid',
    PAYING_INSTALMENTS:'Paying Instalments',
    UP_TO_DATE:        'Up to Date',
    ARREARS_1M:        '1 Month Arrears',
    ARREARS_2M:        '2 Months Arrears',
    ARREARS_3M:        '3 Months Arrears',
    ARREARS_4M_PLUS:   '4+ Months Arrears',
    HANDED_OVER:       'Handed Over',
    SETTLED:           'Settled',
};

const ELIGIBLE_STAGES = new Set<CommissionStage>(['DEPOSIT_PAID', 'PAYING_INSTALMENTS', 'UP_TO_DATE', 'SETTLED']);

type Commission = {
    id: string;
    stage: CommissionStage;
    isEligible: boolean;
    isPaid: boolean;
    paidAt: string | null;
    commissionAmount: number | null;
    paymentRef: string | null;
    referrer: { id: string; firstName: string; lastName: string; cellNumber: string | null; email: string | null };
    case: { id: string; fileNumber: string; status: string; client: { firstName: string; lastName: string; idNumber: string } };
    paidBy: { firstName: string; lastName: string } | null;
};

function formatZAR(amount: number) {
    return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

export default function CommissionsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [commissions, setCommissions] = useState<Commission[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({ totalEligible: 0, totalPaid: 0, totalUnpaidEligible: 0 });
    const [loading, setLoading] = useState(true);

    const [isPaidFilter, setIsPaidFilter] = useState('');
    const [isEligibleFilter, setIsEligibleFilter] = useState('');
    const [search, setSearch] = useState('');

    const isManager = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager || session?.user?.role === 'MANAGER';

    useEffect(() => {
        if (status === 'authenticated' && !isManager) router.push('/');
    }, [session, status, isManager, router]);

    const fetchCommissions = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams({ page: String(page) });
            if (isPaidFilter) p.set('isPaid', isPaidFilter);
            if (isEligibleFilter) p.set('isEligible', isEligibleFilter);
            if (search) p.set('search', search);
            const res = await fetch(`/api/admin/commissions?${p}`);
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            setCommissions(data.commissions);
            setTotal(data.total);
            setPages(data.pages);
            setMeta(data.meta);
        } catch {
            // silently retain stale state
        } finally {
            setLoading(false);
        }
    }, [page, isPaidFilter, isEligibleFilter, search]);

    useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

    async function markPaid(c: Commission) {
        try {
            await fetch(`/api/admin/referrers/${c.referrer.id}/commission/${c.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isPaid: true }),
            });
            fetchCommissions();
        } catch { /* silent */ }
    }

    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }
    if (!isManager) return null;

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <Link href="/admin" className="text-gray-400 hover:text-white text-sm transition-colors">← Back to Admin</Link>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Referrer Commissions</h1>
                    <p className="text-gray-400 text-sm mt-1">Track and manage all referral commissions</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                    { label: 'Eligible for Commission', value: meta.totalEligible, color: 'text-emerald-400' },
                    { label: 'Unpaid & Due', value: meta.totalUnpaidEligible, color: 'text-amber-400' },
                    { label: 'Paid Out', value: meta.totalPaid, color: 'text-blue-400' },
                ].map((s) => (
                    <div key={s.label} className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Commission eligibility notice */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-300 text-xs mb-5">
                Commission is payable only after the referred client has <strong>paid deposit</strong>, <strong>settled</strong>, or a <strong>debit order has gone through</strong> (Paying Instalments / Up to Date).
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-5">
                <input
                    type="text"
                    placeholder="Search referrer, client, file #..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 w-72"
                />
                <select
                    value={isEligibleFilter}
                    onChange={(e) => { setIsEligibleFilter(e.target.value); setPage(1); }}
                    className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zeno-cyan/50"
                >
                    <option value="">All Eligibility</option>
                    <option value="true">Eligible Only</option>
                    <option value="false">Not Yet Eligible</option>
                </select>
                <select
                    value={isPaidFilter}
                    onChange={(e) => { setIsPaidFilter(e.target.value); setPage(1); }}
                    className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zeno-cyan/50"
                >
                    <option value="">All Payment Status</option>
                    <option value="false">Unpaid</option>
                    <option value="true">Paid</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zeno-blue/40">
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Referrer</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Client</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">File #</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Stage</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Amount</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                            <th className="py-3 px-4"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} className="py-12 text-center text-gray-400">Loading...</td></tr>
                        ) : commissions.length === 0 ? (
                            <tr><td colSpan={7} className="py-12 text-center text-gray-400">No commission records found</td></tr>
                        ) : commissions.map((c) => (
                            <tr key={c.id} className={`border-b border-zeno-blue/20 hover:bg-zeno-blue/20 transition-colors ${c.isEligible && !c.isPaid ? 'bg-amber-500/5' : ''}`}>
                                <td className="py-3 px-4">
                                    <Link href={`/admin/referrers/${c.referrer.id}`} className="text-white font-medium hover:text-zeno-cyan transition-colors">
                                        {c.referrer.firstName} {c.referrer.lastName}
                                    </Link>
                                    <div className="text-gray-500 text-xs">{c.referrer.cellNumber ?? c.referrer.email ?? '—'}</div>
                                </td>
                                <td className="py-3 px-4">
                                    <Link href={`/cases/${c.case.id}`} className="text-gray-200 hover:text-white transition-colors">
                                        {c.case.client.firstName} {c.case.client.lastName}
                                    </Link>
                                    <div className="text-gray-500 text-xs font-mono">{c.case.client.idNumber}</div>
                                </td>
                                <td className="py-3 px-4 text-gray-300 font-mono text-xs">{c.case.fileNumber}</td>
                                <td className="py-3 px-4">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${ELIGIBLE_STAGES.has(c.stage) && c.isEligible ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-blue-300 bg-blue-500/10 border-blue-500/30'}`}>
                                        {STAGE_LABELS[c.stage]}
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-gray-300 text-xs">
                                    {c.commissionAmount != null ? formatZAR(Number(c.commissionAmount)) : <span className="text-gray-600">Not set</span>}
                                </td>
                                <td className="py-3 px-4">
                                    {c.isPaid ? (
                                        <div>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">Paid</span>
                                            {c.paidBy && <div className="text-gray-500 text-xs mt-0.5">{c.paidBy.firstName} {c.paidBy.lastName}</div>}
                                        </div>
                                    ) : c.isEligible ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">Due — Unpaid</span>
                                    ) : (
                                        <span className="text-gray-600 text-xs">Not yet due</span>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-2 justify-end">
                                        {c.isEligible && !c.isPaid && (
                                            <button
                                                onClick={() => markPaid(c)}
                                                className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                                            >
                                                Mark Paid
                                            </button>
                                        )}
                                        <Link
                                            href={`/admin/referrers/${c.referrer.id}`}
                                            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors"
                                        >
                                            View
                                        </Link>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
                    <span>Showing {commissions.length} of {total}</span>
                    <div className="flex gap-2">
                        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-zeno-blue/30 border border-zeno-blue/40 disabled:opacity-40 hover:border-zeno-cyan/50 transition-colors">Prev</button>
                        <span className="px-3 py-1">{page} / {pages}</span>
                        <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 rounded bg-zeno-blue/30 border border-zeno-blue/40 disabled:opacity-40 hover:border-zeno-cyan/50 transition-colors">Next</button>
                    </div>
                </div>
            )}
        </div>
    );
}
