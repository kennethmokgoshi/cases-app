'use client';

import { useEffect, useState } from 'react';
import { toast } from '@zenowethu/ui';

// Slim referrer shape shared with GET /api/cases/[id] and PATCH /api/cases/[id]/referrer.
export interface CaseReferrer {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    cellNumber: string | null;
    referrerType: string;
    isActive: boolean;
}

interface ReferrerOption extends CaseReferrer {
    project?: { id: string; name: string } | null;
}

interface AssignReferrerModalProps {
    isOpen: boolean;
    onClose: () => void;
    caseId: string;
    currentReferrer: CaseReferrer | null;
    onChanged: (referrer: CaseReferrer | null) => void;
}

// Lets staff assign, change, or remove the referrer credited with a case —
// used to correct referrals linked to the wrong referrer (or to none at all).
export default function AssignReferrerModal({ isOpen, onClose, caseId, currentReferrer, onChanged }: AssignReferrerModalProps) {
    const [search, setSearch] = useState('');
    const [options, setOptions] = useState<ReferrerOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const params = new URLSearchParams({ isActive: 'true', page: '1' });
                if (search.trim()) params.set('search', search.trim());
                const res = await fetch(`/api/admin/referrers?${params}`);
                if (!res.ok) throw new Error('Failed to load referrers');
                const json = await res.json();
                if (!cancelled) setOptions(json.referrers ?? []);
            } catch {
                if (!cancelled) {
                    setOptions([]);
                    toast.error('Could not load referrers.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [isOpen, search]);

    if (!isOpen) return null;

    const save = async (referrerId: string | null) => {
        setSaving(true);
        try {
            const res = await fetch(`/api/cases/${caseId}/referrer`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ referrerId }),
            });
            const json = await res.json();
            if (!res.ok) {
                toast.error(json.error || 'Failed to update referrer.');
                return;
            }
            onChanged(json.referrer ?? null);
            toast.success(
                json.referrer
                    ? `Referrer set to ${json.referrer.firstName} ${json.referrer.lastName}.`
                    : 'Referrer removed from this case.'
            );
            onClose();
        } catch {
            toast.error('Failed to update referrer.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-zeno-dark border border-zeno-blue/50 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
                <div className="border-b border-zeno-blue/40 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">{currentReferrer ? 'Change Referrer' : 'Assign Referrer'}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {currentReferrer && (
                        <div className="bg-zeno-blue/20 border border-zeno-blue/30 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                            <div className="text-sm min-w-0">
                                <span className="text-gray-400">Current: </span>
                                <span className="text-white font-medium">{currentReferrer.firstName} {currentReferrer.lastName}</span>
                            </div>
                            <button
                                onClick={() => save(null)}
                                disabled={saving}
                                className="text-xs text-red-400 hover:text-red-300 font-semibold shrink-0 disabled:opacity-50"
                            >
                                Remove referrer
                            </button>
                        </div>
                    )}

                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                        placeholder="Search referrers by name, ID number, email…"
                        className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                    />

                    {loading ? (
                        <p className="text-sm text-gray-500 italic py-4 text-center">Loading referrers…</p>
                    ) : options.length === 0 ? (
                        <p className="text-sm text-gray-500 italic py-4 text-center">No referrers found{search ? ` for “${search}”` : ''}.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {options.map((r) => {
                                const isCurrent = r.id === currentReferrer?.id;
                                return (
                                    <button
                                        key={r.id}
                                        onClick={() => !isCurrent && save(r.id)}
                                        disabled={saving || isCurrent}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${isCurrent ? 'bg-zeno-cyan/10 border border-zeno-cyan/20 cursor-default' : 'bg-white/5 hover:bg-white/10 disabled:opacity-50'}`}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-zeno-cyan/10 border border-zeno-cyan/20 flex items-center justify-center shrink-0">
                                            <span className="text-xs font-bold text-zeno-cyan">
                                                {r.firstName.charAt(0)}{r.lastName.charAt(0)}
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-white truncate">
                                                {r.firstName} {r.lastName}
                                                {isCurrent && <span className="ml-2 text-[10px] text-zeno-cyan font-semibold uppercase">Current</span>}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {r.project?.name || r.cellNumber || r.email || '—'}
                                            </p>
                                        </div>
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${r.referrerType === 'HYBRID' ? 'bg-cyan-500/20 text-cyan-400' : r.referrerType === 'DISCOUNT' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                            {r.referrerType === 'HYBRID' ? 'Hybrid' : r.referrerType === 'DISCOUNT' ? 'Discount' : 'Commission'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="border-t border-zeno-blue/40 px-6 py-3 flex justify-end">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
