import React from 'react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    className?: string;
}

export function Pagination({ currentPage, totalPages, onPageChange, className = "" }: PaginationProps) {
    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const showMax = 7;

        if (totalPages <= showMax) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            // Always show first page
            pages.push(1);

            if (currentPage > 4) {
                pages.push('...');
            }

            // Show pages around current
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            // Adjust start/end if we are near the beginning or end
            let adjustedStart = start;
            let adjustedEnd = end;

            if (currentPage <= 4) {
                adjustedEnd = 5;
            } else if (currentPage >= totalPages - 3) {
                adjustedStart = totalPages - 4;
            }

            for (let i = adjustedStart; i <= adjustedEnd; i++) {
                if (i > 1 && i < totalPages) {
                    pages.push(i);
                }
            }

            if (currentPage < totalPages - 3) {
                pages.push('...');
            }

            // Always show last page
            pages.push(totalPages);
        }

        return pages;
    };

    const pages = getPageNumbers();

    return (
        <div className={`flex items-center justify-between px-4 py-3 border-t border-white/5 text-xs text-gray-400 ${className}`}>
            <div className="hidden sm:block">
                <span>Page <span className="text-white font-medium">{currentPage}</span> of <span className="text-white font-medium">{totalPages}</span></span>
            </div>
            
            <div className="flex items-center gap-1">
                {/* First */}
                <button
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:text-white"
                    title="First Page"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                </button>

                {/* Prev */}
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:text-white mr-1"
                    title="Previous Page"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1 mx-1">
                    {pages.map((p, i) => (
                        <React.Fragment key={i}>
                            {typeof p === 'number' ? (
                                <button
                                    onClick={() => onPageChange(p)}
                                    className={`min-w-[32px] h-8 rounded-lg flex items-center justify-center transition-all font-medium border ${
                                        currentPage === p
                                            ? 'bg-zeno-cyan/20 border-zeno-cyan text-zeno-cyan shadow-[0_0_10px_rgba(0,255,255,0.1)]'
                                            : 'border-white/5 text-gray-500 hover:border-white/20 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    {p}
                                </button>
                            ) : (
                                <span className="px-1 text-gray-600 font-bold select-none">{p}</span>
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Next */}
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:text-white ml-1"
                    title="Next Page"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>

                {/* Last */}
                <button
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:text-white"
                    title="Last Page"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
