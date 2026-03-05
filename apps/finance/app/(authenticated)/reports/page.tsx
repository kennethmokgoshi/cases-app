'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

/* ─── Types ─────────────────────────────────────────────── */
type MonthlyRevenue = { month: string; total: number; count: number };
type PartnerSplit = { partner: string; zShare: number; partnerShare: number; total: number; caseCount: number };
type BatchSummary = { id: string; fileName: string; uploadedAt: string; totalAmount: number; matchCount: number; unmatchCount: number; status: string };

function formatZAR(n: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0 }).format(n);
}

/* ─── Revenue Tab ────────────────────────────────────────── */
function RevenueTab({ from, to }: { from: string; to: string }) {
    const [data, setData] = useState<MonthlyRevenue[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/finance/payments?from=${from}&to=${to}&limit=10000`)
            .then(r => r.json())
            .then(({ payments = [] }) => {
                // Aggregate by month client-side
                const map = new Map<string, { total: number; count: number }>();
                for (const p of payments) {
                    const key = new Date(p.date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' });
                    const prev = map.get(key) ?? { total: 0, count: 0 };
                    map.set(key, { total: prev.total + Number(p.amount), count: prev.count + 1 });
                }
                const rows = Array.from(map.entries())
                    .map(([month, { total, count }]) => ({ month, total, count }))
                    .sort((a, b) => a.month.localeCompare(b.month));
                setData(rows);
                setTotal(rows.reduce((s, r) => s + r.total, 0));
            })
            .catch(logger.error)
            .finally(() => setLoading(false));
    }, [from, to]);

    const maxAmount = Math.max(...data.map(d => d.total), 1);

    if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" /></div>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Total Revenue</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatZAR(total)}</p>
                </div>
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Total Payments</p>
                    <p className="text-2xl font-bold text-white mt-1">{data.reduce((s, r) => s + r.count, 0).toLocaleString()}</p>
                </div>
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Avg per Month</p>
                    <p className="text-2xl font-bold text-white mt-1">{data.length > 0 ? formatZAR(total / data.length) : '—'}</p>
                </div>
            </div>

            {/* Bar chart */}
            <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 p-6">
                <h3 className="text-sm font-semibold text-gray-300 mb-6">Revenue by Month</h3>
                {data.length === 0 ? (
                    <p className="text-center text-gray-500 py-8 text-sm">No payments in this period</p>
                ) : (
                    <div className="space-y-3">
                        {data.map(row => (
                            <div key={row.month} className="flex items-center gap-4">
                                <div className="w-20 text-xs text-gray-400 text-right shrink-0">{row.month}</div>
                                <div className="flex-1 relative h-8 bg-white/5 rounded-lg overflow-hidden">
                                    <div
                                        className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-lg transition-all"
                                        style={{ width: `${(row.total / maxAmount) * 100}%` }}
                                    />
                                    <div className="absolute inset-0 flex items-center px-3">
                                        <span className="text-xs font-semibold text-white drop-shadow">{formatZAR(row.total)}</span>
                                    </div>
                                </div>
                                <div className="w-12 text-xs text-gray-500 shrink-0">{row.count} pymt{row.count !== 1 ? 's' : ''}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Partner Splits Tab ─────────────────────────────────── */
function PartnerSplitsTab({ from, to }: { from: string; to: string }) {
    const [data, setData] = useState<PartnerSplit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/finance/payments?from=${from}&to=${to}&limit=10000`)
            .then(r => r.json())
            .then(async ({ payments = [] }) => {
                // Get cases with partner info for payments that have caseId
                const caseIds = [...new Set(payments.filter((p: any) => p.case?.fileNumber).map((p: any) => p.case?.fileNumber))];
                // Build a simple aggregation by partner from payment data
                const map = new Map<string, PartnerSplit>();
                for (const p of payments) {
                    const partner = p.case ? (p.case.partnerName ?? 'Direct (B2C)') : 'Unallocated';
                    const prev = map.get(partner) ?? { partner, zShare: 0, partnerShare: 0, total: 0, caseCount: 0 };
                    const amount = Number(p.amount);
                    // We'll use equal split as fallback since we don't have split% in payment
                    map.set(partner, {
                        ...prev,
                        total: prev.total + amount,
                        zShare: prev.zShare + amount,
                        caseCount: prev.caseCount + 1 });
                }
                setData(Array.from(map.values()).sort((a, b) => b.total - a.total));
            })
            .catch(logger.error)
            .finally(() => setLoading(false));
    }, [from, to]);

    if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>;

    const grandTotal = data.reduce((s, r) => s + r.total, 0);

    return (
        <div className="space-y-6">
            <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
                {data.length === 0 ? (
                    <p className="text-center text-gray-500 py-10 text-sm">No payments in this period</p>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-3">Partner / Source</th>
                                <th className="px-6 py-3">Payments</th>
                                <th className="px-6 py-3">Total Collected</th>
                                <th className="px-6 py-3">% of Revenue</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {data.map(row => (
                                <tr key={row.partner} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 text-white font-medium">{row.partner}</td>
                                    <td className="px-6 py-4 text-gray-400">{row.caseCount}</td>
                                    <td className="px-6 py-4 text-white font-semibold">{formatZAR(row.total)}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-20 bg-white/10 rounded-full h-1.5">
                                                <div
                                                    className="bg-purple-400 h-1.5 rounded-full"
                                                    style={{ width: `${grandTotal > 0 ? (row.total / grandTotal) * 100 : 0}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-gray-400">
                                                {grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0}%
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-white/5">
                            <tr>
                                <td className="px-6 py-3 text-gray-400 font-semibold text-xs uppercase">Total</td>
                                <td className="px-6 py-3 text-gray-400">{data.reduce((s, r) => s + r.caseCount, 0)}</td>
                                <td className="px-6 py-3 text-white font-bold">{formatZAR(grandTotal)}</td>
                                <td className="px-6 py-3 text-gray-400 text-xs">100%</td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>
        </div>
    );
}

/* ─── Batches Tab ────────────────────────────────────────── */
function BatchesReportTab() {
    const [batches, setBatches] = useState<BatchSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/finance/batches?limit=50')
            .then(r => r.json())
            .then(d => setBatches(d.batches ?? []))
            .catch(logger.error)
            .finally(() => setLoading(false));
    }, []);

    const reconciled = batches.filter(b => b.status === 'RECONCILED').length;
    const pending = batches.filter(b => b.status !== 'RECONCILED').length;
    const totalAmount = batches.reduce((s, b) => s + Number(b.totalAmount), 0);

    if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" /></div>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Total Batches</p>
                    <p className="text-2xl font-bold text-white mt-1">{batches.length}</p>
                </div>
                <div className="bg-emerald-500/10 rounded-xl p-5 border border-emerald-500/20">
                    <p className="text-xs text-emerald-600 uppercase tracking-wider">Reconciled</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">{reconciled}</p>
                </div>
                <div className="bg-yellow-500/10 rounded-xl p-5 border border-yellow-500/20">
                    <p className="text-xs text-yellow-600 uppercase tracking-wider">Pending</p>
                    <p className="text-2xl font-bold text-yellow-400 mt-1">{pending}</p>
                </div>
            </div>
            <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-3">File</th>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Amount</th>
                            <th className="px-6 py-3">Matched</th>
                            <th className="px-6 py-3">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {batches.map(b => {
                            const tot = b.matchCount + b.unmatchCount;
                            const rate = tot > 0 ? Math.round((b.matchCount / tot) * 100) : 0;
                            return (
                                <tr key={b.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-3 text-white truncate max-w-[180px]">{b.fileName}</td>
                                    <td className="px-6 py-3 text-gray-400">{new Date(b.uploadedAt).toLocaleDateString('en-ZA')}</td>
                                    <td className="px-6 py-3 text-white font-semibold">{formatZAR(Number(b.totalAmount))}</td>
                                    <td className="px-6 py-3 text-gray-400 text-xs">{rate}% ({b.matchCount}/{tot})</td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs border ${b.status === 'RECONCILED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'}`}>
                                            {b.status}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ─── Main Component ─────────────────────────────────────── */
function ReportsContent() {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'revenue');
    const [from, setFrom] = useState(
        new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    );
    const [to, setTo] = useState(new Date().toISOString().split('T')[0]);

    const tabs = [
        { id: 'revenue', label: 'Revenue', icon: '💰' },
        { id: 'partners', label: 'Partner Splits', icon: '🤝' },
        { id: 'batches', label: 'Batch Report', icon: '📦' },
    ];

    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-8">
                <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-4 inline-block">← Dashboard</Link>
                <h1 className="text-3xl font-bold text-white mb-1">Reports & Analytics</h1>
                <p className="text-gray-400 text-sm">Financial performance, revenue, and reconciliation reports</p>
            </div>

            {/* Date filters (applied to Revenue + Partners tabs) */}
            <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 mb-6 border border-white/5 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">From</label>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">To</label>
                    <input type="date" value={to} onChange={e => setTo(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <div className="flex gap-2 ml-auto">
                    {[
                        { label: 'This Month', fn: () => { const n = new Date(); setFrom(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().split('T')[0]); setTo(n.toISOString().split('T')[0]); } },
                        { label: 'This Year', fn: () => { const n = new Date(); setFrom(new Date(n.getFullYear(), 0, 1).toISOString().split('T')[0]); setTo(n.toISOString().split('T')[0]); } },
                    ].map(q => (
                        <button key={q.label} onClick={q.fn}
                            className="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-xs rounded-lg transition-colors">
                            {q.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-transparent'}`}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'revenue' && <RevenueTab from={from} to={to} />}
            {activeTab === 'partners' && <PartnerSplitsTab from={from} to={to} />}
            {activeTab === 'batches' && <BatchesReportTab />}
        </div>
    );
}

export default function ReportsPage() {
    return (
        <div className="p-6">
            <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" /></div>}>
                <ReportsContent />
            </Suspense>
        </div>
    );
}
