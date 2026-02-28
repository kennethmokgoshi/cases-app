'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

type ReportingData = {
    teamStats: {
        totalCases: number;
        activeCases: number;
        completedCases: number;
        pendingDocuments: number;
    };
    teamMembers: Array<{
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        casesCreated: number;
    }>;
    recentActivity: Array<{
        id: string;
        caseFileNumber: string;
        action: string;
        user: string;
        timestamp: string;
    }>;
};

export default function B2BReportingPage() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(true);
    const [reportingData, setReportingData] = useState<ReportingData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!session) return;
        fetchReportingData();
    }, [session]);

    const fetchReportingData = async () => {
        try {
            const response = await fetch('/api/b2b/reporting');
            if (!response.ok) {
                if (response.status === 403) {
                    setError('Access denied. Manager role required.');
                } else {
                    setError('Failed to load reporting data');
                }
                setLoading(false);
                return;
            }
            const data = await response.json();
            setReportingData(data);
        } catch (err) {
            setError('An error occurred while loading reporting data');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zeno-dark p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-white text-xl">Loading reporting data...</div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-zeno-dark p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                        <h2 className="text-xl font-bold text-red-400 mb-4">⚠️ {error}</h2>
                        <Link
                            href="/b2b-dashboard"
                            className="inline-block px-6 py-2 bg-zeno-cyan hover:bg-zeno-cyan/80 text-white rounded-lg transition-colors"
                        >
                            ← Back to Dashboard
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (!reportingData) {
        return null;
    }

    return (
        <div className="min-h-screen bg-zeno-dark p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/b2b-dashboard"
                        className="inline-flex items-center text-zeno-cyan hover:text-zeno-cyan/80 transition-colors mb-4"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Dashboard
                    </Link>

                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-2">📊 Team Reporting</h1>
                            <p className="text-gray-400">Performance metrics and team analytics</p>
                        </div>
                    </div>
                </div>

                {/* Team Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-gray-400">Total Cases</h3>
                            <div className="w-12 h-12 bg-zeno-cyan/10 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-4xl font-bold text-white">{reportingData.teamStats.totalCases}</p>
                    </div>

                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-gray-400">Active Cases</h3>
                            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-4xl font-bold text-white">{reportingData.teamStats.activeCases}</p>
                    </div>

                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-gray-400">Completed</h3>
                            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-4xl font-bold text-white">{reportingData.teamStats.completedCases}</p>
                    </div>

                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-gray-400">Pending Docs</h3>
                            <div className="w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-4xl font-bold text-white">{reportingData.teamStats.pendingDocuments}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Team Members Performance */}
                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                            <svg className="w-6 h-6 mr-2 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            Team Performance
                        </h2>
                        <div className="space-y-3">
                            {reportingData.teamMembers.map((member) => (
                                <div key={member.id} className="flex items-center justify-between bg-black/20 rounded-lg p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zeno-cyan to-cyan-600 flex items-center justify-center">
                                            <span className="text-white font-bold text-sm">
                                                {member.firstName[0]}{member.lastName[0]}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">{member.firstName} {member.lastName}</p>
                                            <p className="text-sm text-gray-400">{member.email}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-bold text-zeno-cyan">{member.casesCreated}</p>
                                        <p className="text-xs text-gray-400">cases</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="bg-zeno-gray border border-white/10 rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                            <svg className="w-6 h-6 mr-2 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Recent Activity
                        </h2>
                        <div className="space-y-3">
                            {reportingData.recentActivity.length === 0 ? (
                                <p className="text-gray-400 text-center py-8">No recent activity</p>
                            ) : (
                                reportingData.recentActivity.map((activity) => (
                                    <div key={activity.id} className="flex items-start gap-3 pb-3 border-b border-white/10 last:border-0">
                                        <div className="w-2 h-2 mt-2 rounded-full bg-zeno-cyan flex-shrink-0"></div>
                                        <div className="flex-1">
                                            <p className="text-white text-sm">
                                                {activity.action} <span className="text-zeno-cyan">{activity.caseFileNumber}</span>
                                            </p>
                                            <p className="text-xs text-gray-400 mt-1">
                                                {activity.user} • {new Date(activity.timestamp).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
