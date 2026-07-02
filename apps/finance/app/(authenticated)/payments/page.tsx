'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AllocatePaymentModal } from '@/components/payments/AllocatePaymentModal';
import { EditPaymentModal } from '@/components/payments/EditPaymentModal';
import SendRefundFormModal, { type RefundFormRecipient } from './SendRefundFormModal';

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
    category: string;
    notes: string | null;
    client: { id: string; firstName: string; lastName: string; idNumber: string } | null;
    case: { fileNumber: string } | null;
    recordedBy: { firstName: string; lastName: string } | null;
    batch: { fileName: string; status: string } | null;
};

function formatZAR(amount: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
}

function MethodBadge({ method }: { method: string }) {
    const colors: Record<string, string> = {
        EFT: 'bg-blue-500/20 text-blue-400',
        CASH: 'bg-emerald-500/20 text-emerald-400',
        DEBIT_ORDER: 'bg-purple-500/20 text-purple-400',
        CHEQUE: 'bg-yellow-500/20 text-yellow-400' };
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[method] ?? 'bg-gray-500/20 text-gray-400'}`}>
            {method.replace(/_/g, ' ')}
        </span>
    );
}

function PaymentsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [total, setTotal] = useState(0);
    const [allocatingPayment, setAllocatingPayment]     = useState<Payment | null>(null);
    const [editingPayment, setEditingPayment]           = useState<Payment | null>(null);
    const [refundRecipient, setRefundRecipient]         = useState<RefundFormRecipient | undefined>(undefined);
    const [showRefundModal, setShowRefundModal]          = useState(false);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [method, setMethod] = useState(searchParams.get('method') || '');
    const [from, setFrom] = useState(searchParams.get('from') || '');
    const [to, setTo] = useState(searchParams.get('to') || '');

    const fetchPayments = useCallback(async (pg = 1) => {
        setLoading(true);
        setLoadError(null);
        try {
            const params = new URLSearchParams();
            params.set('page', String(pg));
            if (search) params.set('search', search);
            if (method) params.set('method', method);
            if (from) params.set('from', from);
            if (to) params.set('to', to);

            // no-store so a stale browser/router cache can never mask freshly
            // recorded payments with an outdated empty result
            const res = await fetch(`/api/finance/payments?${params}`, { cache: 'no-store' });
            if (!res.ok) {
                const message = res.status === 401
                    ? 'Your session has expired. Please sign in again to view payments.'
                    : `Could not load payments (error ${res.status}). Recorded payments are safe — this is a display error.`;
                logger.error('[Payments] load failed', res.status);
                setLoadError(message);
                return;
            }
            const data = await res.json();
            setPayments(data.payments);
            setTotal(data.total);
            setPages(data.pages);
            setPage(pg);
        } catch (err) {
            logger.error(err);
            setLoadError('Could not reach the server. Recorded payments are safe — check your connection and retry.');
        } finally {
            setLoading(false);
        }
    }, [search, method, from, to]);

    useEffect(() => { fetchPayments(1); }, [fetchPayments]);

    const exportCSV = () => {
        const params = new URLSearchParams();
        params.set('limit', '10000');
        if (search) params.set('search', search);
        if (method) params.set('method', method);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        window.open(`/api/finance/payments?${params}&format=csv`, '_blank');
    };

    return (
        <>
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Dashboard</Link>
                    <h1 className="text-3xl font-bold text-white">Payments</h1>
                    <p className="text-gray-400 text-sm mt-1">{total.toLocaleString()} total records</p>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
                    {/* Header-level Send Refund Form (blank form, staff fills in details) */}
                    <SendRefundFormModal
                        trigger={(onClick) => (
                            <button
                                onClick={() => { setRefundRecipient(undefined); onClick(); }}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 rounded-lg text-sm font-semibold transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                                </svg>
                                Send Refund Form
                            </button>
                        )}
                    />
                    <Link
                        href="/payments/record"
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                        + Record Payment
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 mb-6 border border-white/5 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-gray-500 mb-1 block">Search</label>
                    <input
                        type="text"
                        placeholder="Client name, ID, reference, file #..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchPayments(1)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
                    />
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
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">From</label>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">To</label>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <button
                    onClick={() => fetchPayments(1)}
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    Filter
                </button>
                <button
                    onClick={() => { setSearch(''); setMethod(''); setFrom(''); setTo(''); }}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors"
                >
                    Clear
                </button>
            </div>

            {/* Table */}
            <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
                    </div>
                ) : loadError ? (
                    <div className="text-center py-16 px-6">
                        <svg className="w-10 h-10 mx-auto mb-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-amber-400 text-lg mb-2">Couldn’t load payments</p>
                        <p className="text-gray-400 text-sm mb-4 max-w-md mx-auto">{loadError}</p>
                        <button
                            onClick={() => fetchPayments(page)}
                            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                ) : payments.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <p className="text-lg mb-2">No payments found</p>
                        <Link href="/payments/record" className="text-emerald-400 hover:underline text-sm">Record your first payment</Link>
                    </div>
                ) : (
                    <>
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
                                        <th className="px-5 py-3">Source</th>
                                        <th className="px-5 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {payments.map((p) => (
                                        <tr key={p.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-5 py-3 text-gray-300 whitespace-nowrap">
                                                {new Date(p.date).toLocaleDateString('en-ZA')}
                                            </td>
                                            <td className="px-5 py-3">
                                                {p.client ? (
                                                    <Link href={`/clients/${p.client.id}/payments`} className="group">
                                                        <p className="text-white font-medium group-hover:text-cyan-400 transition-colors">{p.client.firstName} {p.client.lastName}</p>
                                                        <p className="text-gray-500 text-xs">{p.client.idNumber}</p>
                                                    </Link>
                                                ) : (
                                                    <span className="text-red-400 text-xs">Unallocated</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-cyan-400 text-xs font-mono">
                                                {p.case?.fileNumber ?? '—'}
                                            </td>
                                            <td className="px-5 py-3 text-white font-semibold">
                                                {formatZAR(p.amount)}
                                            </td>
                                            <td className="px-5 py-3"><MethodBadge method={p.method} /></td>
                                            <td className="px-5 py-3 text-gray-400 text-xs font-mono">
                                                {p.reference ?? '—'}
                                            </td>
                                            <td className="px-5 py-3 text-gray-500 text-xs">
                                                {p.batch ? (
                                                    <span title={p.batch.fileName}>Batch</span>
                                                ) : (
                                                    <span>Manual</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setEditingPayment(p)}
                                                        title="Edit this payment"
                                                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded text-xs font-medium transition-colors"
                                                    >
                                                        Edit
                                                    </button>
                                                    {!p.client && (
                                                        <button
                                                            onClick={() => setAllocatingPayment(p)}
                                                            className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 rounded text-xs font-medium transition-colors"
                                                        >
                                                            Allocate
                                                        </button>
                                                    )}
                                                    {p.client && (
                                                        <SendRefundFormModal
                                                            prefill={{
                                                                name:    `${p.client.firstName} ${p.client.lastName}`,
                                                                email:   '',           // clients may not have email on the Payment type — staff completes it
                                                                caseRef: p.case?.fileNumber ?? undefined,
                                                            }}
                                                            trigger={(onClick) => (
                                                                <button
                                                                    onClick={onClick}
                                                                    title="Send Refund Request Form to this consumer"
                                                                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded text-xs font-medium transition-colors flex items-center gap-1"
                                                                >
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                            d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                                                                    </svg>
                                                                    Refund Form
                                                                </button>
                                                            )}
                                                        />
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {pages > 1 && (
                            <div className="flex items-center justify-between px-5 py-3 border-t border-white/5">
                                <p className="text-xs text-gray-500">Page {page} of {pages}</p>
                                <div className="flex gap-2">
                                    <button
                                        disabled={page <= 1}
                                        onClick={() => fetchPayments(page - 1)}
                                        className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs transition-colors"
                                    >
                                        ← Prev
                                    </button>
                                    <button
                                        disabled={page >= pages}
                                        onClick={() => fetchPayments(page + 1)}
                                        className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs transition-colors"
                                    >
                                        Next →
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>

        {editingPayment && (
            <EditPaymentModal
                payment={editingPayment}
                onClose={() => setEditingPayment(null)}
                onSuccess={() => {
                    setEditingPayment(null)
                    fetchPayments(page)
                }}
            />
        )}

        {allocatingPayment && (
            <AllocatePaymentModal
                payment={allocatingPayment}
                onClose={() => setAllocatingPayment(null)}
                onSuccess={(paymentId) => {
                    setAllocatingPayment(null)
                    fetchPayments(page)
                }}
            />
        )}
        </>
    );
}

export default function PaymentsPage() {
    return (
        <div className="p-6">
            <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>}>
                <PaymentsContent />
            </Suspense>
        </div>
    );
}
