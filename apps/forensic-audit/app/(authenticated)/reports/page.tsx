'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type ReportStats = {
    totalCases: number;
    casesByStatus: { status: string; count: number }[];
    casesByProject: { projectName: string; count: number }[];
    casesByMonth: { month: string; count: number }[];
    b2bCases: number;
    b2cCases: number;
};

function ReportsContent() {
    const searchParams = useSearchParams();
    const initialTab = searchParams.get('tab') || 'overview';
    const [activeTab, setActiveTab] = useState(initialTab);
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });

    // Project Filtering
    const [projects, setProjects] = useState<any[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState('all');

    useEffect(() => {
        // Fetch projects for filter
        const fetchProjects = async () => {
            try {
                const res = await fetch('/api/projects');
                const data = await res.json();
                if (data.hierarchy?.children) {
                    setProjects(data.hierarchy.children.filter((p: any) => p.type === 'ACQUISITION_SOURCE'));
                }
            } catch (error) {
                logger.error('Failed to fetch projects', error);
            }
        };
        fetchProjects();
    }, []);

    useEffect(() => {
        fetchReportStats();
    }, [dateRange, selectedProjectId]); // Re-fetch when filter changes

    const fetchReportStats = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/reports/stats?from=${dateRange.from}&to=${dateRange.to}&projectId=${selectedProjectId}`);
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            logger.error('Failed to fetch report stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportToCSV = (type: string) => {
        window.open(`/api/reports/export?type=${type}&from=${dateRange.from}&to=${dateRange.to}&projectId=${selectedProjectId}`, '_blank');
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'cases', label: 'Cases Report', icon: '📁' },
        { id: 'invoices', label: 'Invoices', icon: '💰' },
        { id: 'performance', label: 'Performance', icon: '📈' },
    ];

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <Link href="/" className="text-zeno-cyan hover:text-cyan-300 text-sm mb-4 inline-block">
                    ← Back to Dashboard
                </Link>
                <h1 className="text-3xl font-bold text-white mb-2">Reports & Analytics</h1>
                <p className="text-gray-400">Generate and export reports for your cases</p>
            </div>

            {/* Filters */}
            <div className="bg-zeno-gray rounded-xl p-4 mb-6 border border-white/10 flex flex-wrap gap-4 items-center">
                {/* Date Range */}
                <div className="flex items-center gap-2">
                    <label className="text-gray-400 text-sm">From:</label>
                    <input
                        type="date"
                        value={dateRange.from}
                        onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                        className="bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-zeno-cyan focus:outline-none"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-gray-400 text-sm">To:</label>
                    <input
                        type="date"
                        value={dateRange.to}
                        onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                        className="bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-zeno-cyan focus:outline-none"
                    />
                </div>

                {/* Project/Branch Filter */}
                <div className="flex items-center gap-2">
                    <label className="text-gray-400 text-sm">Branch:</label>
                    <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-zeno-cyan focus:outline-none min-w-[200px]"
                    >
                        <option value="all">All Branches</option>
                        {projects.map((parent) => (
                            <optgroup key={parent.id} label={parent.name}>
                                <option value={parent.id}>All {parent.name}</option>
                                {parent.children?.filter((c: any) => c.type === 'BRANCH' || c.type === 'FOLDER').map((child: any) => (
                                    <option key={child.id} value={child.id}>{child.name}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>

                <button
                    onClick={fetchReportStats}
                    className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-medium rounded-lg hover:bg-cyan-400 transition-colors ml-auto"
                >
                    Refresh Data
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${activeTab === tab.id
                                ? 'bg-zeno-cyan text-zeno-navy'
                                : 'bg-zeno-gray text-gray-400 hover:bg-zeno-blue hover:text-white'
                            }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-zeno-cyan border-t-transparent mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading report data...</p>
                </div>
            ) : (
                <>
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <OverviewTab stats={stats} onExport={exportToCSV} />
                    )}

                    {/* Cases Report Tab */}
                    {activeTab === 'cases' && (
                        <CasesReportTab stats={stats} onExport={exportToCSV} />
                    )}

                    {/* Invoices Tab */}
                    {activeTab === 'invoices' && (
                        <InvoicesTab dateRange={dateRange} onExport={exportToCSV} />
                    )}

                    {/* Performance Tab */}
                    {activeTab === 'performance' && (
                        <PerformanceTab stats={stats} />
                    )}
                </>
            )}
        </div>
    );
}

// Tab Components
function OverviewTab({ stats, onExport }: { stats: ReportStats | null; onExport: (type: string) => void }) {
    if (!stats) return null;
    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
                    <h3 className="text-gray-400 text-sm mb-2">Total Cases</h3>
                    <p className="text-3xl font-bold text-white">{stats.totalCases}</p>
                </div>
                <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
                    <h3 className="text-gray-400 text-sm mb-2">B2B Cases</h3>
                    <p className="text-3xl font-bold text-purple-400">{stats.b2bCases}</p>
                </div>
                <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
                    <h3 className="text-gray-400 text-sm mb-2">B2C Cases</h3>
                    <p className="text-3xl font-bold text-teal-400">{stats.b2cCases}</p>
                </div>
                <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
                    <h3 className="text-gray-400 text-sm mb-2">Completion Rate</h3>
                    <p className="text-3xl font-bold text-zeno-cyan">
                        {stats.totalCases > 0
                            ? Math.round((stats.casesByStatus.find(s => s.status === 'COMPLETED')?.count || 0) / stats.totalCases * 100)
                            : 0}%
                    </p>
                </div>
            </div>

            {/* Cases by Status */}
            <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white">Cases by Status</h3>
                    <button onClick={() => onExport('status')} className="text-zeno-cyan hover:text-cyan-300 text-sm">
                        📥 Export CSV
                    </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {stats.casesByStatus.slice(0, 8).map((item) => (
                        <div key={item.status} className="bg-zeno-navy rounded-lg p-3">
                            <p className="text-xs text-gray-400 truncate">{item.status.replace(/_/g, ' ')}</p>
                            <p className="text-xl font-bold text-white">{item.count}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Cases by Project */}
            <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white">Cases by Project</h3>
                    <button onClick={() => onExport('project')} className="text-zeno-cyan hover:text-cyan-300 text-sm">
                        📥 Export CSV
                    </button>
                </div>
                <div className="space-y-2">
                    {stats.casesByProject.map((item) => (
                        <div key={item.projectName} className="flex justify-between items-center p-3 bg-zeno-navy rounded-lg">
                            <span className="text-gray-300">{item.projectName}</span>
                            <span className="text-white font-bold">{item.count}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function CasesReportTab({ stats, onExport }: { stats: ReportStats | null; onExport: (type: string) => void }) {
    return (
        <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">Cases Report</h3>
                <button
                    onClick={() => onExport('cases')}
                    className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-medium rounded-lg hover:bg-cyan-400 transition-colors"
                >
                    📥 Export All Cases (CSV)
                </button>
            </div>
            <p className="text-gray-400 mb-4">Export a detailed report of all cases within the selected date range.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => onExport('cases_b2b')} className="p-4 bg-zeno-navy rounded-lg border border-purple-500/30 hover:bg-purple-500/10 transition-colors text-left">
                    <h4 className="text-purple-400 font-medium mb-1">B2B Cases Only</h4>
                    <p className="text-gray-400 text-sm">Export partner/referral cases</p>
                </button>
                <button onClick={() => onExport('cases_b2c')} className="p-4 bg-zeno-navy rounded-lg border border-teal-500/30 hover:bg-teal-500/10 transition-colors text-left">
                    <h4 className="text-teal-400 font-medium mb-1">B2C Cases Only</h4>
                    <p className="text-gray-400 text-sm">Export direct/private cases</p>
                </button>
            </div>
        </div>
    );
}

function InvoicesTab({ dateRange, onExport }: { dateRange: { from: string; to: string }; onExport: (type: string) => void }) {
    const [invoices, setInvoices] = useState<Array<{ id: string; fileNumber: string; clientName: string; amount: number; status: string; date: string }>>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchInvoices() {
            try {
                const res = await fetch(`/api/reports/invoices?from=${dateRange.from}&to=${dateRange.to}`);
                if (res.ok) {
                    const data = await res.json();
                    setInvoices(data);
                }
            } catch (e) {
                logger.error(e);
            } finally {
                setLoading(false);
            }
        }
        fetchInvoices();
    }, [dateRange]);

    return (
        <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">Pending Invoices (B2C)</h3>
                <button onClick={() => onExport('invoices')} className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-medium rounded-lg">
                    📥 Export Invoices
                </button>
            </div>
            {loading ? (
                <p className="text-gray-400">Loading invoices...</p>
            ) : invoices.length === 0 ? (
                <p className="text-gray-400">No pending invoices found.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">File #</th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Client</th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Amount</th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((inv) => (
                                <tr key={inv.id} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="py-3 px-4 text-zeno-cyan">{inv.fileNumber}</td>
                                    <td className="py-3 px-4 text-white">{inv.clientName}</td>
                                    <td className="py-3 px-4 text-white">R {inv.amount}</td>
                                    <td className="py-3 px-4"><span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">{inv.status}</span></td>
                                    <td className="py-3 px-4 text-gray-400">{inv.date}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function PerformanceTab({ stats }: { stats: ReportStats | null }) {
    return (
        <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-6">Performance Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zeno-navy rounded-lg p-4">
                    <h4 className="text-gray-400 text-sm mb-2">Avg. Processing Time</h4>
                    <p className="text-2xl font-bold text-white">14 days</p>
                    <p className="text-green-400 text-xs">↓ 2 days from last month</p>
                </div>
                <div className="bg-zeno-navy rounded-lg p-4">
                    <h4 className="text-gray-400 text-sm mb-2">Cases Completed</h4>
                    <p className="text-2xl font-bold text-white">{stats?.casesByStatus.find(s => s.status === 'COMPLETED')?.count || 0}</p>
                    <p className="text-green-400 text-xs">This period</p>
                </div>
                <div className="bg-zeno-navy rounded-lg p-4">
                    <h4 className="text-gray-400 text-sm mb-2">SLA Compliance</h4>
                    <p className="text-2xl font-bold text-white">94%</p>
                    <p className="text-yellow-400 text-xs">Target: 95%</p>
                </div>
            </div>
        </div>
    );
}

export default function ReportsPage() {
    return (
        <Suspense fallback={<div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-4 border-zeno-cyan border-t-transparent mx-auto"></div></div>}>
            <ReportsContent />
        </Suspense>
    );
}

