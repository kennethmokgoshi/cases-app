'use client';
import { confirm } from '@zenowethu/ui';


import { useState, useRef, useMemo, useEffect } from 'react';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

type DbMatch = {
    found: boolean;
    clientId: string | null;
    clientName: string | null;
    caseId: string | null;
    fileNumber: string | null;
    caseStatus: string | null;
    currentDhsStatus: string | null;
    currentDhsStatusDate: string | null;
};

type DhsRecord = {
    ncr_ref: string;
    surname: string;
    first_name: string;
    additional_names: string;
    rsa_id: string;
    status_code: string;
    status_label: string;
    action: 'create' | 'update';
    flag: string | null;
    dbMatch: DbMatch;
    statusChanged: boolean;
    // User selection
    selectedAction: 'update' | 'create' | 'skip';
};

type DcOwner = {
    ncrdcNo: string;
    debtCounsellorName: string;
    dcTradingName: string;
};

type Stats = { total: number; matched: number; unmatched: number; statusChanged: number };
type SortField = 'ncr_ref' | 'surname' | 'status_code' | 'currentDhsStatus' | 'selectedAction';
type SortDir = 'asc' | 'desc';

const DEFAULT_DC: DcOwner = {
    ncrdcNo: 'NCRDC3693',
    debtCounsellorName: 'Aaron Nzotho',
    dcTradingName: 'Zenowethu Debt Management',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    F2: 'bg-blue-500/20 text-blue-300',
    G:  'bg-green-500/20 text-green-300',
    G1: 'bg-green-500/20 text-green-300',
    H:  'bg-emerald-500/20 text-emerald-300',
    B:  'bg-red-500/20 text-red-300',
    C:  'bg-orange-500/20 text-orange-300',
    D3: 'bg-gray-500/20 text-gray-300',
    D4: 'bg-gray-500/20 text-gray-300',
    A:  'bg-yellow-500/20 text-yellow-300',
    A1: 'bg-yellow-500/20 text-yellow-300',
    F1: 'bg-purple-500/20 text-purple-300',
};

const ALL_STATUSES = ['A', 'A1', 'B', 'C', 'D3', 'D4', 'F1', 'F2', 'G', 'G1', 'H'];
const PORTAL_OWNER_ACCEPTED = new Set(['A', 'C', 'D3', 'D4']);

const STATUS_LABELS: Record<string, string> = {
    F1: 'Awaiting Proposal Acceptance',
    F2: 'Under Debt Review (Active)',
    G:  'Court Order Granted',
    G1: 'Conditional Court Order',
    H:  'Clearance Certificate Issued',
    B:  'Rejected / Withdrawn',
    C:  'Transferred to Another DC',
    D3: 'Debt Review Removed (Paid Up)',
    D4: 'Debt Review Removed (Other)',
    A:  'Application Received',
    A1: 'Awaiting Credit Provider Response',
};

function StatusBadge({ code }: { code: string | null }) {
    if (!code) return <span className="text-gray-600 text-xs italic">None</span>;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[code] ?? 'bg-gray-500/20 text-gray-300'}`}>
            {code}
        </span>
    );
}

/** Formats a duration in seconds as a compact "Xm Ys" / "Xs" label. */
function formatDuration(seconds: number): string {
    if (seconds < 1) return '<1s';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// How many records to send per Apply request. Small enough to keep each request
// fast (so progress updates feel live) and resilient to a single batch failing.
const APPLY_BATCH_SIZE = 50;

type ApplyProgress = {
    done: number;
    total: number;
    created: number;
    updated: number;
    skipped: number;
    etaSeconds: number | null;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DhsImportPage() {
    // Portal's own DC (loaded from admin settings)
    const [portalDc, setPortalDc] = useState<DcOwner>(DEFAULT_DC);
    const [portalDcLoaded, setPortalDcLoaded] = useState(false);

    // DC ownership
    const [dc, setDc] = useState<DcOwner>({ ncrdcNo: '', debtCounsellorName: '', dcTradingName: '' });
    const [dcConfirmed, setDcConfirmed] = useState(false);
    const [isPortalOwner, setIsPortalOwner] = useState(true);

    // Load portal DC from settings on mount
    useEffect(() => {
        fetch('/api/admin/settings/dc-profile')
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (data?.settings) {
                    setPortalDc({
                        ncrdcNo: data.settings.dc_ncrdcNo || DEFAULT_DC.ncrdcNo,
                        debtCounsellorName: data.settings.dc_name || DEFAULT_DC.debtCounsellorName,
                        dcTradingName: data.settings.dc_organisation || DEFAULT_DC.dcTradingName,
                    });
                }
                setPortalDcLoaded(true);
            })
            .catch(() => setPortalDcLoaded(true));
    }, []);

    // Upload state
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Results state
    const [records, setRecords] = useState<DhsRecord[] | null>(null);
    const [stats, setStats] = useState<Stats | null>(null);

    // Filters
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterMatch, setFilterMatch] = useState<'all' | 'matched' | 'unmatched'>('all');
    const [filterChanged, setFilterChanged] = useState(false);

    // Sort
    const [sortField, setSortField] = useState<SortField>('ncr_ref');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    // Selection
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // Apply state
    const [applying, setApplying] = useState(false);
    const [applyResult, setApplyResult] = useState<{ updated: number; created: number; skipped: number; errors: string[] } | null>(null);
    const [applyProgress, setApplyProgress] = useState<ApplyProgress | null>(null);
    const [dhsProjectName, setDhsProjectName] = useState<string | null>(null);
    const [showResultModal, setShowResultModal] = useState(false);

    // ── Handlers ───────────────────────────────────────────────────────────

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFile(e.target.files?.[0] ?? null);
        setRecords(null);
        setStats(null);
        setError('');
        setSelected(new Set());
        setApplyResult(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) { setFile(dropped); setRecords(null); setStats(null); setError(''); setSelected(new Set()); }
    };

    const handleImport = async () => {
        if (!file) return;
        if (!dcConfirmed) { setError('Please confirm the debt counsellor ownership before extracting.'); return; }
        setLoading(true);
        setError('');
        setRecords(null);
        setStats(null);
        setSelected(new Set());
        setApplyResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/admin/dhs-import', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Import failed');

            // Set default selectedAction based on db match
            const withAction: DhsRecord[] = (data.records ?? []).map((r: any) => ({
                ...r,
                selectedAction: r.dbMatch.found ? 'update' : 'create',
            }));
            setRecords(withAction);
            setStats(data.stats);
        } catch (err: any) {
            setError(err.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    const setRecordAction = (rsa_id: string, action: DhsRecord['selectedAction']) => {
        setRecords((prev) => prev?.map((r) => r.rsa_id === rsa_id ? { ...r, selectedAction: action } : r) ?? null);
    };

    const toggleSelect = (rsa_id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(rsa_id) ? next.delete(rsa_id) : next.add(rsa_id);
            return next;
        });
    };

    const toggleAll = () => {
        if (!filtered) return;
        const allIds = filtered.map((r) => r.rsa_id);
        if (allIds.every((id) => selected.has(id))) {
            setSelected((prev) => { const n = new Set(prev); allIds.forEach((id) => n.delete(id)); return n; });
        } else {
            setSelected((prev) => new Set([...prev, ...allIds]));
        }
    };

    const bulkSetAction = (action: DhsRecord['selectedAction']) => {
        setRecords((prev) => prev?.map((r) => selected.has(r.rsa_id) ? { ...r, selectedAction: action } : r) ?? null);
    };

    const handleApply = async () => {
        if (!records || selected.size === 0) return;

        // Warn before creating new files
        const creates = records.filter((r) => selected.has(r.rsa_id) && r.selectedAction === 'create');
        if (creates.length > 0) {
            const names = creates.slice(0, 3).map((r) => `${r.surname}, ${r.first_name}`).join('; ');
            const more = creates.length > 3 ? ` and ${creates.length - 3} more` : '';
            if (!await confirm(`This will create ${creates.length} new case file(s):\n${names}${more}\n\nConfirm?`)) return;
        } else {
            if (!await confirm(`Apply actions to ${selected.size} selected record(s)?`)) return;
        }

        setApplying(true);
        setApplyResult(null);
        setError('');

        const actions = records
            .filter((r) => selected.has(r.rsa_id))
            .map((r) => ({
                rsa_id: r.rsa_id,
                ncr_ref: r.ncr_ref,
                surname: r.surname,
                first_name: r.first_name,
                additional_names: r.additional_names,
                status_code: r.status_code,
                status_label: r.status_label,
                action: r.selectedAction,
                caseId: r.dbMatch.caseId ?? undefined,
                clientId: r.dbMatch.clientId ?? undefined,
            }));

        // Process in sequential batches so we can report live progress + ETA.
        const total = actions.length;
        const totals = { updated: 0, created: 0, skipped: 0, errors: [] as string[] };
        let projectName: string | null = null;
        const startedAt = Date.now();

        setApplyProgress({ done: 0, total, created: 0, updated: 0, skipped: 0, etaSeconds: null });

        try {
            for (let i = 0; i < total; i += APPLY_BATCH_SIZE) {
                const batch = actions.slice(i, i + APPLY_BATCH_SIZE);
                try {
                    const res = await fetch('/api/admin/dhs-import/apply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ actions: batch, dc: isPortalOwner ? portalDc : dc, isPortalOwner }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Apply failed');
                    totals.updated += data.results?.updated ?? 0;
                    totals.created += data.results?.created ?? 0;
                    totals.skipped += data.results?.skipped ?? 0;
                    if (data.results?.errors?.length) totals.errors.push(...data.results.errors);
                    if (data.dhsProjectName) projectName = data.dhsProjectName;
                } catch (batchErr: any) {
                    // Record the failure but keep going so one bad batch doesn't abort the run.
                    totals.errors.push(`Batch ${Math.floor(i / APPLY_BATCH_SIZE) + 1}: ${batchErr.message ?? 'request failed'}`);
                }

                const done = Math.min(i + APPLY_BATCH_SIZE, total);
                const elapsed = (Date.now() - startedAt) / 1000;
                const remaining = total - done;
                const etaSeconds = done > 0 && elapsed > 0 ? Math.round((elapsed / done) * remaining) : null;
                setApplyProgress({ done, total, created: totals.created, updated: totals.updated, skipped: totals.skipped, etaSeconds });
            }

            setApplyResult(totals);
            setDhsProjectName(projectName);
            setShowResultModal(true);
            setSelected(new Set());
        } catch (err: any) {
            setError(err.message);
        } finally {
            setApplying(false);
            setApplyProgress(null);
        }
    };

    const handleSort = (field: SortField) => {
        setSortDir((prev) => sortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc');
        setSortField(field);
    };

    // ── Derived data ───────────────────────────────────────────────────────

    const filtered = useMemo(() => {
        if (!records) return [];
        let list = [...records];

        if (search) {
            const q = search.toLowerCase();
            list = list.filter((r) =>
                r.ncr_ref.includes(q) ||
                r.surname.toLowerCase().includes(q) ||
                r.first_name.toLowerCase().includes(q) ||
                r.rsa_id.includes(q) ||
                (r.dbMatch.fileNumber ?? '').toLowerCase().includes(q)
            );
        }
        if (filterStatus !== 'all') list = list.filter((r) => r.status_code === filterStatus);
        if (filterMatch !== 'all') list = list.filter((r) => filterMatch === 'matched' ? r.dbMatch.found : !r.dbMatch.found);
        if (filterChanged) list = list.filter((r) => r.statusChanged);

        list.sort((a, b) => {
            let av = '', bv = '';
            if (sortField === 'ncr_ref') { av = String(Number(a.ncr_ref) || 0); bv = String(Number(b.ncr_ref) || 0); return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av); }
            if (sortField === 'surname') { av = a.surname; bv = b.surname; }
            if (sortField === 'status_code') { av = a.status_code; bv = b.status_code; }
            if (sortField === 'currentDhsStatus') { av = a.dbMatch.currentDhsStatus ?? ''; bv = b.dbMatch.currentDhsStatus ?? ''; }
            if (sortField === 'selectedAction') { av = a.selectedAction; bv = b.selectedAction; }
            return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });

        return list;
    }, [records, search, filterStatus, filterMatch, filterChanged, sortField, sortDir]);

    const selectedInFiltered = filtered.filter((r) => selected.has(r.rsa_id)).length;
    const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.rsa_id));

    const SortIcon = ({ field }: { field: SortField }) => (
        <span className="ml-1 text-gray-600">
            {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
    );

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="max-w-[1400px] mx-auto">
            {/* Header */}
            <div className="mb-6">
                <Link href="/admin" className="text-zeno-cyan hover:text-cyan-300 text-sm inline-flex items-center gap-1">← Back to Admin</Link>
            </div>
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">DHS Summary Report Import</h1>
                    <p className="text-gray-400 text-sm">Upload an NCR DHS Debt Counsellor Summary Report (XLS or PDF), compare with the database, then apply bulk updates or create new files.</p>
                </div>
            </div>

            {/* ── Upload card ───────────────────────────────────────────── */}
            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 mb-6">
                <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => inputRef.current?.click()}
                    className="border-2 border-dashed border-white/10 hover:border-zeno-orange/40 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors group"
                >
                    <svg className="w-10 h-10 text-gray-500 group-hover:text-zeno-orange transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {file ? (
                        <div className="text-center">
                            <p className="text-white font-medium">{file.name}</p>
                            <p className="text-gray-400 text-sm">{(file.size / 1024).toFixed(1)} KB — click to change</p>
                        </div>
                    ) : (
                        <div className="text-center">
                            <p className="text-gray-300 font-medium">Drop your DHS report here</p>
                            <p className="text-gray-500 text-sm">or click to browse — .xls, .xlsx, .pdf accepted</p>
                        </div>
                    )}
                    <input ref={inputRef} type="file" accept=".xls,.xlsx,.pdf" onChange={handleFileChange} className="hidden" />
                </div>
                {/* ── DC Ownership ──────────────────────────────────────── */}
                {file && (
                    <div className="mt-5 border-t border-white/5 pt-5">
                        <p className="text-sm font-semibold text-white mb-1">Who owns this DHS report?</p>

                        {/* Ownership toggle */}
                        <div className="flex gap-3 mb-5">
                            <button
                                type="button"
                                onClick={() => { setIsPortalOwner(true); setDcConfirmed(false); }}
                                className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${isPortalOwner ? 'bg-zeno-orange/15 border-zeno-orange/50 text-zeno-orange' : 'bg-black/20 border-white/10 text-gray-400 hover:border-white/20 hover:text-white'}`}
                            >
                                <span className="block font-semibold mb-0.5">My own NCRDC files</span>
                                <span className="text-xs opacity-70">I am the portal owner uploading my own data</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { setIsPortalOwner(false); setDcConfirmed(false); }}
                                className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${!isPortalOwner ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' : 'bg-black/20 border-white/10 text-gray-400 hover:border-white/20 hover:text-white'}`}
                            >
                                <span className="block font-semibold mb-0.5">Another DC's data</span>
                                <span className="text-xs opacity-70">Enter the debt counsellor's details below</span>
                            </button>
                        </div>

                        {/* My own NCRDC — show read-only DC info from settings */}
                        {isPortalOwner && (
                            <div className="mb-4">
                                {!portalDcLoaded ? (
                                    <p className="text-xs text-gray-500">Loading DC profile...</p>
                                ) : (
                                    <div className="bg-zeno-orange/5 border border-zeno-orange/20 rounded-xl px-5 py-4 flex flex-wrap gap-x-8 gap-y-2 mb-3">
                                        <div>
                                            <p className="text-xs text-gray-500 mb-0.5">NCRDC Number</p>
                                            <p className="text-sm font-semibold text-white">{portalDc.ncrdcNo}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 mb-0.5">Debt Counsellor</p>
                                            <p className="text-sm font-semibold text-white">{portalDc.debtCounsellorName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 mb-0.5">Organisation</p>
                                            <p className="text-sm font-semibold text-white">{portalDc.dcTradingName}</p>
                                        </div>
                                        <div className="w-full">
                                            <p className="text-xs text-amber-400/80">⚠️ Statuses A, C, D3, D4 will be marked as <strong>Accepted via DHS</strong>. To update these details go to <a href="/admin/settings" className="underline hover:text-amber-300">Admin → Settings → Portal DC Profile</a>.</p>
                                        </div>
                                    </div>
                                )}
                                <label className={`inline-flex items-center gap-3 cursor-pointer px-4 py-2.5 rounded-lg border transition-colors ${dcConfirmed ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                                    <input type="checkbox" checked={dcConfirmed} onChange={(e) => setDcConfirmed(e.target.checked)} className="w-4 h-4 rounded text-zeno-orange" />
                                    <span className={`text-sm font-medium ${dcConfirmed ? 'text-green-300' : 'text-gray-300'}`}>
                                        {dcConfirmed
                                            ? `✓ Confirmed — these are my own DHS files (${portalDc.ncrdcNo})`
                                            : `I confirm these are my own DHS files for ${portalDc.ncrdcNo || '…'}`}
                                    </span>
                                </label>
                            </div>
                        )}

                        {/* Another DC's data — show editable fields */}
                        {!isPortalOwner && (
                            <div className="mb-4">
                                <p className="text-xs text-gray-500 mb-3">Enter the debt counsellor details for the owner of this report.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">NCRDC Number</label>
                                        <input
                                            value={dc.ncrdcNo}
                                            onChange={(e) => { setDc((p) => ({ ...p, ncrdcNo: e.target.value })); setDcConfirmed(false); }}
                                            className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-400"
                                            placeholder="NCRDC…"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Debt Counsellor Name</label>
                                        <input
                                            value={dc.debtCounsellorName}
                                            onChange={(e) => { setDc((p) => ({ ...p, debtCounsellorName: e.target.value })); setDcConfirmed(false); }}
                                            className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-400"
                                            placeholder="Full name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Organisation</label>
                                        <input
                                            value={dc.dcTradingName}
                                            onChange={(e) => { setDc((p) => ({ ...p, dcTradingName: e.target.value })); setDcConfirmed(false); }}
                                            className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-400"
                                            placeholder="Trading name"
                                        />
                                    </div>
                                </div>
                                <label className={`inline-flex items-center gap-3 cursor-pointer px-4 py-2.5 rounded-lg border transition-colors ${dcConfirmed ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                                    <input type="checkbox" checked={dcConfirmed} onChange={(e) => setDcConfirmed(e.target.checked)} className="w-4 h-4 rounded text-zeno-orange" />
                                    <span className={`text-sm font-medium ${dcConfirmed ? 'text-green-300' : 'text-gray-300'}`}>
                                        {dcConfirmed
                                            ? `✓ Confirmed — this report belongs to ${dc.ncrdcNo || '…'} (${dc.dcTradingName || '…'})`
                                            : `I confirm this report belongs to ${dc.ncrdcNo || '…'} and I am authorised to process it`}
                                    </span>
                                </label>
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-4 flex justify-end">
                    <button
                        onClick={handleImport}
                        disabled={!file || !dcConfirmed || loading || (!isPortalOwner && (!dc.ncrdcNo.trim() || !dc.debtCounsellorName.trim() || !dc.dcTradingName.trim()))}
                        className="px-6 py-2.5 bg-zeno-orange text-white font-bold rounded-lg hover:bg-orange-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading
                            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Extracting &amp; comparing...</>
                            : <>🤖 Extract &amp; Compare with DB</>}
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>}

            {/* ── Apply Result Modal ──────────────────────────────────── */}
            {showResultModal && applyResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowResultModal(false)}
                    />
                    {/* Modal card */}
                    <div className="relative bg-[#0d1829] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Green top bar */}
                        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-green-400" />

                        <div className="p-7">
                            {/* Icon + title */}
                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-2xl shrink-0">
                                    ✅
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Actions Applied Successfully</h2>
                                    <p className="text-gray-400 text-sm mt-0.5">All selected records have been processed.</p>
                                </div>
                            </div>

                            {/* Stats grid */}
                            <div className="grid grid-cols-3 gap-3 mb-6">
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-center">
                                    <p className="text-2xl font-bold text-amber-300">{applyResult.updated}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Updated</p>
                                </div>
                                <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-center">
                                    <p className="text-2xl font-bold text-green-300">{applyResult.created}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Created</p>
                                </div>
                                <div className="bg-gray-500/10 border border-gray-500/20 rounded-xl px-4 py-3 text-center">
                                    <p className="text-2xl font-bold text-gray-400">{applyResult.skipped}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Skipped</p>
                                </div>
                            </div>

                            {/* Errors — only if any */}
                            {applyResult.errors.length > 0 && (
                                <div className="mb-5 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                                    <p className="text-rose-400 text-xs font-semibold mb-2">⚠️ {applyResult.errors.length} error(s)</p>
                                    <div className="space-y-1 max-h-28 overflow-y-auto">
                                        {applyResult.errors.map((e, i) => (
                                            <p key={i} className="text-rose-300 text-xs">{e}</p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Buttons */}
                            <div className="flex flex-col gap-2">
                                {dhsProjectName && (
                                    <Link
                                        href="/admin/projects"
                                        onClick={() => setShowResultModal(false)}
                                        className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium rounded-xl transition-colors text-sm text-center flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                        Visit project: <span className="text-white font-semibold">{dhsProjectName}</span>
                                    </Link>
                                )}
                                <button
                                    onClick={() => setShowResultModal(false)}
                                    className="w-full py-2.5 bg-zeno-orange hover:bg-orange-500 text-white font-bold rounded-xl transition-colors text-sm"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Stats bar ─────────────────────────────────────────────── */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {[
                        { label: 'Total Records', value: stats.total, color: 'text-white' },
                        { label: 'Matched in DB', value: stats.matched, color: 'text-green-300' },
                        { label: 'Not in DB', value: stats.unmatched, color: 'text-amber-300' },
                        { label: 'Status Changed', value: stats.statusChanged, color: 'text-rose-300' },
                    ].map((s) => (
                        <div key={s.label} className="bg-zeno-blue/20 rounded-xl border border-white/5 px-4 py-3">
                            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-gray-500 text-xs mt-0.5">{s.label}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Results table ─────────────────────────────────────────── */}
            {records !== null && (
                <div className="bg-zeno-blue/20 rounded-xl border border-white/5 overflow-hidden">

                    {/* Toolbar */}
                    <div className="px-4 py-3 border-b border-white/5 flex flex-wrap items-center gap-3">
                        {/* Search */}
                        <input
                            type="text"
                            placeholder="Search NCR, name, ID, file #…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="px-3 py-1.5 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-zeno-orange w-52"
                        />

                        {/* Status filter */}
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="px-3 py-1.5 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-zeno-orange [color-scheme:dark]"
                        >
                            <option value="all">All statuses</option>
                            {ALL_STATUSES.map((s) => (
                                <option key={s} value={s}>{s} — {STATUS_LABELS[s]}</option>
                            ))}
                        </select>

                        {/* Match filter */}
                        <select
                            value={filterMatch}
                            onChange={(e) => setFilterMatch(e.target.value as any)}
                            className="px-3 py-1.5 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-zeno-orange [color-scheme:dark]"
                        >
                            <option value="all">All records</option>
                            <option value="matched">Matched in DB</option>
                            <option value="unmatched">Not in DB</option>
                        </select>

                        {/* Changed filter */}
                        <button
                            onClick={() => setFilterChanged((v) => !v)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterChanged ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40' : 'bg-black/20 border border-white/10 text-gray-400 hover:text-white'}`}
                        >
                            Status changed only
                        </button>

                        <span className="ml-auto text-xs text-gray-500">{filtered.length} of {records.length} records</span>
                    </div>

                    {/* Bulk action bar — only when rows are selected */}
                    {selected.size > 0 && (
                        <div className="px-4 py-2.5 bg-zeno-orange/10 border-b border-zeno-orange/20 flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-zeno-orange font-medium">{selected.size} selected</span>
                            <span className="text-gray-600 text-sm">Set action:</span>
                            <button onClick={() => bulkSetAction('update')} className="px-3 py-1 rounded bg-amber-500/20 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition-colors">Update DHS Status</button>
                            <button onClick={() => bulkSetAction('create')} className="px-3 py-1 rounded bg-green-500/20 text-green-300 text-xs font-medium hover:bg-green-500/30 transition-colors">Create New File</button>
                            <button onClick={() => bulkSetAction('skip')} className="px-3 py-1 rounded bg-gray-500/20 text-gray-400 text-xs font-medium hover:bg-gray-500/30 transition-colors">Skip</button>
                            <div className="ml-auto">
                                <button
                                    onClick={handleApply}
                                    disabled={applying}
                                    className="px-4 py-1.5 bg-zeno-orange text-white text-sm font-bold rounded-lg hover:bg-orange-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {applying ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Applying...</> : `Apply to ${selected.size} record(s)`}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Apply progress bar — shown while batches are being processed */}
                    {applying && applyProgress && (() => {
                        const { done, total, created, updated, skipped, etaSeconds } = applyProgress;
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                        const remaining = total - done;
                        return (
                            <div className="px-4 py-4 bg-zeno-blue/40 border-b border-zeno-orange/20">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-zeno-orange border-t-transparent rounded-full animate-spin" />
                                        <span className="text-sm font-medium text-white">Applying actions to case files…</span>
                                    </div>
                                    <span className="text-sm font-bold text-zeno-orange tabular-nums">{pct}%</span>
                                </div>

                                {/* Bar */}
                                <div
                                    className="h-2.5 w-full bg-black/40 rounded-full overflow-hidden"
                                    role="progressbar"
                                    aria-valuenow={pct}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                >
                                    <div
                                        className="h-full bg-gradient-to-r from-zeno-orange to-amber-400 transition-all duration-300 ease-out"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>

                                {/* Counts + ETA */}
                                <div className="flex items-center justify-between mt-2 text-xs text-gray-400 flex-wrap gap-y-1">
                                    <span className="tabular-nums">
                                        <span className="text-white font-medium">{done.toLocaleString()}</span> of {total.toLocaleString()} done
                                        <span className="text-gray-600"> · </span>
                                        {remaining.toLocaleString()} remaining
                                    </span>
                                    <span className="flex items-center gap-3 tabular-nums">
                                        <span className="text-green-300">Created {created.toLocaleString()}</span>
                                        <span className="text-amber-300">Updated {updated.toLocaleString()}</span>
                                        {skipped > 0 && <span className="text-gray-500">Skipped {skipped.toLocaleString()}</span>}
                                        <span className="text-gray-300">
                                            {etaSeconds == null ? 'Estimating…' : `~${formatDuration(etaSeconds)} left`}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-zeno-blue/30 border-b border-white/5">
                                <tr>
                                    <th className="px-3 py-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allFilteredSelected}
                                            onChange={toggleAll}
                                            className="rounded border-gray-600 bg-gray-700 text-zeno-orange focus:ring-offset-0 cursor-pointer"
                                        />
                                    </th>
                                    <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase cursor-pointer whitespace-nowrap" onClick={() => handleSort('ncr_ref')}>NCR Ref <SortIcon field="ncr_ref" /></th>
                                    <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase cursor-pointer" onClick={() => handleSort('surname')}>Name <SortIcon field="surname" /></th>
                                    <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase">RSA ID</th>
                                    <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase cursor-pointer whitespace-nowrap" onClick={() => handleSort('status_code')}>DHS Status (Report) <SortIcon field="status_code" /></th>
                                    <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase cursor-pointer whitespace-nowrap" onClick={() => handleSort('currentDhsStatus')}>DHS Status (DB) <SortIcon field="currentDhsStatus" /></th>
                                    <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase">Case File</th>
                                    <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase">Flag</th>
                                    <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase cursor-pointer" onClick={() => handleSort('selectedAction')}>Action <SortIcon field="selectedAction" /></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500 italic">No records match the current filters.</td></tr>
                                ) : filtered.map((rec) => {
                                    const isSelected = selected.has(rec.rsa_id);
                                    return (
                                        <tr
                                            key={rec.rsa_id || rec.ncr_ref}
                                            className={`transition-colors ${isSelected ? 'bg-zeno-orange/5' : rec.statusChanged ? 'bg-rose-500/5' : 'hover:bg-white/5'}`}
                                        >
                                            <td className="px-3 py-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(rec.rsa_id)}
                                                    className="rounded border-gray-600 bg-gray-700 text-zeno-orange focus:ring-offset-0 cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 font-mono text-gray-300 text-xs">{rec.ncr_ref}</td>
                                            <td className="px-3 py-2.5">
                                                <p className="text-white font-medium leading-tight">{rec.surname}, {rec.first_name}</p>
                                                {rec.additional_names && <p className="text-gray-500 text-xs">{rec.additional_names}</p>}
                                                {rec.dbMatch.clientName && rec.dbMatch.clientName.toLowerCase() !== `${rec.first_name} ${rec.surname}`.toLowerCase() && (
                                                    <p className="text-gray-600 text-xs italic">DB: {rec.dbMatch.clientName}</p>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 font-mono text-gray-400 text-xs">{rec.rsa_id}</td>
                                            <td className="px-3 py-2.5">
                                                <StatusBadge code={rec.status_code} />
                                                <p className="text-gray-500 text-xs mt-0.5">{rec.status_label}</p>
                                                {isPortalOwner && PORTAL_OWNER_ACCEPTED.has(rec.status_code) && (
                                                    <p className="text-emerald-400 text-xs mt-0.5 font-medium">✓ Accepted via DHS</p>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {rec.dbMatch.found ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <StatusBadge code={rec.dbMatch.currentDhsStatus} />
                                                        {rec.statusChanged && (
                                                            <span className="text-rose-400 text-xs font-bold" title="Status differs from report">⚡</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-600 italic">No match</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {rec.dbMatch.fileNumber ? (
                                                    <Link
                                                        href={`/cases/${rec.dbMatch.caseId}`}
                                                        target="_blank"
                                                        className="text-zeno-cyan hover:underline text-xs font-mono"
                                                    >
                                                        {rec.dbMatch.fileNumber}
                                                    </Link>
                                                ) : (
                                                    <span className="text-xs text-gray-600 italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-rose-400 text-xs max-w-[140px] truncate">
                                                {rec.flag ?? <span className="text-gray-600">—</span>}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <select
                                                    value={rec.selectedAction}
                                                    onChange={(e) => setRecordAction(rec.rsa_id, e.target.value as any)}
                                                    className="px-2 py-1 bg-black/30 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-zeno-orange [color-scheme:dark] cursor-pointer"
                                                >
                                                    {rec.dbMatch.found && <option value="update">Update Status</option>}
                                                    <option value="create">Create New File</option>
                                                    <option value="skip">Skip</option>
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
                        <span>Showing {filtered.length} of {records.length} records &nbsp;·&nbsp; {selected.size} selected</span>
                        <span>⚡ = DHS status changed since last sync</span>
                    </div>
                </div>
            )}
        </div>
    );
}
