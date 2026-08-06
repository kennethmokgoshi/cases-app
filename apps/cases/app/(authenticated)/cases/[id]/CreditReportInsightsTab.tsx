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
    adverseListings?: { creditor?: string; accountNumber?: string; openBalance?: number; status?: string; lastPaymentDate?: string }[];
    accounts?: { creditor?: string; accountNumber?: string; balance?: number; status?: string; lastPaymentDate?: string }[];
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

function ReportCard({ report }: { report: ReportEntry }) {
    const byCategory = (cat: InsightItem['category']) => report.insights.filter(i => i.category === cat);
    const score = report.data.creditScore;

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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-zinc-800/50 p-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Total Debt</p>
                    <p className="text-sm font-semibold text-zinc-100">{formatZAR(report.data.summary?.totalDebt)}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Instalments</p>
                    <p className="text-sm font-semibold text-zinc-100">{formatZAR(report.data.summary?.totalInstallment)}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Active</p>
                    <p className="text-sm font-semibold text-zinc-100">{report.data.summary?.activeAccounts ?? 0}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Closed</p>
                    <p className="text-sm font-semibold text-zinc-100">{report.data.summary?.closedAccounts ?? 0}</p>
                </div>
            </div>

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
