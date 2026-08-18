'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@zenowethu/ui';
import { formatRand } from '../../../../lib/case-financials';

// Shape returned by GET /api/finance/cases/[id]/arrangements (ArrangementView)
type Allocation = {
    paymentId?: string;
    amount: number;
    paidOn?: string;
    recordedAt?: string;
    reference?: string | null;
};

type Instalment = {
    id: string;
    sequence: number;
    dueDate: string;
    amountDue: number;
    amountPaid: number;
    balance: number;
    status: 'PENDING' | 'PAID' | 'PARTIAL' | 'MISSED' | 'WAIVED';
    isOverdue: boolean;
    overpaid: number;
    paymentCount: number;
    broughtForward: boolean;
    allocations: Allocation[];
};

type ArrangementView = {
    id: string;
    source: string;
    status: string;
    frequency: string;
    reason: string | null;
    notes: string | null;
    createdAt: string;
    instalments: Instalment[];
    summary: {
        totalDue: number;
        totalPaid: number;
        balance: number;
        instalmentCount: number;
        paidCount: number;
        missedCount: number;
        partialCount: number;
        pendingCount: number;
        waivedCount: number;
        outstandingCount: number;
        overpaidTotal: number;
        allocatedPaymentCount: number;
        broughtForwardCount: number;
        nextPaymentDate: string | null;
        nextPaymentAmount: number | null;
        nextPaymentBalance: number | null;
        nextPaymentStatus: string | null;
        isOverdue: boolean;
        status: string;
    };
};

function fmtDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** What one line of this arrangement is called — a month, a week, or a once-off. */
function periodWord(frequency: string): string {
    if (frequency === 'WEEKLY') return 'Week';
    if (frequency === 'ONCE') return 'Once-off';
    return 'Month';
}

/** "Paying over 7 months" — the headline the consumer's schedule length gives. */
function durationLabel(frequency: string, count: number): string {
    if (frequency === 'ONCE') return 'Once-off payment';
    const unit = frequency === 'WEEKLY' ? 'week' : 'month';
    return `Paying over ${count} ${unit}${count === 1 ? '' : 's'}`;
}

const STATUS_COLORS: Record<string, string> = {
    ACTIVE: 'bg-cyan-500/20 text-cyan-400',
    COMPLETED: 'bg-emerald-500/20 text-emerald-400',
    DEFAULTED: 'bg-red-500/20 text-red-400',
    CANCELLED: 'bg-gray-600/20 text-gray-500',
};

const INST_COLORS: Record<string, string> = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    PAID: 'bg-emerald-500/20 text-emerald-400',
    PARTIAL: 'bg-amber-500/20 text-amber-400',
    MISSED: 'bg-red-500/20 text-red-400',
    WAIVED: 'bg-gray-600/20 text-gray-500',
};

export default function PaymentArrangements({ caseId }: { caseId: string }) {
    const [arrangements, setArrangements] = useState<ArrangementView[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [mandate, setMandate] = useState<{ id: string; status: string } | null>(null);
    const [busy, setBusy] = useState(false);

    // create-form state
    const [mode, setMode] = useState<'TOTAL' | 'PER'>('TOTAL');
    const [amount, setAmount] = useState('');
    const [numInstalments, setNumInstalments] = useState('3');
    const [frequency, setFrequency] = useState<'MONTHLY' | 'WEEKLY' | 'ONCE'>('MONTHLY');
    const [firstDueDate, setFirstDueDate] = useState('');
    const [reason, setReason] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [aRes, mRes] = await Promise.all([
                fetch(`/api/finance/cases/${caseId}/arrangements`, { cache: 'no-store' }),
                fetch(`/api/finance/cases/${caseId}/mandate`, { cache: 'no-store' }),
            ]);
            if (!aRes.ok) throw new Error(`Could not load arrangements (${aRes.status})`);
            const aData = await aRes.json();
            setArrangements(aData.arrangements ?? []);
            if (mRes.ok) {
                const mData = await mRes.json();
                setMandate(mData.mandate ? { id: mData.mandate.id, status: mData.mandate.status } : null);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load arrangements');
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => {
        load();
    }, [load]);

    const createManual = useCallback(async () => {
        if (!amount || !firstDueDate) {
            toast.error('Enter an amount and a first due date');
            return;
        }
        setBusy(true);
        try {
            const schedule: Record<string, unknown> = {
                numInstalments: frequency === 'ONCE' ? 1 : Number(numInstalments),
                firstDueDate: new Date(firstDueDate).toISOString(),
            };
            if (mode === 'TOTAL') schedule.totalAmount = Number(amount);
            else schedule.perInstalmentAmount = Number(amount);

            const res = await fetch(`/api/finance/cases/${caseId}/arrangements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frequency, reason: reason || null, schedule }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error?.formErrors?.join(', ') || body?.error || `Failed (${res.status})`);
            }
            toast.success('Payment arrangement created');
            setShowForm(false);
            setAmount('');
            setReason('');
            await load();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Could not create arrangement');
        } finally {
            setBusy(false);
        }
    }, [amount, firstDueDate, frequency, numInstalments, mode, reason, caseId, load]);

    const createFromMandate = useCallback(async () => {
        if (!mandate) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/finance/cases/${caseId}/arrangements/from-mandate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mandateId: mandate.id }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || `Failed (${res.status})`);
            }
            toast.success('Arrangement generated from mandate');
            await load();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Could not generate from mandate');
        } finally {
            setBusy(false);
        }
    }, [mandate, caseId, load]);

    const setOutcome = useCallback(
        async (instalmentId: string, outcome: 'PAID' | 'MISSED' | 'AUTO') => {
            try {
                const res = await fetch(`/api/finance/instalments/${instalmentId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ outcome }),
                });
                if (!res.ok) throw new Error(`Failed (${res.status})`);
                toast.success(
                    outcome === 'PAID'
                        ? 'Marked paid'
                        : outcome === 'MISSED'
                          ? 'Marked not paid'
                          : 'Manual mark cleared — recorded payments decide again'
                );
                await load();
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Could not update instalment');
            }
        },
        [load]
    );

    const mandateUsable = mandate && ['SIGNED', 'REGISTERED', 'ACTIVE'].includes(mandate.status);

    return (
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5">
            <div className="flex items-center justify-between p-5 pb-3">
                <div>
                    <h2 className="text-white font-semibold">Payment Arrangements</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Promise-to-pay schedule. The next unpaid instalment drives this file’s Next Payment Date.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {mandateUsable && (
                        <button
                            onClick={createFromMandate}
                            disabled={busy}
                            className="px-3 py-1.5 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                            Generate from approved mandate
                        </button>
                    )}
                    <button
                        onClick={() => setShowForm((s) => !s)}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                        {showForm ? 'Close' : '+ New Arrangement'}
                    </button>
                </div>
            </div>

            {/* Create form */}
            {showForm && (
                <div className="mx-5 mb-4 p-4 bg-white/5 rounded-lg border border-white/10 grid grid-cols-2 gap-3">
                    <div className="col-span-2 flex gap-2">
                        <button
                            onClick={() => setMode('TOTAL')}
                            className={`px-3 py-1.5 rounded text-xs font-medium ${mode === 'TOTAL' ? 'bg-cyan-500 text-white' : 'bg-white/5 text-gray-400'}`}
                        >
                            Split a total
                        </button>
                        <button
                            onClick={() => setMode('PER')}
                            className={`px-3 py-1.5 rounded text-xs font-medium ${mode === 'PER' ? 'bg-cyan-500 text-white' : 'bg-white/5 text-gray-400'}`}
                        >
                            Fixed per instalment
                        </button>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">
                            {mode === 'TOTAL' ? 'Total amount (R)' : 'Amount per instalment (R)'}
                        </label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Frequency</label>
                        <select
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as 'MONTHLY' | 'WEEKLY' | 'ONCE')}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                        >
                            <option value="MONTHLY">Monthly</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="ONCE">Once-off</option>
                        </select>
                    </div>
                    {frequency !== 'ONCE' && (
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Number of instalments</label>
                            <input
                                type="number"
                                min={1}
                                max={60}
                                value={numInstalments}
                                onChange={(e) => setNumInstalments(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                            />
                        </div>
                    )}
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">First due date</label>
                        <input
                            type="date"
                            value={firstDueDate}
                            onChange={(e) => setFirstDueDate(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="text-xs text-gray-500 mb-1 block">Reason (optional)</label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Legal fees, service fee instalments"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
                        />
                    </div>
                    <div className="col-span-2">
                        <button
                            onClick={createManual}
                            disabled={busy}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                            {busy ? 'Creating…' : 'Create arrangement'}
                        </button>
                    </div>
                </div>
            )}

            {/* Body */}
            {loading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm px-5 pb-5">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400" />
                    Loading arrangements…
                </div>
            ) : error ? (
                <div className="px-5 pb-5 text-sm">
                    <p className="text-amber-400 mb-2">{error}</p>
                    <button onClick={load} className="text-cyan-400 hover:underline">
                        Retry
                    </button>
                </div>
            ) : arrangements.length === 0 ? (
                <p className="text-gray-500 text-sm px-5 pb-5">
                    No payment arrangement yet. Create one so this file can proceed knowing the consumer has committed
                    to a payment plan.
                </p>
            ) : (
                <div className="px-5 pb-5 space-y-5">
                    {arrangements.map((a) => (
                        <div key={a.id} className="border border-white/10 rounded-lg overflow-hidden">
                            {/* Next Payment Date headline */}
                            <div className="p-4 bg-white/5 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider">Next Payment Date</p>
                                    <p
                                        className={`text-xl font-bold ${a.summary.isOverdue ? 'text-red-400' : 'text-white'}`}
                                    >
                                        {fmtDate(a.summary.nextPaymentDate)}
                                        {a.summary.isOverdue && (
                                            <span className="ml-2 text-xs font-semibold text-red-400">OVERDUE</span>
                                        )}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {a.summary.nextPaymentAmount !== null
                                            ? `${formatRand(a.summary.nextPaymentAmount)} due · ${formatRand(a.summary.nextPaymentBalance)} outstanding on this instalment`
                                            : 'All instalments settled'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[a.summary.status] ?? 'bg-gray-500/20 text-gray-400'}`}
                                    >
                                        {a.summary.status}
                                    </span>
                                    <p className="text-sm text-white font-semibold mt-1">
                                        {durationLabel(a.frequency, a.summary.instalmentCount)}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {a.source === 'MANDATE' ? 'From debit-order mandate' : 'Manual'} · {a.frequency.toLowerCase()}
                                    </p>
                                </div>
                            </div>

                            {/* How the schedule is tracking, period by period */}
                            <div className="px-4 py-3 border-b border-white/5 flex flex-wrap items-center gap-2 text-xs">
                                <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                                    {a.summary.paidCount} of {a.summary.instalmentCount} paid
                                </span>
                                {a.summary.missedCount > 0 && (
                                    <span className="px-2 py-1 rounded bg-red-500/15 text-red-400 font-medium">
                                        {a.summary.missedCount} not paid
                                    </span>
                                )}
                                {a.summary.partialCount > 0 && (
                                    <span className="px-2 py-1 rounded bg-amber-500/15 text-amber-400 font-medium">
                                        {a.summary.partialCount} part-paid
                                    </span>
                                )}
                                {a.summary.pendingCount > 0 && (
                                    <span className="px-2 py-1 rounded bg-gray-500/15 text-gray-400 font-medium">
                                        {a.summary.pendingCount} still to come
                                    </span>
                                )}
                                {a.summary.broughtForwardCount > 0 && (
                                    <span className="px-2 py-1 rounded bg-purple-500/15 text-purple-300 font-medium">
                                        {a.summary.broughtForwardCount} brought forward
                                    </span>
                                )}
                                {a.summary.overpaidTotal > 0 && (
                                    <span className="px-2 py-1 rounded bg-cyan-500/15 text-cyan-300 font-medium">
                                        {formatRand(a.summary.overpaidTotal)} paid over
                                    </span>
                                )}
                            </div>

                            {/* Totals */}
                            <div className="grid grid-cols-3 divide-x divide-white/5 border-b border-white/5 text-center">
                                <div className="py-3">
                                    <p className="text-xs text-gray-500">Total</p>
                                    <p className="text-white font-semibold">{formatRand(a.summary.totalDue)}</p>
                                </div>
                                <div className="py-3">
                                    <p className="text-xs text-gray-500">Paid</p>
                                    <p className="text-emerald-400 font-semibold">{formatRand(a.summary.totalPaid)}</p>
                                </div>
                                <div className="py-3">
                                    <p className="text-xs text-gray-500">Balance</p>
                                    <p className="text-amber-400 font-semibold">{formatRand(a.summary.balance)}</p>
                                </div>
                            </div>

                            {/* Instalment table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                                            <th className="px-4 py-2 font-medium">{periodWord(a.frequency)}</th>
                                            <th className="px-4 py-2 font-medium">Due</th>
                                            <th className="px-4 py-2 font-medium">Amount</th>
                                            <th className="px-4 py-2 font-medium">Paid</th>
                                            <th className="px-4 py-2 font-medium">Balance</th>
                                            <th className="px-4 py-2 font-medium">Status</th>
                                            <th className="px-4 py-2 font-medium text-right">Was it paid?</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {a.instalments.map((inst) => (
                                            <tr key={inst.sequence} className="border-t border-white/5 text-gray-300 align-top">
                                                <td className="px-4 py-2.5 whitespace-nowrap">
                                                    <span className="text-white font-medium">
                                                        {periodWord(a.frequency)} {inst.sequence}
                                                    </span>
                                                    {inst.paymentCount > 1 && (
                                                        <span className="ml-2 px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[10px] font-semibold">
                                                            {inst.paymentCount} payments
                                                        </span>
                                                    )}
                                                    {inst.broughtForward && (
                                                        <span
                                                            className="ml-2 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[10px] font-semibold"
                                                            title="Captured after a later instalment — proof brought forward"
                                                        >
                                                            brought forward
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(inst.dueDate)}</td>
                                                <td className="px-4 py-2.5 text-white">{formatRand(inst.amountDue)}</td>
                                                <td className="px-4 py-2.5 text-emerald-400">
                                                    {formatRand(inst.amountPaid)}
                                                    {inst.allocations.length > 0 && (
                                                        <span className="block text-[11px] text-gray-500 mt-0.5">
                                                            {inst.allocations
                                                                .map((p) => `${formatRand(p.amount)} on ${fmtDate(p.paidOn)}`)
                                                                .join(' · ')}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-amber-400">
                                                    {formatRand(inst.balance)}
                                                    {inst.overpaid > 0 && (
                                                        <span className="block text-[11px] text-cyan-300 mt-0.5">
                                                            +{formatRand(inst.overpaid)} over
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <span
                                                        className={`px-2 py-0.5 rounded text-xs font-medium ${INST_COLORS[inst.status] ?? 'bg-gray-500/20 text-gray-400'}`}
                                                    >
                                                        {inst.status === 'MISSED' ? 'NOT PAID' : inst.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <div className="flex items-center gap-1 justify-end">
                                                        {inst.status !== 'PAID' && (
                                                            <button
                                                                onClick={() => setOutcome(inst.id, 'PAID')}
                                                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded text-xs transition-colors"
                                                            >
                                                                Paid
                                                            </button>
                                                        )}
                                                        {inst.status !== 'MISSED' && (
                                                            <button
                                                                onClick={() => setOutcome(inst.id, 'MISSED')}
                                                                className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded text-xs transition-colors"
                                                            >
                                                                Not paid
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setOutcome(inst.id, 'AUTO')}
                                                            title="Clear the manual mark and let recorded payments decide"
                                                            className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 rounded text-xs transition-colors"
                                                        >
                                                            Clear
                                                        </button>
                                                    </div>
                                                    {inst.balance > 0 && (
                                                        <a
                                                            href={`/payments/record?caseId=${encodeURIComponent(caseId)}&instalmentId=${encodeURIComponent(inst.id)}`}
                                                            className="inline-block mt-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                                                        >
                                                            Capture payment for this {periodWord(a.frequency).toLowerCase()} →
                                                        </a>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {a.reason && <p className="px-4 py-2 text-xs text-gray-500">Reason: {a.reason}</p>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
