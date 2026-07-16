'use client';

import { useState } from 'react';
import { toast } from '@zenowethu/ui';

interface NotificationMatch {
    id: string;
    caseId: string;
    onThisCase: boolean;
    channel: string;
    recipient: string;
    recipientType: string;
    success: boolean;
    provider: string;
    sentAt: string;
    matchedOn: string[];
    snippet: string;
}

interface InboxMatch {
    mailbox: string;
    uid: number;
    from: string;
    to: string;
    subject: string;
    date: string | null;
    seen: boolean;
    matchedOn: string[];
}

interface SearchResult {
    success: boolean;
    searchedFor?: { idNumber: string | null; fullName: string | null };
    since?: string;
    notifications?: NotificationMatch[];
    inbox?: {
        searched: boolean;
        searchedMailboxes: number;
        skippedMailboxes: number;
        matches: InboxMatch[];
        errors: string[];
    };
    summary?: { notificationCount: number; inboxCount: number; total: number };
    error?: string;
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-ZA', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function MatchBadge({ label }: { label: string }) {
    const text = label === 'ID_NUMBER' ? 'ID' : label === 'NAME' ? 'Name' : label === 'EMAIL' ? 'Email' : label;
    return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zeno-gold/20 border border-zeno-gold/40 text-zeno-gold">
            {text}
        </span>
    );
}

/**
 * "Check Communications" button: finds any communication that references this
 * consumer by ID number or first+last name — our outbound record first, then
 * the connected inboxes. Read-only; self-contained modal for results.
 */
export default function CheckCommunicationsButton({ caseId }: { caseId: string }) {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [result, setResult] = useState<SearchResult | null>(null);

    const runSearch = async () => {
        setLoading(true);
        setResult(null);
        setOpen(true);
        try {
            const res = await fetch(`/api/cases/${caseId}/communications/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lookbackDays: 365, includeInbox: true }),
            });
            const data: SearchResult = await res.json();
            if (!res.ok || !data.success) {
                toast.error(data.error || 'Communication search failed');
                setResult({ success: false, error: data.error || 'Search failed' });
                return;
            }
            setResult(data);
            const total = data.summary?.total ?? 0;
            toast.success(total > 0 ? `Found ${total} matching communication(s)` : 'No matching communications found');
        } catch {
            toast.error('Network error — please try again');
            setResult({ success: false, error: 'Network error' });
        } finally {
            setLoading(false);
        }
    };

    const notifications = result?.notifications ?? [];
    const inboxMatches = result?.inbox?.matches ?? [];

    return (
        <>
            <button
                onClick={runSearch}
                disabled={loading}
                className="text-xs text-white bg-zeno-navy border border-white/10 px-2.5 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                title="Find any email/SMS/WhatsApp that mentions this consumer by ID number or name"
            >
                {loading ? (
                    <>
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Searching…
                    </>
                ) : '🔎 Check Communications'}
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
                    <div
                        className="bg-zeno-navy border border-white/10 rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                <span>🔎</span> Consumer Communications
                            </h3>
                            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-lg leading-none">×</button>
                        </div>

                        <div className="px-5 py-4 overflow-y-auto">
                            {loading && (
                                <div className="flex items-center gap-2 text-white/70 text-sm py-8 justify-center">
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                    Searching sent records and connected inboxes…
                                </div>
                            )}

                            {!loading && result?.error && (
                                <div className="text-sm text-red-400 py-6 text-center">{result.error}</div>
                            )}

                            {!loading && result?.success && (
                                <div className="space-y-5">
                                    <p className="text-xs text-white/50">
                                        Searched for{' '}
                                        {result.searchedFor?.idNumber && <span className="text-white/80">ID {result.searchedFor.idNumber}</span>}
                                        {result.searchedFor?.idNumber && result.searchedFor?.fullName && ' or '}
                                        {result.searchedFor?.fullName && <span className="text-white/80">{result.searchedFor.fullName}</span>}
                                        {' '}since {formatDateTime(result.since)}.
                                    </p>

                                    {/* Outbound (NotificationLog) */}
                                    <section>
                                        <h4 className="text-xs font-semibold text-white/80 mb-2">
                                            Sent by us ({notifications.length})
                                        </h4>
                                        {notifications.length === 0 ? (
                                            <p className="text-xs text-white/40">No outbound messages found.</p>
                                        ) : (
                                            <ul className="space-y-2">
                                                {notifications.map((n) => (
                                                    <li key={n.id} className="text-xs bg-white/5 border border-white/10 rounded p-2.5">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <span className="text-white/90 font-medium">
                                                                {n.channel} → {n.recipient}
                                                            </span>
                                                            <div className="flex items-center gap-1.5">
                                                                {n.matchedOn.map((m) => <MatchBadge key={m} label={m} />)}
                                                                <span className={n.success ? 'text-green-400' : 'text-red-400'}>
                                                                    {n.success ? 'sent' : 'failed'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="text-white/50">{formatDateTime(n.sentAt)}{!n.onThisCase && ' · other case'}</div>
                                                        {n.snippet && <div className="text-white/40 mt-1 line-clamp-2">{n.snippet}</div>}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </section>

                                    {/* Inbox */}
                                    <section>
                                        <h4 className="text-xs font-semibold text-white/80 mb-2">
                                            Inbox ({inboxMatches.length})
                                        </h4>
                                        {!result.inbox?.searched ? (
                                            <p className="text-xs text-white/40">Inbox search was not run.</p>
                                        ) : result.inbox.searchedMailboxes === 0 ? (
                                            <p className="text-xs text-white/40">
                                                No mailbox has a saved password yet — ask Admin to set mailbox passwords in Admin → Settings.
                                            </p>
                                        ) : inboxMatches.length === 0 ? (
                                            <p className="text-xs text-white/40">
                                                No inbox messages found across {result.inbox.searchedMailboxes} mailbox(es).
                                            </p>
                                        ) : (
                                            <ul className="space-y-2">
                                                {(inboxMatches as InboxMatch[]).map((m) => (
                                                    <li key={`${m.mailbox}-${m.uid}`} className="text-xs bg-white/5 border border-white/10 rounded p-2.5">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <span className="text-white/90 font-medium truncate">{m.subject}</span>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                {m.matchedOn.map((k) => <MatchBadge key={k} label={k} />)}
                                                                {!m.seen && <span className="text-zeno-gold">new</span>}
                                                            </div>
                                                        </div>
                                                        <div className="text-white/50">From {m.from || '—'} · {formatDateTime(m.date)}</div>
                                                        <div className="text-white/30 mt-0.5">in {m.mailbox}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {result.inbox?.errors && result.inbox.errors.length > 0 && (
                                            <p className="text-[11px] text-amber-400/80 mt-2">
                                                Mailbox issues: {result.inbox.errors.join('; ')}
                                            </p>
                                        )}
                                    </section>
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-3 border-t border-white/10 flex justify-end">
                            <button
                                onClick={() => setOpen(false)}
                                className="text-xs text-white/80 bg-white/5 border border-white/10 px-3 py-1.5 rounded hover:bg-white/10 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
