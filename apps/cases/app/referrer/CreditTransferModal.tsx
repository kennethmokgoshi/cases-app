'use client';

import { useState, FormEvent } from 'react';
import { toast } from '@zenowethu/ui';

type ReferralRow = {
    caseId: string;
    fileNumber: string;
    consumerLabel: string;
    totalPaid: number;
    quoteTotal: number | null;
};

type CreditTransferModalProps = {
    isOpen: boolean;
    sourceCase: ReferralRow | null;
    allCases: ReferralRow[];
    onClose: () => void;
    onSuccess: () => void;
};

export function CreditTransferModal({
    isOpen,
    sourceCase,
    allCases,
    onClose,
    onSuccess,
}: CreditTransferModalProps) {
    const [selectedDestinationId, setSelectedDestinationId] = useState('');
    const [transferAmount, setTransferAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen || !sourceCase) return null;

    const availableCredit = sourceCase.totalPaid - (sourceCase.quoteTotal ?? 0);
    const destinationCases = allCases.filter((c) => c.caseId !== sourceCase.caseId);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (!selectedDestinationId) {
            setError('Please select a destination case');
            return;
        }

        const amount = parseFloat(transferAmount);
        if (!transferAmount || isNaN(amount) || amount <= 0) {
            setError('Please enter a valid transfer amount');
            return;
        }

        if (amount > availableCredit) {
            setError(`Transfer amount cannot exceed available credit of R ${availableCredit.toFixed(2)}`);
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/referrer-portal/transfer-credit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromCaseId: sourceCase.caseId,
                    toCaseId: selectedDestinationId,
                    amount,
                    notes: notes.trim() || undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Transfer failed');
                return;
            }

            toast.success(`Credit transfer of R ${amount.toFixed(2)} completed`);
            setTransferAmount('');
            setNotes('');
            setSelectedDestinationId('');
            onSuccess();
            onClose();
        } catch (err) {
            setError('Transfer failed due to a network error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold text-white">Transfer Credit</h2>
                <p className="mt-1 text-sm text-slate-400">
                    From: <span className="font-mono text-cyan-200">{sourceCase.fileNumber}</span> ({sourceCase.consumerLabel})
                </p>
                <p className="mt-1 text-sm text-slate-300">
                    Available credit: <span className="font-semibold text-emerald-300">R {availableCredit.toFixed(2)}</span>
                </p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300">Destination Case</label>
                        <select
                            value={selectedDestinationId}
                            onChange={(e) => setSelectedDestinationId(e.target.value)}
                            className="mt-2 w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                        >
                            <option value="">Select a case to receive credit...</option>
                            {destinationCases.map((c) => (
                                <option key={c.caseId} value={c.caseId}>
                                    {c.fileNumber} — {c.consumerLabel}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300">Transfer Amount (R)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={availableCredit}
                            value={transferAmount}
                            onChange={(e) => setTransferAmount(e.target.value)}
                            placeholder="0.00"
                            className="mt-2 w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300">Notes (optional)</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Reason for transfer..."
                            rows={2}
                            className="mt-2 w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                        />
                    </div>

                    {error && (
                        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-2 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Transferring...' : 'Transfer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
