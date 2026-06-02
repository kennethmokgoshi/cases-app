'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@zenowethu/ui';

// ─── Types ─────────────────────────────────────────────────────────────────

type Lead = {
    id:              string;
    firstName:       string;
    lastName:        string;
    idNumber:        string | null;
    phone:           string;
    email:           string | null;
    service:         string;
    status:          string;
    source:          string;
    ghlContactId:    string | null;
    popiaConsent:    boolean;
    notes:           string | null;
    convertedCaseId: string | null;
    assignedToId:    string | null;
    createdAt:       string;
    assignedTo:      { id: string; firstName: string; lastName: string } | null;
};

type Meta = { total: number; page: number; limit: number; pages: number };

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; colour: string; bg: string }> = {
    NEW:       { label: 'New',       colour: 'text-brand-cyan',   bg: 'bg-brand-cyan/10 border-brand-cyan/30' },
    CONTACTED: { label: 'Contacted', colour: 'text-yellow-400',   bg: 'bg-yellow-400/10 border-yellow-400/30' },
    CONVERTED: { label: 'Converted', colour: 'text-emerald-400',  bg: 'bg-emerald-400/10 border-emerald-400/30' },
    REJECTED:  { label: 'Rejected',  colour: 'text-red-400',      bg: 'bg-red-400/10 border-red-400/30' },
    DUPLICATE: { label: 'Duplicate', colour: 'text-orange-400',   bg: 'bg-orange-400/10 border-orange-400/30' },
    CLOSED:    { label: 'Closed',    colour: 'text-gray-500',     bg: 'bg-gray-500/10 border-gray-500/30' },
};

const ALL_STATUSES = ['ALL', 'NEW', 'CONTACTED', 'CONVERTED', 'REJECTED', 'DUPLICATE', 'CLOSED'];

// ─── Source config ─────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { label: string; colour: string; bg: string }> = {
    WEBSITE_ASSESSMENT: { label: 'Website',    colour: 'text-emerald-400',  bg: 'bg-emerald-400/10 border-emerald-400/30' },
    FACEBOOK_AD:        { label: 'Facebook',   colour: 'text-blue-400',     bg: 'bg-blue-400/10 border-blue-400/30' },
    INSTAGRAM_AD:       { label: 'Instagram',  colour: 'text-pink-400',     bg: 'bg-pink-400/10 border-pink-400/30' },
    TIKTOK:             { label: 'TikTok',     colour: 'text-white',        bg: 'bg-white/10 border-white/20' },
    LINKEDIN:           { label: 'LinkedIn',   colour: 'text-blue-300',     bg: 'bg-blue-900/30 border-blue-400/30' },
    PINTEREST:          { label: 'Pinterest',  colour: 'text-red-400',      bg: 'bg-red-400/10 border-red-400/30' },
    WEBSITE_CHAT:       { label: 'Web Chat',   colour: 'text-emerald-300',  bg: 'bg-emerald-900/30 border-emerald-400/30' },
    WEBSITE_VOICE:      { label: 'Voice AI',   colour: 'text-purple-400',   bg: 'bg-purple-400/10 border-purple-400/30' },
    GHL_MANUAL:         { label: 'GHL Manual', colour: 'text-orange-400',   bg: 'bg-orange-400/10 border-orange-400/30' },
    REFERRAL:           { label: 'Referral',   colour: 'text-yellow-400',   bg: 'bg-yellow-400/10 border-yellow-400/30' },
};

const ALL_SOURCES = ['ALL', ...Object.keys(SOURCE_CONFIG)];

const SERVICE_LABELS: Record<string, string> = {
    'debt-review-removal': 'DR Removal (17.W)',
    'court-rescission':    'Court Rescission',
    'credit-repair':       'Credit Repair',
    'insurance':           'Lower Insurance',
};

// ─── Convert modal ─────────────────────────────────────────────────────────

type ConvertModalProps = {
    lead:      Lead;
    onClose:   () => void;
    onSuccess: (caseId: string) => void;
};

function ConvertModal({ lead, onClose, onSuccess }: ConvertModalProps) {
    const [projectId, setProjectId] = useState('');
    const [projects,  setProjects]  = useState<{ id: string; name: string }[]>([]);
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState('');

    useEffect(() => {
        fetch('/api/projects?limit=200')
            .then(r => r.json())
            .then(d => setProjects(d.projects ?? d.data ?? []))
            .catch(() => {});
    }, []);

    const handleConvert = async () => {
        if (!projectId) { setError('Please select a project'); return; }
        setLoading(true); setError('');
        try {
            const res = await fetch(`/api/leads/${lead.id}/convert`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ projectId, acquisitionType: 'B2C' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
            onSuccess(data.caseId);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Conversion failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zeno-navy border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <h3 className="text-lg font-bold text-white mb-1">Convert to Case</h3>
                <p className="text-sm text-gray-400 mb-5">
                    Converting <strong className="text-white">{lead.firstName} {lead.lastName}</strong> —{' '}
                    {SERVICE_LABELS[lead.service] ?? lead.service}
                </p>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
                        {error}
                    </div>
                )}

                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                    Assign to Project *
                </label>
                <select
                    value={projectId}
                    onChange={e => setProjectId(e.target.value)}
                    className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-brand-cyan mb-6"
                >
                    <option value="">— Select project —</option>
                    {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConvert}
                        disabled={loading || !projectId}
                        className="flex-1 py-2.5 rounded-lg bg-brand-cyan text-brand-dark text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {loading ? 'Converting…' : 'Convert'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function LeadsPage() {
    const router = useRouter();
    const { data: session } = useSession();

    const [leads,         setLeads]        = useState<Lead[]>([]);
    const [meta,          setMeta]         = useState<Meta | null>(null);
    const [counts,        setCounts]       = useState<Record<string, number>>({});
    const [loading,       setLoading]      = useState(true);
    const [error,         setError]        = useState('');
    const [statusFilter,  setStatusFilter] = useState('NEW');
    const [sourceFilter,  setSourceFilter] = useState('ALL');
    const [search,        setSearch]       = useState('');
    const [page,          setPage]         = useState(1);
    const [convertTarget, setConvertTarget]= useState<Lead | null>(null);
    const [toastMsg,      setToastMsg]     = useState('');

    const showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(''), 4000);
    };

    const fetchLeads = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const qs = new URLSearchParams({ search, page: String(page), limit: '50' });
            if (statusFilter !== 'ALL') qs.set('status', statusFilter);
            if (sourceFilter !== 'ALL') qs.set('source', sourceFilter);
            const res  = await fetch(`/api/leads?${qs}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Failed to load');
            setLeads(data.leads);
            setMeta(data.meta);
            setCounts(data.counts ?? {});
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load leads');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, sourceFilter, search, page]);

    useEffect(() => { fetchLeads(); }, [fetchLeads]);

    useEffect(() => { setPage(1); }, [search, statusFilter, sourceFilter]);

    const handleStatusChange = async (lead: Lead, newStatus: string) => {
        const prev = lead.status;
        setLeads(ls => ls.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));
        try {
            const res = await fetch(`/api/leads/${lead.id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error('Update failed');
            showToast(`Lead marked as ${newStatus}`);
        } catch {
            setLeads(ls => ls.map(l => l.id === lead.id ? { ...l, status: prev } : l));
            showToast('Failed to update status');
        }
    };

    const handleConvertSuccess = (caseId: string) => {
        setConvertTarget(null);
        showToast('Lead converted to case');
        fetchLeads();
        setTimeout(() => router.push(`/cases/${caseId}`), 1200);
    };

    const isAdmin = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Leads Triage</h1>
                    <p className="text-sm text-gray-400 mt-1">
                        All inbound leads from website and social campaigns —{' '}
                        {meta ? `${meta.total} total` : 'loading…'}
                    </p>
                </div>
            </div>

            {/* Status filter pills */}
            <div className="flex flex-wrap gap-2 mb-3">
                {ALL_STATUSES.map(s => {
                    const cfg   = STATUS_CONFIG[s];
                    const count = s === 'ALL'
                        ? Object.values(counts).reduce((a, b) => a + b, 0)
                        : (counts[s] ?? 0);
                    return (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                statusFilter === s
                                    ? (cfg ? `${cfg.bg} ${cfg.colour}` : 'bg-white/10 border-white/30 text-white')
                                    : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                            }`}
                        >
                            {cfg?.label ?? s}{count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                        </button>
                    );
                })}
            </div>

            {/* Source filter pills */}
            <div className="flex flex-wrap gap-2 mb-5">
                {ALL_SOURCES.map(src => {
                    const cfg = SOURCE_CONFIG[src];
                    return (
                        <button
                            key={src}
                            type="button"
                            onClick={() => setSourceFilter(src)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                sourceFilter === src
                                    ? (cfg ? `${cfg.bg} ${cfg.colour}` : 'bg-white/10 border-white/30 text-white')
                                    : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                            }`}
                        >
                            {cfg?.label ?? 'All Sources'}
                        </button>
                    );
                })}
            </div>

            {/* Search bar */}
            <div className="mb-5">
                <input
                    type="text"
                    placeholder="Search by name, phone, email or ID number…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full max-w-md px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-cyan transition-colors"
                />
            </div>

            {/* Error */}
            {error && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
                    {error}
                </div>
            )}

            {/* Table */}
            <div className="bg-white/2 border border-white/8 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-white/5 border-b border-white/10">
                        <tr>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">Name</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">Contact</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">Service</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">Source</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">POPIA</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">Status</th>
                            <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">Received</th>
                            <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center text-gray-500 text-sm">
                                    Loading…
                                </td>
                            </tr>
                        ) : leads.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center text-gray-500 text-sm">
                                    {search ? 'No leads match your search.' : `No ${statusFilter === 'ALL' ? '' : statusFilter.toLowerCase()} leads.`}
                                </td>
                            </tr>
                        ) : leads.map(lead => {
                            const statusCfg = STATUS_CONFIG[lead.status];
                            const sourceCfg = SOURCE_CONFIG[lead.source] ?? SOURCE_CONFIG['GHL_MANUAL']!;
                            return (
                                <tr key={lead.id} className="hover:bg-white/3 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-white">
                                            {lead.firstName} {lead.lastName}
                                        </div>
                                        {lead.idNumber && (
                                            <div className="text-xs text-gray-500 mt-0.5">{lead.idNumber}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-gray-300">{lead.phone}</div>
                                        {lead.email && (
                                            <div className="text-xs text-gray-500 mt-0.5">{lead.email}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {SERVICE_LABELS[lead.service] ?? lead.service}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${sourceCfg.bg} ${sourceCfg.colour}`}>
                                            {sourceCfg.label}
                                        </span>
                                        {lead.ghlContactId && (
                                            <a
                                                href={`https://app.gohighlevel.com/contacts/${lead.ghlContactId}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block mt-1 text-xs text-gray-600 hover:text-brand-cyan truncate max-w-[80px]"
                                                title={`GHL: ${lead.ghlContactId}`}
                                            >
                                                GHL ↗
                                            </a>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {lead.popiaConsent ? (
                                            <span className="text-emerald-400 text-xs font-bold">✓ Yes</span>
                                        ) : (
                                            <span className="text-red-400 text-xs font-bold">✗ No</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${statusCfg?.bg ?? 'bg-white/5 border-white/10'} ${statusCfg?.colour ?? 'text-gray-400'}`}>
                                            {statusCfg?.label ?? lead.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-500">
                                        {new Date(lead.createdAt).toLocaleDateString('en-ZA', {
                                            day: '2-digit', month: 'short', year: 'numeric',
                                        })}
                                        <div className="text-gray-600 mt-0.5">
                                            {new Date(lead.createdAt).toLocaleTimeString('en-ZA', {
                                                hour: '2-digit', minute: '2-digit',
                                            })}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            {lead.status === 'NEW' && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleStatusChange(lead, 'CONTACTED')}
                                                    className="px-2.5 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-bold hover:bg-yellow-500/20 transition-colors"
                                                >
                                                    Mark Contacted
                                                </button>
                                            )}
                                            {(lead.status === 'NEW' || lead.status === 'CONTACTED') && (
                                                <button
                                                    type="button"
                                                    onClick={() => setConvertTarget(lead)}
                                                    className="px-2.5 py-1 rounded-lg bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan text-xs font-bold hover:bg-brand-cyan/20 transition-colors"
                                                >
                                                    Convert →
                                                </button>
                                            )}
                                            {lead.status === 'CONVERTED' && lead.convertedCaseId && (
                                                <button
                                                    type="button"
                                                    onClick={() => router.push(`/cases/${lead.convertedCaseId}`)}
                                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors"
                                                >
                                                    View Case →
                                                </button>
                                            )}
                                            {isAdmin && lead.status !== 'CONVERTED' && (
                                                <select
                                                    value={lead.status}
                                                    onChange={e => handleStatusChange(lead, e.target.value)}
                                                    className="text-xs bg-white/5 border border-white/10 text-gray-400 rounded-lg px-2 py-1 focus:outline-none focus:border-white/30"
                                                >
                                                    {['NEW', 'CONTACTED', 'REJECTED', 'DUPLICATE', 'CLOSED'].map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Pagination */}
                {meta && meta.pages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                        <span className="text-xs text-gray-500">
                            Showing {((page - 1) * meta.limit) + 1}–{Math.min(page * meta.limit, meta.total)} of {meta.total}
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 rounded-lg text-xs border border-white/10 text-gray-400 hover:text-white disabled:opacity-30"
                            >
                                Prev
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.min(meta.pages, p + 1))}
                                disabled={page === meta.pages}
                                className="px-3 py-1 rounded-lg text-xs border border-white/10 text-gray-400 hover:text-white disabled:opacity-30"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Convert modal */}
            {convertTarget && (
                <ConvertModal
                    lead={convertTarget}
                    onClose={() => setConvertTarget(null)}
                    onSuccess={handleConvertSuccess}
                />
            )}

            {/* Toast */}
            {toastMsg && (
                <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-zeno-navy border border-white/10 rounded-xl shadow-2xl text-sm text-white animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {toastMsg}
                </div>
            )}
        </div>
    );
}
