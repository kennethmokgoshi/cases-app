'use client';

import { useState, useEffect } from 'react';
import {
    DestinationProject,
    flattenProjectResponse,
    filterSourcesByClientType,
    getSubprojects
} from './destination-path-logic';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

type Project = DestinationProject;

interface DestinationPathSelectorProps {
    onChange: (targetProjectId: string | null, details: { year: string; month: string; sourceId: string; subprojectId?: string }) => void;
    onError: (error: string) => void;
    onLoading: (isLoading: boolean) => void;
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export function DestinationPathSelector({ onChange, onError, onLoading }: DestinationPathSelectorProps) {
    const currentYearVal = new Date().getFullYear();
    const currentMonthVal = new Date().toLocaleString('default', { month: 'long' });
    const years = Array.from({ length: currentYearVal - 1999 }, (_, i) => currentYearVal - i);

    const [fetchingProjects, setFetchingProjects] = useState(true);
    const [parentProjects, setParentProjects] = useState<Project[]>([]);
    const [allProjects, setAllProjects] = useState<Project[]>([]);

    const [selectedYear, setSelectedYear] = useState(String(currentYearVal));
    const [selectedMonth, setSelectedMonth] = useState(currentMonthVal);
    const [acquisitionType, setAcquisitionType] = useState<'B2B' | 'B2C'>('B2B');
    const [selectedParentId, setSelectedParentId] = useState('');
    const [selectedSubprojectId, setSelectedSubprojectId] = useState('');

    useEffect(() => {
        setFetchingProjects(true);
        onLoading(true);
        fetch('/api/projects')
            .then(res => res.json())
            .then(data => {
                // Flat list of every visible project — needed to walk descendants
                // for the subproject dropdown (works for both the admin nested
                // hierarchy and the member-scoped flat response).
                const flat = flattenProjectResponse(data.hierarchy, data.independent);
                setAllProjects(flat);
                setParentProjects(flat.filter(p => p.type === 'ACQUISITION_SOURCE'));
            })
            .catch(err => {
                logger.error('Failed to load projects', err);
                onError('Failed to load project hierarchy');
            })
            .finally(() => {
                setFetchingProjects(false);
                onLoading(false);
            });
    }, []);

    useEffect(() => {
        setSelectedParentId('');
        setSelectedSubprojectId('');
    }, [acquisitionType]);

    useEffect(() => {
        setSelectedSubprojectId('');
    }, [selectedParentId]);

    useEffect(() => {
        // Find existing target if possible, or just report the components
        // The actual creation happens on "Execute", but we can report the selection state
        if (selectedParentId && selectedYear && selectedMonth) {
            onChange(null, {
                year: selectedYear,
                month: selectedMonth,
                sourceId: selectedParentId,
                subprojectId: selectedSubprojectId || undefined
            });
        } else {
            onChange(null, { year: selectedYear, month: selectedMonth, sourceId: '' });
        }
    }, [selectedYear, selectedMonth, selectedParentId, selectedSubprojectId]);

    const filteredParentProjects = filterSourcesByClientType(parentProjects, acquisitionType);

    const subprojects = selectedParentId ? getSubprojects(selectedParentId, allProjects) : [];

    if (fetchingProjects) {
        return <div className="flex items-center justify-center py-8 text-gray-400">Loading hierarchy...</div>;
    }

    return (
        <div className="space-y-6">
            {/* 1. Year & Month */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                        1. Year <span className="text-red-400">*</span>
                    </label>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="w-full px-4 py-3 bg-zeno-blue border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none transition-all"
                    >
                        <option value="">Select year...</option>
                        {years.map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                        2. Month <span className="text-red-400">*</span>
                    </label>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full px-4 py-3 bg-zeno-blue border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none transition-all"
                    >
                        <option value="">Select month...</option>
                        {MONTHS.map(month => (
                            <option key={month} value={month}>{month}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 2. Source Type */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">
                    3. Client Source Type <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={() => setAcquisitionType('B2B')}
                        className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all group ${acquisitionType === 'B2B'
                            ? 'bg-indigo-600/30 border-indigo-500 text-white'
                            : 'bg-zeno-blue border-white/10 text-gray-400 hover:border-white/30'
                            }`}
                    >
                        <div className="text-sm font-semibold">B2B (Partner)</div>
                        <div className="text-[10px] mt-1 opacity-70 group-hover:opacity-100 italic">Letsatsi, etc.</div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setAcquisitionType('B2C')}
                        className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all group ${acquisitionType === 'B2C'
                            ? 'bg-cyan-600/30 border-cyan-500 text-white'
                            : 'bg-zeno-blue border-white/10 text-gray-400 hover:border-white/30'
                            }`}
                    >
                        <div className="text-sm font-semibold">B2C (Private)</div>
                        <div className="text-[10px] mt-1 opacity-70 group-hover:opacity-100 italic">Direct</div>
                    </button>
                </div>
            </div>

            {/* 3. Main Source */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                    4. Main Source <span className="text-red-400">*</span>
                </label>
                <select
                    value={selectedParentId}
                    onChange={(e) => setSelectedParentId(e.target.value)}
                    className="w-full px-4 py-3 bg-zeno-blue border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none transition-all"
                >
                    <option value="">Choose main source...</option>
                    {filteredParentProjects.map(p => (
                        <option key={p.id} value={p.id}>
                            {p.name} {p.clientType && `(${p.clientType})`}
                        </option>
                    ))}
                </select>
            </div>

            {/* 4. Subproject (Optional) */}
            {selectedParentId && subprojects.length > 0 && (
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                        5. Branch/Subproject <span className="text-gray-500">(Optional)</span>
                    </label>
                    <select
                        value={selectedSubprojectId}
                        onChange={(e) => setSelectedSubprojectId(e.target.value)}
                        className="w-full px-4 py-3 bg-zeno-blue border border-white/10 rounded-lg text-white focus:border-zeno-cyan focus:outline-none transition-all"
                    >
                        <option value="">No subproject (use main source)</option>
                        {subprojects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
}
