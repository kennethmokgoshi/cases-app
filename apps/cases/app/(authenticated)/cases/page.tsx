'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@zenowethu/ui';
import { WORKFLOW_STATUSES, STATUS_CATEGORIES, type StatusCategory } from '@zenowethu/shared-lib';
import { SearchWithSuggestions } from '@zenowethu/ui';
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

    // Sorting state
    const [sortBy, setSortBy] = useState<'fileNumber' | 'client' | 'status' | 'nextUpdate' | 'updated' | 'services'>('updated');
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
                if (statusFilter !== 'ALL') params.set('status', statusFilter);
                if (selectedStatuses.size > 0) params.set('status', Array.from(selectedStatuses).join(','));
                if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
                if (serviceFilter !== 'ALL') params.set('service', serviceFilter);

                const res = await fetch(`/api/cases?${params.toString()}`, { cache: 'no-store' });
                const data = await res.json();
                
                if (res.ok && Array.isArray(data)) {
                    setCases(data);
                    setFilteredCases(data);
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
    }, [urlFilter, urlSearch, urlProjectId, selectedStatuses, categoryFilter, serviceFilter]);

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
            const term = searchTerm.toLowerCase();
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
        return WORKFLOW_STATUSES.find(s => s.code === code) || { name: code, category: 'INTAKE' as StatusCategory };
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
        else comp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        return sortDirection === 'asc' ? comp : -comp;
    });

    const paginated = sortedCases.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(sortedCases.length / ITEMS_PER_PAGE);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center text-white">
                <div>
                    <h1 className="text-3xl font-bold">{urlProjectId ? (projectName || cases[0]?.projects?.find(p => p.project.id === urlProjectId)?.project.fullPath || cases[0]?.projects?.find(p => p.project.id === urlProjectId)?.project.name || 'Project Cases') : 'All Cases'}</h1>
                    <p className="text-gray-400 text-sm">Showing {paginated.length} of {filteredCases.length}</p>
                </div>
                <Link href="/cases/new" className="px-6 py-3 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 transition-all">+ New Case</Link>
            </div>

            <div className="flex flex-wrap gap-2">
                {['', 'my-cases', 'new-leads', 'overdue'].map(f => (
                    <button key={f} onClick={() => router.push(f ? `/cases?filter=${f}` : '/cases')} className={`px-4 py-2 rounded-lg border transition-all text-sm ${(!urlFilter && !f) || urlFilter === f ? 'bg-zeno-cyan text-zeno-navy font-bold border-zeno-cyan' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                        {f ? (f === 'my-cases' ? 'My Cases' : f === 'new-leads' ? 'New Leads' : 'Overdue') : 'All Cases'}
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

            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zeno-blue/30 border-b border-white/5 text-gray-400 uppercase text-[10px] font-bold tracking-wider">
                            <tr>
                                <th className="px-4 py-3 w-10">#</th>
                                {['fileNumber', 'client', 'status', 'services', 'updated', 'project', 'nextUpdate'].map(col => {
                                    const labels:any = {fileNumber: 'File #', client: 'Client', status: 'Process Status', services: 'Type', updated: 'Last Updated', project: 'Project', nextUpdate: 'Next Update'};
                                    return <th key={col} className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSort(col as any)}>{labels[col]} {sortBy === col && (sortDirection === 'asc' ? '↑' : '↓')}</th>;
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-white">
                            {paginated.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">No cases found.</td></tr> : paginated.map((c, i) => {
                                const sInfo = getStatusInfo(c.status);
                                return (
                                    <tr key={c.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-4 text-gray-500 font-mono text-xs">{(currentPage-1)*ITEMS_PER_PAGE + i + 1}</td>
                                        <td className="px-4 py-4 text-zeno-cyan font-bold"><Link href={`/cases/${c.id}`}>{c.fileNumber}</Link></td>
                                        <td className="px-4 py-4">{c.client.firstName} {c.client.lastName}</td>
                                        <td className="px-4 py-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.status === 'COMPLETED' ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'}`}>{sInfo.name}</span></td>
                                        <td className="px-4 py-4">
                                            {(() => {
                                                try {
                                                    const s = c.services ? JSON.parse(c.services) : [];
                                                    if (s.length > 1) return <span className="bg-zeno-cyan/10 text-zeno-cyan px-1.5 py-0.5 rounded text-[10px] font-bold border border-zeno-cyan/20">2 or More</span>;
                                                    return s[0] ? (SERVICES_MAP[s[0]] || s[0]) : <span className="text-gray-600 italic">None</span>;
                                                } catch { return 'Error'; }
                                            })()}
                                        </td>
                                        <td className="px-4 py-4 text-gray-400 text-xs">{new Date(c.updatedAt).toLocaleDateString()}</td>
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
                {totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-white/5 flex justify-between items-center text-xs text-gray-400">
                        <span>Page {currentPage} of {totalPages}</span>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 bg-zeno-blue border border-white/10 rounded-lg disabled:opacity-50">Prev</button>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 bg-zeno-blue border border-white/10 rounded-lg disabled:opacity-50">Next</button>
                        </div>
                    </div>
                )}
            </div>
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
