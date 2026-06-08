'use client';
import { toast } from '@zenowethu/ui';
import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type AutomationRun = {
    id: string;
    type: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    errorMessage: string | null;
    retryCount: number;
    case: { id: string; fileNumber: string } | null;
    client: { id: string; firstName: string; lastName: string } | null;
    logs: any;
};

export default function AutomationsManagement() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    
    const [runs, setRuns] = useState<AutomationRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterType, setFilterType] = useState<string>('');
    const [selectedRun, setSelectedRun] = useState<AutomationRun | null>(null);
    const [scanRunning, setScanRunning] = useState(false);
    const [cronRunning, setCronRunning] = useState<string | null>(null);
    const [scanResult, setScanResult] = useState<{
        scanned: number;
        overdueFound: number;
        actioned: number;
        skipped: number;
        errors: number;
        dcFollowups: number;
        consumerFollowups: number;
        staffAlerts: number;
        ranAt: string;
    } | null>(null);

    useEffect(() => {
        if (authStatus === 'authenticated' && !session?.user?.isAdmin) {
            router.push('/');
        } else if (authStatus === 'authenticated') {
            fetchRuns();
        }
    }, [session, authStatus, router, filterStatus, filterType]);

    const fetchRuns = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus) params.append('status', filterStatus);
            if (filterType) params.append('type', filterType);
            
            const res = await fetch(`/api/admin/automations?${params.toString()}`);
            const data = await res.json();
            if (data.runs) {
                setRuns(data.runs);
            }
        } catch (error) {
            console.error('Failed to fetch runs:', error);
            toast.error('Failed to load automation runs');
        } finally {
            setLoading(false);
        }
    };

    const handleOverdueScan = async () => {
        setScanRunning(true);
        setScanResult(null);
        try {
            const res = await fetch('/api/admin/automation/overdue-scan', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Scan failed');
            setScanResult(data.result);
            toast.success(`Overdue scan complete — ${data.result.actioned} case(s) actioned`);
            fetchRuns(); // refresh automation runs table
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Overdue scan failed');
        } finally {
            setScanRunning(false);
        }
    };

    const runCron = async (type: string) => {
        setCronRunning(type);
        try {
            // Use the server-side proxy so CRON_SECRET is never exposed to the browser
            const res = await fetch('/api/admin/automation/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Cron failed');
            toast.success(`${type.replace(/_/g, ' ')} complete`);
            fetchRuns();
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Cron failed');
        } finally {
            setCronRunning(null);
        }
    };

    const handleRetry = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/automations/${id}/retry`, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Retry failed');
            }
            toast.success('Retry dispatched successfully');
            fetchRuns();
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Success</span>;
            case 'FAILED':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-red-500/20 text-red-300 border border-red-500/30">Failed</span>;
            case 'RETRYING':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Retrying</span>;
            case 'RUNNING':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">Running</span>;
            case 'QUEUED':
            default:
                return <span className="px-2 py-1 text-xs font-medium rounded bg-gray-500/20 text-gray-300 border border-gray-500/30">Queued</span>;
        }
    };

    if (authStatus === 'loading' || (loading && runs.length === 0)) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (!session?.user?.isAdmin) {
        return null;
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Link href="/admin" className="text-gray-400 hover:text-white">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-3xl font-bold text-white">Automation Runs</h1>
                    </div>
                    <p className="text-gray-400">Monitor and retry background automations</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleOverdueScan}
                        disabled={scanRunning}
                        className="px-4 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg hover:bg-amber-500/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {scanRunning ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Scanning...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                                Run Overdue Scan
                            </>
                        )}
                    </button>
                    <button onClick={fetchRuns} className="px-4 py-2 bg-zeno-blue/30 text-white border border-zeno-blue/50 rounded-lg hover:bg-zeno-blue/50 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                    </button>
                </div>
                {/* Manual cron triggers */}
                <div className="flex flex-wrap gap-2 mt-3">
                    {[
                        { type: 'WORKFLOW_AUTOMATION', label: '⚡ Workflow Automation', color: 'green' },
                        { type: 'DHS_RECHECK', label: 'DHS Re-check', color: 'blue' },
                        { type: 'CHECK_NOT_REQUESTED', label: 'DHS Not Requested', color: 'indigo' },
                        { type: 'STALE_CASE_SCAN', label: 'Stale Cases', color: 'purple' },
                        { type: 'DOCUMENT_EXPIRY_SCAN', label: 'Doc Expiry', color: 'cyan' },
                        { type: 'R350_REMINDER', label: 'R350 Reminders', color: 'pink' },
                    ].map(({ type, label, color }) => (
                        <button
                            key={type}
                            onClick={() => runCron(type)}
                            disabled={cronRunning === type}
                            className={`px-3 py-1.5 text-xs rounded-lg border flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-${color}-500/10 text-${color}-300 border-${color}-500/30 hover:bg-${color}-500/20`}
                        >
                            {cronRunning === type ? (
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                            ) : '▶'}
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Overdue Scan Results */}
            {scanResult && (
                <div className="mb-6 p-5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-amber-300 font-semibold flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Overdue Scan — {new Date(scanResult.ranAt).toLocaleString()}
                        </h2>
                        <button onClick={() => setScanResult(null)} className="text-gray-500 hover:text-white">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center text-sm">
                        {[
                            { label: 'Scanned', value: scanResult.scanned, color: 'text-gray-300' },
                            { label: 'Overdue Found', value: scanResult.overdueFound, color: 'text-amber-300' },
                            { label: 'Actioned', value: scanResult.actioned, color: 'text-emerald-300' },
                            { label: 'DC Emails', value: scanResult.dcFollowups, color: 'text-blue-300' },
                            { label: 'Consumer Emails', value: scanResult.consumerFollowups, color: 'text-cyan-300' },
                            { label: 'Staff Alerts', value: scanResult.staffAlerts, color: 'text-purple-300' },
                            { label: 'Errors', value: scanResult.errors, color: scanResult.errors > 0 ? 'text-red-400' : 'text-gray-500' },
                        ].map(stat => (
                            <div key={stat.label} className="bg-white/5 rounded-lg p-3">
                                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                                <div className="text-gray-500 text-xs mt-1">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                    {scanResult.skipped > 0 && (
                        <p className="text-gray-500 text-xs mt-3">
                            {scanResult.skipped} case(s) skipped (already followed up recently or missing contact info).
                        </p>
                    )}
                </div>
            )}

            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="px-4 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan"
                >
                    <option value="">All Statuses</option>
                    <option value="SUCCESS">Success</option>
                    <option value="FAILED">Failed</option>
                    <option value="RUNNING">Running</option>
                    <option value="RETRYING">Retrying</option>
                    <option value="QUEUED">Queued</option>
                </select>
                <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="px-4 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan"
                >
                    <option value="">All Types</option>
                    <option value="OVERDUE_SCAN">Overdue Scan</option>
                    <option value="DHS_RECHECK">DHS Re-check</option>
                    <option value="STALE_CASE_SCAN">Stale Case Scan</option>
                    <option value="DOCUMENT_EXPIRY_SCAN">Document Expiry</option>
                    <option value="R350_REMINDER">R350 Reminder</option>
                    <option value="GHL_ID_MATCH">GHL ID Match</option>
                    <option value="DHS_SYNC">DHS Sync</option>
                    <option value="XDS_SYNC">XDS Sync</option>
                    <option value="GHL_WEBHOOK">GHL Webhook</option>
                    <option value="AI_DOC_ANALYSIS">AI Doc Analysis</option>
                    <option value="AI_PLAN_GEN">AI Plan Gen</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-zeno-blue/50 border-b border-zeno-blue/50 text-gray-300">
                                <th className="px-6 py-4 font-medium">Type</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Related Entity</th>
                                <th className="px-6 py-4 font-medium">Started At</th>
                                <th className="px-6 py-4 font-medium">Duration</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zeno-blue/20">
                            {runs.map(run => (
                                <tr key={run.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white">{run.type}</td>
                                    <td className="px-6 py-4">{getStatusBadge(run.status)}</td>
                                    <td className="px-6 py-4 text-gray-300">
                                        {run.case ? (
                                            <Link href={`/cases/${run.case.id}`} className="hover:underline hover:text-zeno-cyan">
                                                Case {run.case.fileNumber}
                                            </Link>
                                        ) : run.client ? (
                                            `Client: ${run.client.firstName} ${run.client.lastName}`
                                        ) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        {new Date(run.startedAt).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setSelectedRun(run)}
                                                className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-gray-300 text-xs transition-colors"
                                            >
                                                Details
                                            </button>
                                            {run.status === 'FAILED' && (
                                                <button
                                                    onClick={() => handleRetry(run.id)}
                                                    className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 rounded text-xs transition-colors"
                                                >
                                                    Retry
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {runs.length === 0 && !loading && (
                    <div className="p-8 text-center text-gray-400">
                        No automation runs found.
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedRun && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zeno-gray rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-white/10 flex flex-col">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                Run Details
                                {getStatusBadge(selectedRun.status)}
                            </h2>
                            <button onClick={() => setSelectedRun(null)} className="text-gray-400 hover:text-white">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500 block">ID</span>
                                    <span className="text-gray-300">{selectedRun.id}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Type</span>
                                    <span className="text-gray-300">{selectedRun.type}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Started</span>
                                    <span className="text-gray-300">{new Date(selectedRun.startedAt).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Duration</span>
                                    <span className="text-gray-300">{selectedRun.durationMs ? `${selectedRun.durationMs}ms` : '-'}</span>
                                </div>
                            </div>

                            {selectedRun.errorMessage && (
                                <div>
                                    <h3 className="text-sm font-semibold text-red-400 mb-2">Error Message</h3>
                                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-red-200 text-sm font-mono whitespace-pre-wrap">
                                        {selectedRun.errorMessage}
                                    </div>
                                </div>
                            )}

                            {selectedRun.logs && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-400 mb-2">Logs</h3>
                                    <pre className="bg-black/50 border border-white/5 p-4 rounded-lg text-gray-300 text-xs overflow-x-auto">
                                        {JSON.stringify(selectedRun.logs, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-white/10 shrink-0 flex justify-end">
                            <button onClick={() => setSelectedRun(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
