'use client';

import { useEffect, useState } from 'react';

interface InsightItem {
    category: 'dispute' | 'improve' | 'positive' | 'info';
    title: string;
    detail: string;
    relatedCreditor?: string;
}

interface ReportData {
    creditScore?: { score?: number; band?: string; suppressors?: string[] };
    summary?: { totalDebt?: number; totalInstallment?: number; activeAccounts?: number; closedAccounts?: number };
    income?: { grossSalary?: number; netSalary?: number; affordability?: string };
    debtRestructuring?: { ncrdcNo?: string; debtCounsellorName?: string; dhsStatus?: string };
    adverseListings?: { creditor?: string; accountNumber?: string; openBalance?: number; overdueBalance?: number; status?: string; lastPaymentDate?: string }[];
    accounts?: { creditor?: string; accountNumber?: string; originalAmount?: number; balance?: number; installment?: number; status?: string; contractStart?: string; lastPaymentDate?: string }[];
}

function isClosedStatus(status: string | undefined): boolean {
    const s = (status || '').toUpperCase();
    return s.includes('CLOSED') || s.includes('PAID') || s.includes('SETTLED');
}

/** AI-extracted dates arrive as 'YYYY-MM-DD' or the literal string 'NA'. */
function formatReportDate(value: string | undefined): { text: string; stated: boolean } {
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed.toUpperCase() === 'NA') return { text: 'Not stated', stated: false };
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return { text: 'Not stated', stated: false };
    return { text: d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }), stated: true };
}

interface ReportEntry {
    documentId: string;
    fileName: string;
    type: string;
    analyzedAt: string;
    data: ReportData;
    insights: InsightItem[];
}

interface InsightsResponse {
    reports: ReportEntry[];
    unanalyzedReports: { id: string; fileName: string; type: string }[];
    hasCreditReports: boolean;
}

function formatZAR(amount: number | undefined) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount || 0);
}

const CATEGORY_META: Record<InsightItem['category'], { label: string; icon: string; color: string; border: string }> = {
    dispute: { label: 'Dispute Candidates', icon: '⚠️', color: 'text-red-300', border: 'border-red-800/40 bg-red-950/20' },
    improve: { label: 'Could Be Improved', icon: '📈', color: 'text-amber-300', border: 'border-amber-800/40 bg-amber-950/20' },
    positive: { label: "What's Great", icon: '✅', color: 'text-emerald-300', border: 'border-emerald-800/40 bg-emerald-950/20' },
    info: { label: 'For Your Information', icon: 'ℹ️', color: 'text-sky-300', border: 'border-sky-800/40 bg-sky-950/20' },
};

function InsightColumn({ category, items }: { category: InsightItem['category']; items: InsightItem[] }) {
    const meta = CATEGORY_META[category];
    if (items.length === 0) return null;
    return (
        <div className="space-y-2">
            <div className={`text-xs font-semibold uppercase tracking-wider ${meta.color} flex items-center gap-1.5`}>
                <span>{meta.icon}</span> {meta.label} ({items.length})
            </div>
            <div className="space-y-2">
                {items.map((item, i) => (
                    <div key={i} className={`rounded-lg border p-3 ${meta.border}`}>
                        <p className="text-xs font-semibold text-zinc-100">{item.title}</p>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{item.detail}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

const OWN_NCRDC_NO = 'NCRDC3693';

function ReportCard({ report }: { report: ReportEntry }) {
    const byCategory = (cat: InsightItem['category']) => report.insights.filter(i => i.category === cat);
    const score = report.data.creditScore;
    const prescribedCount = report.insights.filter(i => i.category === 'dispute' && i.title.startsWith('Possible prescription')).length;
    const ncrdcNo = (report.data.debtRestructuring?.ncrdcNo || '').trim();
    const hasDebtReview = ncrdcNo && ncrdcNo.toUpperCase() !== 'NA';
    const isOwnDebtReview = hasDebtReview && ncrdcNo.toUpperCase() === OWN_NCRDC_NO;

    const allAccountRows = [
        ...(report.data.accounts || []).map(a => ({
            creditor: a.creditor || 'Unknown creditor',
            accountNumber: a.accountNumber,
            originalAmount: a.originalAmount,
            balance: a.balance,
            installment: a.installment,
            status: a.status || 'ACTIVE',
            closed: isClosedStatus(a.status),
            openDate: a.contractStart,
            lastPaymentDate: a.lastPaymentDate,
        })),
        ...(report.data.adverseListings || []).map(a => ({
            creditor: a.creditor || 'Unknown creditor',
            accountNumber: a.accountNumber,
            originalAmount: undefined as number | undefined,
            balance: a.openBalance ?? a.overdueBalance,
            installment: undefined as number | undefined,
            status: a.status || 'Adverse Listing',
            closed: false,
            openDate: undefined as string | undefined,
            lastPaymentDate: a.lastPaymentDate,
        })),
    ];

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <p className="text-sm font-semibold text-zinc-100">{report.fileName}</p>
                    <p className="text-xs text-zinc-500">
                        Analyzed {report.analyzedAt ? new Date(report.analyzedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </p>
                </div>
                {score && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-800 border border-zinc-700 text-zinc-200">
                        Score {score.score ?? 'N/A'} — {score.band || 'Unknown'}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
                <div className="rounded-lg bg-zinc-800/50 p-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Balance</p>
                    <p className="text-sm font-semibold text-zinc-100">{formatZAR(report.data.summary?.totalDebt)}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Instalments</p>
                    <p className="text-sm font-semibold text-zinc-100">{formatZAR(report.data.summary?.totalInstallment)}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Open</p>
                    <p className="text-sm font-semibold text-zinc-100">{report.data.summary?.activeAccounts ?? 0}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Closed</p>
                    <p className="text-sm font-semibold text-zinc-100">{report.data.summary?.closedAccounts ?? 0}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Prescribed</p>
                    <p className={`text-sm font-semibold ${prescribedCount > 0 ? 'text-red-300' : 'text-zinc-100'}`}>{prescribedCount}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Debt Review</p>
                    <p className={`text-sm font-semibold ${!hasDebtReview ? 'text-zinc-100' : isOwnDebtReview ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {!hasDebtReview ? 'None found' : isOwnDebtReview ? 'Zenowethu' : ncrdcNo}
                    </p>
                </div>
            </div>

            {allAccountRows.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                        All Accounts ({allAccountRows.length})
                    </p>
                    <div className="border border-zinc-800 rounded-xl overflow-hidden text-xs">
                        <table className="w-full text-left">
                            <thead className="bg-zinc-800/80 text-zinc-400 font-semibold border-b border-zinc-700/60">
                                <tr>
                                    <th className="p-2">Creditor</th>
                                    <th className="p-2">Status</th>
                                    <th className="p-2">Opening Balance</th>
                                    <th className="p-2">Current Balance</th>
                                    <th className="p-2">Monthly Instalment</th>
                                    <th className="p-2">Open Date</th>
                                    <th className="p-2">Last Payment</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800 text-zinc-300">
                                {allAccountRows.map((a, i) => {
                                    const openDate = formatReportDate(a.openDate);
                                    const lastPayment = formatReportDate(a.lastPaymentDate);
                                    return (
                                        <tr key={`${a.creditor}-${a.accountNumber ?? i}`} className="hover:bg-zinc-800/30">
                                            <td className="p-2 font-medium">
                                                {a.creditor}
                                                {a.accountNumber && <div className="text-[10px] text-zinc-500">{a.accountNumber}</div>}
                                            </td>
                                            <td className="p-2">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${a.closed ? 'bg-zinc-700/50 text-zinc-400' : 'bg-emerald-500/20 text-emerald-300'}`}>
                                                    {a.status}
                                                </span>
                                            </td>
                                            <td className="p-2 text-zinc-400">{a.originalAmount != null ? formatZAR(a.originalAmount) : '—'}</td>
                                            <td className="p-2">{formatZAR(a.balance)}</td>
                                            <td className="p-2 text-zinc-400">{a.installment != null ? formatZAR(a.installment) : '—'}</td>
                                            <td className={`p-2 ${openDate.stated ? 'text-zinc-400' : 'text-amber-400 italic'}`}>{openDate.text}</td>
                                            <td className={`p-2 ${lastPayment.stated ? 'text-zinc-400' : 'text-amber-400 italic'}`}>{lastPayment.text}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InsightColumn category="dispute" items={byCategory('dispute')} />
                <InsightColumn category="improve" items={byCategory('improve')} />
                <InsightColumn category="positive" items={byCategory('positive')} />
                <InsightColumn category="info" items={byCategory('info')} />
            </div>

            {report.insights.length === 0 && (
                <p className="text-xs text-zinc-500 italic">No notable findings extracted from this report.</p>
            )}
        </div>
    );
}

export function CreditReportInsightsTab({ caseId }: { caseId: string }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<InsightsResponse | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetch(`/api/cases/${caseId}/credit-reports/insights`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to load credit report insights');
                return res.json();
            })
            .then(json => {
                if (!cancelled) setData(json);
            })
            .catch(err => {
                if (!cancelled) setError(err.message || 'Failed to load credit report insights');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [caseId]);

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-base font-semibold text-zinc-100">Credit Report Insights</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                    AI-assisted read of this case&apos;s analyzed credit report(s) — what may be worth disputing, what could be improved, and what&apos;s already in good standing.
                </p>
            </div>

            {loading && (
                <div className="py-10 text-center space-y-3">
                    <div className="animate-spin w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full mx-auto" />
                    <p className="text-xs text-zinc-500">Loading credit report insights...</p>
                </div>
            )}

            {!loading && error && (
                <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/60 text-red-200 text-sm">
                    ⚠️ {error}
                </div>
            )}

            {!loading && !error && data && (
                <>
                    {!data.hasCreditReports && (
                        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 text-xs">
                            No credit report documents uploaded on this case yet. Upload one under the Documents tab.
                        </div>
                    )}

                    {data.hasCreditReports && data.unanalyzedReports.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200 text-xs">
                            <span className="font-semibold">{data.unanalyzedReports.length} credit report(s) not yet analyzed:</span>{' '}
                            {data.unanalyzedReports.map(r => r.fileName).join(', ')} — use &quot;Analyse Credit Reports&quot; above to extract data first.
                        </div>
                    )}

                    {data.reports.length > 0 && (
                        <div className="space-y-4">
                            {data.reports.map(report => (
                                <ReportCard key={report.documentId} report={report} />
                            ))}
                        </div>
                    )}

                    {data.hasCreditReports && data.reports.length === 0 && data.unanalyzedReports.length === 0 && (
                        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 text-xs">
                            No analyzed credit report data found.
                        </div>
                    )}

                    {data.reports.length > 0 && (
                        <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-3 text-[11px] text-zinc-500 leading-relaxed">
                            AI-assisted analysis for staff review only — not legal or financial advice. Confirm every detail against the source document before disputing, generating documents, or advising the consumer. Dispute candidates are not a guarantee of removal or success.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
