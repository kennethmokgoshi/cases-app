'use client';

import { useState, useEffect, useCallback } from 'react';
import { SLATier } from '@zenowethu/shared-lib';

type RecentCase = {
    id: string;
    fileNumber: string;
    status: string;
    createdAt: string;
    client: { firstName: string; lastName: string } | null;
};

type AdvancedStats = {
    slaStats: {
        total: number;
        critical: number;
        warning: number;
        normal: number;
        overdue: number;
    };
    trends: Array<{ month: string; count: number }>;
    bottlenecks: Array<{ status: string; avgDays: string; volume: number }>;
};

type ReportStats = {
    totalLeads: number;
    thisMonth: number;
    lastMonth: number;
    pendingReview: number;
    approved: number;
    rejected: number;
    averageResponseTime: string;
    recentCases: RecentCase[];
};

function formatTimeAgo(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
}

function formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function statusColour(status: string) {
    if (status === 'NEW_LEAD') return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-400' };
    if (status === 'CANCELLED') return { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' };
    if (status === 'COMPLETED' || status === 'CLOSED') return { bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-400' };
    return { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' };
}

function monthChange(thisMonth: number, lastMonth: number): { label: string; positive: boolean } {
    if (lastMonth === 0) return { label: thisMonth > 0 ? '+100% from last month' : '— no data yet', positive: thisMonth > 0 };
    const pct = ((thisMonth - lastMonth) / lastMonth * 100).toFixed(0);
    return { label: `${Number(pct) >= 0 ? '+' : ''}${pct}% from last month`, positive: Number(pct) >= 0 };
}

export default function B2BReportsPage() {
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [advanced, setAdvanced] = useState<AdvancedStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [statsRes, advRes] = await Promise.all([
                fetch('/api/b2b/stats'),
                fetch('/api/reports/advanced')
            ]);

            if (!statsRes.ok || !advRes.ok) throw new Error('Failed to fetch analytics');

            const statsData = await statsRes.json();
            const advData = await advRes.json();

            setStats(statsData);
            setAdvanced(advData);
        } catch (err) {
            setError('Unable to load analytical data. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-zeno-dark">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-zeno-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Computing analytics…</p>
                </div>
            </div>
        );
    }

    if (error || !stats || !advanced) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-zeno-dark">
                <div className="text-center max-w-sm p-8 bg-zeno-gray border border-white/10 rounded-2xl">
                    <p className="text-red-400 mb-6 font-medium">{error ?? 'No data available.'}</p>
                    <button
                        onClick={loadData}
                        className="px-6 py-2 bg-zeno-cyan text-black font-bold rounded-xl hover:bg-cyan-400 transition-all active:scale-95"
                    >
                        Retry Load
                    </button>
                </div>
            </div>
        );
    }

    const change = monthChange(stats.thisMonth, stats.lastMonth);

    return (
        <div className="max-w-7xl mx-auto space-y-10 p-6 lg:p-10 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">Advanced Analytics</h1>
                    <p className="text-gray-400 text-lg">Deep insights into pipeline health and performance.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => window.open('/api/reports/advanced/export', '_blank')}
                        className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 transition-all active:scale-95"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export Excel
                    </button>
                    <div className="p-4 bg-zeno-gray/50 border border-white/5 rounded-2xl">
                        <p className="text-xs text-gray-500 uppercase font-black mb-1">Response Time</p>
                        <p className="text-2xl font-bold text-zeno-cyan">{stats.averageResponseTime}</p>
                    </div>
                </div>
            </div>

            {/* SLA Compliance Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-gradient-to-br from-zeno-gray to-zeno-navy border border-white/10 rounded-3xl p-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <svg className="w-32 h-32 text-zeno-cyan" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
                        <span className="w-1.5 h-8 bg-zeno-cyan rounded-full" />
                        SLA Compliance
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative z-10">
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-400">Total Tracked</p>
                            <p className="text-4xl font-black text-white">{advanced.slaStats.total}</p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-red-400">Critical / Past Due</p>
                            <p className="text-4xl font-black text-red-500">{advanced.slaStats.critical}</p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-yellow-400">Warning (≤2d)</p>
                            <p className="text-4xl font-black text-yellow-500">{advanced.slaStats.warning}</p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-green-400">On Track</p>
                            <p className="text-4xl font-black text-green-500">{advanced.slaStats.normal}</p>
                        </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="mt-10 h-3 w-full bg-white/5 rounded-full overflow-hidden flex">
                        <div
                            style={{ width: `${(advanced.slaStats.critical / advanced.slaStats.total) * 100}%` }}
                            className="h-full bg-red-500"
                        />
                        <div
                            style={{ width: `${(advanced.slaStats.warning / advanced.slaStats.total) * 100}%` }}
                            className="h-full bg-yellow-500"
                        />
                        <div
                            style={{ width: `${(advanced.slaStats.normal / advanced.slaStats.total) * 100}%` }}
                            className="h-full bg-green-500"
                        />
                    </div>
                    <p className="mt-4 text-xs text-gray-500 font-medium">
                        * Compliance is calculated based on business days excluding South African public holidays.
                    </p>
                </div>

                <div className="bg-zeno-gray border border-white/10 rounded-3xl p-8">
                    <h2 className="text-xl font-bold text-white mb-6">Monthly Growth</h2>
                    <div className="space-y-6">
                        {advanced.trends.map((t, i) => (
                            <div key={t.month} className="flex items-center justify-between group">
                                <div className="space-y-1">
                                    <p className="text-sm text-gray-400 group-hover:text-white transition-colors">{t.month}</p>
                                    <div className="h-1.5 bg-zeno-cyan/20 rounded-full w-32 overflow-hidden">
                                        <div
                                            style={{ width: `${(t.count / Math.max(...advanced.trends.map(x => x.count))) * 100}%` }}
                                            className="h-full bg-zeno-cyan group-hover:bg-cyan-400 transition-all duration-500"
                                        />
                                    </div>
                                </div>
                                <p className="text-2xl font-bold text-white">{t.count}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottleneck Analysis Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-zeno-gray border border-white/10 rounded-3xl p-8">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold text-white">Status Throughput</h2>
                        <span className="px-3 py-1 bg-white/5 text-gray-400 text-xs rounded-lg font-bold">MTIS (Mean Time In Status)</span>
                    </div>
                    <div className="space-y-2">
                        {advanced.bottlenecks.length === 0 ? (
                            <p className="text-gray-500 text-center py-12 italic">Insufficient workflow logs to compute MTIS.</p>
                        ) : (
                            advanced.bottlenecks.map((b) => (
                                <div key={b.status} className="flex items-center justify-between p-4 bg-black/20 rounded-2xl hover:bg-black/40 transition-colors border border-transparent hover:border-white/5 group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-zeno-dark flex items-center justify-center text-xs font-black text-gray-500 group-hover:text-zeno-cyan transition-colors">
                                            {b.volume}
                                        </div>
                                        <p className="font-bold text-gray-300">{formatStatus(b.status)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-black text-white">{b.avgDays} days</p>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Average Stay</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="bg-zeno-gray border border-white/10 rounded-3xl p-8">
                    <h2 className="text-2xl font-bold text-white mb-8">Recent Activity Pipeline</h2>
                    <div className="space-y-4">
                        {stats.recentCases.map(c => {
                            const colour = statusColour(c.status);
                            return (
                                <div key={c.id} className="flex items-center justify-between p-5 bg-black/20 rounded-2xl group border border-transparent hover:border-zeno-cyan/20 hover:bg-zeno-cyan/5 transition-all">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`w-12 h-12 shrink-0 ${colour.bg} rounded-xl flex items-center justify-center relative`}>
                                            <div className={`w-3 h-3 rounded-full ${colour.dot} animate-pulse`} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-white font-bold group-hover:text-zeno-cyan transition-colors truncate">
                                                {c.client ? `${c.client.firstName} ${c.client.lastName}` : 'Unknown Client'}
                                            </p>
                                            <p className="text-sm text-gray-500 font-medium">
                                                {c.fileNumber} · <span className={colour.text}>{formatStatus(c.status)}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xs font-black text-gray-600 uppercase tracking-tighter">
                                            {formatTimeAgo(c.createdAt)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
