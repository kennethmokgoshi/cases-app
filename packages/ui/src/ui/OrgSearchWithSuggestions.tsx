'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Client-side logger
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

export type OrgSuggestion = {
    id: string;
    name: string;
    entityType: 'MAIN_SOURCE' | 'BRANCH' | 'SUB_PROJECT' | 'PROJECT' | 'REFERRER';
    typeLabel: string;
    subtitle: string;
    parentName?: string | null;
    badgeColor: string;
    href: string;
    caseCount?: number;
};

type OrgSearchWithSuggestionsProps = {
    placeholder?: string;
    initialValue?: string;
    onSelectResult?: (result: OrgSuggestion) => void;
    onQueryChange?: (term: string) => void;
    className?: string;
    showHelpBanner?: boolean;
};

export function OrgSearchWithSuggestions({
    placeholder = 'Search projects, referrers (William), branches (Paul Kruger 1), main sources...',
    initialValue = '',
    onSelectResult,
    onQueryChange,
    className = '',
    showHelpBanner = true
}: OrgSearchWithSuggestionsProps) {
    const router = useRouter();
    const [query, setQuery] = useState(initialValue);
    const [suggestions, setSuggestions] = useState<OrgSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setQuery(initialValue);
    }, [initialValue]);

    // Handle clicks outside the component
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
        if (searchTerm.length > 0 && searchTerm.length < 2) {
            setSuggestions([]);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/projects/search?q=${encodeURIComponent(searchTerm)}`);
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data);
                setShowSuggestions(true);
                setSelectedIndex(-1);
            }
        } catch (error) {
            logger.error('Failed to fetch org suggestions', error);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);
        if (onQueryChange) onQueryChange(value);

        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        debounceTimeout.current = setTimeout(() => {
            fetchSuggestions(value);
        }, 200);
    };

    const handleSelect = (item: OrgSuggestion) => {
        setShowSuggestions(false);
        if (onSelectResult) {
            onSelectResult(item);
        } else {
            router.push(item.href);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showSuggestions || suggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                handleSelect(suggestions[selectedIndex]);
            } else if (suggestions.length > 0) {
                handleSelect(suggestions[0]);
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    return (
        <div ref={containerRef} className="relative w-full">
            {/* Search Input */}
            <div className={`relative flex items-center rounded-lg border border-white/10 bg-zeno-navy px-3 py-2 text-white shadow-sm transition-all focus-within:border-zeno-cyan focus-within:ring-1 focus-within:ring-zeno-cyan ${className}`}>
                <svg className="h-4 w-4 shrink-0 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => {
                        if (suggestions.length > 0) setShowSuggestions(true);
                        else fetchSuggestions(query);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full bg-transparent pl-3 pr-8 text-sm text-white placeholder-white/40 focus:outline-none"
                />
                {loading ? (
                    <div className="absolute right-3 flex items-center">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zeno-cyan border-t-transparent"></div>
                    </div>
                ) : query ? (
                    <button
                        type="button"
                        onClick={() => {
                            setQuery('');
                            setSuggestions([]);
                            setShowSuggestions(false);
                            if (onQueryChange) onQueryChange('');
                        }}
                        className="absolute right-3 text-white/40 hover:text-white"
                    >
                        ✕
                    </button>
                ) : null}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-white/10 bg-[#0B1D35] p-2 shadow-2xl backdrop-blur-md">
                    {suggestions.length === 0 ? (
                        <div className="px-4 py-3 text-center text-xs text-white/50">
                            No projects, referrers, branches, or sources found matching &quot;{query}&quot;
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                                Projects, Referrers, Branches & Sources
                            </div>
                            {suggestions.map((item, idx) => {
                                const isSelected = idx === selectedIndex;
                                return (
                                    <button
                                        key={`${item.entityType}-${item.id}`}
                                        type="button"
                                        onClick={() => handleSelect(item)}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                                            isSelected ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/80'
                                        }`}
                                    >
                                        <div className="flex flex-col min-w-0 pr-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-white truncate">{item.name}</span>
                                                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${item.badgeColor}`}>
                                                    {item.typeLabel}
                                                </span>
                                            </div>
                                            <span className="text-xs text-white/50 truncate mt-0.5">
                                                {item.subtitle}
                                            </span>
                                        </div>

                                        <svg className="h-4 w-4 shrink-0 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {showHelpBanner && (
                        <div className="mt-2 border-t border-white/10 pt-2 px-3 py-1.5 text-[11px] text-white/50 flex items-center gap-1.5 bg-white/[0.02] rounded-b-md">
                            <span>💡</span>
                            <span>Searching for a client (e.g. Adolph or Mnguni)? Use the <strong>Clients & Cases</strong> search box.</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
