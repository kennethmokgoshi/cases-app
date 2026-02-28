'use client';

import { useState, useEffect, useCallback } from 'react';

type RecentCase = {
    id: string;
    fileNumber: string;
    status: string;
    createdAt: string;
    client: { firstName: string; lastName: string } | null;
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadStats = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch('/api/b2b/stats')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json() as Promise<ReportStats>;
            })
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(() => {
                setError('Unable to load report data. Please try again.');
                setLoading(false);
            });
    }, []);

    useEffect(() => { loadStats(); }, [loadStats]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-64">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Loading reports…</p>
                </div>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="flex items-center justify-center min-h-64">
                <div className="text-center max-w-sm">
                    <p className="text-red-400 mb-4 text-sm">{error ?? 'No data available.'}</p>
                    <button
                        onClick={loadStats}
                        className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg text-sm hover:bg-cyan-400 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const approvalRate = stats.totalLeads > 0
        ? ((stats.approved / stats.totalLeads) * 100).toFixed(0)
        : '0';
    const change = monthChange(stats.thisMonth, stats.lastMonth);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Reports &amp; Analytics</h1>
                <p className="text-gray-400">Track your referral performance</p>
            </div>

            {/* Primary Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Leads */}
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400">Total Leads</h3>
                        <div className="w-10 h-10 bg-zeno-cyan/10 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white mb-1">{stats.totalLeads}</p>
                    <p className="text-xs text-gray-500">All time referrals</p>
                </div>

                {/* This Month */}
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400">This Month</h3>
                        <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white mb-1">{stats.thisMonth}</p>
                    <p className={`text-xs ${change.positive ? 'text-green-400' : 'text-red-400'}`}>{change.label}</p>
                </div>

                {/* Approved */}
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400">Approved</h3>
                        <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white mb-1">{stats.approved}</p>
                    <p className="text-xs text-gray-500">{approvalRate}% approval rate</p>
                </div>

                {/* Pending Review */}
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400">Pending Review</h3>
                        <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white mb-1">{stats.pendingReview}</p>
                    <p className="text-xs text-gray-500">Avg response: {stats.averageResponseTime}</p>
                </div>
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                    <h3 className="text-sm font-medium text-gray-400 mb-3">Rejected / Cancelled</h3>
                    <p className="text-3xl font-bold text-red-400">{stats.rejected}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {stats.totalLeads > 0 ? ((stats.rejected / stats.totalLeads) * 100).toFixed(0) : 0}% of total referrals
                    </p>
                </div>
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                    <h3 className="text-sm font-medium text-gray-400 mb-3">Last Month</h3>
                    <p className="text-3xl font-bold text-white">{stats.lastMonth}</p>
                    <p className="text-xs text-gray-500 mt-1">Referrals submitted last month</p>
                </div>
            </div>

            {/* Performance Chart Placeholder */}
            <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-6">Monthly Performance</h2>
                <div className="h-64 flex items-center justify-center border border-dashed border-white/10 rounded-lg">
                    <div className="text-center">
                        <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <p className="text-gray-400">Performance chart coming soon</p>
                        <p className="text-sm text-gray-500 mt-2">Visual analytics will be displayed here</p>
                    </div>
                </div>
            </div>

            {/* Recent Activity — live data from /api/b2b/stats */}
            <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-6">Recent Activity</h2>

                {stats.recentCases.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500 text-sm">No referrals submitted yet.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {stats.recentCases.map(c => {
                            const colour = statusColour(c.status);
                            const clientName = c.client
                                ? `${c.client.firstName} ${c.client.lastName}`
                                : 'Unknown Client';
                            return (
                                <div key={c.id} className="flex items-center justify-between p-4 bg-zeno-navy rounded-lg">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`w-10 h-10 shrink-0 ${colour.bg} rounded-lg flex items-center justify-center`}>
                                            <div className={`w-2.5 h-2.5 rounded-full ${colour.dot}`} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-white font-medium truncate">{clientName}</p>
                                            <p className="text-sm text-gray-400">
                                                {c.fileNumber} ·{' '}
                                                <span className={colour.text}>{formatStatus(c.status)}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-sm text-gray-500 shrink-0 ml-4">
                                        {formatTimeAgo(c.createdAt)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
