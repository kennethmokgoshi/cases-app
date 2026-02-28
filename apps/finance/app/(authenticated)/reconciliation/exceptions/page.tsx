'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type ExceptionPayment = {
    id: string;
    amount: number;
    date: string;
    method: string;
    reference: string | null;
    unmatchedId: string | null;
    notes: string | null;
    batch: { id: string; fileName: string; uploadedAt: string; status: string } | null;
};

type GroupedBatch = {
    batchId: string | null;
    batchName: string;
    payments: ExceptionPayment[];
};

function formatZAR(amount: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
}

export default function ExceptionsReportPage() {
    const [payments, setPayments] = useState<ExceptionPayment[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const fetchExceptions = useCallback(async (p: number, f: string, t: string) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(p), limit: '50' });
            if (f) params.set('from', f);
            if (t) params.set('to', t);
            const res = await fetch(`/api/finance/reconciliation/exceptions?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setPayments(data.payments);
                setTotal(data.total);
                setPages(data.pages);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchExceptions(1, '', '');
    }, [fetchExceptions]);

    function handleFilter() {
        setPage(1);
        fetchExceptions(1, from, to);
    }

    function handleClear() {
        setFrom('');
        setTo('');
        setPage(1);
        fetchExceptions(1, '', '');
    }

    function goToPage(nextPage: number) {
        setPage(nextPage);
        fetchExceptions(nextPage, from, to);
    }

    // Group payments by batch
    const grouped = payments.reduce<Record<string, GroupedBatch>>((acc, p) => {
        const key = p.batch?.id ?? '_manual';
        if (!acc[key]) {
            acc[key] = {
                batchId: p.batch?.id ?? null,
                batchName: p.batch?.fileName ?? 'Manual Entry',
                payments: [] };
        }
        acc[key].payments.push(p);
        return acc;
    }, {});

    const grandTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <Link href="/reconciliation" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">
                        ← Reconciliation
                    </Link>
                    <h1 className="text-2xl font-bold text-white">Exception Report</h1>
                    <p className="text-gray-500 text-sm mt-1">All unallocated payments grouped by batch</p>
                </div>
                {total > 0 && (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-5 py-3 text-center shrink-0">
                        <p className="text-orange-400 font-bold text-2xl">{total}</p>
                        <p className="text-orange-600 text-xs mt-0.5">Total exceptions</p>
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">From</label>
                    <input
                        type="date"
                        value={from}
                        onChange={e => setFrom(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-colors"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">To</label>
                    <input
                        type="date"
                        value={to}
                        onChange={e => setTo(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-colors"
                    />
                </div>
                <button
                    onClick={handleFilter}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 transition-colors"
                >
                    Filter
                </button>
                {(from || to) && (
                    <button
                        onClick={handleClear}
                        className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
                </div>
            ) : payments.length === 0 ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <p className="text-emerald-400 font-semibold">No exceptions found</p>
                    <p className="text-gray-500 text-sm mt-1">All payments have been allocated.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.values(grouped).map(group => {
                        const groupTotal = group.payments.reduce((sum, p) => sum + Number(p.amount), 0);
                        return (
                            <div key={group.batchId ?? '_manual'}>
                                {/* Batch header */}
                                <div className="flex items-center gap-3 mb-2.5">
                                    <h3
                                        className="text-sm font-semibold text-gray-200 font-mono truncate max-w-sm"
                                        title={group.batchName}
                                    >
                                        {group.batchName}
                                    </h3>
                                    <span className="text-orange-400 text-xs bg-orange-500/10 border border-orange-500/20 rounded-full px-2 py-0.5 shrink-0">
                                        {group.payments.length} exception{group.payments.length !== 1 ? 's' : ''}
                                    </span>
                                    {group.batchId && (
                                        <Link
                                            href={`/batches/${group.batchId}`}
                                            className="text-cyan-400/60 hover:text-cyan-400 text-xs transition-colors shrink-0"
                                        >
                                            View batch →
                                        </Link>
                                    )}
                                </div>

                                <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-white/5 text-gray-500 text-xs uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-5 py-2.5">Date</th>
                                                    <th className="px-5 py-2.5">Original ID</th>
                                                    <th className="px-5 py-2.5 text-right">Amount</th>
                                                    <th className="px-5 py-2.5">Method</th>
                                                    <th className="px-5 py-2.5">Reference</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {group.payments.map(p => (
                                                    <tr key={p.id} className="hover:bg-white/5 transition-colors">
                                                        <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                                                            {new Date(p.date).toLocaleDateString('en-ZA')}
                                                        </td>
                                                        <td className="px-5 py-3">
                                                            <span className="text-orange-400 font-mono text-xs">
                                                                {p.unmatchedId || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3 text-white font-semibold text-right">
                                                            {formatZAR(Number(p.amount))}
                                                        </td>
                                                        <td className="px-5 py-3 text-gray-400 text-xs">{p.method}</td>
                                                        <td className="px-5 py-3 text-gray-500 text-xs font-mono">
                                                            {p.reference || '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-white/3 border-t border-white/5">
                                                <tr>
                                                    <td colSpan={2} className="px-5 py-2.5 text-xs text-gray-600">
                                                        Subtotal ({group.payments.length})
                                                    </td>
                                                    <td className="px-5 py-2.5 text-right text-orange-400 text-sm font-bold">
                                                        {formatZAR(groupTotal)}
                                                    </td>
                                                    <td colSpan={2} />
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Grand total */}
                    <div className="flex justify-end pt-2">
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-5 py-3 text-right">
                            <p className="text-xs text-orange-500 uppercase tracking-wider mb-0.5">Grand Total Unallocated</p>
                            <p className="text-xl font-bold text-orange-400">{formatZAR(grandTotal)}</p>
                        </div>
                    </div>

                    {/* Pagination */}
                    {pages > 1 && (
                        <div className="flex items-center justify-between">
                            <p className="text-gray-500 text-xs">Page {page} of {pages} · {total} total</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => goToPage(page - 1)}
                                    disabled={page === 1}
                                    className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-400 disabled:opacity-30 transition-colors"
                                >
                                    ← Prev
                                </button>
                                <button
                                    onClick={() => goToPage(page + 1)}
                                    disabled={page === pages}
                                    className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-400 disabled:opacity-30 transition-colors"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
