'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AllocateModal from '@/components/reconciliation/AllocateModal';

type UnallocatedPayment = {
    id: string;
    amount: number;
    date: string;
    method: string;
    reference: string | null;
    unmatchedId: string | null;
    notes: string | null;
    batch: { id: string; fileName: string; uploadedAt: string; status: string } | null;
};

type BatchSummary = {
    id: string;
    fileName: string;
    uploadedAt: string;
    status: string;
    totalAmount: number;
    matchCount: number;
    unmatchCount: number;
};

type Summary = {
    unallocatedCount: number;
    unallocatedAmount: number;
    unreconciledBatches: number;
    batchesNeedingAttention: BatchSummary[];
};

function formatZAR(amount: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
}

export default function ReconciliationPage() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [payments, setPayments] = useState<UnallocatedPayment[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [allocating, setAllocating] = useState<UnallocatedPayment | null>(null);

    const fetchSummary = useCallback(async () => {
        try {
            const res = await fetch('/api/finance/reconciliation/summary');
            if (res.ok) setSummary(await res.json());
        } catch { /* silent */ }
    }, []);

    const fetchPayments = useCallback(async (p: number) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/finance/reconciliation/exceptions?page=${p}&limit=20`);
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
        fetchSummary();
        fetchPayments(1);
    }, [fetchSummary, fetchPayments]);

    function handleAllocated(paymentId: string) {
        setAllocating(null);
        setPayments(prev => prev.filter(p => p.id !== paymentId));
        setTotal(prev => prev - 1);
        fetchSummary();
    }

    function goToPage(nextPage: number) {
        setPage(nextPage);
        fetchPayments(nextPage);
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Reconciliation</h1>
                    <p className="text-gray-500 text-sm mt-1">Match unallocated payments to clients and cases</p>
                </div>
                <Link
                    href="/reconciliation/exceptions"
                    className="self-start px-4 py-2 rounded-xl text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-colors"
                >
                    Exception Report →
                </Link>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-orange-500/10 rounded-xl p-4 border border-orange-500/20">
                    <p className="text-xs text-orange-500 uppercase tracking-wider">Unallocated Payments</p>
                    <p className="text-3xl font-bold text-orange-400 mt-1">
                        {summary ? summary.unallocatedCount : '—'}
                    </p>
                    <p className="text-orange-600 text-xs mt-1">
                        {summary ? `${formatZAR(summary.unallocatedAmount)} total` : 'Loading...'}
                    </p>
                </div>
                <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/20">
                    <p className="text-xs text-yellow-500 uppercase tracking-wider">Unreconciled Batches</p>
                    <p className="text-3xl font-bold text-yellow-400 mt-1">
                        {summary ? summary.unreconciledBatches : '—'}
                    </p>
                    <p className="text-yellow-600 text-xs mt-1">Awaiting reconciliation</p>
                </div>
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Batches Needing Attention</p>
                    <p className="text-3xl font-bold text-white mt-1">
                        {summary ? summary.batchesNeedingAttention.length : '—'}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">Have unmatched payments</p>
                </div>
            </div>

            {/* Batches needing attention */}
            {summary && summary.batchesNeedingAttention.length > 0 && (
                <div>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Batches Needing Attention
                    </h2>
                    <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-white/5 text-gray-500 text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="px-5 py-3 text-left">File</th>
                                        <th className="px-5 py-3 text-left">Uploaded</th>
                                        <th className="px-5 py-3 text-right">Matched</th>
                                        <th className="px-5 py-3 text-right">Unmatched</th>
                                        <th className="px-5 py-3 text-right">Total</th>
                                        <th className="px-5 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {summary.batchesNeedingAttention.map(b => (
                                        <tr key={b.id} className="hover:bg-white/5 transition-colors">
                                            <td
                                                className="px-5 py-3 text-gray-300 text-xs font-mono max-w-[220px] truncate"
                                                title={b.fileName}
                                            >
                                                {b.fileName}
                                            </td>
                                            <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                                                {new Date(b.uploadedAt).toLocaleDateString('en-ZA')}
                                            </td>
                                            <td className="px-5 py-3 text-right text-emerald-400 font-semibold">
                                                {b.matchCount}
                                            </td>
                                            <td className="px-5 py-3 text-right text-orange-400 font-semibold">
                                                {b.unmatchCount}
                                            </td>
                                            <td className="px-5 py-3 text-right text-gray-300 text-xs">
                                                {formatZAR(Number(b.totalAmount))}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <Link
                                                    href={`/batches/${b.id}`}
                                                    className="text-cyan-400 hover:text-cyan-300 text-xs hover:underline underline-offset-2"
                                                >
                                                    View →
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Unallocated payments table */}
            <div>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Unallocated Payments{total > 0 && <span className="text-orange-400 ml-1">({total})</span>}
                </h2>

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
                        <p className="text-emerald-400 font-semibold">All payments allocated!</p>
                        <p className="text-gray-500 text-sm mt-1">No unallocated payments remain.</p>
                    </div>
                ) : (
                    <>
                        <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                                        <tr>
                                            <th className="px-5 py-3">Date</th>
                                            <th className="px-5 py-3">Original ID</th>
                                            <th className="px-5 py-3 text-right">Amount</th>
                                            <th className="px-5 py-3">Method</th>
                                            <th className="px-5 py-3">Reference</th>
                                            <th className="px-5 py-3">Batch</th>
                                            <th className="px-5 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {payments.map(p => (
                                            <tr key={p.id} className="hover:bg-white/5 bg-orange-500/3 transition-colors">
                                                <td className="px-5 py-3 text-gray-300 text-xs whitespace-nowrap">
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
                                                <td className="px-5 py-3 text-xs max-w-[160px] truncate" title={p.batch?.fileName}>
                                                    {p.batch ? (
                                                        <Link
                                                            href={`/batches/${p.batch.id}`}
                                                            className="text-cyan-400/70 hover:text-cyan-400 transition-colors"
                                                        >
                                                            {p.batch.fileName}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-gray-600">Manual</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <button
                                                        onClick={() => setAllocating(p)}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 transition-colors whitespace-nowrap"
                                                    >
                                                        Assign →
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Pagination */}
                        {pages > 1 && (
                            <div className="flex items-center justify-between mt-4">
                                <p className="text-gray-500 text-xs">
                                    Page {page} of {pages} · {total} unallocated
                                </p>
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
                    </>
                )}
            </div>

            {/* Allocate modal */}
            {allocating && (
                <AllocateModal
                    paymentId={allocating.id}
                    paymentAmount={Number(allocating.amount)}
                    originalId={allocating.unmatchedId}
                    onClose={() => setAllocating(null)}
                    onAllocated={handleAllocated}
                />
            )}
        </div>
    );
}
