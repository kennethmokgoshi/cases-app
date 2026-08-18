'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type ClientMatch = {
    id: string;
    firstName: string;
    lastName: string;
    idNumber: string;
    activeCase: { fileNumber: string } | null;
};

// One month of the case's payment arrangement, as returned by
// GET /api/finance/cases/[id]/arrangements.
type InstalmentOption = {
    id: string;
    sequence: number;
    dueDate: string;
    amountDue: number;
    amountPaid: number;
    balance: number;
    status: 'PENDING' | 'PAID' | 'PARTIAL' | 'MISSED' | 'WAIVED';
    paymentCount: number;
};

type ArrangementOption = {
    id: string;
    frequency: string;
    reason: string | null;
    instalments: InstalmentOption[];
    summary: { instalmentCount: number; paidCount: number; missedCount: number };
};

function periodWord(frequency: string): string {
    if (frequency === 'WEEKLY') return 'Week';
    if (frequency === 'ONCE') return 'Once-off';
    return 'Month';
}

function fmtDay(value: string): string {
    return new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtAmount(value: number): string {
    return `R${value.toFixed(2)}`;
}

export default function RecordPaymentPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const caseId = searchParams.get('caseId') ?? '';
    const [idNumber, setIdNumber] = useState(searchParams.get('idNumber') ?? '');
    const [clientMatch, setClientMatch] = useState<ClientMatch | null>(null);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState('');

    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState('EFT');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [category, setCategory] = useState('INSTALLMENT');

    // Which month of the arrangement this payment settles. Empty = let the
    // system apply it to the oldest unpaid month.
    const [arrangements, setArrangements] = useState<ArrangementOption[]>([]);
    const [instalmentId, setInstalmentId] = useState(searchParams.get('instalmentId') ?? '');

    const [proofFile, setProofFile] = useState<File | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [warning, setWarning] = useState('');

    useEffect(() => {
        if (idNumber.length >= 6) lookupClient();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load the case's payment schedule so staff can say which month this covers.
    useEffect(() => {
        if (!caseId) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/finance/cases/${caseId}/arrangements`, { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setArrangements(data.arrangements ?? []);
            } catch {
                // A missing schedule just means the month picker stays hidden.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [caseId]);

    const allInstalments = arrangements.flatMap((a) =>
        a.instalments.map((i) => ({ ...i, frequency: a.frequency, arrangementReason: a.reason }))
    );
    const chosen = allInstalments.find((i) => i.id === instalmentId) ?? null;
    // Any later month already carrying money means this capture is back-dated.
    const isBackDated =
        chosen !== null &&
        allInstalments.some((i) => i.sequence > chosen.sequence && (i.amountPaid > 0 || i.status === 'PAID'));

    // Offer the outstanding amount for the chosen month — staff can still overtype it.
    const chosenBalance = chosen?.balance ?? 0;
    useEffect(() => {
        if (chosenBalance > 0) setAmount(chosenBalance.toFixed(2));
    }, [chosenBalance]);

    async function lookupClient() {
        if (idNumber.length < 6) return;
        setLookupLoading(true);
        setLookupError('');
        setClientMatch(null);
        try {
            const res = await fetch(`/api/cases/search?q=${encodeURIComponent(idNumber)}&limit=1`);
            const data = await res.json();
            const cases = data.cases || data;
            if (cases.length > 0) {
                const c = cases[0];
                setClientMatch({
                    id: c.client?.id,
                    firstName: c.client?.firstName ?? '',
                    lastName: c.client?.lastName ?? '',
                    idNumber: c.client?.idNumber ?? idNumber,
                    activeCase: { fileNumber: c.fileNumber } });
            } else {
                setLookupError('No client found with this ID number');
            }
        } catch {
            setLookupError('Lookup failed. You can still record the payment without linking a client.');
        } finally {
            setLookupLoading(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setWarning('');
        try {
            let res: Response;
            if (proofFile) {
                const form = new FormData();
                if (idNumber) form.set('idNumber', idNumber);
                if (caseId) form.set('caseId', caseId);
                if (instalmentId) form.set('instalmentId', instalmentId);
                form.set('amount', amount);
                form.set('date', date);
                form.set('method', method);
                form.set('reference', reference);
                form.set('notes', notes);
                form.set('category', category);
                form.set('proofOfPayment', proofFile);
                res = await fetch('/api/finance/payments', { method: 'POST', body: form });
            } else {
                res = await fetch('/api/finance/payments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        idNumber: idNumber || undefined,
                        caseId: caseId || undefined,
                        instalmentId: instalmentId || undefined,
                        amount, date, method, reference, notes, category }) });
            }
            if (!res.ok) {
                const data = await res.json();
                throw new Error(typeof data.error === 'string' ? data.error : 'Failed to record payment');
            }
            const created = await res.json();
            if (created.proofUploadError) {
                // Payment saved but the file didn't — keep staff on the page so they see it
                setWarning(created.proofUploadError);
                return;
            }
            // Land back on the consumer's file so staff see the payment in context,
            // not on the global payments list they came from.
            const destination = caseId || created.caseId;
            router.push(destination ? `/cases/${destination}` : '/payments');
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <div className="mb-8">
                <Link
                    href={caseId ? `/cases/${caseId}` : '/payments'}
                    className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block"
                >
                    ← {caseId ? 'Back to file' : 'Back to Payments'}
                </Link>

                <h1 className="text-3xl font-bold text-white">Record Manual Payment</h1>
                <p className="text-gray-400 text-sm mt-1">
                    {caseId
                        ? 'Log a payment against this file — you return to the file once it saves'
                        : 'Log a single payment and link it to a client'}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Client lookup */}
                <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Client (Optional)</h2>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={idNumber}
                            onChange={(e) => setIdNumber(e.target.value)}
                            placeholder="SA ID Number"
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
                        />
                        <button
                            type="button"
                            onClick={lookupClient}
                            disabled={lookupLoading || idNumber.length < 6}
                            className="px-4 py-2.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                        >
                            {lookupLoading ? 'Looking up...' : 'Lookup'}
                        </button>
                    </div>

                    {lookupError && (
                        <p className="text-orange-400 text-xs">{lookupError}</p>
                    )}

                    {clientMatch && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 flex items-center justify-between">
                            <div>
                                <p className="text-white font-medium">{clientMatch.firstName} {clientMatch.lastName}</p>
                                <p className="text-gray-400 text-xs">{clientMatch.idNumber}
                                    {clientMatch.activeCase && <span className="ml-2 text-cyan-400">• File: {clientMatch.activeCase.fileNumber}</span>}
                                </p>
                            </div>
                            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Payment Details */}
                <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Payment Details</h2>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-gray-500 mb-1.5 block">Amount (ZAR) *</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                required
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1.5 block">Date *</label>
                            <input
                                type="date"
                                required
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-cyan-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-gray-500 mb-1.5 block">Payment Method *</label>
                            <select
                                required
                                value={method}
                                onChange={(e) => setMethod(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-cyan-500 focus:outline-none"
                            >
                                <option value="EFT">EFT</option>
                                <option value="CASH">Cash</option>
                                <option value="DEBIT_ORDER">Debit Order</option>
                                <option value="CHEQUE">Cheque</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1.5 block">Category</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-cyan-500 focus:outline-none"
                            >
                                <option value="DEPOSIT">Deposit</option>
                                <option value="INSTALLMENT">Installment</option>
                                <option value="SERVICE_FEE">Service Fee</option>
                                <option value="LEGAL_FEE">Legal Fee</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                    </div>

                    {/* Which month of the arrangement this payment settles */}
                    {allInstalments.length > 0 && (
                        <div>
                            <label className="text-xs text-gray-500 mb-1.5 block">Apply to instalment</label>
                            <select
                                value={instalmentId}
                                onChange={(e) => setInstalmentId(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-cyan-500 focus:outline-none"
                            >
                                <option value="">Auto — apply to the oldest unpaid instalment</option>
                                {arrangements.map((a) => (
                                    <optgroup
                                        key={a.id}
                                        label={`${a.reason || 'Payment arrangement'} — ${a.summary.instalmentCount} ${periodWord(a.frequency).toLowerCase()}${a.summary.instalmentCount === 1 ? '' : 's'}`}
                                    >
                                        {a.instalments.map((i) => (
                                            <option key={i.id} value={i.id}>
                                                {periodWord(a.frequency)} {i.sequence} · due {fmtDay(i.dueDate)} · {fmtAmount(i.amountDue)} · {i.status}
                                                {i.balance > 0 && i.status !== 'PENDING' ? ` (${fmtAmount(i.balance)} short)` : ''}
                                                {i.paymentCount > 0 ? ` · ${i.paymentCount} payment${i.paymentCount === 1 ? '' : 's'} already` : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            <p className="text-xs text-gray-600 mt-1">
                                Pick the instalment this proof covers. Leave on Auto and it fills the oldest unpaid one.
                            </p>
                            {isBackDated && (
                                <div className="mt-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-300 text-xs">
                                    Proof brought forward — this instalment sits before ones already paid. It will be
                                    marked paid without disturbing the later instalments.
                                </div>
                            )}
                            {chosen && chosen.status === 'PAID' && (
                                <div className="mt-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2 text-cyan-300 text-xs">
                                    This instalment is already settled — recording here counts as an extra payment in the
                                    same period.
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">Reference</label>
                        <input
                            type="text"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="e.g. EFT-20260221-001"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">Proof of Payment (optional)</label>
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                            onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                            className="w-full text-sm text-gray-400 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:text-cyan-400 file:text-sm file:font-medium file:cursor-pointer hover:file:bg-cyan-500/30"
                        />
                        <p className="text-xs text-gray-600 mt-1">PDF, JPG, PNG or WebP — max 10MB</p>
                        {proofFile && (
                            <div className="mt-2 flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                                <span className="text-gray-300 text-xs truncate">{proofFile.name} ({(proofFile.size / 1024).toFixed(0)} KB)</span>
                                <button type="button" onClick={() => setProofFile(null)} className="text-gray-500 hover:text-red-400 text-xs ml-3">Remove</button>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Any additional notes..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none resize-none"
                        />
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {warning && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-400 text-sm">
                        {warning}{' '}
                        <Link
                            href={caseId ? `/cases/${caseId}` : '/payments'}
                            className="underline hover:text-amber-300"
                        >
                            {caseId ? 'Go to file' : 'Go to Payments'}
                        </Link>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
                    >
                        {submitting ? 'Recording...' : 'Record Payment'}
                    </button>
                    <Link
                        href={caseId ? `/cases/${caseId}` : '/payments'}
                        className="px-6 py-3 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl font-medium transition-colors text-center"
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}
