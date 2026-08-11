'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from '@zenowethu/ui';

interface DhsOverdueCase {
    id: string;
    fileNumber: string;
    clientName: string;
    /** REQUESTED_VIA_DHS or DHS_REQUESTED — both mean "awaiting a DHS outcome". */
    status: string;
    daysInStatus: number;
    statusEntryDate: string;
    projectName: string;
}

const STATUS_LABELS: Record<string, string> = {
    REQUESTED_VIA_DHS: 'Requested via DHS',
    DHS_REQUESTED: 'DHS Requested',
};

interface DhsOverdueResult {
    count: number;
    statusLabel: string;
    cases: DhsOverdueCase[];
}

interface BulkCheckResultItem {
    caseId: string;
    fileNumber: string;
    clientName: string;
    previousStatus: string;
    newStatus?: string;
    outcome: string;
    error?: string;
}

interface BulkCheckResponse {
    processed: number;
    skipped: number;
    forbidden: number;
    summary: {
        accepted: number;
        declined: number;
        pending: number;
        notLinked: number;
        notRequested: number;
        zdmClient: number;
        other: number;
        errors: number;
    };
    results: BulkCheckResultItem[];
}

function bulkItemColor(item: BulkCheckResultItem): string {
    if (item.error) return 'text-red-400';
    if (item.newStatus === 'ACCEPTED_VIA_DHS') return 'text-emerald-400';
    if (item.newStatus === 'DECLINED_VIA_DHS') return 'text-red-400';
    if (item.newStatus === 'NOT_LINKED') return 'text-orange-400';
    return 'text-amber-300';
}

/**
 * "Check DHS Overdue Files" dashboard button: counts/lists cases stuck in
 * "Requested via DHS" past SLA. Scoped server-side to the projects the
 * signed-in user has access to (admins see everything). Once a check has
 * run, a second action lets staff run the existing "Check Request Status"
 * DHS check across every file that was found, in one click.
 */
export default function CheckDhsOverdueButton() {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [result, setResult] = useState<DhsOverdueResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResult, setBulkResult] = useState<BulkCheckResponse | null>(null);
    const [bulkError, setBulkError] = useState<string | null>(null);

    const runCheck = async () => {
        setLoading(true);
        setError(null);
        setBulkResult(null);
        setBulkError(null);
        try {
            const res = await fetch('/api/dashboard/dhs-overdue');
            const data = await res.json();
            if (!res.ok) {
                const message = data?.error || 'Failed to check DHS overdue files';
                toast.error(message);
                setError(message);
                setOpen(true);
                return;
            }
            setResult(data);
            setOpen(true);
            toast.success(
                data.count > 0
                    ? `${data.count} case${data.count === 1 ? '' : 's'} requested via DHS ${data.count === 1 ? 'is' : 'are'} overdue`
                    : 'No overdue "Requested via DHS" cases — you\'re all caught up'
            );
        } catch {
            const message = 'Network error — please try again';
            toast.error(message);
            setError(message);
            setOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const runBulkCheck = async () => {
        if (!result || result.cases.length === 0) return;
        setBulkLoading(true);
        setBulkError(null);
        try {
            const res = await fetch('/api/dhs/bulk-check-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caseIds: result.cases.map((c) => c.id) }),
            });
            const data = await res.json();
            if (!res.ok) {
                const message = data?.error || 'Failed to check request status on these files';
                toast.error(message);
                setBulkError(message);
                return;
            }
            setBulkResult(data);

            const s = data.summary as BulkCheckResponse['summary'];
            const parts: string[] = [];
            if (s.accepted) parts.push(`${s.accepted} accepted`);
            if (s.declined) parts.push(`${s.declined} declined`);
            if (s.pending) parts.push(`${s.pending} still pending`);
            if (s.notLinked) parts.push(`${s.notLinked} not linked`);
            if (s.notRequested) parts.push(`${s.notRequested} not requested`);
            if (s.zdmClient) parts.push(`${s.zdmClient} ZDM client`);
            if (s.errors) parts.push(`${s.errors} error${s.errors === 1 ? '' : 's'}`);
            const skippedNote = data.skipped > 0 ? ` — ${data.skipped} skipped this run, click again to continue` : '';
            toast.success(`Checked ${data.processed} file${data.processed === 1 ? '' : 's'}: ${parts.join(', ') || 'no changes'}${skippedNote}`);
        } catch {
            const message = 'Network error — please try again';
            toast.error(message);
            setBulkError(message);
        } finally {
            setBulkLoading(false);
        }
    };

    const bulkByCaseId = new Map((bulkResult?.results ?? []).map((r) => [r.caseId, r]));

    return (
        <>
            <button
                onClick={runCheck}
                disabled={loading}
                className="group bg-amber-950/20 border border-amber-500/20 rounded-2xl p-6 hover:bg-amber-900/20 transition-all cursor-pointer relative overflow-hidden text-left w-full disabled:opacity-60 disabled:cursor-wait"
                title="Count cases stuck in 'Requested via DHS' past their SLA — scoped to the projects you have access to"
            >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-8xl">📡</span>
                </div>
                <h3 className="text-amber-400 font-bold uppercase tracking-widest text-sm mb-4">DHS Compliance</h3>
                <div className="space-y-4 relative z-10">
                    <div>
                        <p className="text-3xl font-bold text-white">
                            {loading ? (
                                <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : result?.count ?? '—'}
                        </p>
                        <p className="text-xs text-gray-400">Requested via DHS — Overdue</p>
                    </div>
                    <div className="flex justify-between items-center text-xs text-amber-300 font-medium">
                        <span>{loading ? 'Checking…' : 'Click to check now'}</span>
                        <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </div>
                </div>
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
                    <div
                        className="bg-zeno-navy border border-white/10 rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                <span>📡</span> Requested via DHS — Overdue{result ? ` (${result.count})` : ''}
                            </h3>
                            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-lg leading-none">×</button>
                        </div>

                        {!error && result && result.cases.length > 0 && (
                            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3">
                                <p className="text-[11px] text-white/40">
                                    {bulkLoading
                                        ? 'Running DHS "Check Request Status" on each file below — this can take several minutes, please keep this open…'
                                        : bulkResult
                                            ? `Last run checked ${bulkResult.processed} file(s). You can run it again.`
                                            : 'Runs the existing "Check Request Status" DHS check on every file below.'}
                                </p>
                                <button
                                    onClick={runBulkCheck}
                                    disabled={bulkLoading}
                                    className="text-xs text-white bg-amber-600/80 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-wait px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 shrink-0"
                                >
                                    {bulkLoading ? (
                                        <>
                                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            Checking…
                                        </>
                                    ) : '🔎 Check Request Status on All'}
                                </button>
                            </div>
                        )}

                        <div className="px-5 py-4 overflow-y-auto">
                            {error && <div className="text-sm text-red-400 py-6 text-center">{error}</div>}
                            {!error && bulkError && <div className="text-sm text-red-400 pb-4 text-center">{bulkError}</div>}

                            {!error && result && result.cases.length === 0 && (
                                <p className="text-sm text-white/50 py-8 text-center">No overdue "Requested via DHS" cases in your accessible projects.</p>
                            )}

                            {!error && result && result.cases.length > 0 && (
                                <ul className="space-y-2">
                                    {result.cases.map((c) => {
                                        const bulkItem = bulkByCaseId.get(c.id);
                                        return (
                                            <li key={c.id} className="text-xs bg-white/5 border border-white/10 rounded p-2.5">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <Link href={`/cases/${c.id}`} className="text-white/90 font-medium hover:text-zeno-cyan transition-colors">
                                                        {c.fileNumber} — {c.clientName}
                                                    </Link>
                                                    <span className="text-amber-400 font-semibold">{c.daysInStatus}d</span>
                                                </div>
                                                <div className="text-white/40 flex items-center gap-1.5">
                                                    <span>{c.projectName}</span>
                                                    <span className="text-white/25">·</span>
                                                    <span>{STATUS_LABELS[c.status] ?? c.status}</span>
                                                </div>
                                                {bulkItem && (
                                                    <div className={`mt-1.5 pt-1.5 border-t border-white/10 ${bulkItemColor(bulkItem)}`}>
                                                        {bulkItem.outcome}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
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
