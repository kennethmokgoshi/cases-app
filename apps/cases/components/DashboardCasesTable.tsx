'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Case = {
    id: string;
    fileNumber: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    client: {
        firstName: string;
        lastName: string;
        idNumber: string;
    };
    projects: Array<{
        isPrimary: boolean;
        project: {
            name: string;
        };
    }>;
};

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DashboardCasesTable() {
    const [cases, setCases] = useState<Case[]>([]);
    const [filteredCases, setFilteredCases] = useState<Case[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchCases() {
            try {
                const response = await fetch('/api/cases');
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        // Get last 10 cases
                        const recentCases = data.slice(0, 10);
                        setCases(recentCases);
                        setFilteredCases(recentCases);
                    } else {
                        console.error('[DASHBOARD] Cases API returned non-array:', data);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch cases:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchCases();
    }, []);

    useEffect(() => {
        if (!searchTerm) {
            setFilteredCases(cases);
            return;
        }

        const term = searchTerm.toLowerCase();
        const filtered = cases.filter(c =>
            c.fileNumber.toLowerCase().includes(term) ||
            `${c.client.firstName} ${c.client.lastName}`.toLowerCase().includes(term) ||
            c.client.idNumber?.toLowerCase().includes(term)
        );
        setFilteredCases(filtered);
    }, [searchTerm, cases]);

    if (loading) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                <h3 className="text-xl font-bold mb-6">Recent Cases</h3>
                <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zeno-cyan"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Recent Cases</h3>
                <Link href="/cases" className="text-zeno-cyan hover:text-cyan-300 text-sm font-medium">
                    View All →
                </Link>
            </div>

            {/* Search Input */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Search cases..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 bg-zeno-navy border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-zeno-cyan focus:outline-none"
                />
            </div>

            {/* Cases Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-zeno-blue/30 border-b border-white/5">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                File #
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                Client
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                Project
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                Services Required
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                Created
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                Last Updated
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredCases.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                    No cases found.
                                </td>
                            </tr>
                        ) : (
                            filteredCases.map((c: any) => (
                                <tr key={c.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <Link
                                            href={`/cases/${c.id}`}
                                            className="text-zeno-cyan hover:text-cyan-300 font-medium"
                                        >
                                            {c.fileNumber}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/cases/${c.id}`}
                                            className="text-white hover:text-zeno-cyan transition-colors"
                                        >
                                            {c.client.firstName} {c.client.lastName}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                            {c.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-sm">
                                        {c.projects.find((p: any) => p.isPrimary)?.project.name || 'None'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-sm">
                                        {c.services || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-sm whitespace-nowrap">
                                        {c.createdAt ? formatDate(c.createdAt) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-sm whitespace-nowrap">
                                        {c.updatedAt ? formatDate(c.updatedAt) : '-'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
