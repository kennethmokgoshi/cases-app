'use client';

import { useState } from 'react';
import { toast } from '@zenowethu/ui';

interface CaseUpdateResult {
    subject: string;
    from: string;
    date: string | null;
    summary: string;
    attachments: { fileName: string; fileUrl: string; type: string }[];
    notificationSent: boolean;
    notificationMsg: string | null;
    /** True when documents were harvested but the email had no textual update. */
    documentsOnly?: boolean;
}

interface ScanRunMeta {
    ranByName: string;
    ranAt: string;
    lookbackDays: number;
    forceRescan?: boolean;
    mailboxes: string[];
    scannedInbox: boolean;
    scannedSent: boolean;
    rawMatches?: number;
    candidatesFound?: number;
    updatesFound: number;
    documentsHarvested?: number;
    aiFailures?: number;
    errors?: string[];
}

interface ScanResponse {
    success: boolean;
    message?: string;
    updates?: CaseUpdateResult[];
    mailboxesScanned?: number;
    scanRun?: ScanRunMeta;
    error?: string;
}

interface LastScan extends ScanRunMeta {
    updates: CaseUpdateResult[];
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function CheckForUpdatesButton({
    caseId,
    onUpdated,
}: {
    caseId: string;
    onUpdated?: () => void;
}) {
    const [showMenu, setShowMenu] = useState(false);
    const [selectedLookbackDays, setSelectedLookbackDays] = useState<number>(180);
    const [isChecking, setIsChecking] = useState(false);
    const [showResultModal, setShowResultModal] = useState(false);
    const [result, setResult] = useState<ScanResponse | null>(null);

    // Pre-run confirmation (who last ran the check + when)
    const [showPreRunModal, setShowPreRunModal] = useState(false);
    const [loadingPreRun, setLoadingPreRun] = useState(false);
    const [lastScan, setLastScan] = useState<LastScan | null>(null);

    // On main-button click: look up the most recent scan first. If one exists,
    // show a confirmation so the user can re-run or just view the last results.
    const handleMainClick = async () => {
        setShowMenu(false);
        setLoadingPreRun(true);
        try {
            const res = await fetch(`/api/cases/${caseId}/check-updates`, { method: 'GET' });
            const data = await res.json();
            if (res.ok && data.lastScan) {
                setLastScan(data.lastScan as LastScan);
                setShowPreRunModal(true);
                return;
            }
        } catch {
            // Fall through to running the check directly on lookup failure.
        } finally {
            setLoadingPreRun(false);
        }
        // No prior scan (or lookup failed) — just run it.
        runCheck(selectedLookbackDays);
    };

    const viewLastResults = () => {
        if (!lastScan) return;
        setResult({
            success: true,
            updates: lastScan.updates,
            mailboxesScanned: lastScan.mailboxes.length,
            scanRun: lastScan,
        });
        setShowPreRunModal(false);
        setShowResultModal(true);
    };

    const runCheck = async (lookback: number, forceRescan = false) => {
        setShowMenu(false);
        setShowPreRunModal(false);
        setIsChecking(true);
        setResult(null);

        try {
            const res = await fetch(`/api/cases/${caseId}/check-updates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lookbackDays: lookback, forceRescan }),
            });

            const data: ScanResponse = await res.json();
            if (!res.ok || !data.success) {
                toast.error(data.error || 'Check for updates failed');
                setResult({ success: false, error: data.error || 'Failed to complete update scan' });
            } else {
                setResult(data);
                const count = data.updates?.length ?? 0;
                const docsOnly = data.updates?.filter((u) => u.documentsOnly).length ?? 0;
                const realUpdates = count - docsOnly;
                if (count > 0) {
                    const parts: string[] = [];
                    if (realUpdates > 0) parts.push(`${realUpdates} update(s)`);
                    if (docsOnly > 0) parts.push(`${docsOnly} document delivery(ies)`);
                    toast.success(`Scan complete! Logged ${parts.join(' and ')}.`);
                } else if (data.scanRun?.candidatesFound && data.scanRun.candidatesFound > 0) {
                    toast.success('Scan complete. Matching emails found but no new updates or documents.');
                } else {
                    toast.success('Scan complete. No new updates found.');
                }
                onUpdated?.();
                setShowResultModal(true);
            }
        } catch {
            toast.error('Network error — please try again');
            setResult({ success: false, error: 'Network communication error' });
        } finally {
            setIsChecking(false);
        }
    };

    const updates = result?.updates ?? [];

    return (
        <div className="relative inline-block text-left">
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={handleMainClick}
                    disabled={isChecking || loadingPreRun}
                    className="text-xs text-white bg-indigo-650 hover:bg-indigo-600 border border-indigo-500/50 px-3 py-1.5 rounded hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 font-medium shadow-sm"
                    title="Check connected mailboxes for updates since selected range"
                >
                    {isChecking || loadingPreRun ? (
                        <>
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            {loadingPreRun ? 'Loading...' : 'Checking updates...'}
                        </>
                    ) : (
                        <>🔄 Check for Updates</>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setShowMenu(!showMenu)}
                    disabled={isChecking || loadingPreRun}
                    className="text-xs text-white bg-indigo-750 hover:bg-indigo-700 border border-indigo-500/50 px-2 py-1.5 rounded transition-all disabled:opacity-50 flex items-center justify-center"
                    title="Select Date Range"
                >
                    ▾
                </button>
            </div>

            {showMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 w-56 bg-zeno-navy border border-indigo-500/30 rounded-lg shadow-2xl z-50 overflow-hidden">
                        <div className="p-2.5 bg-white/5 border-b border-white/10">
                            <span className="text-[10px] uppercase font-bold text-indigo-300">📅 Search range</span>
                        </div>
                        <div className="p-1.5 space-y-1">
                            {[
                                { label: 'Last 30 Days', days: 30 },
                                { label: 'Last 90 Days', days: 90 },
                                { label: 'Last 180 Days (6mo)', days: 180 },
                                { label: 'Last 365 Days (1yr)', days: 365 },
                            ].map(opt => (
                                <button
                                    key={opt.days}
                                    type="button"
                                    onClick={() => {
                                        setSelectedLookbackDays(opt.days);
                                        runCheck(opt.days);
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors ${
                                        selectedLookbackDays === opt.days
                                            ? 'bg-indigo-600 text-white font-semibold'
                                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Pre-run Confirmation — who last ran the check and when */}
            {showPreRunModal && lastScan && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200" onClick={() => setShowPreRunModal(false)}>
                    <div
                        className="bg-zeno-navy border border-indigo-500/20 rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                <span>🔄</span> Check for Updates
                            </h3>
                            <button onClick={() => setShowPreRunModal(false)} className="text-white/60 hover:text-white text-lg leading-none">×</button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
                                <p className="text-sm text-gray-200">
                                    Last checked by{' '}
                                    <span className="font-semibold text-white">{lastScan.ranByName}</span>
                                </p>
                                <p className="text-xs text-gray-400">
                                    🕒 {formatDateTime(lastScan.ranAt)}
                                </p>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${lastScan.scannedInbox ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                                        Inbox {lastScan.scannedInbox ? '✓' : '—'}
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${lastScan.scannedSent ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                                        Sent Items {lastScan.scannedSent ? '✓' : '—'}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-500/15 text-indigo-300 font-medium">
                                        {lastScan.updatesFound} update(s) found
                                    </span>
                                </div>
                                {lastScan.mailboxes.length > 0 && (
                                    <p className="text-[10px] text-gray-500 pt-1 leading-relaxed">
                                        Mailboxes: {lastScan.mailboxes.join(', ')}
                                    </p>
                                )}
                            </div>

                            <p className="text-xs text-gray-400">
                                Would you like to run the check again, or view the results of the most recent scan?
                            </p>

                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                                    Documents missing even though the emails exist? A <span className="font-semibold">Force re-scan</span> re-examines emails already checked before and re-pulls their attachments (duplicates are skipped automatically; no messages are sent to the consumer).
                                </p>
                                <button
                                    onClick={() => runCheck(selectedLookbackDays, true)}
                                    className="mt-2 text-[11px] text-amber-100 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-3 py-1.5 rounded font-semibold transition-all"
                                >
                                    ⟳ Force re-scan (ignore already-checked)
                                </button>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex flex-wrap justify-end gap-2">
                            <button
                                onClick={() => setShowPreRunModal(false)}
                                className="text-xs text-white/70 hover:text-white px-3 py-2 rounded font-medium transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={viewLastResults}
                                className="text-xs text-indigo-200 bg-white/5 hover:bg-white/10 border border-indigo-500/30 px-4 py-2 rounded font-semibold transition-all"
                            >
                                View Recent Results
                            </button>
                            <button
                                onClick={() => runCheck(selectedLookbackDays)}
                                className="text-xs text-white bg-indigo-650 hover:bg-indigo-600 px-4 py-2 rounded font-semibold transition-all shadow-md"
                            >
                                Run Check Again
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sweep Results Modal */}
            {showResultModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200" onClick={() => setShowResultModal(false)}>
                    <div
                        className="bg-zeno-navy border border-indigo-500/20 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                <span>🔄</span> Update Check Results
                            </h3>
                            <button onClick={() => setShowResultModal(false)} className="text-white/60 hover:text-white text-lg leading-none">×</button>
                        </div>

                        <div className="px-6 py-5 overflow-y-auto space-y-4">
                            {result?.scanRun ? (
                                <div className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-1.5">
                                    <p className="text-xs text-gray-300">
                                        Run by <span className="font-semibold text-white">{result.scanRun.ranByName}</span>
                                        {' • '}{formatDateTime(result.scanRun.ranAt)}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${result.scanRun.scannedInbox ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                                            Inbox {result.scanRun.scannedInbox ? '✓' : '—'}
                                        </span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${result.scanRun.scannedSent ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                                            Sent Items {result.scanRun.scannedSent ? '✓' : '—'}
                                        </span>
                                    </div>
                                    {result.scanRun.mailboxes.length > 0 && (
                                        <p className="text-[10px] text-gray-500 leading-relaxed">
                                            Mailboxes: {result.scanRun.mailboxes.join(', ')}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400">
                                    Scanned connected mailboxes for updates since {formatDateTime(new Date(Date.now() - selectedLookbackDays * 24 * 60 * 60 * 1000).toISOString())}.
                                </p>
                            )}

                            {result?.scanRun?.aiFailures ? (
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[11px] text-amber-200 leading-relaxed">
                                    ⚠️ AI analysis failed on {result.scanRun.aiFailures} email(s), so no update summaries were generated — but any attachments were still harvested. Check the AI provider configuration in Admin settings.
                                </div>
                            ) : null}

                            {updates.length === 0 ? (
                                <div className="text-center py-8 bg-white/5 border border-white/5 rounded-xl space-y-2">
                                    <div className="text-3xl">📭</div>
                                    <div className="text-sm text-gray-300 font-medium">No new updates or documents found.</div>
                                    <div className="text-xs text-gray-500">
                                        {result?.scanRun?.candidatesFound && result.scanRun.candidatesFound > 0
                                            ? `${result.scanRun.candidatesFound} matching email(s) were found, but they were already processed, had no new attachments, and contained no new case updates.`
                                            : result?.scanRun?.rawMatches && result.scanRun.rawMatches > 0
                                                ? `The mail server matched ${result.scanRun.rawMatches} message(s) by ID number / name, but they were all already processed on a previous run.`
                                                : 'The mail server returned no emails matching this client’s ID number or name in the scanned mailboxes for the selected range.'}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                                        New Items Processed ({updates.length})
                                    </div>
                                    <div className="space-y-3">
                                        {updates.map((up, idx) => (
                                            <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-white leading-snug">{up.subject}</h4>
                                                        <p className="text-[10px] text-gray-400 mt-1">From: {up.from} • {formatDateTime(up.date)}</p>
                                                    </div>
                                                    <span className={`shrink-0 text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase ${up.documentsOnly ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'}`}>
                                                        {up.documentsOnly ? '📎 Documents' : '✨ Update'}
                                                    </span>
                                                </div>

                                                <div className="bg-indigo-950/20 border border-indigo-500/10 rounded p-2.5">
                                                    <span className="text-[10px] uppercase font-bold text-indigo-400 block mb-1">{up.documentsOnly ? 'Summary:' : 'AI Update Summary:'}</span>
                                                    <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">{up.summary}</p>
                                                </div>

                                                {up.attachments && up.attachments.length > 0 && (
                                                    <div className="space-y-1">
                                                        <span className="text-[10px] uppercase font-bold text-emerald-400 block">Attached Documents Downloaded:</span>
                                                        <div className="flex flex-wrap gap-2">
                                                            {up.attachments.map((att, aIdx) => (
                                                                <a
                                                                    key={aIdx}
                                                                    href={att.fileUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all font-medium flex items-center gap-1.5"
                                                                >
                                                                    <span>📄</span>
                                                                    <span className="truncate max-w-[150px]">{att.fileName}</span>
                                                                    <span className="text-[9px] opacity-60 uppercase">({att.type})</span>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {up.notificationMsg && (
                                                    <div className="bg-emerald-950/25 border border-emerald-500/10 rounded p-2.5">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-[10px] uppercase font-bold text-emerald-400">Notified Consumer:</span>
                                                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                                                up.notificationSent 
                                                                    ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                                                                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                            }`}>
                                                                {up.notificationSent ? 'Sent ✓' : 'Send Failed ✗'}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-300 italic">"{up.notificationMsg}"</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex justify-end">
                            <button
                                onClick={() => setShowResultModal(false)}
                                className="text-xs text-white/80 bg-indigo-650 hover:bg-indigo-600 px-4 py-2 rounded font-semibold transition-all shadow-md"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
