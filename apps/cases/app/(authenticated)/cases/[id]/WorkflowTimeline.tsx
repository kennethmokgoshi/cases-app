'use client';

import { useState, useEffect } from 'react';
import { WORKFLOW_STATUSES } from '@zenowethu/shared-lib';

type WorkflowLog = {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    action: string;
    timestamp: string;
    notes: string | null;
    user: { firstName: string; lastName: string } | null;
};

type Payment = {
    id: string;
    amount: number;
    date: string;
    method: string;
    reference: string | null;
    category: string;
    status: string;
    recordedBy: { firstName: string; lastName: string } | null;
};

type CaseInfo = {
    id: string;
    fileNumber: string;
    status: string;
    statusEntryDate: string;
    createdAt: string;
    serviceFee: number | null;
    instalments: number;
    totalMonthlyInstallment: number | null;
    client: { firstName: string; lastName: string };
    createdBy: { firstName: string; lastName: string } | null;
    declineFirstDetectedAt?: string | null;
    declineLastDetectedAt?: string | null;
    dhsStatus?: string | null;
};

type WorkflowData = {
    case: CaseInfo;
    logs: WorkflowLog[];
    payments: Payment[];
    paymentTotal: number;
};

const CATEGORY_COLOR: Record<string, string> = {
    BEGINNING:        'bg-blue-500/20 text-blue-400 border-blue-500/30',
    OVERDUE:          'bg-red-500/20 text-red-400 border-red-500/30',
    IN_PROGRESS:      'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    DETOUR:           'bg-orange-500/20 text-orange-400 border-orange-500/30',
    ADVANCED:         'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    ADVANCED_DETOUR:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
    ADVANCED_PROGRESS:'bg-teal-500/20 text-teal-400 border-teal-500/30',
    COMPLETED:        'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    PAYING:           'bg-teal-500/20 text-teal-400 border-teal-500/30',
    SETTLED:          'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    LOST:             'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const DOT_COLOR: Record<string, string> = {
    BEGINNING:        'bg-blue-400',
    OVERDUE:          'bg-red-400',
    IN_PROGRESS:      'bg-cyan-400',
    DETOUR:           'bg-orange-400',
    ADVANCED:         'bg-indigo-400',
    ADVANCED_DETOUR:  'bg-amber-400',
    ADVANCED_PROGRESS:'bg-teal-400',
    COMPLETED:        'bg-emerald-400',
    PAYING:           'bg-teal-400',
    SETTLED:          'bg-emerald-400',
    LOST:             'bg-gray-400',
};

function getStatusMeta(code: string) {
    return WORKFLOW_STATUSES.find(s => s.code === code);
}

function formatZAR(n: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n);
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-ZA', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function daysAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
}

function StatusBadge({ code }: { code: string }) {
    const meta = getStatusMeta(code);
    const colors = CATEGORY_COLOR[meta?.category ?? ''] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors}`}>
            {meta?.name ?? code.replace(/_/g, ' ')}
        </span>
    );
}

export function WorkflowTimeline({ caseId }: { caseId: string }) {
    const [data, setData] = useState<WorkflowData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showPayments, setShowPayments] = useState(false);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/cases/${caseId}/workflow`)
            .then(r => r.json())
            .then(d => {
                if (d.error) throw new Error(d.error);
                setData(d);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [caseId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
        );
    }

    if (!data) return null;

    const { case: c, logs, payments, paymentTotal } = data;
    const daysOpen = Math.floor((Date.now() - new Date(c.createdAt as string).getTime()) / 86400000);
    const currentMeta = getStatusMeta(c.status);
    const currentDotColor = DOT_COLOR[currentMeta?.category ?? ''] ?? 'bg-gray-400';

    const progressPercent =
        c.serviceFee && Number(c.serviceFee) > 0
            ? Math.min(100, (paymentTotal / Number(c.serviceFee)) * 100)
            : null;

    // Build a merged timeline: status changes + payments sorted chronologically
    type TimelineItem =
        | { kind: 'log'; data: WorkflowLog }
        | { kind: 'payment'; data: Payment };

    const timeline: TimelineItem[] = [
        ...logs.map(l => ({ kind: 'log' as const, data: l })),
        ...payments.map(p => ({ kind: 'payment' as const, data: p })),
    ].sort((a, b) => {
        const dateA = a.kind === 'log' ? a.data.timestamp : a.data.date;
        const dateB = b.kind === 'log' ? b.data.timestamp : b.data.date;
        return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    return (
        <div className="space-y-6">
            {/* Current status + summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 bg-white/[0.03] border border-white/10 rounded-2xl p-5 flex items-start gap-4">
                    <div className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ring-4 ring-white/10 ${currentDotColor}`} />
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Current Status</p>
                        <div className="flex items-center gap-3 flex-wrap">
                            <StatusBadge code={c.status} />
                            <span className="text-gray-500 text-xs">
                                since {formatDate(c.statusEntryDate)} · {daysAgo(c.statusEntryDate)}
                            </span>
                        </div>
                        {currentMeta?.description && (
                            <p className="text-gray-400 text-xs mt-1.5">{currentMeta.description}</p>
                        )}
                        {currentMeta?.slaEnabled && currentMeta.slaDays && (
                            <p className="text-gray-500 text-xs mt-1">
                                SLA: <span className="text-amber-400">{currentMeta.slaDays} day{currentMeta.slaDays !== 1 ? 's' : ''}</span>
                            </p>
                        )}
                    </div>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Payment Progress</p>
                    {progressPercent !== null ? (
                        <>
                            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-emerald-400 font-semibold">{formatZAR(paymentTotal)} paid</span>
                                <span className="text-gray-500">{progressPercent.toFixed(0)}% of {formatZAR(Number(c.serviceFee))}</span>
                            </div>
                        </>
                    ) : (
                        <div>
                            <p className="text-white font-semibold">{formatZAR(paymentTotal)}</p>
                            <p className="text-gray-500 text-xs">{payments.length} payment{payments.length !== 1 ? 's' : ''} recorded</p>
                        </div>
                    )}
                    {c.totalMonthlyInstallment && Number(c.totalMonthlyInstallment) > 0 && (
                        <p className="text-gray-500 text-xs">
                            Monthly: <span className="text-gray-300">{formatZAR(Number(c.totalMonthlyInstallment))}</span>
                        </p>
                    )}
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <p className="text-2xl font-bold text-white">{logs.length}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Status changes</p>
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <p className="text-2xl font-bold text-white">{payments.length}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Payments</p>
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <p className="text-2xl font-bold text-white">
                        {daysOpen}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Days since open</p>
                </div>
            </div>

            {/* Timeline */}
            <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                    Case Timeline
                </h3>

                {timeline.length === 0 ? (
                    <p className="text-gray-500 text-sm py-6 text-center">No workflow history yet.</p>
                ) : (
                    <ol className="relative border-l border-white/10 space-y-0 ml-3">
                        {/* Case opened — first entry */}
                        <li className="mb-6 ml-6">
                            <span className="absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full bg-gray-600 ring-4 ring-[var(--color-bg-primary)]">
                                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                            </span>
                            <div className="flex items-start gap-3 flex-wrap">
                                <div>
                                    <p className="text-white text-sm font-medium">Case opened</p>
                                    <p className="text-gray-500 text-xs mt-0.5">
                                        {formatDateTime(c.createdAt)}
                                        {c.createdBy && ` · ${c.createdBy.firstName} ${c.createdBy.lastName}`}
                                    </p>
                                </div>
                            </div>
                        </li>

                        {/* DHS Decline Date (if applicable) */}
                        {c.declineFirstDetectedAt && (
                            <li className="mb-6 ml-6">
                                <span className="absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full bg-red-600 ring-4 ring-[var(--color-bg-primary)]">
                                    <span className="w-1.5 h-1.5 bg-red-300 rounded-full" />
                                </span>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-red-500/20 text-red-400 border-red-500/30">
                                            🚩 DHS Decline Detected
                                        </span>
                                    </div>
                                    <p className="text-gray-500 text-xs">
                                        {formatDateTime(c.declineFirstDetectedAt)}
                                    </p>
                                    {c.declineLastDetectedAt && c.declineLastDetectedAt !== c.declineFirstDetectedAt && (
                                        <p className="text-gray-500 text-xs mt-1">
                                            Most recent: {formatDateTime(c.declineLastDetectedAt)}
                                        </p>
                                    )}
                                </div>
                            </li>
                        )}

                        {timeline.map((item) => {
                            if (item.kind === 'log') {
                                const log = item.data;
                                const toMeta = getStatusMeta(log.toStatus);
                                const dotColor = DOT_COLOR[toMeta?.category ?? ''] ?? 'bg-gray-400';
                                return (
                                    <li key={`log-${log.id}`} className="mb-6 ml-6">
                                        <span className={`absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full ring-4 ring-[var(--color-bg-primary)] ${dotColor}`} />
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <StatusBadge code={log.toStatus} />
                                                {log.fromStatus && (
                                                    <span className="text-gray-600 text-xs">
                                                        from <span className="text-gray-400">{getStatusMeta(log.fromStatus)?.name ?? log.fromStatus.replace(/_/g, ' ')}</span>
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-gray-500 text-xs">
                                                {formatDateTime(log.timestamp)}
                                                {log.user && ` · ${log.user.firstName} ${log.user.lastName}`}
                                            </p>
                                            {log.notes && (
                                                <p className="text-gray-400 text-xs bg-white/[0.03] border border-white/5 rounded px-3 py-2 mt-1">
                                                    {log.notes}
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                );
                            }

                            const pmt = item.data;
                            return (
                                <li key={`pmt-${pmt.id}`} className="mb-6 ml-6">
                                    <span className="absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 ring-4 ring-[var(--color-bg-primary)]">
                                        <span className="w-1.5 h-1.5 bg-emerald-200 rounded-full" />
                                    </span>
                                    <div className="space-y-0.5">
                                        <p className="text-emerald-400 text-sm font-semibold">
                                            Payment — {formatZAR(Number(pmt.amount))}
                                            <span className="text-gray-500 font-normal text-xs ml-2">{pmt.method.replace(/_/g, ' ')}</span>
                                        </p>
                                        <p className="text-gray-500 text-xs">
                                            {formatDate(pmt.date)}
                                            {pmt.recordedBy && ` · recorded by ${pmt.recordedBy.firstName} ${pmt.recordedBy.lastName}`}
                                            {pmt.reference && ` · Ref: ${pmt.reference}`}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}

                        {/* Current status pin */}
                        <li className="mb-2 ml-6">
                            <span className={`absolute -left-2.5 flex items-center justify-center w-5 h-5 rounded-full ring-4 ring-[var(--color-bg-primary)] ${currentDotColor}`}>
                                <span className="w-2 h-2 bg-white/70 rounded-full" />
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                                <StatusBadge code={c.status} />
                                <span className="text-gray-500 text-xs font-medium">Current · {daysAgo(c.statusEntryDate)}</span>
                            </div>
                        </li>
                    </ol>
                )}
            </div>

            {/* Payments table toggle */}
            {payments.length > 0 && (
                <div>
                    <button
                        onClick={() => setShowPayments(v => !v)}
                        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        <svg
                            className={`w-4 h-4 transition-transform ${showPayments ? 'rotate-90' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {showPayments ? 'Hide' : 'Show'} all {payments.length} payment{payments.length !== 1 ? 's' : ''}
                    </button>

                    {showPayments && (
                        <div className="mt-3 bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/5">
                                        <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Date</th>
                                        <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Amount</th>
                                        <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Method</th>
                                        <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Category</th>
                                        <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Reference</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {payments.map(p => (
                                        <tr key={p.id} className="hover:bg-white/[0.02]">
                                            <td className="px-4 py-2.5 text-gray-300">{formatDate(p.date)}</td>
                                            <td className="px-4 py-2.5 text-right text-emerald-400 font-semibold">{formatZAR(Number(p.amount))}</td>
                                            <td className="px-4 py-2.5 text-gray-400 text-xs">{p.method.replace(/_/g, ' ')}</td>
                                            <td className="px-4 py-2.5 text-gray-400 text-xs">{p.category}</td>
                                            <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{p.reference ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-white/5 bg-white/[0.02]">
                                        <td className="px-4 py-2.5 text-xs text-gray-500">Total</td>
                                        <td className="px-4 py-2.5 text-right text-emerald-400 font-bold">{formatZAR(paymentTotal)}</td>
                                        <td colSpan={3} />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
