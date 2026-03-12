'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@zenowethu/ui';
import { WORKFLOW_STATUSES, STATUS_CATEGORIES, type StatusCategory, logger } from '@zenowethu/shared-lib';
import { SearchWithSuggestions } from '@zenowethu/ui';


type Case = {
    id: string;
    fileNumber: string;
    status: string;
    statusEntryDate: string;
    deadline: string | null;
    nextUpdate: string | null; // Added
    isOverdue: boolean;
    createdAt: string;
    updatedAt: string;
    createdById: string | null;
    assignedToId: string | null;
    client: {
        id: string;
        firstName: string;
        lastName: string;
        idNumber: string;
        email: string | null;
        phone: string | null;
    };
    projects: Array<{
        isPrimary: boolean;
        project: {
            id: string;
            name: string;
            type: string;
            fullPath?: string;
        };
    }>;
};

function CasesContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlProjectId = searchParams.get('projectId');
    const urlSearch = searchParams.get('search');
    const urlYear = searchParams.get('year');
    const urlMonth = searchParams.get('month');
    const urlSource = searchParams.get('source');
    const urlFilter = searchParams.get('filter');
    const urlCreatedBy = searchParams.get('createdBy');
    const urlAssignedTo = searchParams.get('assignedTo');

    const { data: session } = useSession();
    const [cases, setCases] = useState<Case[]>([]);
    const [filteredCases, setFilteredCases] = useState<Case[]>([]);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [allProjects, setAllProjects] = useState<Array<{ id: string, name: string, parentId: string | null, type: string }>>([]);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Filters
    const [searchTerm, setSearchTerm] = useState(urlSearch || '');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [categoryFilter, setCategoryFilter] = useState<StatusCategory | 'ALL'>('ALL');
    const [projectFilter, setProjectFilter] = useState<string>(urlProjectId || 'ALL');
    const [yearFilter, setYearFilter] = useState<string>(urlYear || 'ALL');
    const [monthFilter, setMonthFilter] = useState<string>(urlMonth || 'ALL');
    const [sourceFilter, setSourceFilter] = useState<string>(urlSource || 'ALL');

    // Case status filter (for simplified Active/Completed/Closed/Cancelled)
    const [caseStatusFilter, setCaseStatusFilter] = useState<Set<string>>(new Set(['ACTIVE', 'COMPLETED', 'CLOSED', 'CANCELLED']));
    const [showCaseStatusDropdown, setShowCaseStatusDropdown] = useState(false);

    // Sorting state
    const [sortBy, setSortBy] = useState<'fileNumber' | 'client' | 'status' | 'project' | 'nextUpdate' | 'updated'>('updated');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');



    // Track client-side hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    // Update filters when URL params change
    useEffect(() => {
        if (urlProjectId) setProjectFilter(urlProjectId);
        else setProjectFilter('ALL');

        if (urlSearch !== null) setSearchTerm(urlSearch);

        if (urlYear) setYearFilter(urlYear);
        else setYearFilter('ALL');

        if (urlMonth) setMonthFilter(urlMonth);
        else setMonthFilter('ALL');

        if (urlSource) setSourceFilter(urlSource);
        else setSourceFilter('ALL');
    }, [urlProjectId, urlSearch, urlYear, urlMonth, urlSource]);

    useEffect(() => {
        async function fetchData() {
            try {
                // Fetch cases and projects in parallel
                const [casesRes, projectsRes] = await Promise.all([
                    fetch('/api/cases', { cache: 'no-store' }),
                    fetch('/api/projects?flat=true', { cache: 'no-store' })
                ]);

                const casesData = await casesRes.json();
                setCases(casesData);
                setFilteredCases(casesData);

                // Set projects for filter dropdown
                if (projectsRes.ok) {
                    const projectsData = await projectsRes.json();
                    setAllProjects(projectsData.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        parentId: p.parentId || null,
                        type: p.type
                    })));
                }
            } catch (error) {
                logger.error('Failed to fetch data', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Apply filters whenever they change
    useEffect(() => {
        let filtered = [...cases];

        // Overdue filter
        if (urlFilter === 'overdue') {
            const now = new Date();
            filtered = filtered.filter(c => c.nextUpdate && new Date(c.nextUpdate) < now);
        }

        // My Cases filter
        if (urlFilter === 'my-cases' && session?.user?.id) {
            filtered = filtered.filter(c => c.createdById === session.user.id);
        }

        // Assigned to Me filter
        if (urlFilter === 'assigned' && session?.user?.id) {
            filtered = filtered.filter(c => c.assignedToId === session.user.id);
        }

        // Specific Creator filter
        if (urlCreatedBy) {
            filtered = filtered.filter(c => c.createdById === urlCreatedBy);
        }

        // Specific Assignee filter
        if (urlAssignedTo) {
            filtered = filtered.filter(c => c.assignedToId === urlAssignedTo);
        }

        // Search filter (file number, client name, email, phone)
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

        // Status filter
        if (statusFilter !== 'ALL') {
            filtered = filtered.filter(c => c.status === statusFilter);
        }

        // Category filter
        if (categoryFilter !== 'ALL') {
            const statusesInCategory = WORKFLOW_STATUSES
                .filter(s => s.category === categoryFilter)
                .map(s => s.code);
            filtered = filtered.filter(c => statusesInCategory.includes(c.status));
        }

        filtered = filtered.filter(c => {
            // Get ancestry traversal to match filters
            const primaryProjectId = c.projects.find(p => p.isPrimary)?.project.id;
            if (!primaryProjectId) return false;

            // If no complex filters, skip traversal
            if (projectFilter === 'ALL' && yearFilter === 'ALL' && monthFilter === 'ALL' && sourceFilter === 'ALL') {
                return true;
            }

            // Check if we need to match a specific Project ID (and its descendants)
            // If projectFilter is set, we must find it in the ancestry path
            let foundProject = (projectFilter === 'ALL');
            let foundYear = (yearFilter === 'ALL');
            let foundMonth = (monthFilter === 'ALL');
            // For source, we'll assume exact name match for now, or use the 'contains' logic if safer
            let foundSource = (sourceFilter === 'ALL');

            // Helper to normalize month names for comparison
            const normalizeMonth = (name: string) => {
                const trimmedName = name.trim();
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

                const fullIndex = monthNames.findIndex(m => m.toLowerCase() === trimmedName.toLowerCase());
                if (fullIndex !== -1) return monthNames[fullIndex];

                const shortIndex = shortMonthNames.findIndex(m => m.toLowerCase() === trimmedName.toLowerCase());
                if (shortIndex !== -1) return monthNames[shortIndex];

                return trimmedName; // Return original if not a month
            };

            const targetMonth = normalizeMonth(monthFilter);

            // Walk up the tree
            let currentId: string | null | undefined = primaryProjectId;
            while (currentId) {
                const p = allProjects.find(pr => pr.id === currentId);
                if (!p) break;

                // Check Project Match
                if (!foundProject && currentId === projectFilter) foundProject = true;

                const pName = p.name.trim();

                if (!foundYear && pName === yearFilter) foundYear = true;
                if (!foundMonth && normalizeMonth(pName) === targetMonth) foundMonth = true;
                if (!foundSource && pName === sourceFilter) foundSource = true;

                currentId = p.parentId;
            }

            if (!foundProject || !foundYear || !foundMonth || !foundSource) return false;

            return true;
        });


        // Filter by case status (Active/Completed/Closed/Cancelled)
        filtered = filtered.filter(c => {
            const caseStatus = c.status === 'COMPLETED' ? 'COMPLETED'
                : c.status === 'CLOSED' ? 'CLOSED'
                    : c.status === 'CANCELLED' ? 'CANCELLED'
                        : 'ACTIVE';
            return caseStatusFilter.has(caseStatus);
        });

        setFilteredCases(filtered);
        // Reset to page 1 when filters change
        setCurrentPage(1);
    }, [searchTerm, statusFilter, categoryFilter, projectFilter, yearFilter, monthFilter, sourceFilter, caseStatusFilter, cases, allProjects]);

    const getStatusInfo = (code: string) => {
        return WORKFLOW_STATUSES.find(s => s.code === code) || {
            name: code,
            category: 'INTAKE' as StatusCategory };
    };

    const getCategoryColor = (category: StatusCategory) => {
        const cat = STATUS_CATEGORIES.find(c => c.code === category);
        return cat?.color || 'gray';
    };

    // Reset all filters
    const handleReset = () => {
        setSearchTerm('');
        setStatusFilter('ALL');
        setCategoryFilter('ALL');
        setProjectFilter('ALL');
        setYearFilter('ALL');
        setMonthFilter('ALL');
        setSourceFilter('ALL');
        router.push('/cases');
    };

    // Handle column sorting
    const handleSort = (column: typeof sortBy) => {
        if (sortBy === column) {
            // Toggle direction if same column
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // Set new column and default to ascending
            setSortBy(column);
            setSortDirection('asc');
        }
    };

    const toggleCaseStatus = (status: string) => {
        const newFilter = new Set(caseStatusFilter);
        if (newFilter.has(status)) {
            newFilter.delete(status);
        } else {
            newFilter.add(status);
        }
        setCaseStatusFilter(newFilter);
    };



    if (!mounted) return null;

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    // Apply sorting
    const sortedCases = [...filteredCases].sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
            case 'fileNumber':
                comparison = a.fileNumber.localeCompare(b.fileNumber);
                break;
            case 'client':
                const nameA = `${a.client.firstName} ${a.client.lastName}`.toLowerCase();
                const nameB = `${b.client.firstName} ${b.client.lastName}`.toLowerCase();
                comparison = nameA.localeCompare(nameB);
                break;
            case 'status':
                comparison = a.status.localeCompare(b.status);
                break;
            case 'project':
                const projA = a.projects.find(p => p.isPrimary)?.project?.name || '';
                const projB = b.projects.find(p => p.isPrimary)?.project?.name || '';
                comparison = projA.localeCompare(projB);
                break;
            case 'nextUpdate':
                const nextA = a.nextUpdate ? new Date(a.nextUpdate).getTime() : 0;
                const nextB = b.nextUpdate ? new Date(b.nextUpdate).getTime() : 0;
                comparison = nextA - nextB;
                break;
            case 'updated':
                comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
                break;
        }

        return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Calculate pagination
    const totalPages = Math.ceil(sortedCases.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedCases = sortedCases.slice(startIndex, endIndex);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-3xl font-bold text-white">All Cases</h1>
                        {(yearFilter !== 'ALL' || monthFilter !== 'ALL' || sourceFilter !== 'ALL') && (
                            <div className="flex gap-2">
                                {yearFilter !== 'ALL' && <span className="px-2 py-0.5 rounded bg-zeno-blue text-xs text-zeno-cyan border border-zeno-cyan/20">Year: {yearFilter}</span>}
                                {monthFilter !== 'ALL' && <span className="px-2 py-0.5 rounded bg-zeno-blue text-xs text-zeno-cyan border border-zeno-cyan/20">Month: {monthFilter}</span>}
                                {sourceFilter !== 'ALL' && <span className="px-2 py-0.5 rounded bg-zeno-blue text-xs text-zeno-cyan border border-zeno-cyan/20">Source: {sourceFilter}</span>}
                            </div>
                        )}
                    </div>
                    <p className="text-gray-400">
                        Showing {startIndex + 1}-{Math.min(endIndex, filteredCases.length)} of {filteredCases.length}
                        {filteredCases.length !== cases.length && ` (filtered from ${cases.length})`}
                    </p>
                </div>
                <Link
                    href="/cases/new"
                    className="px-6 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-all shadow-lg shadow-zeno-cyan/20"
                >
                    + New Case
                </Link>
            </div>

            {/* Filters */}
            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-4">
                    {/* Search */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Search</label>
                        <SearchWithSuggestions
                            placeholder="File #, ID, Name, Email, Phone..."
                            initialValue={searchTerm}
                            onQueryChange={setSearchTerm}
                        />
                    </div>

                    {/* Category Filter */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Category</label>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value as StatusCategory | 'ALL')}
                            className="w-full px-4 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                        >
                            <option value="ALL">All Categories</option>
                            {STATUS_CATEGORIES.map(cat => (
                                <option key={cat.code} value={cat.code}>{cat.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Status</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full px-4 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                        >
                            <option value="ALL">All Statuses</option>
                            {WORKFLOW_STATUSES.map(status => (
                                <option key={status.code} value={status.code}>{status.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Project Filter */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Project</label>
                        <select
                            value={projectFilter}
                            onChange={(e) => setProjectFilter(e.target.value)}
                            className="w-full px-4 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none"
                        >
                            <option value="ALL">All Projects</option>
                            {allProjects.map(proj => (
                                <option key={proj.id} value={proj.id}>{proj.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Reset Button */}
                    <div className="flex items-end">
                        <button
                            onClick={handleReset}
                            className="w-full px-4 py-2 bg-transparent border border-white/20 text-gray-300 rounded-lg hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-2"
                            title="Reset all filters"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Reset
                        </button>
                    </div>
                </div>
            </div>



            {/* Cases Table */}
            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-zeno-blue/30 border-b border-white/5">
                            <tr>

                                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-12">
                                    #
                                </th>
                                <th
                                    className="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                                    onClick={() => handleSort('fileNumber')}
                                >
                                    <div className="flex items-center gap-2">
                                        File #
                                        {sortBy === 'fileNumber' && (
                                            <span className="text-zeno-cyan">
                                                {sortDirection === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                                    onClick={() => handleSort('client')}
                                >
                                    <div className="flex items-center gap-2">
                                        Client
                                        {sortBy === 'client' && (
                                            <span className="text-zeno-cyan">
                                                {sortDirection === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                                    onClick={() => handleSort('status')}
                                >
                                    <div className="flex items-center gap-2">
                                        Status
                                        {sortBy === 'status' && (
                                            <span className="text-zeno-cyan">
                                                {sortDirection === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                                    onClick={() => handleSort('project')}
                                >
                                    <div className="flex items-center gap-2">
                                        Primary Project
                                        {sortBy === 'project' && (
                                            <span className="text-zeno-cyan">
                                                {sortDirection === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider relative">
                                    <div
                                        className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors select-none"
                                        onClick={() => setShowCaseStatusDropdown(!showCaseStatusDropdown)}
                                    >
                                        Case Status
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                    {showCaseStatusDropdown && (
                                        <div className="absolute top-full left-0 mt-1 bg-zeno-navy border border-white/10 rounded-lg shadow-xl z-50 min-w-[200px]">
                                            <div className="p-3 space-y-2">
                                                {[
                                                    { value: 'ACTIVE', label: 'Active', color: 'text-green-300' },
                                                    { value: 'COMPLETED', label: 'Completed', color: 'text-purple-300' },
                                                    { value: 'CLOSED', label: 'Closed', color: 'text-gray-300' },
                                                    { value: 'CANCELLED', label: 'Cancelled', color: 'text-gray-300' }
                                                ].map(option => (
                                                    <label
                                                        key={option.value}
                                                        className="flex items-center gap-2 cursor-pointer hover:bg-white/5 px-2 py-1 rounded transition-colors"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={caseStatusFilter.has(option.value)}
                                                            onChange={() => toggleCaseStatus(option.value)}
                                                            className="w-4 h-4 rounded border-gray-600 bg-zeno-blue text-zeno-cyan focus:ring-2 focus:ring-zeno-cyan"
                                                        />
                                                        <span className={`text-sm font-medium ${option.color}`}>
                                                            {option.label}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th
                                    className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                                    onClick={() => handleSort('nextUpdate')}
                                >
                                    <div className="flex items-center gap-2">
                                        Next Update
                                        {sortBy === 'nextUpdate' && (
                                            <span className="text-zeno-cyan">
                                                {sortDirection === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                                    onClick={() => handleSort('updated')}
                                >
                                    <div className="flex items-center gap-2">
                                        Last Updated
                                        {sortBy === 'updated' && (
                                            <span className="text-zeno-cyan">
                                                {sortDirection === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {paginatedCases.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                        No cases found matching your filters.
                                    </td>
                                </tr>
                            ) : (
                                paginatedCases.map((c, index) => {
                                    const globalIndex = startIndex + index + 1;
                                    const statusInfo = getStatusInfo(c.status);
                                    const primaryProject = c.projects.find(p => p.isPrimary)?.project;

                                    return (
                                        <tr key={c.id} className="hover:bg-white/5 transition-colors">

                                            <td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-gray-400">
                                                {globalIndex}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <Link
                                                    href={`/cases/${c.id}`}
                                                    className="text-zeno-cyan hover:text-cyan-300 font-medium"
                                                >
                                                    {c.fileNumber}
                                                </Link>
                                            </td>
                                            <td className="px-3 py-2 min-w-[200px]">
                                                <Link
                                                    href={`/cases/${c.id}`}
                                                    className="text-white font-medium hover:text-zeno-cyan transition-colors"
                                                >
                                                    {c.client.firstName} {c.client.lastName}
                                                </Link>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {/* Color-coded status badge */}
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.status === 'COMPLETED'
                                                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                                    : c.status === 'CLOSED' || c.status === 'CANCELLED'
                                                        ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                        : statusInfo.category === 'INTAKE'
                                                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                            : statusInfo.category === 'DOCUMENTATION'
                                                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                                                : statusInfo.category === 'DHS_PROCESS'
                                                                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                                                    : statusInfo.category === 'LEGAL'
                                                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                                        : statusInfo.category === 'DISPUTE'
                                                                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                                                            : statusInfo.category === 'COMPLETION'
                                                                                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                                                                : statusInfo.category === 'PAYMENT'
                                                                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                                                    : statusInfo.category === 'FOLLOW_UP'
                                                                                        ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                                                                                        : statusInfo.category === 'INACTIVE'
                                                                                            ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                                                            : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                    }`}>
                                                    {statusInfo.name}
                                                </span>
                                                {c.nextUpdate && new Date(c.nextUpdate) < new Date() && (
                                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/50">
                                                        OVERDUE
                                                    </span>
                                                )}
                                            </td>
                                            <td
                                                className="px-3 py-2 text-gray-400 text-sm min-w-[250px] break-words"
                                                title={primaryProject?.fullPath || primaryProject?.name || 'None'}
                                            >
                                                {primaryProject?.fullPath || primaryProject?.name || 'None'}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${c.status === 'COMPLETED'
                                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                                    : c.status === 'CLOSED' || c.status === 'CANCELLED'
                                                        ? 'bg-gray-500/20 text-gray-300 border border-gray-500/40'
                                                        : 'bg-green-500/20 text-green-300 border border-green-500/40'
                                                    }`}>
                                                    {c.status === 'COMPLETED' ? 'COMPLETED'
                                                        : c.status === 'CLOSED' ? 'CLOSED'
                                                            : c.status === 'CANCELLED' ? 'CANCELLED'
                                                                : 'ACTIVE'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-sm">
                                                {c.nextUpdate ? (
                                                    <span className={mounted && new Date(c.nextUpdate) < new Date() ? 'text-red-400 font-medium' : 'text-zeno-cyan'}>
                                                        {mounted ? new Date(c.nextUpdate).toLocaleDateString() : ''}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-600">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-gray-400 text-sm">
                                                {mounted ? new Date(c.updatedAt).toLocaleDateString() : ''}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="px-3 py-2 border-t border-white/5 flex items-center justify-between">
                        <div className="text-sm text-gray-400">
                            Page {currentPage} of {totalPages}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 bg-zeno-blue border border-white/10 text-white rounded-lg hover:bg-zeno-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                Previous
                            </button>

                            {/* Page numbers */}
                            <div className="flex gap-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                                    // Show first page, last page, current page, and pages around current
                                    const showPage = page === 1 ||
                                        page === totalPages ||
                                        (page >= currentPage - 1 && page <= currentPage + 1);

                                    if (!showPage) {
                                        // Show ellipsis
                                        if ((page === currentPage - 2 && currentPage > 3) ||
                                            (page === currentPage + 2 && currentPage < totalPages - 2)) {
                                            return <span key={page} className="px-2 py-2 text-gray-500">...</span>;
                                        }
                                        return null;
                                    }

                                    return (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`px-4 py-2 rounded-lg transition-all ${currentPage === page
                                                ? 'bg-zeno-cyan text-zeno-navy font-bold'
                                                : 'bg-zeno-blue border border-white/10 text-white hover:bg-zeno-blue/80'
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 bg-zeno-blue border border-white/10 text-white rounded-lg hover:bg-zeno-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>



        </div>
    );
}

export default function CasesPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        }>
            <CasesContent />
        </Suspense>
    );
}
