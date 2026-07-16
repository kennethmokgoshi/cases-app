'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

// ─── Export Dropdown ──────────────────────────────────────────────────────────
function ExportDropdown({ reportType, onExport, label = 'Export', variant = 'primary' }: {
    reportType: string;
    onExport: (type: string, format: string) => void;
    label?: string;
    variant?: 'primary' | 'inline';
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const options = [
        { format: 'csv',   icon: '📄', label: 'CSV',        desc: 'Comma-separated values' },
        { format: 'excel', icon: '📊', label: 'Excel',      desc: '.xlsx spreadsheet' },
        { format: 'pdf',   icon: '📋', label: 'PDF',        desc: 'Printable document' },
    ];

    const btnClass = variant === 'primary'
        ? 'px-4 py-2 bg-zeno-cyan text-zeno-navy font-medium rounded-lg hover:bg-cyan-400 transition-colors flex items-center gap-2'
        : 'text-zeno-cyan hover:text-cyan-300 text-sm flex items-center gap-1';

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(!open)} className={btnClass}>
                <span>📥 {label}</span>
                <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-zeno-navy border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden">
                    <div className="p-2 border-b border-white/5">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest px-2 font-bold">Export Format</p>
                    </div>
                    <div className="p-1">
                        {options.map(opt => (
                            <button
                                key={opt.format}
                                onClick={() => { onExport(reportType, opt.format); setOpen(false); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left"
                            >
                                <span className="text-lg">{opt.icon}</span>
                                <div>
                                    <p className="text-sm font-medium text-white">{opt.label}</p>
                                    <p className="text-[10px] text-gray-500">{opt.desc}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Client-side logger
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

type ReportStats = {
    totalCases: number;
    casesByStatus: { status: string; count: number }[];
    casesByProject: { projectName: string; count: number }[];
    casesByMonth: { month: string; count: number }[];
    staffStats: { staffId: string; staffName: string; count: number }[];
    b2bStats: { partnerName: string; count: number }[];
    b2bCases: number;
    b2cCases: number;
};

function ReportsContent() {
    const searchParams = useSearchParams();
    const initialTab = searchParams.get('tab') || 'overview';
    const [activeTab, setActiveTab] = useState(initialTab);
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterBy, setFilterBy] = useState<'createdAt' | 'fileToBeCompleted'>('createdAt');
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
    }, [dateRange, selectedProjectId, filterBy]); // Re-fetch when filter changes

    const fetchReportStats = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/reports/stats?from=${dateRange.from}&to=${dateRange.to}&projectId=${selectedProjectId}&filterBy=${filterBy}`);
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

    const exportReport = (type: string, format: string = 'csv') => {
        window.open(`/api/reports/export?type=${type}&format=${format}&from=${dateRange.from}&to=${dateRange.to}&projectId=${selectedProjectId}&filterBy=${filterBy}`, '_blank');
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'cases', label: 'Cases Report', icon: '📁' },
        { id: 'staff', label: 'Staff Performance', icon: '👥' },
        { id: 'b2b', label: 'B2B Partners', icon: '🏢' },
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
                                {parent.children?.filter((c: any) => c.type === 'BRANCH' || c.type === 'FOLDER' || c.type === 'REFERRER').map((child: any) => (
                                    <option key={child.id} value={child.id}>{child.name}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>

                {/* Filter By Mode */}
                <div className="flex items-center gap-2 bg-zeno-navy p-1 rounded-lg border border-white/5">
                    <button
                        onClick={() => setFilterBy('createdAt')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filterBy === 'createdAt' ? 'bg-zeno-cyan text-zeno-navy' : 'text-gray-400 hover:text-white'}`}
                    >
                        Created Date
                    </button>
                    <button
                        onClick={() => setFilterBy('fileToBeCompleted')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filterBy === 'fileToBeCompleted' ? 'bg-zeno-cyan text-zeno-navy' : 'text-gray-400 hover:text-white'}`}
                    >
                        Completion Date
                    </button>
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
                        <OverviewTab stats={stats} onExport={exportReport} />
                    )}

                    {/* Cases Report Tab */}
                    {activeTab === 'cases' && (
                        <CasesReportTab stats={stats} filterBy={filterBy} onExport={exportReport} />
                    )}

                    {/* Staff Tab */}
                    {activeTab === 'staff' && (
                        <StaffPerformanceTab stats={stats} onExport={exportReport} />
                    )}

                    {/* B2B Tab */}
                    {activeTab === 'b2b' && (
                        <B2BPerformanceTab stats={stats} onExport={exportReport} />
                    )}

                    {/* Invoices Tab */}
                    {activeTab === 'invoices' && (
                        <InvoicesTab dateRange={dateRange} onExport={exportReport} />
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
function OverviewTab({ stats, onExport }: { stats: ReportStats | null; onExport: (type: string, format: string) => void }) {
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
                    <ExportDropdown reportType="status" onExport={onExport} label="Export" variant="inline" />
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
                    <ExportDropdown reportType="project" onExport={onExport} label="Export" variant="inline" />
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

function CasesReportTab({ stats, filterBy, onExport }: { stats: ReportStats | null; filterBy: string; onExport: (type: string, format: string) => void }) {
    const isCompletionMode = filterBy === 'fileToBeCompleted';

    return (
        <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-white">Detailed Cases Report</h3>
                    <p className="text-sm text-zeno-cyan mt-1">Filtering by: {isCompletionMode ? 'Target Completion Date' : 'Registration Date'}</p>
                </div>
                <div className="flex gap-2">
                    {isCompletionMode && <ExportDropdown reportType="cases_completed" onExport={onExport} label="Export Completion Report" variant="primary" />}
                    <ExportDropdown reportType="cases" onExport={onExport} label="Export All Cases" variant={isCompletionMode ? 'inline' : 'primary'} />
                </div>
            </div>
            <p className="text-gray-400 mb-6">Export a detailed report of all cases within the selected date range and branch filter.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-zeno-navy rounded-lg border border-purple-500/30">
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="text-purple-400 font-medium">B2B Cases Only</h4>
                        <ExportDropdown reportType="cases_b2b" onExport={onExport} label="Export" variant="inline" />
                    </div>
                    <p className="text-gray-400 text-sm">Export partner/referral cases</p>
                </div>
                <div className="p-4 bg-zeno-navy rounded-lg border border-teal-500/30">
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="text-teal-400 font-medium">B2C Cases Only</h4>
                        <ExportDropdown reportType="cases_b2c" onExport={onExport} label="Export" variant="inline" />
                    </div>
                    <p className="text-gray-400 text-sm">Export direct/private cases</p>
                </div>
            </div>
        </div>
    );
}

function StaffPerformanceTab({ stats, onExport }: { stats: ReportStats | null; onExport: (type: string, format: string) => void }) {
    if (!stats) return null;
    return (
        <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">Staff Performance</h3>
                <ExportDropdown reportType="staff" onExport={onExport} label="Export Staff Report" variant="primary" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.staffStats.map((staff) => (
                    <div key={staff.staffId} className="bg-zeno-navy p-4 rounded-xl border border-white/5 flex justify-between items-center">
                        <div>
                            <p className="text-white font-medium">{staff.staffName}</p>
                            <p className="text-xs text-gray-500">{staff.staffId === 'unassigned' ? 'Action required' : 'Team Member'}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold text-zeno-cyan">{staff.count}</p>
                            <p className="text-[10px] text-gray-400 uppercase">Cases</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function B2BPerformanceTab({ stats, onExport }: { stats: ReportStats | null; onExport: (type: string, format: string) => void }) {
    if (!stats) return null;
    return (
        <div className="bg-zeno-gray rounded-xl p-6 border border-white/10">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">B2B / Partner Breakdown</h3>
                <ExportDropdown reportType="b2b" onExport={onExport} label="Export Partner Report" variant="primary" />
            </div>
            <div className="space-y-3">
                {stats.b2bStats.map((partner) => (
                    <div key={partner.partnerName} className="flex items-center justify-between p-4 bg-zeno-navy rounded-xl border border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                                🏢
                            </div>
                            <span className="text-white font-medium">{partner.partnerName}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <span className="text-xl font-bold text-white">{partner.count}</span>
                                <span className="text-gray-500 text-xs ml-2">cases</span>
                            </div>
                        </div>
                    </div>
                ))}
                {stats.b2bStats.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        No B2B cases found for the selected criteria.
                    </div>
                )}
            </div>
        </div>
    );
}

function InvoicesTab({ dateRange, onExport }: { dateRange: { from: string; to: string }; onExport: (type: string, format: string) => void }) {
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
                <ExportDropdown reportType="invoices" onExport={onExport} label="Export Invoices" variant="primary" />
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

