'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@zenowethu/ui';
import { 
    STATUS_CATEGORIES, 
    getStatusByCode, 
    formatStatus as sharedFormatStatus 
} from '@zenowethu/shared-lib';

// Client-side logger
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

type CaseType = {
    id: string;
    fileNumber: string;
    client: {
        firstName: string;
        lastName: string;
        idNumber: string;
        phone: string;
    };
    jointClient?: {
        firstName: string;
        lastName: string;
    } | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    createdById: string;
    projects: Array<{
        project: {
            id: string;
            name: string;
            fullPath?: string;
        };
    }>;
};

function formatDateTime(iso: string): string {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date} ${time}`;
}

export default function B2BMyCasesPage() {
    return (
        <Suspense fallback={<div className="text-white flex items-center justify-center min-h-screen">Loading cases...</div>}>
            <B2BMyCasesComponent />
        </Suspense>
    );
}

function B2BMyCasesComponent() {
    const router = useRouter();
    const { data: session } = useSession();
    const [cases, setCases] = useState<CaseType[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'my_cases' | 'new' | 'in_progress' | 'completed'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const casesPerPage = 20;

    const searchParams = useSearchParams();
    const yearFilter = searchParams.get('year');
    const monthFilter = searchParams.get('month');
    const projectIdFilter = searchParams.get('projectId');
    const projectIdsFilter = searchParams.get('projectIds');
    const filterParam = searchParams.get('filter');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['all', 'my_cases', 'new', 'in_progress', 'completed'].includes(tab)) {
            setFilter(tab as any);
        } else {
            setFilter('all');
        }
        fetchCases();
    }, [searchParams]);

    useEffect(() => {
        // Reset to page 1 when filter or search params change
        setCurrentPage(1);
    }, [filter, searchParams]);

    const fetchCases = async () => {
        try {
            setLoading(true);
            // Request more cases to avoid truncation (e.g., 1000)
            const params = new URLSearchParams(searchParams.toString());
            if (!params.has('take')) params.set('take', '1000');
            
            const res = await fetch(`/api/cases?${params.toString()}`);
            const data = await res.json();
            
            if (res.ok && Array.isArray(data)) {
                setCases(data);
            } else {
                logger.error(`API Error (${res.status}):`, data);
                setCases([]);
            }
        } catch (error) {
            logger.error('Failed to fetch cases:', error);
            setCases([]);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        const statusObj = getStatusByCode(status);
        const category = statusObj?.category || 'BEGINNING';
        const catConfig = STATUS_CATEGORIES.find(c => c.code === category);
        
        const colors: Record<string, string> = {
            'blue': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            'red': 'bg-red-500/10 text-red-400 border-red-500/20',
            'cyan': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
            'orange': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
            'indigo': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
            'amber': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            'teal': 'bg-teal-500/10 text-teal-400 border-teal-500/20',
            'green': 'bg-green-500/10 text-green-400 border-green-500/20',
            'gray': 'bg-gray-500/10 text-gray-400 border-gray-500/20',
            'emerald': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };

        return colors[catConfig?.color || 'gray'] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    };

    const formatStatus = (status: string) => {
        return sharedFormatStatus(status);
    };

    const projectIdsSet = projectIdsFilter ? new Set(projectIdsFilter.split(',').filter(Boolean)) : null;

    const filteredCases = Array.isArray(cases) ? cases.filter(c => {
        const statusObj = getStatusByCode(c.status);
        const category = statusObj?.category;

        // Tab Filter
        if (filter === 'all') return true;
        if (filter === 'my_cases') return c.createdById === session?.user?.id;
        if (filter === 'new') return category === 'BEGINNING';
        if (filter === 'in_progress') return ['IN_PROGRESS', 'DETOUR', 'ADVANCED', 'ADVANCED_DETOUR', 'ADVANCED_PROGRESS', 'PAYING'].includes(category as string);
        if (filter === 'completed') return ['COMPLETED', 'SETTLED'].includes(category as string);
        return true;
    }) : [];

    // Pagination
    const totalPages = Math.ceil(filteredCases.length / casesPerPage);
    const startIndex = (currentPage - 1) * casesPerPage;
    const endIndex = startIndex + casesPerPage;
    const paginatedCases = filteredCases.slice(startIndex, endIndex);

    const getEmptyStateMessage = () => {
        switch (filter) {
            case 'my_cases':
                return {
                    title: 'No referrals uploaded by you',
                    description: 'You haven\'t submitted any referrals yet' };
            case 'new':
                return {
                    title: 'No new leads',
                    description: 'You don\'t have any new leads at the moment' };
            case 'in_progress':
                return {
                    title: 'No cases in progress',
                    description: 'You don\'t have any active cases being processed' };
            case 'completed':
                return {
                    title: 'No completed cases',
                    description: 'You don\'t have any completed cases yet' };
            default:
                return {
                    title: 'No cases found',
                    description: 'You haven\'t submitted any referrals yet' };
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-white">Loading cases...</div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-3xl font-bold text-white">
                            {monthFilter || yearFilter || projectIdFilter || projectIdsFilter 
                                ? 'Filtered Referrals' 
                                : filter === 'my_cases' ? 'My Cases' : 'All Referrals'}
                        </h1>
                        <span className="bg-zeno-cyan/20 text-zeno-cyan px-2.5 py-1 rounded-full text-sm font-bold border border-zeno-cyan/30">
                            {filteredCases.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <p className="text-gray-400">View and track all your referrals</p>
                        {(monthFilter || yearFilter || projectIdFilter || projectIdsFilter) && (
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600">•</span>
                                <div className="flex gap-1.5">
                                    {yearFilter && (
                                        <span className="bg-white/5 text-zeno-cyan px-2 py-0.5 rounded text-xs border border-white/10">
                                            {yearFilter}
                                        </span>
                                    )}
                                    {monthFilter && (
                                        <span className="bg-white/5 text-zeno-cyan px-2 py-0.5 rounded text-xs border border-white/10">
                                            {monthFilter}
                                        </span>
                                    )}
                                    {(projectIdFilter || projectIdsFilter) && (
                                        <span className="bg-white/5 text-zeno-cyan px-2 py-0.5 rounded text-xs border border-white/10">
                                            Project Filter Active
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => router.push('/b2b-dashboard/cases')}
                                    className="text-[10px] text-gray-500 hover:text-white transition-colors"
                                >
                                    Clear Filters
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => router.push('/b2b-dashboard/cases/new')}
                    className="bg-zeno-cyan hover:bg-cyan-600 text-zeno-navy font-bold px-6 py-3 rounded-lg transition-all flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Referral
                </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center justify-between border-b border-white/10">
                <div className="flex gap-2">
                    {[
                        { label: 'All Referrals', value: 'all' },
                        { label: 'My Cases', value: 'my_cases' },
                        { label: 'New Leads', value: 'new' },
                        { label: 'In Progress', value: 'in_progress' },
                        { label: 'Completed', value: 'completed' },
                    ].map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => setFilter(tab.value as any)}
                            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${filter === tab.value
                                ? 'text-zeno-cyan border-zeno-cyan'
                                : 'text-gray-400 border-transparent hover:text-white'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="text-sm text-gray-500 pb-2">
                    <span className="text-white font-bold">{filteredCases.length}</span> {filteredCases.length === 1 ? 'referral' : 'referrals'} found
                </div>
            </div>

            {/* Cases List */}
            {filteredCases.length === 0 ? (
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-12 text-center">
                    <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="text-xl font-bold text-white mb-2">{getEmptyStateMessage().title}</h3>
                    <p className="text-gray-400">{getEmptyStateMessage().description}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid gap-4">
                        {paginatedCases.map(caseItem => (
                            <div
                                key={caseItem.id}
                                className="bg-zeno-gray border border-white/10 hover:border-zeno-cyan/30 rounded-xl p-6 transition-all cursor-pointer"
                                onClick={() => router.push(`/b2b-dashboard/cases/${caseItem.id}`)}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-white">
                                            {caseItem.client.firstName} {caseItem.client.lastName}
                                        </h3>
                                        <p className="text-sm text-gray-400">{caseItem.fileNumber}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${caseItem.jointClient ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                            {caseItem.jointClient ? 'Joint' : 'Single'}
                                        </span>
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(caseItem.status)}`}>
                                            {formatStatus(caseItem.status)}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 gap-4 text-sm">
                                    <div>
                                        <p className="text-gray-400 mb-1">ID Number</p>
                                        <p className="text-white font-medium">{caseItem.client.idNumber}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 mb-1">Phone</p>
                                        <p className="text-white font-medium">{caseItem.client.phone || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 mb-1">Created</p>
                                        <p className="text-white font-medium">
                                            {caseItem.createdAt ? formatDateTime(caseItem.createdAt) : '-'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 mb-1">Last Updated</p>
                                        <p className="text-white font-medium">
                                            {caseItem.updatedAt ? formatDateTime(caseItem.updatedAt) : '-'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-white/10 pt-6">
                            <p className="text-sm text-gray-400">
                                Showing {startIndex + 1} to {Math.min(endIndex, filteredCases.length)} of {filteredCases.length} cases
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-4 py-2 bg-zeno-gray border border-white/10 rounded-lg text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Previous
                                </button>

                                <div className="flex gap-1">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-10 h-10 rounded-lg font-medium transition-colors ${currentPage === page
                                                ? 'bg-zeno-cyan text-zeno-navy'
                                                : 'bg-zeno-gray border border-white/10 text-white hover:bg-white/5'
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-4 py-2 bg-zeno-gray border border-white/10 rounded-lg text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
