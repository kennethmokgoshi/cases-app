'use client';

import { useState } from 'react';

interface AnalysisResult {
    documentId: string;
    fileName: string;
    success: boolean;
    accountsFound?: number;
    error?: string;
}

interface AnalyseCreditReportsButtonProps {
    caseId: string;
    onAnalyzed?: () => void;
    variant?: 'header' | 'tab';
}

export function AnalyseCreditReportsButton({ caseId, onAnalyzed, variant = 'header' }: AnalyseCreditReportsButtonProps) {
    const [modalOpen, setModalOpen] = useState(false);
    const [running, setRunning] = useState(false);
    const [ran, setRan] = useState(false);
    const [results, setResults] = useState<AnalysisResult[]>([]);
    const [summary, setSummary] = useState<{ analyzed: number; failed: number; skipped: number; message?: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const runAnalysis = async (force: boolean) => {
        setRunning(true);
        setError(null);
        try {
            const res = await fetch(`/api/cases/${caseId}/credit-reports/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to analyze credit reports');
            }
            const data = await res.json();
            setResults(data.results || []);
            setSummary({ analyzed: data.analyzed, failed: data.failed, skipped: data.skipped, message: data.message });
            setRan(true);
            if (data.analyzed > 0) onAnalyzed?.();
        } catch (err: any) {
            setError(err.message || 'An error occurred while analyzing credit reports.');
        } finally {
            setRunning(false);
        }
    };

    const handleOpenModal = () => {
        setModalOpen(true);
        setRan(false);
        setResults([]);
        setSummary(null);
        setError(null);
    };

    const buttonClass = variant === 'header'
        ? 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600/90 text-white hover:bg-violet-500 transition-all shadow-sm'
        : 'inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500 shadow-md transition-all';

    return (
        <>
            <button
                type="button"
                onClick={handleOpenModal}
                className={buttonClass}
                title="Run AI analysis on this case's credit report document(s) only"
            >
                <span>🧮</span>
                <span>Analyse Credit Reports</span>
            </button>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
                    <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-2xl p-6 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                            <div className="flex items-center gap-2.5">
                                <span className="text-xl">🧮</span>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Analyse Credit Reports</h3>
                                    <p className="text-xs text-zinc-400">
                                        Only touches this case&apos;s credit report document(s) — TransUnion, Experian, XDS, Lightstone, and other bureau reports. Does not affect ID, POA, or client profile fields.
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="text-zinc-400 hover:text-white text-xl p-1">
                                ✕
                            </button>
                        </div>

                        <div className="py-4 space-y-4 text-sm">
                            {error && (
                                <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/60 text-red-200 text-sm">
                                    ⚠️ {error}
                                </div>
                            )}

                            {!ran && !running && !error && (
                                <p className="text-xs text-zinc-400">
                                    Analyzes any credit report(s) not yet analyzed. Use &quot;Force Re-analyze All&quot; to refresh reports that already have data.
                                </p>
                            )}

                            {running && (
                                <div className="py-8 text-center space-y-3">
                                    <div className="animate-spin w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full mx-auto" />
                                    <p className="text-sm font-medium text-zinc-300">Analyzing credit report(s)...</p>
                                </div>
                            )}

                            {ran && summary && (
                                <div className="space-y-3">
                                    {summary.message && results.length === 0 && (
                                        <div className="p-3 text-center text-xs text-zinc-300 bg-zinc-800/50 border border-zinc-700/50 rounded-xl">
                                            {summary.message}
                                        </div>
                                    )}
                                    {results.length > 0 && (
                                        <>
                                            <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                                                {summary.analyzed} analyzed, {summary.failed} failed{summary.skipped ? `, ${summary.skipped} already analyzed` : ''}
                                            </div>
                                            <div className="border border-zinc-800 rounded-xl overflow-hidden text-xs divide-y divide-zinc-800">
                                                {results.map(r => (
                                                    <div key={r.documentId} className="p-2.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-zinc-300">{r.fileName}</span>
                                                            {r.success ? (
                                                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                                                                    ✓ {r.accountsFound ?? 0} account(s) found
                                                                </span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[10px]">
                                                                    ✗ Failed
                                                                </span>
                                                            )}
                                                        </div>
                                                        {!r.success && r.error && (
                                                            <p className="mt-1 text-[10px] text-red-300/80 break-all">{r.error}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all"
                            >
                                {ran ? 'Close' : 'Cancel'}
                            </button>
                            {ran && (
                                <button
                                    type="button"
                                    onClick={() => runAnalysis(true)}
                                    disabled={running}
                                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 transition-all"
                                >
                                    Force Re-analyze All
                                </button>
                            )}
                            {!ran && (
                                <button
                                    type="button"
                                    onClick={() => runAnalysis(false)}
                                    disabled={running}
                                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-all flex items-center gap-1.5"
                                >
                                    <span>⚡</span>
                                    <span>Analyze</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
