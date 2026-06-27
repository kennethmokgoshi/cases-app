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

export default function RecordPaymentPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
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

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (idNumber.length >= 6) lookupClient();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        try {
            const res = await fetch('/api/finance/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idNumber: idNumber || undefined, amount, date, method, reference, notes, category }) });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to record payment');
            }
            router.push('/payments');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <div className="mb-8">
                <Link href="/payments" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Back to Payments</Link>

                <h1 className="text-3xl font-bold text-white">Record Manual Payment</h1>
                <p className="text-gray-400 text-sm mt-1">Log a single payment and link it to a client</p>
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

                <div className="flex gap-3">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
                    >
                        {submitting ? 'Recording...' : 'Record Payment'}
                    </button>
                    <Link
                        href="/payments"
                        className="px-6 py-3 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl font-medium transition-colors text-center"
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}
