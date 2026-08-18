'use client';

/**
 * Document Quarantine — files that arrived on one consumer's email thread but
 * whose contents belong to a different consumer.
 *
 * These were deliberately never attached to the case they arrived on. From here
 * staff route each file to the consumer it actually belongs to, or discard it.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast, confirm } from '@zenowethu/ui';

type QuarantinedDocument = {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    detectedType: string;
    reason: string;
    extractedIdNumber: string | null;
    expectedIdNumber: string | null;
    allExtractedIds: string | null;
    sourceFrom: string | null;
    sourceSubject: string | null;
    sourceDate: string | null;
    status: string;
    reviewedAt: string | null;
    reviewNotes: string | null;
    createdAt: string;
    intendedCase: {
        id: string;
        fileNumber: string;
        client: { firstName: string; lastName: string; idNumber: string };
    };
    reassignedToCase: { id: string; fileNumber: string } | null;
    reviewedBy: { firstName: string | null; lastName: string | null } | null;
    sourceMailbox: { emailAddress: string } | null;
};

type CaseSuggestion = {
    id: string;
    fileNumber: string;
    clientName: string;
    clientIdNumber: string;
    status: string;
};

const STATUS_TABS = [
    { key: 'PENDING_REVIEW', label: 'Needs review' },
    { key: 'REASSIGNED', label: 'Reassigned' },
    { key: 'DISCARDED', label: 'Discarded' },
    { key: 'ALL', label: 'All' },
];

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentQuarantinePage() {
    const [items, setItems] = useState<QuarantinedDocument[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [status, setStatus] = useState('PENDING_REVIEW');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<CaseSuggestion[]>([]);
    const [searching, setSearching] = useState(false);
    const [notes, setNotes] = useState('');
    const [actioningId, setActioningId] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch(`/api/documents/quarantine?status=${status}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load quarantined documents');
            setItems(data.items ?? []);
            setPendingCount(data.pendingCount ?? 0);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Failed to load quarantined documents');
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const searchCases = useCallback(async (q: string) => {
        if (!q || q.trim().length < 2) {
            setSuggestions([]);
            return;
        }
        setSearching(true);
        try {
            const res = await fetch(`/api/cases/search?q=${encodeURIComponent(q.trim())}`);
            const data = await res.json();
            setSuggestions(Array.isArray(data) ? data : []);
        } catch {
            setSuggestions([]);
        } finally {
            setSearching(false);
        }
    }, []);

    // Opening a row seeds the search with the ID actually found inside the file,
    // so the case it really belongs to is usually the first result.
    const openRow = (doc: QuarantinedDocument) => {
        if (expandedId === doc.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(doc.id);
        setNotes('');
        const seed = doc.extractedIdNumber ?? '';
        setQuery(seed);
        setSuggestions([]);
        if (seed) searchCases(seed);
    };

    const handleReassign = async (doc: QuarantinedDocument, target: CaseSuggestion, force = false) => {
        if (force && !notes.trim()) {
            toast.error('A reason is required when overriding the ownership check.');
            return;
        }

        const ok = await confirm({
            title: force ? 'Override ownership check?' : 'Reassign document',
            message: force
                ? `This file does not contain ${target.clientName}'s ID number. Attach it to ${target.fileNumber} anyway?`
                : `Attach "${doc.fileName}" to ${target.fileNumber} (${target.clientName})?`,
            confirmText: force ? 'Override and attach' : 'Reassign',
            variant: force ? 'danger' : 'default',
        });
        if (!ok) return;

        setActioningId(doc.id);
        try {
            const res = await fetch(`/api/documents/quarantine/${doc.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REASSIGN',
                    caseId: target.id,
                    notes: notes.trim() || undefined,
                    force,
                }),
            });
            const data = await res.json();

            if (res.status === 409 && data.requiresForce) {
                toast.error(data.message || 'Ownership could not be confirmed for that case.');
                return;
            }
            if (!res.ok) {
                toast.error(data.message || data.error || 'Reassign failed');
                return;
            }

            toast.success(`Attached to ${data.caseFileNumber}.`);
            setExpandedId(null);
            fetchItems();
        } catch {
            toast.error('Reassign failed');
        } finally {
            setActioningId(null);
        }
    };

    const handleDiscard = async (doc: QuarantinedDocument) => {
        if (!notes.trim()) {
            toast.error('Please record why this document is being discarded.');
            return;
        }
        const ok = await confirm({
            title: 'Discard document',
            message: `Mark "${doc.fileName}" as not needed? The file is retained for audit but will leave the review queue.`,
            confirmText: 'Discard',
            variant: 'danger',
        });
        if (!ok) return;

        setActioningId(doc.id);
        try {
            const res = await fetch(`/api/documents/quarantine/${doc.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'DISCARD', notes: notes.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Discard failed');
                return;
            }
            toast.success('Document discarded.');
            setExpandedId(null);
            fetchItems();
        } catch {
            toast.error('Discard failed');
        } finally {
            setActioningId(null);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Document Quarantine</h1>
                    <p className="text-gray-400 mt-1 max-w-3xl">
                        Files that arrived on a case&apos;s email but whose contents belong to a different consumer.
                        They were <span className="text-white font-medium">not</span> attached to that case. Route each
                        one to the consumer it actually belongs to, or discard it.
                    </p>
                </div>
                <button
                    onClick={fetchItems}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-lg hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 shrink-0"
                >
                    <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {STATUS_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setStatus(tab.key)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            status === tab.key
                                ? 'bg-zeno-cyan/10 text-zeno-cyan border-zeno-cyan/30'
                                : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        {tab.label}
                        {tab.key === 'PENDING_REVIEW' && pendingCount > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                {pendingCount}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {loadError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl px-4 py-3 text-sm">
                    {loadError}
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20">
                    <div className="w-10 h-10 border-2 border-zeno-cyan border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-400 font-medium">Loading quarantined documents...</span>
                </div>
            ) : items.length === 0 ? (
                <div className="bg-zeno-blue/20 border border-white/5 rounded-xl py-20 flex flex-col items-center gap-2 text-gray-500">
                    <svg className="w-16 h-16 opacity-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <p className="text-xl font-medium text-gray-400">
                        {status === 'PENDING_REVIEW' ? 'Nothing waiting for review' : 'Nothing here'}
                    </p>
                    <p className="text-sm">
                        {status === 'PENDING_REVIEW'
                            ? 'No mis-addressed documents have been intercepted.'
                            : 'Try a different filter.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map(doc => {
                        const expanded = expandedId === doc.id;
                        const busy = actioningId === doc.id;
                        const foundIds = (doc.allExtractedIds ?? '').split(',').filter(Boolean);
                        return (
                            <div key={doc.id} className="bg-zeno-blue/20 border border-white/5 rounded-xl overflow-hidden">
                                <div className="p-5">
                                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                                        <div className="min-w-0 space-y-3">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-500/10 text-red-300 border border-red-500/20 uppercase tracking-wide">
                                                    Blocked
                                                </span>
                                                <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-white/5 text-gray-400 border border-white/10">
                                                    {doc.detectedType}
                                                </span>
                                                {doc.status !== 'PENDING_REVIEW' && (
                                                    <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                                        {doc.status}
                                                        {doc.reassignedToCase ? ` → ${doc.reassignedToCase.fileNumber}` : ''}
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-500">{formatBytes(doc.fileSize)}</span>
                                            </div>

                                            <div className="font-semibold text-white truncate">{doc.fileName}</div>

                                            <div className="grid sm:grid-cols-2 gap-3 text-sm">
                                                <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                                                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                                                        Arrived on this case
                                                    </div>
                                                    <a
                                                        href={`/cases/${doc.intendedCase.id}`}
                                                        className="text-zeno-cyan hover:underline font-medium"
                                                    >
                                                        {doc.intendedCase.fileNumber}
                                                    </a>
                                                    <div className="text-gray-300">
                                                        {doc.intendedCase.client.firstName} {doc.intendedCase.client.lastName}
                                                    </div>
                                                    <div className="font-mono text-xs text-gray-500">
                                                        {doc.expectedIdNumber ?? doc.intendedCase.client.idNumber}
                                                    </div>
                                                </div>
                                                <div className="bg-red-500/5 rounded-lg px-3 py-2 border border-red-500/10">
                                                    <div className="text-[10px] uppercase tracking-wider text-red-400/70 mb-1">
                                                        But the file contains
                                                    </div>
                                                    <div className="font-mono text-red-300">
                                                        {foundIds.length > 0 ? foundIds.join(', ') : '(no ID readable)'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-xs text-gray-500 space-y-0.5">
                                                {doc.sourceFrom && <div>From: <span className="text-gray-400">{doc.sourceFrom}</span></div>}
                                                {doc.sourceSubject && <div>Subject: <span className="text-gray-400">{doc.sourceSubject}</span></div>}
                                                <div>
                                                    Intercepted {new Date(doc.createdAt).toLocaleString()}
                                                    {doc.sourceMailbox ? ` · ${doc.sourceMailbox.emailAddress}` : ''}
                                                </div>
                                                {doc.reviewNotes && (
                                                    <div className="text-gray-400 pt-1">Note: {doc.reviewNotes}</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <a
                                                href={`/api/documents/quarantine/${doc.id}/download`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                                            >
                                                Preview
                                            </a>
                                            {doc.status === 'PENDING_REVIEW' && (
                                                <button
                                                    onClick={() => openRow(doc)}
                                                    className="px-3 py-2 text-sm rounded-lg bg-zeno-cyan/10 border border-zeno-cyan/30 text-zeno-cyan hover:bg-zeno-cyan/20 transition-colors"
                                                >
                                                    {expanded ? 'Close' : 'Resolve'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {expanded && (
                                    <div className="border-t border-white/5 bg-black/20 p-5 space-y-4">
                                        <div>
                                            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">
                                                Find the case this document really belongs to
                                            </label>
                                            <input
                                                value={query}
                                                onChange={e => {
                                                    setQuery(e.target.value);
                                                    searchCases(e.target.value);
                                                }}
                                                placeholder="Search by ID number, name or file number"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-zeno-cyan/50"
                                            />
                                            {searching && <p className="text-xs text-gray-500 mt-2">Searching...</p>}
                                            {!searching && query.trim().length >= 2 && suggestions.length === 0 && (
                                                <p className="text-xs text-gray-500 mt-2">
                                                    No case found for that search. This consumer may not have a file yet.
                                                </p>
                                            )}
                                        </div>

                                        {suggestions.length > 0 && (
                                            <ul className="space-y-2">
                                                {suggestions.map(s => {
                                                    const idMatches = foundIds.includes(s.clientIdNumber?.replace(/\D/g, ''));
                                                    const isSameCase = s.id === doc.intendedCase.id;
                                                    return (
                                                        <li
                                                            key={s.id}
                                                            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10"
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="text-white text-sm font-medium truncate">
                                                                    {s.fileNumber} · {s.clientName}
                                                                </div>
                                                                <div className="font-mono text-xs text-gray-500">{s.clientIdNumber}</div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {idMatches && (
                                                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                                                        ID MATCHES FILE
                                                                    </span>
                                                                )}
                                                                <button
                                                                    disabled={busy || isSameCase}
                                                                    onClick={() => handleReassign(doc, s, !idMatches)}
                                                                    title={isSameCase ? 'This is the case the document was blocked on' : undefined}
                                                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                                                        idMatches
                                                                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                                                                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                                                                    }`}
                                                                >
                                                                    {busy ? 'Working...' : idMatches ? 'Attach here' : 'Attach (override)'}
                                                                </button>
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}

                                        <div>
                                            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2">
                                                Reason / notes
                                                <span className="text-gray-600 normal-case tracking-normal">
                                                    {' '}— required to discard, or to override the ownership check
                                                </span>
                                            </label>
                                            <textarea
                                                value={notes}
                                                onChange={e => setNotes(e.target.value)}
                                                rows={2}
                                                placeholder="e.g. DC confirmed this invoice was sent to us in error"
                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-zeno-cyan/50"
                                            />
                                        </div>

                                        <div className="flex justify-end">
                                            <button
                                                disabled={busy}
                                                onClick={() => handleDiscard(doc)}
                                                className="px-4 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                                            >
                                                {busy ? 'Working...' : 'Discard document'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
