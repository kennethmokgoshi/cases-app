'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getStatusByCode } from '@zenowethu/shared-lib';
import { formatRand, type CaseFinancialSummary } from '../../../../lib/case-financials';
import MandateForm from './MandateForm';
import DeleteDocumentButton from '@/components/finance/DeleteDocumentButton';

// ─── Types (shape of /api/finance/cases/[id]/summary) ────────────────────────

type CaseInfo = {
    id: string;
    fileNumber: string;
    status: string;
    createdAt: string;
    acquisitionType: string;
    partnerName: string | null;
    partnerBranch: string | null;
    partnerSplitPercent: number;
    serviceFeeCollectedBy: string;
    serviceFee: string | null;
    instalments: number;
    zenowethuShare: string | null;
    isInvoiced: boolean;
    r350Status: string;
    totalDebtAmount: string | null;
    totalMonthlyInstallment: string | null;
};

type ClientInfo = {
    id: string;
    firstName: string;
    lastName: string;
    idNumber: string;
    email: string | null;
    phone: string | null;
};

type PaymentRow = {
    id: string;
    amount: string;
    date: string;
    method: string;
    reference: string | null;
    category: string;
    status: string;
    recordedBy: { firstName: string; lastName: string } | null;
    batch: { fileName: string } | null;
};

type InvoiceRow = {
    id: string;
    invoiceNumber: string;
    status: string;
    type: string;
    total: string;
    issuedAt: string;
    dueAt: string;
    sentAt: string | null;
};

type SummaryResponse = {
    case: CaseInfo;
    client: ClientInfo;
    summary: CaseFinancialSummary;
    payments: PaymentRow[];
    invoices: InvoiceRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function casesAppUrl(path: string): string {
    if (typeof window !== 'undefined' && window.location.hostname.includes('zenowethu.co.za')) {
        return `https://cases.zenowethu.co.za${path}`;
    }
    return `${process.env.NEXT_PUBLIC_CASES_URL || 'http://localhost:3000'}${path}`;
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

const INVOICE_STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-gray-500/20 text-gray-400',
    SENT: 'bg-cyan-500/20 text-cyan-400',
    PAID: 'bg-emerald-500/20 text-emerald-400',
    PARTIALLY_PAID: 'bg-amber-500/20 text-amber-400',
    OVERDUE: 'bg-red-500/20 text-red-400',
    CANCELLED: 'bg-gray-600/20 text-gray-500',
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
    COMPLETED: 'bg-emerald-500/20 text-emerald-400',
    UNALLOCATED: 'bg-amber-500/20 text-amber-400',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinanceCaseDetailPage() {
    const params = useParams<{ id: string }>();
    const [data, setData] = useState<SummaryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/finance/cases/${params.id}/summary`);
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || `Failed to load case (${res.status})`);
            }
            setData(await res.json());
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load case');
        } finally {
            setLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto flex flex-col items-center justify-center py-32 text-gray-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mb-3"></div>
                <span className="text-sm">Loading case financials...</span>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="max-w-7xl mx-auto py-20 text-center">
                <p className="text-red-400 font-semibold mb-2">Could not load this case</p>
                <p className="text-gray-500 text-sm mb-6">{error}</p>
                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={load}
                        className="px-4 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-400 rounded-lg text-sm font-semibold transition-colors"
                    >
                        Retry
                    </button>
                    <Link href="/cases" className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
                        ← Back to Cases
                    </Link>
                </div>
            </div>
        );
    }

    const { case: caseInfo, client, summary, payments, invoices } = data;
    const status = getStatusByCode(caseInfo.status);
    const fullyCollected = summary.outstanding === 0 && summary.serviceFee !== null && summary.serviceFee > 0;

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                <div>
                    <Link href="/cases" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← All Cases</Link>
                    <h1 className="text-3xl font-bold text-white">
                        {client.firstName} {client.lastName}
                    </h1>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-400">
                        <span>{client.idNumber}</span>
                        {client.email && <span>{client.email}</span>}
                        {client.phone && <span>{client.phone}</span>}
                        <span className="text-gray-500">File: {caseInfo.fileNumber}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3 self-start flex-wrap">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase tracking-wide">
                        {status?.name ?? caseInfo.status}
                    </span>
                    <a
                        href={casesAppUrl(`/cases/${caseInfo.id}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-lg text-sm font-medium transition-colors"
                    >
                        Open in Cases app ↗
                    </a>
                </div>
            </div>

            {/* Over-collection warning */}
            {summary.overCollected > 0 && (
                <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                        <p className="text-red-400 font-semibold text-sm">Over-collection detected</p>
                        <p className="text-gray-400 text-sm mt-0.5">
                            {formatRand(summary.overCollected)} has been collected beyond the agreed service fee of {formatRand(summary.serviceFee)}.
                            Check whether the debit order should be cancelled and consider a refund.
                        </p>
                    </div>
                </div>
            )}

            {/* Financial summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Service Fee</p>
                    <p className="text-2xl font-bold text-white">{formatRand(summary.serviceFee)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {summary.serviceFee === null
                            ? 'No fee set on this case'
                            : `${caseInfo.instalments} instalment${caseInfo.instalments === 1 ? '' : 's'}`}
                    </p>
                </div>
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Collected</p>
                    <p className="text-2xl font-bold text-emerald-400">{formatRand(summary.totalPaid)}</p>
                    {summary.percentCollected !== null && (
                        <div className="mt-2">
                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${summary.overCollected > 0 ? 'bg-red-400' : 'bg-emerald-400'}`}
                                    style={{ width: `${summary.percentCollected}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{summary.percentCollected}% of fee</p>
                        </div>
                    )}
                </div>
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                        {summary.overCollected > 0 ? 'Over-collected' : 'Outstanding'}
                    </p>
                    <p className={`text-2xl font-bold ${summary.overCollected > 0 ? 'text-red-400' : fullyCollected ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {summary.overCollected > 0 ? formatRand(summary.overCollected) : formatRand(summary.outstanding)}
                    </p>
                    {fullyCollected && summary.overCollected === 0 && (
                        <p className="text-xs text-emerald-500 mt-1">Fully collected ✓</p>
                    )}
                </div>
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Invoiced</p>
                    <p className="text-2xl font-bold text-white">{formatRand(summary.invoicedTotal)}</p>
                    <p className="text-xs text-gray-500 mt-1">{summary.invoiceCount} invoice{summary.invoiceCount === 1 ? '' : 's'}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Fee & billing details */}
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5 h-fit">
                    <h2 className="text-white font-semibold mb-4">Fee &amp; Billing</h2>
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Source</dt>
                            <dd className="text-gray-300 text-right">
                                {caseInfo.acquisitionType === 'B2B'
                                    ? `B2B — ${caseInfo.partnerName ?? 'Partner'}${caseInfo.partnerBranch ? ` (${caseInfo.partnerBranch})` : ''}`
                                    : 'B2C (Private)'}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Fee collected by</dt>
                            <dd className="text-gray-300">{caseInfo.serviceFeeCollectedBy}</dd>
                        </div>
                        {caseInfo.partnerSplitPercent > 0 && (
                            <div className="flex justify-between gap-4">
                                <dt className="text-gray-500">Partner split</dt>
                                <dd className="text-gray-300">{caseInfo.partnerSplitPercent}%</dd>
                            </div>
                        )}
                        {caseInfo.zenowethuShare !== null && (
                            <div className="flex justify-between gap-4">
                                <dt className="text-gray-500">Zenowethu share</dt>
                                <dd className="text-gray-300">{formatRand(caseInfo.zenowethuShare)}</dd>
                            </div>
                        )}
                        <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">R350 admin fee</dt>
                            <dd className="text-gray-300">{caseInfo.r350Status.replace(/_/g, ' ')}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Invoiced</dt>
                            <dd className={caseInfo.isInvoiced ? 'text-emerald-400' : 'text-amber-400'}>
                                {caseInfo.isInvoiced ? 'Yes' : 'Not yet'}
                            </dd>
                        </div>
                        <div className="border-t border-white/5 pt-3 flex justify-between gap-4">
                            <dt className="text-gray-500">Total debt under review</dt>
                            <dd className="text-gray-300">{formatRand(caseInfo.totalDebtAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Monthly instalment</dt>
                            <dd className="text-gray-300">{formatRand(caseInfo.totalMonthlyInstallment)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Case opened</dt>
                            <dd className="text-gray-300">{formatDate(caseInfo.createdAt)}</dd>
                        </div>
                    </dl>
                </div>

                {/* Payments + invoices */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Payments */}
                    <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5">
                        <div className="flex items-center justify-between p-5 pb-3">
                            <h2 className="text-white font-semibold">Payments</h2>
                            <Link
                                href={`/payments/record?idNumber=${encodeURIComponent(client.idNumber)}`}
                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-semibold transition-colors"
                            >
                                + Record Payment
                            </Link>
                        </div>
                        {payments.length === 0 ? (
                            <p className="text-gray-500 text-sm px-5 pb-5">
                                No payments recorded for this case yet. Record a manual payment or import a partner batch.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-t border-white/5">
                                            <th className="px-5 py-2 font-medium">Date</th>
                                            <th className="px-5 py-2 font-medium">Amount</th>
                                            <th className="px-5 py-2 font-medium">Method</th>
                                            <th className="px-5 py-2 font-medium">Reference</th>
                                            <th className="px-5 py-2 font-medium">Status</th>
                                            <th className="px-5 py-2 font-medium">Source</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payments.map(p => (
                                            <tr key={p.id} className="border-t border-white/5 text-gray-300">
                                                <td className="px-5 py-2.5 whitespace-nowrap">{formatDate(p.date)}</td>
                                                <td className="px-5 py-2.5 font-medium text-white whitespace-nowrap">{formatRand(p.amount)}</td>
                                                <td className="px-5 py-2.5">{p.method.replace(/_/g, ' ')}</td>
                                                <td className="px-5 py-2.5 text-gray-400">{p.reference ?? '—'}</td>
                                                <td className="px-5 py-2.5">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_STATUS_COLORS[p.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-2.5 text-gray-400">
                                                    {p.batch
                                                        ? `Batch: ${p.batch.fileName}`
                                                        : p.recordedBy
                                                            ? `${p.recordedBy.firstName} ${p.recordedBy.lastName}`
                                                            : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Invoices */}
                    <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5">
                        <div className="flex items-center justify-between p-5 pb-3">
                            <h2 className="text-white font-semibold">Invoices &amp; Quotes</h2>
                            <Link
                                href="/invoices/new"
                                className="px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-semibold transition-colors"
                            >
                                + New Invoice
                            </Link>
                        </div>
                        {invoices.length === 0 ? (
                            <p className="text-gray-500 text-sm px-5 pb-5">No invoices for this case yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-t border-white/5">
                                            <th className="px-5 py-2 font-medium">Number</th>
                                            <th className="px-5 py-2 font-medium">Type</th>
                                            <th className="px-5 py-2 font-medium">Total</th>
                                            <th className="px-5 py-2 font-medium">Status</th>
                                            <th className="px-5 py-2 font-medium">Issued</th>
                                            <th className="px-5 py-2 font-medium">Due</th>
                                            <th className="px-5 py-2 font-medium text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.map(inv => (
                                            <tr key={inv.id} className="border-t border-white/5 text-gray-300">
                                                <td className="px-5 py-2.5">
                                                    <Link href={`/invoices/${inv.id}`} className="text-cyan-400 hover:text-cyan-300 font-medium">
                                                        {inv.invoiceNumber}
                                                    </Link>
                                                </td>
                                                <td className="px-5 py-2.5">{inv.type}</td>
                                                <td className="px-5 py-2.5 font-medium text-white whitespace-nowrap">{formatRand(inv.total)}</td>
                                                <td className="px-5 py-2.5">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${INVOICE_STATUS_COLORS[inv.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                                                        {inv.status.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-2.5 whitespace-nowrap">{formatDate(inv.issuedAt)}</td>
                                                <td className="px-5 py-2.5 whitespace-nowrap">{formatDate(inv.dueAt)}</td>
                                                <td className="px-5 py-2.5 text-right">
                                                    <DeleteDocumentButton
                                                        documentId={inv.id}
                                                        documentNumber={inv.invoiceNumber}
                                                        type={inv.type === 'QUOTE' ? 'QUOTE' : 'INVOICE'}
                                                        onDeleted={load}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Debit order mandate */}
            <div className="mt-6">
                <MandateForm caseId={caseInfo.id} />
            </div>
        </div>
    );
}
