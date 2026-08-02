'use client';

import { useState } from 'react';

interface ScannedDocument {
    id: string;
    type: string;
    fileName: string;
    analyzed?: boolean;
}

interface Candidate {
    sourceDocumentId: string;
    sourceDocumentType: string;
    creditorName: string;
    accountNumber: string | null;
    accountType: string;
    outstandingBalance: number;
    monthlyInstalment: number | null;
    termMonths: number | null;
    accountOpenDate: string | null;
    lastPaymentDate: string | null;
    status: string;
    hasInsurance: boolean;
    premiumAmount: number | null;
    matchStatus: 'NEW' | 'DUPLICATE';
    existingAccountId: string | null;
}

interface CandidateRow extends Candidate {
    include: boolean;
}

const ACCOUNT_TYPE_OPTIONS = ['Retail', 'Credit Card', 'Personal Loan', 'Vehicle Finance', 'Mortgage', 'Other'];

function formatZAR(amount: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount || 0);
}

interface SyncCreditAccountsButtonProps {
    caseId: string;
    onSynced?: () => void;
    variant?: 'header' | 'tab';
}

export function SyncCreditAccountsButton({ caseId, onSynced, variant = 'header' }: SyncCreditAccountsButtonProps) {
    const [modalOpen, setModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [documentsScanned, setDocumentsScanned] = useState<ScannedDocument[]>([]);
    const [needsAnalysis, setNeedsAnalysis] = useState<ScannedDocument[]>([]);
    const [rows, setRows] = useState<CandidateRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const handleOpenModal = async () => {
        setModalOpen(true);
        setLoading(true);
        setError(null);
        setSuccessMsg(null);
        setRows([]);

        try {
            const res = await fetch(`/api/cases/${caseId}/credit-accounts/sync`);
            if (!res.ok) {
                throw new Error('Failed to scan credit reports for accounts');
            }
            const data = await res.json();
            setDocumentsScanned(data.documentsScanned || []);
            setNeedsAnalysis(data.needsAnalysis || []);
            setRows((data.candidates || []).map((c: Candidate) => ({ ...c, include: c.matchStatus === 'NEW' })));
        } catch (err: any) {
            setError(err.message || 'An error occurred while scanning credit reports.');
        } finally {
            setLoading(false);
        }
    };

    const updateRow = (index: number, patch: Partial<CandidateRow>) => {
        setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    };

    const includedCount = rows.filter(r => r.include).length;

    const handleImport = async () => {
        const included = rows.filter(r => r.include);
        if (included.length === 0) return;

        setSubmitting(true);
        setError(null);
        setSuccessMsg(null);

        try {
            const res = await fetch(`/api/cases/${caseId}/credit-accounts/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accounts: included.map(r => ({
                        include: true,
                        creditorName: r.creditorName,
                        accountNumber: r.accountNumber,
                        accountType: r.accountType,
                        outstandingBalance: r.outstandingBalance,
                        monthlyInstalment: r.monthlyInstalment,
                        lastPaymentDate: r.lastPaymentDate,
                        accountOpenDate: r.accountOpenDate,
                        termMonths: r.termMonths,
                        status: r.status,
                        hasInsurance: r.hasInsurance,
                        premiumAmount: r.premiumAmount,
                        existingAccountId: r.existingAccountId,
                    })),
                }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to sync credit accounts');
            }

            const result = await res.json();
            setSuccessMsg(`Synced successfully — ${result.created} account(s) added, ${result.updated} updated.`);
            onSynced?.();
            setTimeout(() => setModalOpen(false), 2500);
        } catch (err: any) {
            setError(err.message || 'Error syncing credit accounts.');
        } finally {
            setSubmitting(false);
        }
    };

    const buttonClass = variant === 'header'
        ? 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600/90 text-white hover:bg-sky-500 transition-all shadow-sm'
        : 'inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 text-white hover:from-sky-500 hover:to-blue-500 shadow-md transition-all';

    return (
        <>
            <button
                type="button"
                onClick={handleOpenModal}
                className={buttonClass}
                title="Scan uploaded credit reports and import accounts into Credit Accounts"
            >
                <span>🔄</span>
                <span>Sync Credit Accounts</span>
            </button>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
                    <div className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-700/80 rounded-2xl p-6 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                            <div className="flex items-center gap-2.5">
                                <span className="text-xl">🔄</span>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Sync Credit Accounts</h3>
                                    <p className="text-xs text-zinc-400">Imports accounts extracted from this case&apos;s analyzed credit report(s)</p>
                                </div>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="text-zinc-400 hover:text-white text-xl p-1">
                                ✕
                            </button>
                        </div>

                        {loading ? (
                            <div className="py-12 text-center space-y-3">
                                <div className="animate-spin w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full mx-auto" />
                                <p className="text-sm font-medium text-zinc-300">Scanning credit report documents...</p>
                            </div>
                        ) : error ? (
                            <div className="my-4 p-4 rounded-xl bg-red-950/60 border border-red-800/60 text-red-200 text-sm">
                                ⚠️ {error}
                            </div>
                        ) : (
                            <div className="py-4 space-y-5 text-sm">
                                {documentsScanned.length === 0 && (
                                    <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200 text-xs">
                                        No credit report documents found on this case.
                                    </div>
                                )}

                                {needsAnalysis.length > 0 && (
                                    <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200 flex items-start gap-3">
                                        <span className="text-xl">⚠️</span>
                                        <div>
                                            <div className="font-semibold text-amber-300">
                                                {needsAnalysis.length} credit report(s) not yet analyzed
                                            </div>
                                            <p className="text-xs text-amber-200/80 mt-0.5">
                                                {needsAnalysis.map(d => d.fileName).join(', ')} — run AI analysis on {needsAnalysis.length === 1 ? 'it' : 'these'} from the Documents tab first, then re-open this sync to pull in {needsAnalysis.length === 1 ? 'its' : 'their'} accounts.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {rows.length === 0 && documentsScanned.some(d => d.analyzed) && (
                                    <div className="p-3 text-center text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-800/40 rounded-xl">
                                        ✓ No new accounts found — analyzed credit report(s) contain no extractable accounts, or everything is already in Credit Accounts.
                                    </div>
                                )}

                                {rows.length > 0 && (
                                    <>
                                        {successMsg && (
                                            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs flex items-center gap-2">
                                                <span>✓</span>
                                                <span>{successMsg}</span>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                                                Accounts Found ({rows.length}) — {includedCount} selected
                                            </span>
                                        </div>

                                        <div className="border border-zinc-800 rounded-xl overflow-hidden text-xs">
                                            <table className="w-full text-left">
                                                <thead className="bg-zinc-800/80 text-zinc-400 font-semibold border-b border-zinc-700/60">
                                                    <tr>
                                                        <th className="p-2 w-8"></th>
                                                        <th className="p-2">Creditor</th>
                                                        <th className="p-2">Type</th>
                                                        <th className="p-2">Balance</th>
                                                        <th className="p-2">Status</th>
                                                        <th className="p-2">Match</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                                                    {rows.map((r, i) => (
                                                        <tr key={`${r.creditorName}-${r.accountNumber ?? i}`} className="hover:bg-zinc-800/30">
                                                            <td className="p-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={r.include}
                                                                    onChange={(e) => updateRow(i, { include: e.target.checked })}
                                                                    className="text-sky-500 focus:ring-sky-500"
                                                                />
                                                            </td>
                                                            <td className="p-2 font-medium">
                                                                {r.creditorName}
                                                                {r.accountNumber && (
                                                                    <div className="text-[10px] text-zinc-500">{r.accountNumber}</div>
                                                                )}
                                                            </td>
                                                            <td className="p-2">
                                                                <select
                                                                    value={r.accountType}
                                                                    onChange={(e) => updateRow(i, { accountType: e.target.value })}
                                                                    className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200"
                                                                >
                                                                    {ACCOUNT_TYPE_OPTIONS.map(opt => (
                                                                        <option key={opt} value={opt}>{opt}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="p-2">{formatZAR(r.outstandingBalance)}</td>
                                                            <td className="p-2 text-zinc-400">{r.status}</td>
                                                            <td className="p-2">
                                                                {r.matchStatus === 'DUPLICATE' ? (
                                                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                                                                        Existing — will update
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                                                                        New
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all"
                            >
                                Cancel
                            </button>
                            {rows.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleImport}
                                    disabled={submitting || includedCount === 0}
                                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 transition-all flex items-center gap-1.5"
                                >
                                    {submitting ? (
                                        <>
                                            <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                                            <span>Syncing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>⚡</span>
                                            <span>Import {includedCount} Selected Account{includedCount === 1 ? '' : 's'}</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
