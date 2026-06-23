'use client';
import { toast } from '@zenowethu/ui';
import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type ConvertedReferrer = {
    id: string;
    firstName: string;
    lastName: string;
    idNumber: string;
    email: string | null;
    cellNumber: string | null;
    createdAt: string;
    project: { id: string; name: string } | null;
    parentReferrer: { firstName: string; lastName: string } | null;
    _count: { cases: number };
    isActive: boolean;
    commissionType: string;
    fixedCommissionAmount: number | null;
};

type ReportStats = {
    totalConverted: number;
    convertedThisMonth: number;
    convertedThisWeek: number;
    avgCasesPerReferrer: number;
    totalCasesGenerated: number;
    activeConverted: number;
    withParentReferrer: number;
};

export default function ReferrerConversionReportPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [referrers, setReferrers] = useState<ConvertedReferrer[]>([]);
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<'all' | 'month' | 'week'>('month');

    const isManager = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager || session?.user?.role === 'MANAGER';

    useEffect(() => {
        if (status === 'authenticated' && !isManager) router.push('/');
    }, [session, status, isManager, router]);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/referrer-conversion-report?range=${timeRange}`);
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            setReferrers(data.referrers);
            setStats(data.stats);
        } catch {
            toast.error('Failed to load report');
        } finally {
            setLoading(false);
        }
    }, [timeRange]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (!isManager) return null;

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <Link href="/admin" className="text-gray-400 hover:text-white text-sm transition-colors">← Back to Admin</Link>
                </div>
                <h1 className="text-2xl font-bold text-white">Referrer Conversion Report</h1>
                <p className="text-gray-400 text-sm mt-1">Track clients converted to referrers and their performance</p>
            </div>

            {/* Time Range Filter */}
            <div className="flex gap-3 mb-6">
                {(['all', 'month', 'week'] as const).map((range) => (
                    <button
                        key={range}
                        onClick={() => setTimeRange(range)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            timeRange === range
                                ? 'bg-zeno-cyan text-zeno-dark'
                                : 'bg-zeno-blue/30 text-gray-300 hover:bg-zeno-blue/40'
                        }`}
                    >
                        {range === 'all' ? 'All Time' : range === 'month' ? 'This Month' : 'This Week'}
                    </button>
                ))}
            </div>

            {/* Stats Grid */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                    {[
                        { label: 'Total Converted', value: stats.totalConverted, color: 'text-white' },
                        { label: 'This Month', value: stats.convertedThisMonth, color: 'text-emerald-400' },
                        { label: 'This Week', value: stats.convertedThisWeek, color: 'text-blue-400' },
                        { label: 'Active', value: stats.activeConverted, color: 'text-green-400' },
                        { label: 'Avg Cases', value: stats.avgCasesPerReferrer.toFixed(1), color: 'text-amber-400' },
                        { label: 'Cases Generated', value: stats.totalCasesGenerated, color: 'text-purple-400' },
                    ].map((s) => (
                        <div key={s.label} className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-4">
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Key Insights */}
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold text-emerald-400 mb-2">📊 Key Insights</h3>
                <ul className="text-xs text-emerald-300 space-y-1">
                    {stats && (
                        <>
                            <li>✓ <strong>{stats.totalConverted}</strong> clients have been successfully converted to referrers</li>
                            <li>✓ <strong>{stats.totalCasesGenerated}</strong> cases generated from converted referrers</li>
                            <li>✓ <strong>{stats.withParentReferrer}</strong> converted referrers preserve their parent referrer relationship</li>
                            <li>✓ Converted referrers generate an average of <strong>{stats.avgCasesPerReferrer.toFixed(1)}</strong> cases each</li>
                        </>
                    )}
                </ul>
            </div>

            {/* Table */}
            <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zeno-blue/40">
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">ID Number</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Contact</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Converted</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Referred By</th>
                            <th className="text-center py-3 px-4 text-gray-400 font-medium">Cases Generated</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Commission</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} className="py-12 text-center text-gray-400">Loading...</td></tr>
                        ) : referrers.length === 0 ? (
                            <tr><td colSpan={8} className="py-12 text-center text-gray-400">No conversions yet</td></tr>
                        ) : referrers.map((r) => (
                            <tr key={r.id} className="border-b border-zeno-blue/20 hover:bg-zeno-blue/20 transition-colors">
                                <td className="py-3 px-4">
                                    <Link href={`/admin/referrers`} className="text-white font-medium hover:text-zeno-cyan transition-colors">
                                        {r.firstName} {r.lastName}
                                    </Link>
                                </td>
                                <td className="py-3 px-4 text-gray-300 font-mono text-xs">{r.idNumber}</td>
                                <td className="py-3 px-4">
                                    <div className="text-gray-300 text-xs">{r.cellNumber ?? '—'}</div>
                                    <div className="text-gray-500 text-xs">{r.email ?? '—'}</div>
                                </td>
                                <td className="py-3 px-4 text-gray-300 text-xs">{new Date(r.createdAt).toLocaleDateString('en-ZA')}</td>
                                <td className="py-3 px-4">
                                    {r.parentReferrer ? (
                                        <span className="text-purple-400 text-xs font-medium">{r.parentReferrer.firstName} {r.parentReferrer.lastName}</span>
                                    ) : (
                                        <span className="text-gray-600 text-xs">Top-level</span>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <span className="text-white font-bold">{r._count.cases}</span>
                                </td>
                                <td className="py-3 px-4 text-xs">
                                    {r.commissionType === 'VOLUME_BASED' ? (
                                        <span className="text-blue-400">Volume-Based</span>
                                    ) : (
                                        <span className="text-emerald-400">R{r.fixedCommissionAmount}</span>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${r.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                        {r.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
