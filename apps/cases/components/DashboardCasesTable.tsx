'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    SortableCase,
    SortColumn,
    SortState,
    formatCaseDate,
    formatServiceLabel,
    getPrimaryProjectLabel,
    nextSortState,
    parseServices,
    searchCases,
    sortCases,
} from '../lib/case-table-sort';

type Case = SortableCase;

const COLUMNS: Array<{ key: SortColumn; label: string; nowrap?: boolean }> = [
    { key: 'fileNumber', label: 'File #', nowrap: true },
    { key: 'client', label: 'Client' },
    { key: 'status', label: 'Status' },
    { key: 'project', label: 'Project' },
    { key: 'type', label: 'Type' },
    { key: 'created', label: 'Created', nowrap: true },
    { key: 'updated', label: 'Last Updated', nowrap: true },
];

export function DashboardCasesTable() {
    const [cases, setCases] = useState<Case[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sort, setSort] = useState<SortState>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchCases() {
            try {
                const response = await fetch('/api/cases');
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        // Get last 10 cases
                        setCases(data.slice(0, 10));
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

    const visibleCases = useMemo(
        () => sortCases(searchCases(cases, searchTerm), sort),
        [cases, searchTerm, sort]
    );

    const handleHeaderClick = (column: SortColumn) => {
        setSort((current) => nextSortState(current, column));
    };

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
                <table className="w-full text-xs">
                    <thead className="bg-zeno-blue/30 border-b border-white/5">
                        <tr>
                            {COLUMNS.map(({ key, label, nowrap }) => {
                                const isSorted = sort?.column === key;
                                const direction = isSorted ? sort.direction : undefined;
                                return (
                                    <th
                                        key={key}
                                        aria-sort={
                                            direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
                                        }
                                        className={`px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider ${nowrap ? 'whitespace-nowrap' : ''}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleHeaderClick(key)}
                                            title={`Sort by ${label}`}
                                            className={`inline-flex items-center gap-1 uppercase tracking-wider font-semibold transition-colors ${
                                                isSorted ? 'text-zeno-cyan' : 'text-gray-400 hover:text-white'
                                            }`}
                                        >
                                            {label}
                                            <span className="text-[10px] leading-none">
                                                {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '⇅'}
                                            </span>
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {visibleCases.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-2 py-8 text-center text-gray-500">
                                    No cases found.
                                </td>
                            </tr>
                        ) : (
                            visibleCases.map((c) => {
                                const projectLabel = getPrimaryProjectLabel(c);
                                const services = parseServices(c.services);
                                return (
                                    <tr key={c.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-2 py-2 whitespace-nowrap">
                                            <Link
                                                href={`/cases/${c.id}`}
                                                className="text-zeno-cyan hover:text-cyan-300 font-medium"
                                            >
                                                {c.fileNumber}
                                            </Link>
                                        </td>
                                        <td className="px-2 py-2 whitespace-nowrap">
                                            <Link
                                                href={`/cases/${c.id}`}
                                                className="text-white hover:text-zeno-cyan transition-colors"
                                            >
                                                {c.client.firstName} {c.client.lastName}
                                            </Link>
                                        </td>
                                        <td className="px-2 py-2 whitespace-nowrap">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                                {c.status}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2 text-gray-400 text-xs">
                                            {projectLabel || <span className="text-gray-600 italic">—</span>}
                                        </td>
                                        <td className="px-2 py-2">
                                            {services.length === 0 ? (
                                                <span className="text-gray-500">—</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {services.map((s) => (
                                                        <span
                                                            key={s}
                                                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 whitespace-nowrap"
                                                        >
                                                            {formatServiceLabel(s)}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-2 py-2 text-gray-400 whitespace-nowrap">
                                            {c.createdAt ? formatCaseDate(c.createdAt) : '-'}
                                        </td>
                                        <td className="px-2 py-2 text-gray-400 whitespace-nowrap">
                                            {c.updatedAt ? formatCaseDate(c.updatedAt) : '-'}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
