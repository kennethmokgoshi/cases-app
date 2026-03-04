'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

// Client-side logger
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

type SearchResult = {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    idNumber: string;
    phone: string | null;
    email: string | null;
    latestCase: {
        id: string;
        fileNumber: string;
        status: string;
    } | null;
    totalCases: number;
};

export default function B2BClientSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounced search
    const searchClients = useCallback(async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/b2b/clients/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || data.error || 'Search failed');
            }

            setResults(data.clients || []);
            setIsOpen(true);
            setSelectedIndex(-1);
        } catch (err: any) {
            logger.error('Search error:', err);
            setError(err.message || 'Failed to search clients');
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Handle input change with debounce
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            searchClients(value);
        }, 300);
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < results.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && results[selectedIndex]?.latestCase) {
                    window.location.href = `/b2b-dashboard/cases/${results[selectedIndex].latestCase.id}`;
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setSelectedIndex(-1);
                break;
        }
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            'COMPLETED': 'bg-green-500/20 text-green-400',
            'NEW_LEAD': 'bg-blue-500/20 text-blue-400',
            'IN_PROGRESS': 'bg-cyan-500/20 text-cyan-400',
            'Outstanding Documents': 'bg-yellow-500/20 text-yellow-400',
            'APPROVED': 'bg-green-500/20 text-green-400' };
        return colors[status] || 'bg-gray-500/20 text-gray-400';
    };

    const formatStatus = (status: string) => {
        return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const highlightMatch = (text: string, searchTerm: string) => {
        if (!searchTerm) return text;
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) =>
            regex.test(part) ? (
                <span key={i} className="text-zeno-cyan font-semibold">{part}</span>
            ) : (
                <span key={i}>{part}</span>
            )
        );
    };

    return (
        <div ref={searchRef} className="relative w-full">
            {/* Search Input */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    {isLoading ? (
                        <svg className="w-4 h-4 text-zeno-cyan animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    )}
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => results.length > 0 && setIsOpen(true)}
                    placeholder="Search clients..."
                    className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 focus:ring-2 focus:ring-zeno-cyan/20 focus:bg-white/10 transition-all"
                />
                {query && (
                    <button
                        onClick={() => {
                            setQuery('');
                            setResults([]);
                            setIsOpen(false);
                            inputRef.current?.focus();
                        }}
                        className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Search Results Dropdown */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-zeno-gray border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
                    {error ? (
                        <div className="px-4 py-6 text-center">
                            <svg className="w-10 h-10 mx-auto mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="px-4 py-6 text-center">
                            <svg className="w-10 h-10 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-gray-400 text-sm">No clients found matching "{query}"</p>
                            <p className="text-gray-500 text-xs mt-1">Only clients in your partner account are shown</p>
                        </div>
                    ) : (
                        <>
                            <div className="px-4 py-2 bg-zeno-navy/50 border-b border-white/5">
                                <p className="text-xs text-gray-400">
                                    Found <span className="text-zeno-cyan font-semibold">{results.length}</span> client{results.length !== 1 ? 's' : ''} in your account
                                </p>
                            </div>
                            <ul className="max-h-80 overflow-y-auto">
                                {results.map((client, index) => (
                                    <li key={client.id}>
                                        {client.latestCase ? (
                                            <Link
                                                href={`/b2b-dashboard/cases/${client.latestCase.id}`}
                                                className={`block px-4 py-3 hover:bg-zeno-navy/50 transition-colors ${selectedIndex === index ? 'bg-zeno-navy/50' : ''
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-white truncate">
                                                            {highlightMatch(client.fullName, query)}
                                                        </p>
                                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                                            <span className="flex items-center gap-1">
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                                                                </svg>
                                                                {highlightMatch(client.idNumber, query)}
                                                            </span>
                                                            {client.phone && (
                                                                <span className="flex items-center gap-1">
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                                    </svg>
                                                                    {highlightMatch(client.phone, query)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {client.latestCase && (
                                                            <p className="text-xs text-gray-500 mt-1.5">
                                                                Case: {client.latestCase.fileNumber}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        {client.latestCase && (
                                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(client.latestCase.status)}`}>
                                                                {formatStatus(client.latestCase.status)}
                                                            </span>
                                                        )}
                                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            </Link>
                                        ) : (
                                            <div className="px-4 py-3 bg-zeno-navy/30">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1">
                                                        <p className="font-medium text-gray-400">
                                                            {highlightMatch(client.fullName, query)}
                                                        </p>
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            ID: {client.idNumber} • No active cases
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
