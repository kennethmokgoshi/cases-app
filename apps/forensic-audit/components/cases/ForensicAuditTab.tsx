'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AccountFinding, FullAuditResult } from '@/lib/forensic-engine';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type SavedAuditResult = {
    auditId: string
    status: string
    auditor: string | null
    recommendations: string | null
    accountFindings: AccountFinding[]
    updatedAt: string
}

type Props = {
    caseId: string
    clientNetSalary?: string | number | null
    clientGrossSalary?: string | number | null
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatZAR(amount: number): string {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency', currency: 'ZAR', minimumFractionDigits: 0 }).format(amount);
}

function riskConfig(level: string) {
    if (level === 'CRITICAL') return { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    bar: 'bg-red-500' };
    if (level === 'HIGH')     return { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', bar: 'bg-orange-500' };
    if (level === 'MEDIUM')   return { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', bar: 'bg-yellow-500' };
    return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-500' };
}

function severityConfig(severity: string) {
    if (severity === 'CRITICAL') return { dot: 'bg-red-500',    text: 'text-red-400' };
    if (severity === 'HIGH')     return { dot: 'bg-orange-500', text: 'text-orange-400' };
    if (severity === 'MEDIUM')   return { dot: 'bg-yellow-500', text: 'text-yellow-400' };
    return { dot: 'bg-emerald-500', text: 'text-emerald-400' };
}

function flagCell(flagged: boolean, score: number) {
    if (flagged) return <span className="text-orange-400 font-bold text-xs">⚠ {score > 0 ? `+${score}` : ''}</span>;
    return <span className="text-emerald-500 text-xs">✓</span>;
}

// Derive a FullAuditResult-like object from saved findings for display
function deriveDisplayResult(saved: SavedAuditResult): {
    totalRiskScore: number
    riskLevel: string
    summaryFindings: Array<{ type: string; severity: string; message: string }>
    section80Eligible: boolean
} {
    const accountFindings = saved.accountFindings ?? [];
    const totalRiskScore = Math.min(100, accountFindings.reduce((s, af) => s + (af.accountRiskScore ?? 0), 0));
    const riskLevel =
        totalRiskScore >= 81 ? 'CRITICAL' :
        totalRiskScore >= 61 ? 'HIGH' :
        totalRiskScore >= 31 ? 'MEDIUM' : 'LOW';

    const summaryFindings: Array<{ type: string; severity: string; message: string }> = [];
    for (const af of accountFindings) {
        if (af.checks?.prescription?.flagged) {
            summaryFindings.push({ type: 'PRESCRIPTION', severity: 'CRITICAL', message: `${af.creditorName} — ${af.checks.prescription.reason}` });
        }
        if (af.checks?.recklessLending?.flagged) {
            summaryFindings.push({ type: 'RECKLESS_LENDING', severity: (af.checks.recklessLending.riskScore ?? 0) >= 35 ? 'HIGH' : 'MEDIUM', message: `${af.creditorName} — ${af.checks.recklessLending.reason}` });
        }
        if (af.checks?.interestRate?.flagged) {
            summaryFindings.push({ type: 'INTEREST_RATE', severity: 'HIGH', message: `${af.creditorName} — ${af.checks.interestRate.reason}` });
        }
        if (af.checks?.insurancePremium?.flagged) {
            summaryFindings.push({ type: 'INSURANCE_PREMIUM', severity: 'MEDIUM', message: `${af.creditorName} — ${af.checks.insurancePremium.reason}` });
        }
    }
    const section80Eligible = accountFindings.some(
        af => af.checks?.recklessLending?.flagged && (af.checks.recklessLending.riskScore ?? 0) >= 35
    );
    return { totalRiskScore, riskLevel, summaryFindings, section80Eligible };
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function ForensicAuditTab({ caseId, clientNetSalary, clientGrossSalary }: Props) {
    const [saved, setSaved] = useState<SavedAuditResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [runLoading, setRunLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [repoRate, setRepoRate] = useState('8.25');
    const [declaredExpenses, setDeclaredExpenses] = useState('');
    const [householdSize, setHouseholdSize] = useState('1');

    // Load existing results on mount
    const loadResults = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/forensic/results/${caseId}`);
            if (!res.ok) throw new Error('Failed to load audit results');
            const data = await res.json();
            setSaved(data);
        } catch {
            setError('Could not load previous audit results.');
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => { loadResults(); }, [loadResults]);

    // Run a new audit
    const handleRunAudit = async () => {
        setRunLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/forensic/run/${caseId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repoRate: parseFloat(repoRate) || 8.25,
                    declaredExpenses: parseFloat(declaredExpenses) || 0,
                    householdSize: parseInt(householdSize) || 1 }) });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Audit failed');
            }
            // Reload saved results
            await loadResults();
        } catch (e: any) {
            setError(e.message ?? 'Failed to run audit');
        } finally {
            setRunLoading(false);
        }
    };

    // Download PDF
    const handleDownloadPdf = () => {
        window.open(`/api/forensic/report/${caseId}`, '_blank');
    };

    // ── Loading state ───────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zeno-cyan" />
                <span className="ml-3 text-gray-400 text-sm">Loading audit results…</span>
            </div>
        );
    }

    const display = saved ? deriveDisplayResult(saved) : null;
    const rc = display ? riskConfig(display.riskLevel) : null;

    return (
        <div className="space-y-6">

            {/* ── Header bar ─────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-white tracking-wider uppercase">Forensic Audit</h3>
                    {saved && (
                        <p className="text-xs text-gray-500 mt-0.5">
                            Last run {new Date(saved.updatedAt).toLocaleString('en-ZA')}
                            {saved.auditor ? ` by ${saved.auditor}` : ''}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowAdvanced(v => !v)}
                        className="text-xs text-gray-500 hover:text-white transition-colors"
                    >
                        ⚙ Options
                    </button>
                    <button
                        onClick={handleRunAudit}
                        disabled={runLoading}
                        className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {runLoading ? (
                            <><span className="animate-spin inline-block w-3 h-3 border-b border-zeno-navy rounded-full" /> Running…</>
                        ) : (
                            <>▶ {saved ? 'Re-run Audit' : 'Run Audit'}</>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Advanced options ──────────────────────────── */}
            {showAdvanced && (
                <div className="bg-zeno-blue/20 border border-white/5 rounded-xl p-4 grid grid-cols-3 gap-4">
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Repo Rate (%)</label>
                        <input
                            type="number" step="0.25" value={repoRate}
                            onChange={e => setRepoRate(e.target.value)}
                            className="w-full bg-zeno-navy/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Monthly Expenses (R)</label>
                        <input
                            type="number" value={declaredExpenses}
                            onChange={e => setDeclaredExpenses(e.target.value)}
                            placeholder="e.g. 5500"
                            className="w-full bg-zeno-navy/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Household Size</label>
                        <select
                            value={householdSize}
                            onChange={e => setHouseholdSize(e.target.value)}
                            className="w-full bg-zeno-navy/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                        >
                            <option value="1">1 — Single</option>
                            <option value="2">2 — Couple</option>
                            <option value="3">3 — Family (1 child)</option>
                            <option value="4">4+ — Family (2+ children)</option>
                        </select>
                    </div>
                    {(!clientNetSalary && !clientGrossSalary) && (
                        <div className="col-span-3 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                            ⚠ No salary data on this client — reckless lending checks may be inaccurate. Add salary to the client profile first.
                        </div>
                    )}
                </div>
            )}

            {/* ── Error ────────────────────────────────────── */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                    ⚠ {error}
                </div>
            )}

            {/* ── No results yet ───────────────────────────── */}
            {!saved && !error && (
                <div className="bg-zeno-blue/10 border border-white/5 rounded-2xl p-12 text-center">
                    <div className="text-4xl mb-4">🔍</div>
                    <p className="text-gray-400 text-sm mb-1">No forensic audit has been run for this case yet.</p>
                    <p className="text-gray-600 text-xs">Click <strong className="text-white">Run Audit</strong> to analyse all credit accounts for prescription, reckless lending, interest rate violations, and insurance premium overcharging.</p>
                </div>
            )}

            {/* ── Results ──────────────────────────────────── */}
            {saved && display && rc && (
                <>
                    {/* Risk score panel */}
                    <div className={`${rc.bg} border ${rc.border} rounded-2xl p-5 flex items-center gap-6`}>
                        <div className="text-center min-w-[80px]">
                            <div className={`text-4xl font-black ${rc.color}`}>{display.totalRiskScore}</div>
                            <div className="text-gray-500 text-xs">/ 100</div>
                        </div>
                        <div className="flex-1">
                            <div className={`text-lg font-bold ${rc.color} tracking-wider uppercase mb-1`}>
                                {display.riskLevel} RISK
                            </div>
                            <div className="w-full bg-white/5 rounded-full h-2 mb-2">
                                <div
                                    className={`${rc.bar} h-2 rounded-full transition-all`}
                                    style={{ width: `${display.totalRiskScore}%` }}
                                />
                            </div>
                            <div className="text-xs text-gray-500">
                                {saved.accountFindings.length} account{saved.accountFindings.length !== 1 ? 's' : ''} analysed ·{' '}
                                {display.summaryFindings.length} issue{display.summaryFindings.length !== 1 ? 's' : ''} flagged
                                {display.section80Eligible && (
                                    <span className="ml-2 text-red-400 font-bold">· Section 80 eligible</span>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleDownloadPdf}
                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
                            >
                                ↓ PDF Report
                            </button>
                        </div>
                    </div>

                    {/* Findings list */}
                    {display.summaryFindings.length > 0 ? (
                        <div className="bg-zeno-blue/10 border border-white/5 rounded-2xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Findings ({display.summaryFindings.length})
                                </span>
                            </div>
                            <div className="divide-y divide-white/5">
                                {display.summaryFindings.map((f, i) => {
                                    const sc = severityConfig(f.severity);
                                    return (
                                        <div key={i} className="px-5 py-3 flex items-start gap-3">
                                            <div className={`w-2 h-2 rounded-full ${sc.dot} mt-1.5 flex-shrink-0`} />
                                            <div className="flex-1 min-w-0">
                                                <span className={`text-xs font-bold ${sc.text} mr-2`}>{f.severity}</span>
                                                <span className="text-xs text-gray-500 mr-2">{f.type.replace(/_/g, ' ')}</span>
                                                <span className="text-xs text-gray-300">{f.message}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400">
                            ✓ No forensic issues flagged across all accounts.
                        </div>
                    )}

                    {/* Per-account table */}
                    {saved.accountFindings.length > 0 && (
                        <div className="bg-zeno-blue/10 border border-white/5 rounded-2xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-white/5">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Per-Account Breakdown
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-zeno-navy/60 text-gray-500 uppercase text-[10px] tracking-wider">
                                            <th className="px-4 py-2 text-left">Creditor</th>
                                            <th className="px-3 py-2 text-left">Type</th>
                                            <th className="px-3 py-2 text-right">Balance</th>
                                            <th className="px-3 py-2 text-center">Prescription</th>
                                            <th className="px-3 py-2 text-center">Reckless</th>
                                            <th className="px-3 py-2 text-center">Rate</th>
                                            <th className="px-3 py-2 text-center">Insurance</th>
                                            <th className="px-3 py-2 text-center">Score</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {saved.accountFindings.map((af, i) => (
                                            <tr key={af.accountId} className={i % 2 === 0 ? 'bg-transparent' : 'bg-white/2'}>
                                                <td className="px-4 py-2 text-white font-medium">{af.creditorName}</td>
                                                <td className="px-3 py-2 text-gray-400">{af.accountType}</td>
                                                <td className="px-3 py-2 text-right text-gray-300">{formatZAR(af.outstandingBalance)}</td>
                                                <td className="px-3 py-2 text-center">{flagCell(af.checks?.prescription?.flagged ?? false, af.checks?.prescription?.riskScore ?? 0)}</td>
                                                <td className="px-3 py-2 text-center">{flagCell(af.checks?.recklessLending?.flagged ?? false, af.checks?.recklessLending?.riskScore ?? 0)}</td>
                                                <td className="px-3 py-2 text-center">{flagCell(af.checks?.interestRate?.flagged ?? false, af.checks?.interestRate?.riskScore ?? 0)}</td>
                                                <td className="px-3 py-2 text-center">{flagCell(af.checks?.insurancePremium?.flagged ?? false, af.checks?.insurancePremium?.riskScore ?? 0)}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className={`font-bold ${af.accountRiskScore >= 60 ? 'text-red-400' : af.accountRiskScore >= 30 ? 'text-orange-400' : 'text-emerald-400'}`}>
                                                        {af.accountRiskScore}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Recommendation */}
                    {saved.recommendations && (
                        <div className={`${display.section80Eligible ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/20'} border rounded-2xl p-5`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Recommended Action</span>
                                {display.section80Eligible && (
                                    <span className="text-xs text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                                        ⚠ Legal Action
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-white leading-relaxed">{saved.recommendations}</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
