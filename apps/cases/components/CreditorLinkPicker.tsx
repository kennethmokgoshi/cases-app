'use client';

import { useEffect, useRef, useState } from 'react';

interface CreditProviderOption {
    id:      string;
    name:    string;
    email:   string | null;
    phone:   string | null;
    address: string | null;
}

interface CreditorLinkPickerProps {
    caseId:       string;
    accountId:    string;
    creditorName: string;
    onLinked:     () => void;
}

/**
 * Small inline popover for linking a case's credit account to a
 * CreditProvider directory record — search existing providers, or (if
 * permitted) quick-create one — so its contact details flow into generated
 * documents like Form 17.W and creditor emails.
 */
export function CreditorLinkPicker({ caseId, accountId, creditorName, onLinked }: CreditorLinkPickerProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState(creditorName);
    const [results, setResults] = useState<CreditProviderOption[]>([]);
    const [searching, setSearching] = useState(false);
    const [linking, setLinking] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newProvider, setNewProvider] = useState({ email: '', phone: '', address: '' });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setShowCreateForm(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        setSearching(true);
        const timeout = setTimeout(async () => {
            try {
                const res = await fetch(`/api/admin/credit-providers?search=${encodeURIComponent(search)}&isActive=true`);
                if (res.ok) {
                    const data = await res.json();
                    setResults(data.providers ?? []);
                }
            } catch {
                // ignore — leave previous results
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [open, search]);

    const link = async (creditProviderId: string | null) => {
        setLinking(true);
        setError(null);
        try {
            const res = await fetch(`/api/cases/${caseId}/credit-accounts/${accountId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creditProviderId }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to link creditor');
            }
            setOpen(false);
            setShowCreateForm(false);
            onLinked();
        } catch (err: any) {
            setError(err.message || 'Failed to link creditor');
        } finally {
            setLinking(false);
        }
    };

    const createAndLink = async () => {
        setCreating(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/credit-providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name:    search.trim() || creditorName,
                    type:    'OTHER',
                    email:   newProvider.email || null,
                    phone:   newProvider.phone || null,
                    address: newProvider.address || null,
                }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to create credit provider');
            }
            const provider = await res.json();
            await link(provider.id);
        } catch (err: any) {
            setError(err.message || 'Failed to create credit provider');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="relative inline-block" ref={containerRef}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="text-xs text-amber-300 underline hover:text-amber-200"
            >
                Link creditor…
            </button>

            {open && (
                <div className="absolute z-20 mt-1 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 text-left">
                    {!showCreateForm ? (
                        <>
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search credit providers…"
                                className="w-full px-2 py-1.5 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 mb-2"
                                autoFocus
                            />
                            <div className="max-h-40 overflow-y-auto space-y-1">
                                {searching ? (
                                    <p className="text-xs text-zinc-500 px-1 py-2">Searching…</p>
                                ) : results.length === 0 ? (
                                    <p className="text-xs text-zinc-500 px-1 py-2">No matching providers.</p>
                                ) : (
                                    results.map(p => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            disabled={linking}
                                            onClick={() => link(p.id)}
                                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
                                        >
                                            <div className="text-xs font-medium text-zinc-100">{p.name}</div>
                                            <div className="text-[10px] text-zinc-500">{p.email || 'no email'} · {p.phone || 'no phone'}</div>
                                        </button>
                                    ))
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCreateForm(true)}
                                className="mt-2 w-full text-xs text-teal-300 hover:text-teal-200 text-left px-1"
                            >
                                + Add new creditor
                            </button>
                        </>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-zinc-200">New creditor: {search.trim() || creditorName}</p>
                            <input
                                type="email"
                                placeholder="Email"
                                value={newProvider.email}
                                onChange={e => setNewProvider(p => ({ ...p, email: e.target.value }))}
                                className="w-full px-2 py-1.5 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100"
                            />
                            <input
                                type="text"
                                placeholder="Phone"
                                value={newProvider.phone}
                                onChange={e => setNewProvider(p => ({ ...p, phone: e.target.value }))}
                                className="w-full px-2 py-1.5 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100"
                            />
                            <textarea
                                placeholder="Address"
                                value={newProvider.address}
                                onChange={e => setNewProvider(p => ({ ...p, address: e.target.value }))}
                                className="w-full px-2 py-1.5 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100"
                                rows={2}
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateForm(false)}
                                    className="text-xs px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300"
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    disabled={creating}
                                    onClick={createAndLink}
                                    className="text-xs px-2 py-1 rounded-lg bg-teal-600 text-white disabled:opacity-50"
                                >
                                    {creating ? 'Creating…' : 'Create & Link'}
                                </button>
                            </div>
                        </div>
                    )}
                    {error && <p className="mt-2 text-[10px] text-red-400">{error}</p>}
                </div>
            )}
        </div>
    );
}
