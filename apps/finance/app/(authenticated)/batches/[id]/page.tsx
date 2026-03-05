'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type Payment = {
    id: string;
    amount: number;
    date: string;
    method: string;
    reference: string | null;
    status: string;
    unmatchedId: string | null;
    client: { firstName: string; lastName: string; idNumber: string } | null;
    case: { fileNumber: string; status: string } | null;
};

type Batch = {
    id: string;
    fileName: string;
    uploadedAt: string;
    status: string;
    totalAmount: number;
    matchCount: number;
    unmatchCount: number;
    uploadedBy: { firstName: string; lastName: string; email: string };
    payments: Payment[];
};

function formatZAR(amount: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
}

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [batch, setBatch] = useState<Batch | null>(null);
    const [loading, setLoading] = useState(true);
    const [reconciling, setReconciling] = useState(false);
    const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');

    useEffect(() => {
        fetch(`/api/finance/batches/${id}`)
            .then(r => r.json())
            .then(data => setBatch(data))
            .catch(logger.error)
            .finally(() => setLoading(false));
    }, [id]);

    async function reconcile() {
        if (!confirm('Mark this batch as Reconciled? This cannot be undone.')) return;
        setReconciling(true);
        try {
            const res = await fetch(`/api/finance/batches/${id}/reconcile`, { method: 'PATCH' });
            if (res.ok) {
                const updated = await res.json();
                setBatch(prev => prev ? { ...prev, status: updated.status } : prev);
            }
        } catch (err) {
            logger.error(err);
        } finally {
            setReconciling(false);
        }
    }

    if (loading) {
        return (
            <div className="p-6 flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
            </div>
        );
    }

    if (!batch) {
        return (
            <div className="p-6 text-center py-20">
                <p className="text-gray-400">Batch not found</p>
                <Link href="/batches" className="text-cyan-400 hover:underline text-sm mt-2 inline-block">← Back to Batches</Link>
            </div>
        );
    }

    const total = batch.matchCount + batch.unmatchCount;
    const matchRate = total > 0 ? Math.round((batch.matchCount / total) * 100) : 0;

    const StatusBadge = ({ status }: { status: string }) => {
        const colors: Record<string, string> = {
            PROCESSING: 'bg-yellow-500/20 text-yellow-400',
            MATCHED: 'bg-blue-500/20 text-blue-400',
            RECONCILED: 'bg-emerald-500/20 text-emerald-400' };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-gray-500/20 text-gray-400'}`}>{status}</span>;
    };

    const filteredPayments = batch.payments.filter(p => {
        if (filter === 'matched') return p.client !== null;
        if (filter === 'unmatched') return p.client === null;
        return true;
    });

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <Link href="/batches" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Batches</Link>
                    <h1 className="text-2xl font-bold text-white truncate max-w-lg" title={batch.fileName}>{batch.fileName}</h1>
                    <div className="flex items-center gap-3 mt-2">
                        <StatusBadge status={batch.status} />
                        <span className="text-gray-500 text-xs">
                            Uploaded {new Date(batch.uploadedAt).toLocaleDateString('en-ZA')} by {batch.uploadedBy.firstName} {batch.uploadedBy.lastName}
                        </span>
                    </div>
                </div>
                {batch.status !== 'RECONCILED' && (
                    <button
                        onClick={reconcile}
                        disabled={reconciling}
                        className="px-5 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 self-start"
                    >
                        {reconciling ? 'Reconciling...' : '✓ Mark as Reconciled'}
                    </button>
                )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Total Amount</p>
                    <p className="text-xl font-bold text-white mt-1">{formatZAR(Number(batch.totalAmount))}</p>
                </div>
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Payments</p>
                    <p className="text-xl font-bold text-white mt-1">{batch.payments.length}</p>
                </div>
                <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
                    <p className="text-xs text-emerald-600 uppercase tracking-wider">Matched</p>
                    <p className="text-xl font-bold text-emerald-400 mt-1">{batch.matchCount}</p>
                </div>
                <div className="bg-orange-500/10 rounded-xl p-4 border border-orange-500/20">
                    <p className="text-xs text-orange-600 uppercase tracking-wider">Unmatched</p>
                    <p className="text-xl font-bold text-orange-400 mt-1">{batch.unmatchCount}</p>
                </div>
            </div>

            {/* Match rate bar */}
            <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-white/5">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-gray-400 font-medium">Match Rate</p>
                    <p className="text-sm font-semibold text-white">{matchRate}%</p>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                    <div
                        className={`h-2 rounded-full transition-all ${matchRate === 100 ? 'bg-emerald-400' : matchRate > 60 ? 'bg-blue-400' : 'bg-orange-400'}`}
                        style={{ width: `${matchRate}%` }}
                    />
                </div>
            </div>

            {/* Payments table */}
            <div>
                <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-base font-semibold text-white">Payments</h2>
                    <div className="flex gap-1">
                        {(['all', 'matched', 'unmatched'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${filter === f ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-5 py-3">Date</th>
                                    <th className="px-5 py-3">Client</th>
                                    <th className="px-5 py-3">File #</th>
                                    <th className="px-5 py-3">Amount</th>
                                    <th className="px-5 py-3">Method</th>
                                    <th className="px-5 py-3">Reference</th>
                                    <th className="px-5 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredPayments.map((p) => (
                                    <tr key={p.id} className={`hover:bg-white/5 transition-colors ${!p.client ? 'bg-red-500/5' : ''}`}>
                                        <td className="px-5 py-3 text-gray-300 whitespace-nowrap">
                                            {new Date(p.date).toLocaleDateString('en-ZA')}
                                        </td>
                                        <td className="px-5 py-3">
                                            {p.client ? (
                                                <div>
                                                    <p className="text-white">{p.client.firstName} {p.client.lastName}</p>
                                                    <p className="text-gray-500 text-xs">{p.client.idNumber}</p>
                                                </div>
                                            ) : (
                                                <div>
                                                    <span className="text-red-400 text-xs">Unmatched</span>
                                                    {p.unmatchedId && (
                                                        <p className="text-orange-400 text-xs font-mono mt-0.5">{p.unmatchedId}</p>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-cyan-400 text-xs font-mono">{p.case?.fileNumber ?? '—'}</td>
                                        <td className="px-5 py-3 text-white font-semibold">{formatZAR(Number(p.amount))}</td>
                                        <td className="px-5 py-3 text-gray-400 text-xs">{p.method}</td>
                                        <td className="px-5 py-3 text-gray-400 text-xs font-mono">{p.reference ?? '—'}</td>
                                        <td className="px-5 py-3">
                                            {p.client ? (
                                                <span className="text-emerald-400 text-xs">✓ Matched</span>
                                            ) : (
                                                <span className="text-orange-400 text-xs">⚠ Unmatched</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
