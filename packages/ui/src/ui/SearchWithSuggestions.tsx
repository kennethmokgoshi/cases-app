
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

// Minimal status helpers (avoid importing from shared-lib which bundles pdf-image.ts)
// TODO: Move these to a separate package that doesn't include Node.js modules
const STATUS_CATEGORIES = [
    { code: 'INTAKE', name: 'Intake', color: 'bg-blue-500' },
    { code: 'DOCUMENTATION', name: 'Documentation', color: 'bg-yellow-500' },
    { code: 'DHS_PROCESS', name: 'DHS Process', color: 'bg-purple-500' },
    { code: 'LEGAL', name: 'Legal', color: 'bg-red-500' },
    { code: 'DISPUTE', name: 'Dispute', color: 'bg-orange-500' },
    { code: 'COMPLETION', name: 'Completion', color: 'bg-green-500' },
    { code: 'PAYMENT', name: 'Payment', color: 'bg-cyan-500' },
    { code: 'FOLLOW_UP', name: 'Follow Up', color: 'bg-indigo-500' },
    { code: 'INACTIVE', name: 'Inactive', color: 'bg-gray-500' }
];

const getStatusByCode = (code: string) => {
    // Simplified version - just return category based on status code pattern
    let category = 'INTAKE';
    if (code.includes('DOC') || code.includes('OUTSTANDING')) category = 'DOCUMENTATION';
    else if (code.includes('DHS') || code.includes('APPROVED')) category = 'DHS_PROCESS';
    else if (code.includes('COURT') || code.includes('LEGAL')) category = 'LEGAL';
    else if (code.includes('DISPUTE')) category = 'DISPUTE';
    else if (code.includes('COMPLETE') || code.includes('CLOSED')) category = 'COMPLETION';
    else if (code.includes('PAYMENT') || code.includes('PAID')) category = 'PAYMENT';
    else if (code.includes('FOLLOW')) category = 'FOLLOW_UP';
    else if (code.includes('WITHDRAWN') || code.includes('REJECTED')) category = 'INACTIVE';

    return {
        code,
        name: code.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        category,
        description: '',
        slaEnabled: false,
        isOverdueState: false
    };
};

type Suggestion = {
    id: string;
    fileNumber: string;
    clientName: string;
    clientIdNumber: string;
    status: string;
    project: string;
};

type SearchWithSuggestionsProps = {
    placeholder?: string;
    initialValue?: string;
    onSearch?: (term: string) => void;
    onQueryChange?: (term: string) => void;
    className?: string;
};

export function SearchWithSuggestions({
    placeholder = 'Search...',
    initialValue = '',
    onSearch,
    onQueryChange,
    className = ''
}: SearchWithSuggestionsProps) {
    const router = useRouter();
    const [query, setQuery] = useState(initialValue);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setQuery(initialValue);
    }, [initialValue]);

    // Handle clicks outside the component to close suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const fetchSuggestions = async (searchTerm: string) => {
        if (searchTerm.length < 2) {
            setSuggestions([]);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/cases/search?q=${encodeURIComponent(searchTerm)}`);
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data);
                setShowSuggestions(true);
            }
        } catch (error) {
            logger.error('Failed to fetch suggestions', error);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);
        if (onQueryChange) onQueryChange(value);

        // Debounce logic
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        debounceTimeout.current = setTimeout(() => {
            fetchSuggestions(value);
        }, 200); // 200ms debounce
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            setShowSuggestions(false);
            if (onSearch) {
                onSearch(query);
            } else {
                // Default behavior: navigate to results page
                router.push(`/cases?search=${encodeURIComponent(query)}`);
            }
        }
    };

    const handleSelectSuggestion = (id: string) => {
        router.push(`/cases/${id}`);
        setShowSuggestions(false);
    };

    const handleFullSearch = () => {
        setShowSuggestions(false);
        if (onSearch) {
            onSearch(query);
        } else {
            router.push(`/cases?search=${encodeURIComponent(query)}`);
        }
    };

    // Helper to get status color
    const getStatusColor = (statusCode: string) => {
        const status = getStatusByCode(statusCode);
        if (!status) return 'text-gray-500 bg-gray-100';

        const category = STATUS_CATEGORIES.find(c => c.code === status.category);
        const color = category?.color || 'gray';

        // Using standard Tailwind colors
        switch (color) {
            case 'green': return 'text-green-600 bg-green-50';
            case 'blue': return 'text-blue-600 bg-blue-50';
            case 'indigo': return 'text-indigo-600 bg-indigo-50';
            case 'purple': return 'text-purple-600 bg-purple-50';
            case 'yellow': return 'text-yellow-600 bg-yellow-50';
            case 'amber': return 'text-amber-600 bg-amber-50';
            case 'red': return 'text-red-600 bg-red-50';
            case 'cyan': return 'text-cyan-600 bg-cyan-50';
            case 'emerald': return 'text-emerald-600 bg-emerald-50';
            default: return 'text-gray-600 bg-gray-50';
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="relative">
                <input
                    type="text"
                    placeholder={placeholder}
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-zeno-blue/30 text-white text-sm rounded-lg pl-3 pr-8 py-2 border border-white/5 focus:border-zeno-cyan focus:outline-none placeholder-gray-500 transition-colors"
                />

                {query && (
                    <button
                        onClick={() => {
                            setQuery('');
                            setSuggestions([]);
                            setShowSuggestions(false);
                            if (onSearch) onSearch('');
                        }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                        ✕
                    </button>
                )}

                <button
                    onClick={handleFullSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </button>
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && query.length >= 2 && (
                <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden text-left top-full left-0 max-h-96 overflow-y-auto">
                    {/* Header Options similar to screenshot */}
                    <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 border-b border-gray-100 flex justify-between">
                        <span>Search results for <strong>{query}</strong></span>
                    </div>

                    <button
                        onClick={handleFullSearch}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-gray-700 border-b border-gray-100 transition-colors flex justify-between items-center group"
                    >
                        <span>View all results for <strong>{query}</strong></span>
                        <span className="text-gray-400 group-hover:text-gray-600 text-xs text-right">In all projects ↵</span>
                    </button>

                    {loading ? (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">Loading...</div>
                    ) : suggestions.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">No cases found matching "{query}"</div>
                    ) : (
                        suggestions.map((item) => {
                            const statusInfo = getStatusByCode(item.status);

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleSelectSuggestion(item.id)}
                                    className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors flex items-start gap-3 group"
                                >
                                    {/* Initials Circle */}
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-600 flex items-center justify-center text-white text-xs font-bold uppercase mt-0.5">
                                        {item.clientName.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                            {/* Status Badge */}
                                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${getStatusColor(item.status)}`}>
                                                {statusInfo?.name || item.status}
                                            </span>
                                            {/* Client Name & ID */}
                                            <span className="text-sm font-semibold text-gray-900 truncate">
                                                {item.clientName}
                                            </span>
                                            <span className="text-xs text-gray-500 font-mono">
                                                {item.clientIdNumber}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span className="truncate pr-2">{item.project}</span>
                                            <span className="font-mono text-gray-600">#{item.fileNumber}</span>
                                        </div>
                                    </div>

                                    {/* Status Indicator Dot */}
                                    {item.status === 'COMPLETED' || item.status === 'PAID_R350' || item.status === 'FILE_PAID' || item.status === 'WAITING_R350' ? (
                                        <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
                                    ) : (
                                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
