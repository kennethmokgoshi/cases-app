'use client';
import { toast } from '@zenowethu/ui';


import React, { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@zenowethu/ui';
import { WORKFLOW_STATUSES, STATUS_CATEGORIES, type StatusCategory } from '@zenowethu/shared-lib';
import { SearchWithSuggestions, Pagination } from '@zenowethu/ui';
import { SERVICES_MAP } from '@zenowethu/config';

// Client-side logger
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

type Case = {
    id: string;
    fileNumber: string;
    status: string;
    statusEntryDate: string;
    deadline: string | null;
    nextUpdate: string | null;
    isOverdue: boolean;
    createdAt: string;
    updatedAt: string;
    createdById: string | null;
    updatedById: string | null;
    updatedBy?: {
        firstName: string;
        lastName: string;
    } | null;
    assignedToId: string | null;
    services: string | null;
    client: {
        id: string;
        firstName: string;
        lastName: string;
        idNumber: string;
        email: string | null;
        phone: string | null;
    };
    jointClient?: {
        id: string;
        firstName: string;
        lastName: string;
    } | null;
    category: string;
    projects: {
        projectId: string;
        isPrimary: boolean;
        project: {
            id: string;
            name: string;
            fullPath?: string;
        };
    }[];
};

const CASE_CATEGORIES = [
    'Non-Payroll Single',
    'Non-Payroll Joint',
    'Payroll Single',
    'Payroll Joint'
];

type BulkDhsResult = {
    caseId: string;
    fileNumber: string;
    clientName: string;
    status: 'pending' | 'running' | 'success' | 'error';
    message: string;
};

type DhsActionConfig = {
    endpoint: (caseId: string) => string;
    body: (c: { id: string; client: { idNumber: string } }) => object;
};

const DHS_ACTION_CONFIG: Record<string, DhsActionConfig> = {
    // auto_fill: checks if ID is linked on DHS, scrapes DC info, sets NOT_LINKED or NOT_REQUESTED_VIA_DHS
    'Check DHS': {
        endpoint: () => '/api/dhs/lookup',
        body: (c) => ({ idNumber: c.client.idNumber, caseId: c.id, action: 'auto_fill' }),
    },
    'Request via DHS': {
        endpoint: () => '/api/dhs/lookup',
        body: (c) => ({ idNumber: c.client.idNumber, caseId: c.id, action: 'validate_and_request' }),
    },
    'Email Documents to DC': {
        endpoint: (caseId) => `/api/cases/${caseId}/dc-notification`,
        body: () => ({ type: 'FILE_REQUEST' }),
    },
    'Request Invoice from DC': {
        endpoint: (caseId) => `/api/cases/${caseId}/dc-notification`,
        body: () => ({ type: 'INVOICE_REQUEST' }),
    },
    'Check DHS Request': {
        endpoint: () => '/api/dhs/lookup',
        body: (c) => ({ idNumber: c.client.idNumber, caseId: c.id, action: 'check_status' }),
    },
};

function CasesContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlSearch = searchParams.get('search');
    const urlYear = searchParams.get('year');
    const urlMonth = searchParams.get('month');
    const urlSource = searchParams.get('source');
    const urlFilter = searchParams.get('filter');
    const urlProjectId = searchParams.get('projectId');

    const { data: session } = useSession();
    const [cases, setCases] = useState<Case[]>([]);
    const [filteredCases, setFilteredCases] = useState<Case[]>([]);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [projectName, setProjectName] = useState<string>('');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const ITEMS_PER_PAGE = 20;

    // Filters
    const [searchTerm, setSearchTerm] = useState(urlSearch || '');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [serviceFilter, setServiceFilter] = useState<string>(urlSource || 'ALL');
    const [yearFilter, setYearFilter] = useState<string>(urlYear || 'ALL');
    const [monthFilter, setMonthFilter] = useState<string>(urlMonth || 'ALL');
    const [sourceFilter, setSourceFilter] = useState<string>(urlSource || 'ALL');

    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
    const [showDhsMenu, setShowDhsMenu] = useState(false);
    const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());

    // Bulk delete modal state
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('');
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkDeleteResult, setBulkDeleteResult] = useState<{ succeeded: string[]; failed: { fileNumber: string; reason: string }[] } | null>(null);

    // Bulk DHS action state
    const [showBulkDhsModal, setShowBulkDhsModal] = useState(false);
    const [bulkDhsActionLabel, setBulkDhsActionLabel] = useState('');
    const [bulkDhsResults, setBulkDhsResults] = useState<BulkDhsResult[]>([]);
    const [bulkDhsDone, setBulkDhsDone] = useState(false);
    const bulkDhsCancelRef = useRef(false);

    // Sorting state
    const [sortBy, setSortBy] = useState<'fileNumber' | 'client' | 'status' | 'nextUpdate' | 'updated' | 'updatedBy' | 'services'>('updated');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Track hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    // Sync URL params
    useEffect(() => {
        if (urlSource) setServiceFilter(urlSource);
        if (urlSearch !== null) setSearchTerm(urlSearch);
        if (urlYear) setYearFilter(urlYear);
        if (urlMonth) setMonthFilter(urlMonth);
        if (urlSource) setSourceFilter(urlSource);
    }, [urlSearch, urlYear, urlMonth, urlSource]);

    // Fetch data
    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                const params = new URLSearchParams();
                if (urlFilter) params.set('filter', urlFilter);
                if (urlSearch) params.set('search', urlSearch);
                if (urlProjectId) params.set('projectId', urlProjectId);
                if (!params.has('take')) params.set('take', '10000');
                if (urlYear) params.set('year', urlYear);
                if (urlMonth) params.set('month', urlMonth);
                if (urlSource) params.set('source', urlSource);
                if (statusFilter !== 'ALL') params.set('status', statusFilter);
                if (selectedStatuses.size > 0) params.set('status', Array.from(selectedStatuses).join(','));
                if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
                if (serviceFilter !== 'ALL') params.set('service', serviceFilter);

                const res = await fetch(`/api/cases?${params.toString()}`, { cache: 'no-store' });
                const data = await res.json();
                
                // Handle total count from header
                const total = res.headers.get('X-Total-Count');
                if (total) {
                    setTotalResults(parseInt(total));
                }

                if (res.ok && Array.isArray(data)) {
                    setCases(data);
                    setFilteredCases(data);
                    if (!total) setTotalResults(data.length);
                } else {
                    setCases([]);
                    setFilteredCases([]);
                }
            } catch (error) {
                logger.error('Fetch error:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [urlFilter, urlSearch, urlProjectId, urlYear, urlMonth, urlSource, selectedStatuses, categoryFilter, serviceFilter]);

    // Fetch project name when filtering by projectId
    useEffect(() => {
        if (!urlProjectId) {
            setProjectName('');
            return;
        }
        async function fetchProjectName() {
            try {
                const res = await fetch(`/api/projects/${urlProjectId}`);
                if (res.ok) {
                    const data = await res.json();
                    setProjectName(data.name || 'Project Cases');
                }
            } catch (e) {
                // fallback handled below
            }
        }
        fetchProjectName();
    }, [urlProjectId]);

    // Client-side filtering
    useEffect(() => {
        let filtered = [...cases];

        if (searchTerm) {
            const term = searchTerm.trim().toLowerCase();
            filtered = filtered.filter(c =>
                c.fileNumber.toLowerCase().includes(term) ||
                `${c.client.firstName} ${c.client.lastName}`.toLowerCase().includes(term) ||
                c.client.email?.toLowerCase().includes(term) ||
                c.client.phone?.includes(term) ||
                c.client.idNumber?.includes(term)
            );
        }

        if (serviceFilter !== 'ALL') {
            try {
                filtered = filtered.filter(c => {
                    const list = c.services ? JSON.parse(c.services) : [];
                    return Array.isArray(list) && list.includes(serviceFilter);
                });
            } catch (e) {}
        }

        setFilteredCases(filtered);
        setCurrentPage(1);
    }, [searchTerm, statusFilter, categoryFilter, serviceFilter, cases]);

    const getStatusInfo = (code: string) => {
        return WORKFLOW_STATUSES.find(s => s.code === code) || { name: code, category: 'BEGINNING' as StatusCategory };
    };

    const handleReset = () => {
        setSearchTerm('');
        setStatusFilter('ALL');
        setSelectedStatuses(new Set());
        setCategoryFilter('ALL');
        setServiceFilter('ALL');
        router.push('/cases');
    };

    const handleSort = (column: any) => {
        if (sortBy === column) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        else { setSortBy(column); setSortDirection('asc'); }
    };

    if (!mounted) return null;
    if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zeno-cyan"></div></div>;

    const sortedCases = [...filteredCases].sort((a, b) => {
        let comp = 0;
        if (sortBy === 'fileNumber') comp = a.fileNumber.localeCompare(b.fileNumber);
        else if (sortBy === 'client') comp = `${a.client.firstName} ${a.client.lastName}`.localeCompare(`${b.client.firstName} ${b.client.lastName}`);
        else if (sortBy === 'status') comp = a.status.localeCompare(b.status);
        else if (sortBy === 'services') comp = (a.services || '').localeCompare(b.services || '');
        else if (sortBy === 'nextUpdate') comp = (a.nextUpdate ? new Date(a.nextUpdate).getTime() : 0) - (b.nextUpdate ? new Date(b.nextUpdate).getTime() : 0);
        else if (sortBy === 'updatedBy') comp = `${a.updatedBy?.firstName || ''} ${a.updatedBy?.lastName || ''}`.localeCompare(`${b.updatedBy?.firstName || ''} ${b.updatedBy?.lastName || ''}`);
        else comp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        return sortDirection === 'asc' ? comp : -comp;
    });

    const paginated = sortedCases.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(sortedCases.length / ITEMS_PER_PAGE);

    const runBulkDhsAction = async (actionLabel: string) => {
        const config = DHS_ACTION_CONFIG[actionLabel];
        if (!config) return;

        const selected = filteredCases.filter(c => selectedCaseIds.has(c.id));
        if (selected.length === 0) {
            toast.error('Select at least one case first using the checkboxes.');
            return;
        }

        bulkDhsCancelRef.current = false;
        setBulkDhsActionLabel(actionLabel);
        setBulkDhsResults(selected.map(c => ({
            caseId: c.id,
            fileNumber: c.fileNumber,
            clientName: `${c.client.firstName} ${c.client.lastName}`,
            status: 'pending',
            message: '',
        })));
        setBulkDhsDone(false);
        setShowBulkDhsModal(true);

        for (let i = 0; i < selected.length; i++) {
            if (bulkDhsCancelRef.current) break;

            const c = selected[i];

            setBulkDhsResults(prev => prev.map((r, idx) =>
                idx === i ? { ...r, status: 'running' } : r
            ));

            try {
                const res = await fetch(config.endpoint(c.id), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config.body(c)),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed');

                const msg = data.message || data.result?.message || data.status || 'Completed';
                setBulkDhsResults(prev => prev.map((r, idx) =>
                    idx === i ? { ...r, status: 'success', message: msg } : r
                ));
            } catch (err) {
                setBulkDhsResults(prev => prev.map((r, idx) =>
                    idx === i ? { ...r, status: 'error', message: err instanceof Error ? err.message : 'Failed' } : r
                ));
            }
        }

        setBulkDhsDone(true);
    };

    const allPageSelected = paginated.length > 0 && paginated.every(c => selectedCaseIds.has(c.id));
    const somePageSelected = paginated.some(c => selectedCaseIds.has(c.id)) && !allPageSelected;

    const toggleSelectAll = () => {
        const next = new Set(selectedCaseIds);
        if (allPageSelected) {
            paginated.forEach(c => next.delete(c.id));
        } else {
            paginated.forEach(c => next.add(c.id));
        }
        setSelectedCaseIds(next);
    };

    const toggleCase = (id: string) => {
        const next = new Set(selectedCaseIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedCaseIds(next);
    };

    const selectAllFiltered = () => setSelectedCaseIds(new Set(filteredCases.map(c => c.id)));
    const clearSelection = () => setSelectedCaseIds(new Set());

    const handleBulkDelete = async () => {
        if (bulkDeleteConfirmText !== 'DELETE') return;
        setBulkDeleting(true);
        try {
            const res = await fetch('/api/cases/bulk-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caseIds: Array.from(selectedCaseIds) }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            setBulkDeleteResult({ succeeded: data.succeeded, failed: data.failed });
            // Remove deleted cases from local state
            setCases(prev => prev.filter(c => !data.succeeded.includes(c.fileNumber)));
            setFilteredCases(prev => prev.filter(c => !data.succeeded.includes(c.fileNumber)));
            setSelectedCaseIds(new Set());
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Bulk delete failed');
            setShowBulkDeleteModal(false);
        } finally {
            setBulkDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center text-white">
                <div>
                    <h1 className="text-3xl font-bold">
                        {urlYear ? (
                            <>
                                {urlMonth ? `${urlMonth} ` : ''}{urlYear} Cases
                                {urlSource && <span className="text-zeno-cyan/60 text-xl ml-3">({urlSource})</span>}
                            </>
                        ) : urlSource ? (
                            `${urlSource} Cases`
                        ) : urlProjectId ? (
                            projectName || cases[0]?.projects?.find(p => p.project.id === urlProjectId)?.project.fullPath || cases[0]?.projects?.find(p => p.project.id === urlProjectId)?.project.name || 'Project Cases'
                        ) : 'All Cases'}
                    </h1>
                    <p className="text-gray-400 text-sm">
                        Showing {Math.min(filteredCases.length, (currentPage - 1) * ITEMS_PER_PAGE + 1)}
                        - {Math.min(filteredCases.length, currentPage * ITEMS_PER_PAGE)}
                        of {searchTerm ? filteredCases.length : totalResults}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <Link href="/cases/new" className="px-6 py-3 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-all">+ New Case</Link>
                    <div className="relative">
                        <button
                            onClick={() => setShowDhsMenu(prev => !prev)}
                            className="flex items-center gap-2 px-4 py-2 bg-zeno-blue/40 border border-white/10 text-gray-300 text-sm font-semibold rounded-lg hover:bg-white/10 hover:text-white transition-all"
                        >
                            <span>
                                Bulk Action
                                {selectedCaseIds.size > 0
                                    ? <span className="ml-1.5 px-1.5 py-0.5 bg-zeno-cyan text-zeno-navy text-[10px] font-black rounded-full">{selectedCaseIds.size}</span>
                                    : null}
                            </span>
                            <svg className={`w-4 h-4 transition-transform ${showDhsMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {showDhsMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowDhsMenu(false)} />
                                <div className="absolute right-0 mt-1 w-56 bg-zeno-navy border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                                    {[
                                        { label: 'Check DHS', icon: '🔍', danger: false },
                                        { label: 'Request via DHS', icon: '📤', danger: false },
                                        { label: 'Email Documents to DC', icon: '📧', danger: false },
                                        { label: 'Request Invoice from DC', icon: '🧾', danger: false },
                                        { label: 'Check DHS Request', icon: '📋', danger: false },
                                        ...(session?.user?.isManager ? [{ label: 'Delete', icon: '🗑️', danger: true }] : []),
                                    ].map(({ label, icon, danger }) => (
                                        <button
                                            key={label}
                                            onClick={() => {
                                                setShowDhsMenu(false);
                                                if (label === 'Delete') {
                                                    if (selectedCaseIds.size === 0) {
                                                        toast.error('Select at least one case first using the checkboxes.');
                                                        return;
                                                    }
                                                    setBulkDeleteConfirmText('');
                                                    setBulkDeleteResult(null);
                                                    setShowBulkDeleteModal(true);
                                                } else {
                                                    runBulkDhsAction(label);
                                                }
                                            }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left border-b border-white/5 last:border-0 ${danger ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                                        >
                                            <span>{icon}</span>
                                            <span>{label}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {[
                    { key: '', label: 'All Cases' },
                    { key: 'my-cases', label: 'My Cases' },
                    { key: 'begin', label: 'Begin' },
                    { key: 'overdue', label: 'Overdue' },
                    { key: 'progress', label: 'Progress' },
                    { key: 'detour', label: 'Detour' },
                    { key: 'advanced', label: 'Advanced' },
                    { key: 'completed', label: 'Completed' },
                    { key: 'finance', label: 'Finance' },
                    { key: 'lost', label: 'Lost Cases' },
                ].map(({ key: f, label }) => (
                    <button key={f} onClick={() => {
                        const params = new URLSearchParams();
                        if (f) params.set('filter', f);
                        if (urlYear) params.set('year', urlYear);
                        if (urlMonth) params.set('month', urlMonth);
                        if (urlSource) params.set('source', urlSource);
                        if (urlProjectId) params.set('projectId', urlProjectId);
                        const query = params.toString();
                        router.push(query ? `/cases?${query}` : '/cases');
                    }} className={`px-4 py-2 rounded-lg border transition-all text-sm ${(!urlFilter && !f) || urlFilter === f ? 'bg-zeno-cyan text-zeno-navy font-bold border-zeno-cyan' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">Service Required</label>
                    <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white outline-none focus:border-zeno-cyan">
                        <option value="ALL">All Services</option>
                        {Object.entries(SERVICES_MAP).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">Category</label>
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white outline-none focus:border-zeno-cyan">
                        <option value="ALL">All Categories</option>
                        {CASE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="relative">
                    <label className="block text-xs font-medium text-gray-400 mb-2">Status</label>
                    <button onClick={() => setShowStatusDropdown(!showStatusDropdown)} className="w-full px-3 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white text-left flex justify-between items-center text-sm">
                        <span className="truncate">{selectedStatuses.size === 0 ? 'All Statuses' : `${selectedStatuses.size} selected`}</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {showStatusDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-full bg-zeno-navy border border-white/10 rounded-lg shadow-2xl z-50 max-h-60 overflow-y-auto p-2">
                            {WORKFLOW_STATUSES.map(s => (
                                <label key={s.code} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer">
                                    <input type="checkbox" checked={selectedStatuses.has(s.code)} onChange={() => {
                                        const next = new Set(selectedStatuses);
                                        if (next.has(s.code)) next.delete(s.code); else next.add(s.code);
                                        setSelectedStatuses(next);
                                    }} className="w-4 h-4 rounded" />
                                    <span className="text-xs text-gray-300">{s.name}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                <div className="lg:col-span-1">
                    <label className="block text-xs font-medium text-gray-400 mb-2">Search</label>
                    <SearchWithSuggestions placeholder="File #, Name..." initialValue={searchTerm} onQueryChange={setSearchTerm} />
                </div>
                <div className="flex items-end">
                    <button onClick={handleReset} className="w-full px-3 py-2 bg-transparent border border-white/20 text-gray-300 rounded-lg hover:bg-white/5 text-sm">Reset</button>
                </div>
            </div>

            {selectedCaseIds.size > 0 && (
                <div className="flex items-center gap-4 px-4 py-2.5 bg-zeno-cyan/10 border border-zeno-cyan/20 rounded-xl text-sm">
                    <span className="text-zeno-cyan font-semibold">
                        {selectedCaseIds.size} case{selectedCaseIds.size !== 1 ? 's' : ''} selected
                    </span>
                    {selectedCaseIds.size < filteredCases.length && (
                        <button onClick={selectAllFiltered} className="text-zeno-cyan/70 hover:text-zeno-cyan underline text-xs">
                            Select all {filteredCases.length} filtered cases
                        </button>
                    )}
                    <button onClick={clearSelection} className="ml-auto text-gray-400 hover:text-white text-xs">
                        Clear selection
                    </button>
                </div>
            )}

            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zeno-blue/30 border-b border-white/5 text-gray-400 uppercase text-[10px] font-bold tracking-wider">
                            <tr>
                                <th className="px-4 py-3 w-10">
                                    <input
                                        type="checkbox"
                                        checked={allPageSelected}
                                        ref={el => { if (el) el.indeterminate = somePageSelected; }}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded cursor-pointer accent-zeno-cyan"
                                    />
                                </th>
                                <th className="px-4 py-3 w-10">#</th>
                                {['fileNumber', 'client', 'status', 'services', 'updatedBy', 'project', 'nextUpdate'].map(col => {
                                    const labels:any = {fileNumber: 'File #', client: 'Client', status: 'Process Status', services: 'Type', updatedBy: 'Last Updated By', project: 'Project', nextUpdate: 'Next Update'};
                                    return <th key={col} className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSort(col as any)}>{labels[col]} {sortBy === col && (sortDirection === 'asc' ? '↑' : '↓')}</th>;
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-white">
                            {paginated.length === 0 ? <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">No cases found.</td></tr> : paginated.map((c, i) => {
                                const sInfo = getStatusInfo(c.status);
                                const isSelected = selectedCaseIds.has(c.id);
                                return (
                                    <tr key={c.id} className={`transition-colors ${isSelected ? 'bg-zeno-cyan/5 border-l-2 border-l-zeno-cyan' : 'hover:bg-white/5'}`}>
                                        <td className="px-4 py-4">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleCase(c.id)}
                                                className="w-4 h-4 rounded cursor-pointer accent-zeno-cyan"
                                            />
                                        </td>
                                        <td className="px-4 py-4 text-gray-500 font-mono text-xs">{(currentPage-1)*ITEMS_PER_PAGE + i + 1}</td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-2">
                                                <Link href={`/cases/${c.id}`} className="text-zeno-cyan font-bold">{c.fileNumber}</Link>
                                                <span className={`px-1.5 py-0.5 rounded-[4px] text-[9px] font-black uppercase tracking-tighter border ${c.jointClient ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-gray-500/10 text-gray-500 border-white/5'}`}>
                                                    {c.jointClient ? 'Joint' : 'Single'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-white">{c.client.firstName} {c.client.lastName}</span>
                                                {c.jointClient && (
                                                    <span className="text-[10px] text-indigo-400/80 font-bold uppercase tracking-tight">
                                                        Joint: {c.jointClient.firstName} {c.jointClient.lastName}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                c.status === 'COMPLETED' ? 'bg-green-500/20 text-green-300' : 
                                                c.status === 'NOT_LINKED' ? 'bg-red-500/20 text-red-300 border border-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.3)]' :
                                                'bg-blue-500/20 text-blue-300'
                                            }`}>
                                                {sInfo.name}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            {(() => {
                                                try {
                                                    const s = c.services ? JSON.parse(c.services) : [];
                                                    if (s.length > 1) return <span className="bg-zeno-cyan/10 text-zeno-cyan px-1.5 py-0.5 rounded text-[10px] font-bold border border-zeno-cyan/20">2 or More</span>;
                                                    return s[0] ? (SERVICES_MAP[s[0]] || s[0]) : <span className="text-gray-600 italic">None</span>;
                                                } catch { return 'Error'; }
                                            })()}
                                        </td>
                                        <td className="px-4 py-4 text-gray-400 text-xs">
                                            {c.updatedBy ? `${c.updatedBy.firstName} ${c.updatedBy.lastName}` : '—'}
                                            <div className="text-[10px] opacity-60">
                                                {new Date(c.updatedAt).toLocaleDateString()} {new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            {(() => {
                                                const primary = c.projects?.find(p => p.isPrimary) || c.projects?.[0];
                                                if (!primary) return <span className="text-gray-600 italic text-xs">—</span>;
                                                const label = primary.project.fullPath || primary.project.name;
                                                return (
                                                    <Link href={`/cases?projectId=${primary.project.id}`} className="text-zeno-cyan hover:underline text-xs font-medium">
                                                        {label}
                                                    </Link>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-4 text-xs">
                                            {c.nextUpdate ? <span className={new Date(c.nextUpdate) < new Date() ? 'text-red-400 font-bold' : 'text-zeno-cyan'}>{new Date(c.nextUpdate).toLocaleDateString()}</span> : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <Pagination 
                    currentPage={currentPage} 
                    totalPages={totalPages} 
                    onPageChange={setCurrentPage} 
                />
            </div>

            {/* Bulk DHS Action Progress Modal */}
            {showBulkDhsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-zeno-navy border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="p-5 border-b border-white/5 shrink-0">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-white">{bulkDhsActionLabel}</h2>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {bulkDhsResults.filter(r => r.status === 'success').length} of {bulkDhsResults.length} completed
                                        {!bulkDhsDone && <span className="text-zeno-cyan animate-pulse ml-2">— running...</span>}
                                    </p>
                                </div>
                                {!bulkDhsDone && (
                                    <button
                                        onClick={() => { bulkDhsCancelRef.current = true; }}
                                        className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                                    >
                                        Stop
                                    </button>
                                )}
                            </div>
                            {/* Progress bar */}
                            <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-zeno-cyan rounded-full transition-all duration-300"
                                    style={{ width: `${(bulkDhsResults.filter(r => r.status === 'success' || r.status === 'error').length / (bulkDhsResults.length || 1)) * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* Scrollable results list */}
                        <div className="overflow-y-auto flex-1 divide-y divide-white/5">
                            {bulkDhsResults.map((r) => (
                                <div key={r.caseId} className="flex items-start gap-3 px-5 py-3">
                                    <div className="mt-0.5 shrink-0">
                                        {r.status === 'pending' && <span className="text-gray-600 text-base">○</span>}
                                        {r.status === 'running' && (
                                            <svg className="animate-spin w-4 h-4 text-zeno-cyan" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                            </svg>
                                        )}
                                        {r.status === 'success' && <span className="text-green-400 text-base">✓</span>}
                                        {r.status === 'error' && <span className="text-red-400 text-base">✗</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-mono font-bold text-zeno-cyan">{r.fileNumber}</span>
                                            <span className="text-xs text-gray-400 truncate">{r.clientName}</span>
                                        </div>
                                        {r.message && (
                                            <p className={`text-xs mt-0.5 truncate ${r.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                                                {r.message}
                                            </p>
                                        )}
                                        {r.status === 'pending' && <p className="text-xs text-gray-600 mt-0.5">Waiting...</p>}
                                        {r.status === 'running' && <p className="text-xs text-zeno-cyan/70 mt-0.5">Processing — DHS may take up to 90 seconds</p>}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Footer */}
                        {bulkDhsDone && (
                            <div className="p-5 border-t border-white/5 shrink-0 space-y-3">
                                <div className="flex gap-3 text-sm">
                                    <span className="text-green-400 font-semibold">✓ {bulkDhsResults.filter(r => r.status === 'success').length} succeeded</span>
                                    {bulkDhsResults.filter(r => r.status === 'error').length > 0 && (
                                        <span className="text-red-400 font-semibold">✗ {bulkDhsResults.filter(r => r.status === 'error').length} failed</span>
                                    )}
                                </div>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="w-full py-2.5 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-all"
                                >
                                    Done
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bulk Delete Modal */}
            {showBulkDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-zeno-navy border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">

                        {/* Results view */}
                        {bulkDeleteResult ? (
                            <div className="p-6 space-y-4">
                                <h2 className="text-xl font-bold text-white">Bulk Delete Complete</h2>
                                <div className="flex gap-4">
                                    <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                                        <p className="text-3xl font-black text-green-400">{bulkDeleteResult.succeeded.length}</p>
                                        <p className="text-xs text-green-400/70 mt-1">Moved to Trash</p>
                                    </div>
                                    {bulkDeleteResult.failed.length > 0 && (
                                        <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                                            <p className="text-3xl font-black text-red-400">{bulkDeleteResult.failed.length}</p>
                                            <p className="text-xs text-red-400/70 mt-1">Failed</p>
                                        </div>
                                    )}
                                </div>
                                {bulkDeleteResult.failed.length > 0 && (
                                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 max-h-32 overflow-y-auto">
                                        <p className="text-xs text-red-400 font-semibold mb-2">Failed cases:</p>
                                        {bulkDeleteResult.failed.map(f => (
                                            <p key={f.fileNumber} className="text-xs text-gray-400">{f.fileNumber} — {f.reason}</p>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-gray-500">Cases moved to trash will be permanently deleted in 30 days.</p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="w-full py-2.5 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-all"
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            /* Confirmation view */
                            <div className="p-6 space-y-5">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                                        <span className="text-lg">🗑️</span>
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Delete {selectedCaseIds.size} Case{selectedCaseIds.size !== 1 ? 's' : ''}?</h2>
                                        <p className="text-sm text-gray-400 mt-1">These cases will be moved to trash and permanently deleted in 30 days.</p>
                                    </div>
                                </div>

                                {/* Scrollable list of selected file numbers */}
                                <div className="bg-black/20 border border-white/5 rounded-xl max-h-40 overflow-y-auto p-3">
                                    <div className="grid grid-cols-2 gap-1">
                                        {filteredCases
                                            .filter(c => selectedCaseIds.has(c.id))
                                            .map(c => (
                                                <span key={c.id} className="text-xs font-mono text-gray-300 bg-white/5 rounded px-2 py-1">{c.fileNumber}</span>
                                            ))
                                        }
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs text-gray-400 mb-2">
                                        Type <span className="font-bold text-red-400">DELETE</span> to confirm
                                    </label>
                                    <input
                                        type="text"
                                        value={bulkDeleteConfirmText}
                                        onChange={e => setBulkDeleteConfirmText(e.target.value.toUpperCase())}
                                        placeholder="Type DELETE"
                                        className="w-full px-4 py-2.5 bg-black/30 border border-white/10 rounded-lg text-white placeholder-gray-600 outline-none focus:border-red-500/50 font-mono"
                                        autoFocus
                                    />
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowBulkDeleteModal(false)}
                                        disabled={bulkDeleting}
                                        className="flex-1 py-2.5 border border-white/10 text-gray-300 rounded-lg hover:bg-white/5 transition-all text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleBulkDelete}
                                        disabled={bulkDeleteConfirmText !== 'DELETE' || bulkDeleting}
                                        className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition-all text-sm disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {bulkDeleting ? (
                                            <>
                                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                                Deleting...
                                            </>
                                        ) : `Delete ${selectedCaseIds.size} Case${selectedCaseIds.size !== 1 ? 's' : ''}`}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

class SessionErrorBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError() { return { hasError: true }; }
    render() {
        if (this.state.hasError) return this.props.fallback || <div className="flex items-center justify-center min-h-[60vh] text-center"><p className="text-gray-400">Session Error</p></div>;
        return this.props.children;
    }
}

export default function CasesPage() {
    return (
        <SessionErrorBoundary>
            <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zeno-cyan"></div></div>}>
                <CasesContent />
            </Suspense>
        </SessionErrorBoundary>
    );
}
