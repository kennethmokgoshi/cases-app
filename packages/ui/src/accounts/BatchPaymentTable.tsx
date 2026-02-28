'use client';

import { useState } from 'react';
import Link from 'next/link';

type Payment = {
    id: string;
    amount: number; // or string based on serialization
    date: string | Date;
    reference: string | null;
    status: string;
    unmatchedId: string | null;
    client: {
        id: string;
        firstName: string;
        lastName: string;
        idNumber: string;
    } | null;
    notes: string | null;
};

export function BatchPaymentTable({ payments }: { payments: any[] }) {
    const [filter, setFilter] = useState<'ALL' | 'MATCHED' | 'UNMATCHED'>('ALL');

    const filteredPayments = payments.filter(p => {
        if (filter === 'MATCHED') return p.status === 'COMPLETED' || p.clientId;
        if (filter === 'UNMATCHED') return p.status === 'UNALLOCATED' || !p.clientId;
        return true;
    });

    // Formatting helper
    const fmtMoney = (val: any) => {
        const num = parseFloat(val);
        return isNaN(num) ? 'R 0.00' : 'R ' + num.toFixed(2);
    };

    const fmtDate = (d: any) => {
        if (!d) return '-';
        return new Date(d).toLocaleDateString();
    };

    return (
        <div className="space-y-4">
            {/* Filter Tabs */}
            <div className="flex gap-2 border-b border-white/10 pb-1">
                <button
                    onClick={() => setFilter('ALL')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${filter === 'ALL' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    All ({payments.length})
                </button>
                <button
                    onClick={() => setFilter('MATCHED')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${filter === 'MATCHED' ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    Matched ({payments.filter(p => p.status === 'COMPLETED' || p.clientId).length})
                </button>
                <button
                    onClick={() => setFilter('UNMATCHED')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${filter === 'UNMATCHED' ? 'bg-red-500/10 text-red-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    Unmatched ({payments.filter(p => p.status === 'UNALLOCATED' || !p.clientId).length})
                </button>
            </div>

            {/* Table */}
            <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-white/5 uppercase tracking-wider text-xs font-semibold text-gray-300">
                            <tr>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Client / ID Ref</th>
                                <th className="px-6 py-3">Reference</th>
                                <th className="px-6 py-3 text-right">Amount</th>
                                <th className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredPayments.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500 italic">
                                        No payments found in this view.
                                    </td>
                                </tr>
                            ) : (
                                filteredPayments.map((payment) => (
                                    <tr key={payment.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4">
                                            {payment.status === 'COMPLETED' || payment.clientId ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                                                    Matched
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-1 rounded bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20">
                                                    Unmatched
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {fmtDate(payment.date)}
                                        </td>
                                        <td className="px-6 py-4">
                                            {payment.client ? (
                                                <div>
                                                    <div className="text-white font-medium">{payment.client.firstName} {payment.client.lastName}</div>
                                                    <div className="text-xs text-gray-500">{payment.client.idNumber}</div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <span className="text-red-300">Unknown Client</span>
                                                    <div className="text-xs text-gray-500 font-mono">ID: {payment.unmatchedId || 'N/A'}</div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 max-w-xs truncate" title={payment.reference || ''}>
                                            {payment.reference || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right text-white font-medium">
                                            {fmtMoney(payment.amount)}
                                        </td>
                                        <td className="px-6 py-4">
                                            {/* Action buttons (Edit/Assign) could go here */}
                                            {!payment.clientId && (
                                                <button className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline">
                                                    Assign Manually
                                                </button>
                                            )}
                                            {payment.clientId && (
                                                <Link href={`/cases?clientId=${payment.clientId}`} className="text-xs text-gray-500 hover:text-white hover:underline">
                                                    View Client
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
