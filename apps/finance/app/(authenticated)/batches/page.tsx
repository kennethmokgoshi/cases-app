'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { logger } from '@zenowethu/shared-lib';

type Batch = {
    id: string;
    fileName: string;
    uploadedAt: string;
    status: string;
    totalAmount: number;
    matchCount: number;
    unmatchCount: number;
    uploadedBy: { firstName: string; lastName: string };
    _count: { payments: number };
};

function formatZAR(amount: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { color: string; label: string }> = {
        PROCESSING: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Processing' },
        MATCHED: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Matched' },
        RECONCILED: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Reconciled' } };
    const c = config[status] ?? { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: status };
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${c.color}`}>{c.label}</span>
    );
}

export default function BatchesPage() {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/finance/batches')
            .then(r => r.json())
            .then(data => { setBatches(data.batches ?? []); setTotal(data.total ?? 0); })
            .catch(logger.error)
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Dashboard</Link>
                    <h1 className="text-3xl font-bold text-white">Payment Batches</h1>
                    <p className="text-gray-400 text-sm mt-1">{total} batches total</p>
                </div>
                <Link
                    href="/batches/upload"
                    className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg text-sm font-semibold transition-colors self-start"
                >
                    + Import Batch
                </Link>
            </div>

            <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
                    </div>
                ) : batches.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <p className="text-lg mb-2">No batches uploaded yet</p>
                        <Link href="/batches/upload" className="text-indigo-400 hover:underline text-sm">Import your first batch</Link>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-3">File Name</th>
                                    <th className="px-6 py-3">Uploaded</th>
                                    <th className="px-6 py-3">By</th>
                                    <th className="px-6 py-3">Total Amount</th>
                                    <th className="px-6 py-3">Payments</th>
                                    <th className="px-6 py-3">Match Rate</th>
                                    <th className="px-6 py-3">Status</th>
                                    <th className="px-6 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {batches.map((batch) => {
                                    const total = batch.matchCount + batch.unmatchCount;
                                    const matchRate = total > 0 ? Math.round((batch.matchCount / total) * 100) : 0;
                                    return (
                                        <tr key={batch.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4">
                                                <p className="text-white font-medium truncate max-w-[220px]" title={batch.fileName}>
                                                    {batch.fileName}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-gray-400 whitespace-nowrap">
                                                {new Date(batch.uploadedAt).toLocaleDateString('en-ZA')}
                                            </td>
                                            <td className="px-6 py-4 text-gray-400">
                                                {batch.uploadedBy.firstName} {batch.uploadedBy.lastName}
                                            </td>
                                            <td className="px-6 py-4 text-white font-semibold">
                                                {formatZAR(Number(batch.totalAmount))}
                                            </td>
                                            <td className="px-6 py-4 text-gray-300">
                                                {batch._count.payments}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-20 bg-white/10 rounded-full h-1.5">
                                                        <div
                                                            className={`h-1.5 rounded-full transition-all ${matchRate === 100 ? 'bg-emerald-400' : matchRate > 50 ? 'bg-blue-400' : 'bg-orange-400'}`}
                                                            style={{ width: `${matchRate}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-400">{matchRate}%</span>
                                                </div>
                                                <p className="text-xs text-gray-600 mt-0.5">
                                                    {batch.matchCount} matched · {batch.unmatchCount} unmatched
                                                </p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <StatusBadge status={batch.status} />
                                            </td>
                                            <td className="px-6 py-4">
                                                <Link
                                                    href={`/batches/${batch.id}`}
                                                    className="text-cyan-400 hover:text-cyan-300 text-xs transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    View →
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
