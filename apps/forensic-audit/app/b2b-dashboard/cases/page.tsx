'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
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
    status: string;
    createdAt: string;
    createdById: string;
    projects: Array<{
        project: {
            id: string;
            name: string;
            fullPath?: string;
        };
    }>;
};

export default function B2BMyCasesPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [cases, setCases] = useState<CaseType[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'my_cases' | 'new' | 'in_progress' | 'completed'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const casesPerPage = 20;

    useEffect(() => {
        fetchCases();

        // Read tab from URL parameter
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const tabParam = urlParams.get('tab');
            if (tabParam && ['all', 'my_cases', 'new', 'in_progress', 'completed'].includes(tabParam)) {
                setFilter(tabParam as any);
            }
        }
    }, []);

    useEffect(() => {
        // Reset to page 1 when filter changes
        setCurrentPage(1);
    }, [filter]);

    const fetchCases = async () => {
        try {
            const res = await fetch('/api/cases');
            const data = await res.json();
            setCases(data);
        } catch (error) {
            logger.error('Failed to fetch cases:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            'NEW_LEAD': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
            'PENDING_REVIEW': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
            'APPROVED': 'bg-green-500/10 text-green-400 border-green-500/30',
            'IN_PROGRESS': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
            'COMPLETED': 'bg-purple-500/10 text-purple-400 border-purple-500/30' };
        return colors[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    };

    const formatStatus = (status: string) => {
        return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const yearFilter = searchParams.get('year');
    const monthFilter = searchParams.get('month');
    const projectIdFilter = searchParams.get('projectId');
    const filterParam = searchParams.get('filter');

    const filteredCases = cases.filter(c => {
        // 1. Pre-filter by My Cases if parameter present
        if (filterParam === 'my-cases' && c.createdById !== session?.user?.id) return false;

        // 2. Filter by Year/Month
        if (yearFilter) {
            const date = new Date(c.createdAt);
            if (date.getFullYear().toString() !== yearFilter) return false;
        }
        if (monthFilter) {
            const date = new Date(c.createdAt);
            const monthName = date.toLocaleString('default', { month: 'long' });
            if (monthName !== monthFilter) return false;
        }

        // 3. Filter by Project
        if (projectIdFilter) {
            if (!c.projects?.some(p => p.project.id === projectIdFilter)) return false;
        }

        // 4. Tab Filter
        if (filter === 'all') return true;
        if (filter === 'my_cases') return c.createdById === session?.user?.id;
        if (filter === 'new') return c.status === 'NEW_LEAD';
        if (filter === 'in_progress') return c.status === 'IN_PROGRESS' || c.status === 'APPROVED';
        if (filter === 'completed') return c.status === 'COMPLETED';
        return true;
    });

    // Pagination
    const totalPages = Math.ceil(filteredCases.length / casesPerPage);
    const startIndex = (currentPage - 1) * casesPerPage;
    const endIndex = startIndex + casesPerPage;
    const paginatedCases = filteredCases.slice(startIndex, endIndex);

    const getEmptyStateMessage = () => {
        switch (filter) {
            case 'my_cases':
                return {
                    title: 'No cases uploaded by you',
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
                    <h1 className="text-3xl font-bold text-white mb-2">My Cases</h1>
                    <p className="text-gray-400">View and track all your referrals</p>
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
            <div className="flex gap-2 border-b border-white/10">
                {[
                    { label: 'All Cases', value: 'all' },
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
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(caseItem.status)}`}>
                                        {formatStatus(caseItem.status)}
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <p className="text-gray-400 mb-1">ID Number</p>
                                        <p className="text-white font-medium">{caseItem.client.idNumber}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 mb-1">Phone</p>
                                        <p className="text-white font-medium">{caseItem.client.phone || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 mb-1">Submitted</p>
                                        <p className="text-white font-medium">
                                            {new Date(caseItem.createdAt).toLocaleDateString()}
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
