'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

type ClientProfile = {
    id: string;
    firstName: string;
    lastName: string;
    idNumber: string;
    email: string | null;
    phone: string | null;
};

type ActiveCase = {
    id: string;
    fileNumber: string;
    status: string;
    serviceFee: number | null;
    instalments: number;
    totalMonthlyInstallment: number | null;
};

type Summary = {
    totalPaid: number;
    outstanding: number | null;
    paymentCount: number;
};

type Payment = {
    id: string;
    amount: number;
    date: string;
    method: string;
    reference: string | null;
    status: string;
    category: string;
    notes: string | null;
    case: { fileNumber: string } | null;
    recordedBy: { firstName: string; lastName: string } | null;
    batch: { fileName: string } | null;
};

function formatZAR(amount: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

const METHOD_COLORS: Record<string, string> = {
    EFT: 'bg-blue-500/20 text-blue-400',
    CASH: 'bg-emerald-500/20 text-emerald-400',
    DEBIT_ORDER: 'bg-purple-500/20 text-purple-400',
    CHEQUE: 'bg-yellow-500/20 text-yellow-400',
};

const CATEGORY_LABELS: Record<string, string> = {
    DEPOSIT: 'Deposit',
    INSTALLMENT: 'Installment',
    SERVICE_FEE: 'Service Fee',
    LEGAL_FEE: 'Legal Fee',
    OTHER: 'Other',
};

const STATUS_COLORS: Record<string, string> = {
    COMPLETED: 'bg-emerald-500/20 text-emerald-400',
    UNALLOCATED: 'bg-yellow-500/20 text-yellow-400',
    REVERSED: 'bg-red-500/20 text-red-400',
};

export default function ClientPaymentsPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [client, setClient] = useState<ClientProfile | null>(null);
    const [activeCase, setActiveCase] = useState<ActiveCase | null>(null);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [category, setCategory] = useState('');
    const [method, setMethod] = useState('');

    const fetchData = useCallback(async (pg = 1) => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ page: String(pg) });
            if (fromDate) params.set('from', fromDate);
            if (toDate) params.set('to', toDate);
            if (category) params.set('category', category);
            if (method) params.set('method', method);

            const res = await fetch(`/api/finance/clients/${id}/payments?${params}`);
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Failed to load payments');
            }
            const data = await res.json();
            setClient(data.client);
            setActiveCase(data.activeCase);
            setSummary(data.summary);
            setPayments(data.payments);
            setTotal(data.total);
            setPage(data.page);
            setPages(data.pages);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [id, fromDate, toDate, category, method]);

    useEffect(() => {
        fetchData(1);
    }, [fetchData]);

    const progressPercent =
        summary && activeCase?.serviceFee && Number(activeCase.serviceFee) > 0
            ? Math.min(100, (summary.totalPaid / Number(activeCase.serviceFee)) * 100)
            : null;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <Link href="/payments" className="text-cyan-400 hover:text-cyan-300 text-sm inline-block mb-2">
                    ← Back to Payments
                </Link>
                {client ? (
                    <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                            <h1 className="text-3xl font-bold text-white">
                                {client.firstName} {client.lastName}
                            </h1>
                            <p className="text-gray-400 text-sm mt-0.5">
                                ID: {client.idNumber}
                                {client.email && <span className="ml-3">{client.email}</span>}
                                {client.phone && <span className="ml-3">{client.phone}</span>}
                            </p>
                        </div>
                        <Link
                            href={`/payments/record?idNumber=${encodeURIComponent(client.idNumber)}`}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                            + Record Payment
                        </Link>
                    </div>
                ) : (
                    <div className="h-10 w-64 bg-white/5 rounded-lg animate-pulse" />
                )}
            </div>

            {/* Summary cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[var(--color-bg-secondary)] border border-white/5 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Paid</p>
                        <p className="text-2xl font-bold text-emerald-400">{formatZAR(summary.totalPaid)}</p>
                    </div>
                    {summary.outstanding !== null && (
                        <div className="bg-[var(--color-bg-secondary)] border border-white/5 rounded-2xl p-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Outstanding</p>
                            <p className={`text-2xl font-bold ${summary.outstanding > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                                {formatZAR(summary.outstanding)}
                            </p>
                        </div>
                    )}
                    {activeCase?.serviceFee && Number(activeCase.serviceFee) > 0 && (
                        <div className="bg-[var(--color-bg-secondary)] border border-white/5 rounded-2xl p-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Service Fee</p>
                            <p className="text-2xl font-bold text-white">{formatZAR(Number(activeCase.serviceFee))}</p>
                        </div>
                    )}
                    <div className="bg-[var(--color-bg-secondary)] border border-white/5 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Payments</p>
                        <p className="text-2xl font-bold text-white">{summary.paymentCount}</p>
                    </div>
                </div>
            )}

            {/* Progress bar */}
            {progressPercent !== null && (
                <div className="bg-[var(--color-bg-secondary)] border border-white/5 rounded-2xl p-5">
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-sm text-gray-400">Payment Progress</p>
                        <p className="text-sm font-semibold text-white">{progressPercent.toFixed(1)}%</p>
                    </div>
                    <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    {activeCase && (
                        <p className="text-xs text-gray-500 mt-2">
                            File: <span className="text-cyan-400">{activeCase.fileNumber}</span>
                            <span className="mx-2">·</span>
                            Status: <span className="text-gray-300">{activeCase.status.replace(/_/g, ' ')}</span>
                            {activeCase.totalMonthlyInstallment && (
                                <>
                                    <span className="mx-2">·</span>
                                    Monthly: <span className="text-gray-300">{formatZAR(Number(activeCase.totalMonthlyInstallment))}</span>
                                </>
                            )}
                        </p>
                    )}
                </div>
            )}

            {/* Filters */}
            <div className="bg-[var(--color-bg-secondary)] border border-white/5 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">From</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                    />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">To</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                    />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Category</label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                    >
                        <option value="">All Categories</option>
                        {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Method</label>
                    <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                    >
                        <option value="">All Methods</option>
                        <option value="EFT">EFT</option>
                        <option value="CASH">Cash</option>
                        <option value="DEBIT_ORDER">Debit Order</option>
                        <option value="CHEQUE">Cheque</option>
                    </select>
                </div>
                {(fromDate || toDate || category || method) && (
                    <button
                        onClick={() => { setFromDate(''); setToDate(''); setCategory(''); setMethod(''); }}
                        className="px-3 py-2 text-xs text-gray-400 hover:text-white border border-white/10 rounded-lg transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Payments table */}
            <div className="bg-[var(--color-bg-secondary)] border border-white/5 rounded-2xl overflow-hidden">
                {error && (
                    <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">{error}</div>
                )}

                {loading ? (
                    <div className="p-8 text-center text-gray-500 text-sm">Loading payments...</div>
                ) : payments.length === 0 ? (
                    <div className="p-12 text-center">
                        <p className="text-gray-400 font-medium">No payments recorded</p>
                        <p className="text-gray-600 text-sm mt-1">Payments recorded for this client will appear here.</p>
                        <Link
                            href={`/payments/record?idNumber=${encodeURIComponent(client?.idNumber ?? '')}`}
                            className="mt-4 inline-block px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                            Record First Payment
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/5">
                                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Date</th>
                                        <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Amount</th>
                                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Method</th>
                                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Category</th>
                                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Status</th>
                                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Reference</th>
                                        <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Recorded By</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {payments.map((p) => (
                                        <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatDate(p.date)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-white whitespace-nowrap">
                                                {formatZAR(Number(p.amount))}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${METHOD_COLORS[p.method] ?? 'bg-gray-500/20 text-gray-400'}`}>
                                                    {p.method.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-400 text-xs">
                                                {CATEGORY_LABELS[p.category] ?? p.category}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                                                    {p.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate">
                                                {p.reference ?? (p.batch ? `Batch: ${p.batch.fileName}` : '—')}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                                                {p.recordedBy
                                                    ? `${p.recordedBy.firstName} ${p.recordedBy.lastName}`
                                                    : p.batch ? 'Batch import' : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {pages > 1 && (
                            <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
                                <p className="text-xs text-gray-500">{total} payment{total !== 1 ? 's' : ''}</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => fetchData(page - 1)}
                                        disabled={page <= 1}
                                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded text-xs disabled:opacity-40 transition-colors"
                                    >
                                        Previous
                                    </button>
                                    <span className="px-3 py-1.5 text-gray-400 text-xs">
                                        {page} / {pages}
                                    </span>
                                    <button
                                        onClick={() => fetchData(page + 1)}
                                        disabled={page >= pages}
                                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded text-xs disabled:opacity-40 transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
