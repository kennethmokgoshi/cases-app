'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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


type PartnerCase = {
    id: string;
    fileNumber: string;
    clientName: string;
    status: string;
    createdAt: string;
};

type PartnerStats = {
    totalCases: number;
    activeCases: number;
    completedCases: number;
    pendingCases: number;
    newLeads: number;
    newLeadsLast7Days: number;
    completedLast7Days: number;
    myCases: number;
    recentCases: PartnerCase[];
};

export default function B2BDashboard() {
    const { data: session } = useSession();
    const [stats, setStats] = useState<PartnerStats>({
        totalCases: 0,
        activeCases: 0,
        completedCases: 0,
        pendingCases: 0,
        newLeads: 0,
        newLeadsLast7Days: 0,
        completedLast7Days: 0,
        myCases: 0,
        recentCases: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        // Check for success message
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('success') === 'lead_created') {
                setShowSuccess(true);
                // Clear the URL param
                window.history.replaceState({}, '', '/b2b-dashboard');
                // Auto-hide after 5 seconds
                setTimeout(() => setShowSuccess(false), 5000);
            }
        }
    }, []);

    useEffect(() => {
        if (session?.user) {
            fetchPartnerData();
        }
    }, [session]);

    const fetchPartnerData = async () => {
        setError(null);
        try {
            const res = await fetch('/api/b2b-dashboard/stats');
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const detail = body.detail || body.error || `Status: ${res.status}`;
                throw new Error(`Database Error: Unable to load dashboard (${detail})`);
            }
            const data = await res.json();
            setStats(data);
        } catch (error: any) {
            logger.error('Failed to fetch partner data:', error);
            setError(error.message || 'Connection Failure');
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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-white">Loading...</div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Success Message */}
            {showSuccess && (
                <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-4 flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <p className="font-medium text-green-400">Lead Created Successfully!</p>
                        <p className="text-sm text-green-300">Your referral has been submitted. Our team will follow up within 1 business day.</p>
                    </div>
                </div>
            )}

            {/* Welcome Section */}
            <div className="bg-gradient-to-br from-zeno-gray to-zeno-navy border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-3xl font-bold text-white">Welcome, {session?.user?.firstName}</h1>
                        </div>
                        <p className="text-gray-400">Track and manage your referred cases with Zenowethu</p>
                    </div>

                    {/* Role Badge - Larger and More Prominent */}
                    <div className="flex items-center gap-3">
                        {session?.user?.isAdmin ? (
                            <div className="bg-gradient-to-br from-red-500 to-red-600 px-6 py-3 rounded-xl shadow-lg shadow-red-500/20">
                                <div className="flex items-center gap-2">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    <div>
                                        <p className="text-xs text-white/80 uppercase tracking-wide">Role</p>
                                        <p className="text-lg font-bold text-white">Administrator</p>
                                    </div>
                                </div>
                            </div>
                        ) : session?.user?.isManager ? (
                            <div className="bg-gradient-to-br from-purple-500 to-purple-600 px-6 py-3 rounded-xl shadow-lg shadow-purple-500/20">
                                <div className="flex items-center gap-2">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    <div>
                                        <p className="text-xs text-white/80 uppercase tracking-wide">Role</p>
                                        <p className="text-lg font-bold text-white">Manager</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-gradient-to-br from-blue-500 to-blue-600 px-6 py-3 rounded-xl shadow-lg shadow-blue-500/20">
                                <div className="flex items-center gap-2">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <div>
                                        <p className="text-xs text-white/80 uppercase tracking-wide">Role</p>
                                        <p className="text-lg font-bold text-white">Member</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Organization Badge */}
                        <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-xl">
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Organization</p>
                            <p className="text-sm font-semibold text-white">{session?.user?.organization || 'Zenowethu'}</p>
                        </div>
                    </div>
                </div>

                {/* Manager/Admin Info Banner */}
                {(session?.user?.isManager || session?.user?.isAdmin) && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-zeno-cyan/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-semibold text-white mb-1">
                                    {session?.user?.isAdmin ? 'Administrator Privileges' : 'Manager Privileges'}
                                </h3>
                                <p className="text-xs text-gray-400">
                                    {session?.user?.isAdmin
                                        ? 'You have full system access including user management, advanced reporting, and all dashboard features.'
                                        : 'You can access team reporting and view performance metrics for your team members.'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
                {/* Database Error Banner */}
                {error && (
                    <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <h4 className="text-white font-semibold text-sm">Database Connection Issue</h4>
                            <p className="text-gray-400 text-xs">{error}</p>
                        </div>
                        <button
                            onClick={() => fetchPartnerData()}
                            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded-lg transition-colors border border-red-500/30"
                        >
                            Retry Connection
                        </button>
                    </div>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Cases */}
                <Link href="/b2b-dashboard/cases" className="bg-zeno-gray border border-white/10 rounded-xl p-6 hover:border-zeno-cyan/50 hover:shadow-lg hover:shadow-zeno-cyan/10 transition-all cursor-pointer group block">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400 group-hover:text-zeno-cyan transition-colors">Total Referrals</h3>
                        <div className="w-12 h-12 bg-zeno-cyan/10 rounded-lg flex items-center justify-center group-hover:bg-zeno-cyan/20 transition-colors">
                            <svg className="w-6 h-6 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-white">{stats.totalCases}</p>
                </Link>

                {/* Active Cases */}
                <Link href="/b2b-dashboard/cases?status=active" className="bg-zeno-gray border border-white/10 rounded-xl p-6 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 transition-all cursor-pointer group block">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400 group-hover:text-blue-400 transition-colors">Active Referrals</h3>
                        <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-white">{stats.activeCases}</p>
                </Link>

                {/* Pending Documents */}
                <Link href="/b2b-dashboard/cases?status=pending" className="bg-zeno-gray border border-white/10 rounded-xl p-6 hover:border-yellow-500/50 hover:shadow-lg hover:shadow-yellow-500/10 transition-all cursor-pointer group block">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400 group-hover:text-yellow-400 transition-colors">Pending Documents</h3>
                        <div className="w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center group-hover:bg-yellow-500/20 transition-colors">
                            <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-white">{stats.pendingCases}</p>
                </Link>

                {/* My Cases */}
                <Link href="/b2b-dashboard/cases?tab=my_cases" className="bg-zeno-gray border border-zeno-cyan/30 rounded-xl p-6 hover:border-zeno-cyan/60 hover:shadow-lg hover:shadow-zeno-cyan/10 transition-all cursor-pointer group block">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400 group-hover:text-zeno-cyan transition-colors">My Cases</h3>
                        <div className="w-12 h-12 bg-zeno-cyan/10 rounded-lg flex items-center justify-center group-hover:bg-zeno-cyan/20 transition-colors">
                            <svg className="w-6 h-6 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-white">{stats.myCases}</p>
                    <p className="text-xs text-gray-500 mt-2">Cases you uploaded</p>
                </Link>

                {/* Completed */}
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400">Completed</h3>
                        <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-white">{stats.completedCases}</p>
                </div>

                {/* New Leads */}
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400">New Leads</h3>
                        <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-white">{stats.newLeads}</p>
                </div>

                {/* New Leads Last 7 Days */}
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400">New (Past 7 Days)</h3>
                        <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-white">{stats.newLeadsLast7Days}</p>
                </div>

                {/* Completed Last 7 Days */}
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400">Completed (Past 7 Days)</h3>
                        <div className="w-12 h-12 bg-teal-500/10 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.6 1.4A8.967 8.967 0 0121 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9c2.5 0 4.75 1 6.4 2.6" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-white">{stats.completedLast7Days}</p>
                </div>
            </div>

            {/* Reporting Buttons - For Managers */}
            {(session?.user?.isManager || session?.user?.isAdmin) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Team Reporting */}
                    <Link
                        href="/b2b-dashboard/reporting"
                        className="bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-600 rounded-xl p-6 transition-all transform hover:scale-105"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white mb-1">📊 Team Reporting</h3>
                                <p className="text-white/80 text-sm">View team performance & analytics</p>
                            </div>
                        </div>
                    </Link>

                    {/* Advanced Reports */}
                    <Link
                        href="/b2b-dashboard/reports"
                        className="bg-gradient-to-br from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-600 rounded-xl p-6 transition-all transform hover:scale-105"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white mb-1">📈 Advanced Reports</h3>
                                <p className="text-white/80 text-sm">Advanced analytics & insights</p>
                            </div>
                        </div>
                    </Link>
                </div>
            )}

            {/* Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Submit New Referral */}
                <Link
                    href="/b2b-dashboard/cases/new"
                    className="bg-gradient-to-br from-zeno-cyan to-cyan-600 hover:from-cyan-600 hover:to-zeno-cyan rounded-xl p-8 transition-all transform hover:scale-105 group"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center">
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-zeno-navy mb-1">Submit New Referral</h3>
                            <p className="text-zeno-navy/80">Start a new case for a client</p>
                        </div>
                    </div>
                </Link>

                {/* Contact Support */}
                <div className="bg-zeno-gray border border-white/10 rounded-xl p-8">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-white/5 rounded-lg flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white mb-1">Contact Support</h3>
                            <p className="text-gray-400">support@zenowethu.co.za</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Cases */}
            <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">Recent Referrals</h2>
                    <Link
                        href="/b2b-dashboard/cases"
                        className="text-zeno-cyan hover:text-cyan-400 text-sm font-medium transition-colors"
                    >
                        View All
                    </Link>
                </div>

                {stats.recentCases.length === 0 ? (
                    <div className="text-center py-12">
                        <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="text-lg font-bold text-white mb-2">No Referrals Yet</h3>
                        <p className="text-gray-400 mb-6">You haven't submitted any referrals yet. Get started by submitting your first client case.</p>
                        <Link
                            href="/b2b-dashboard/cases/new"
                            className="inline-flex items-center gap-2 bg-zeno-cyan hover:bg-cyan-600 text-zeno-navy font-bold px-6 py-3 rounded-lg transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Submit Your First Referral
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {stats.recentCases.map(c => (
                            <Link
                                key={c.id}
                                href={`/b2b-dashboard/cases/${c.id}`}
                                className="block p-4 bg-zeno-navy hover:bg-zeno-navy/80 rounded-lg transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium text-white">{c.clientName}</p>
                                        <p className="text-sm text-gray-400">{c.fileNumber}</p>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(c.status)}`}>
                                        {formatStatus(c.status)}
                                    </span>
                                </div>
                            </Link>
                        ))}
                        <Link
                            href="/b2b-dashboard/cases"
                            className="block text-center py-3 text-zeno-cyan hover:text-cyan-400 text-sm font-medium transition-colors"
                        >
                            View All Referrals →
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}

