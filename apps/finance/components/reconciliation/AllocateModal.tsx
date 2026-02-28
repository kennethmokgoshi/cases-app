'use client';

import { useState, useEffect, useRef } from 'react';

type ClientResult = {
    id: string;
    firstName: string;
    lastName: string;
    idNumber: string;
    email: string | null;
    phone: string | null;
    activeCase: { id: string; fileNumber: string; status: string } | null;
};

type Props = {
    paymentId: string;
    paymentAmount: number;
    originalId: string | null;
    onClose: () => void;
    onAllocated: (paymentId: string) => void;
};

function formatZAR(amount: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
}

export default function AllocateModal({ paymentId, paymentAmount, originalId, onClose, onAllocated }: Props) {
    const [query, setQuery] = useState(originalId || '');
    const [results, setResults] = useState<ClientResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<ClientResult | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`/api/finance/clients/search?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                setResults(data.clients || []);
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
    }, [query]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    async function handleAllocate() {
        if (!selected) return;
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/finance/payments/${paymentId}/allocate`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: selected.id,
                    caseId: selected.activeCase?.id }) });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Failed to allocate payment');
                return;
            }
            onAllocated(paymentId);
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
                {/* Header */}
                <div className="flex items-start justify-between p-5 border-b border-white/5">
                    <div>
                        <h2 className="text-white font-semibold">Assign Payment</h2>
                        <p className="text-gray-500 text-xs mt-0.5">
                            {formatZAR(paymentAmount)}
                            {originalId && (
                                <> · Original ID: <span className="font-mono text-orange-400">{originalId}</span></>
                            )}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Search input */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Search by name or ID number</label>
                        <input
                            type="text"
                            value={query}
                            onChange={e => { setQuery(e.target.value); setSelected(null); }}
                            placeholder="e.g. 8001015009087 or John Smith"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors"
                            autoFocus
                        />
                    </div>

                    {/* Search results */}
                    {query.length >= 2 && (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto">
                            {searching ? (
                                <p className="text-gray-500 text-xs py-4 text-center">Searching...</p>
                            ) : results.length === 0 ? (
                                <p className="text-gray-500 text-xs py-4 text-center">No clients found for &quot;{query}&quot;</p>
                            ) : (
                                results.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => setSelected(c)}
                                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                                            selected?.id === c.id
                                                ? 'bg-cyan-500/15 border-cyan-500/40'
                                                : 'bg-white/3 border-white/5 hover:bg-white/8 hover:border-white/15'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-white text-sm font-medium truncate">
                                                    {c.firstName} {c.lastName}
                                                </p>
                                                <p className="text-gray-500 text-xs font-mono">{c.idNumber}</p>
                                            </div>
                                            {c.activeCase ? (
                                                <span className="text-cyan-400 text-xs font-mono shrink-0">{c.activeCase.fileNumber}</span>
                                            ) : (
                                                <span className="text-orange-400 text-xs shrink-0">No active case</span>
                                            )}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}

                    {/* Selected client preview */}
                    {selected && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5">
                            <p className="text-xs text-emerald-500 font-medium mb-1.5">Selected</p>
                            <p className="text-white text-sm font-semibold">{selected.firstName} {selected.lastName}</p>
                            <p className="text-gray-400 text-xs font-mono mt-0.5">{selected.idNumber}</p>
                            {selected.activeCase ? (
                                <p className="text-cyan-400 text-xs mt-1.5">
                                    Case: <span className="font-mono">{selected.activeCase.fileNumber}</span>
                                    <span className="text-gray-500 ml-1">· {selected.activeCase.status}</span>
                                </p>
                            ) : (
                                <p className="text-orange-400 text-xs mt-1.5">
                                    No active case — payment will be linked to client only
                                </p>
                            )}
                        </div>
                    )}

                    {error && (
                        <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-5 border-t border-white/5">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAllocate}
                        disabled={!selected || saving}
                        className="px-5 py-2 rounded-xl text-sm font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Assigning...' : 'Assign Payment'}
                    </button>
                </div>
            </div>
        </div>
    );
}
