'use client';

import { useEffect } from 'react';
import { logger } from '@zenowethu/shared-lib/src/logger';

/**
 * Segment-level error boundary — catches any unhandled error thrown
 * inside the rendered page/layout tree. Renders within the root layout
 * so SessionProvider and ThemeProvider are still available.
 */
export default function Error({
    error,
    reset }: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // TODO (Round 3): replace with a proper error tracking service (e.g. Sentry)
        logger.error('[Error Boundary]', error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary,#0f1117)] px-4">
            <div className="text-center max-w-md w-full">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.694-.833-3.464 0L3.34 16.5C2.57 17.333 3.532 19 5.072 19z" />
                    </svg>
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
                <p className="text-gray-400 mb-6 text-sm leading-relaxed">
                    An unexpected error occurred. It has been logged and we&apos;ll look into it.
                </p>

                {error.digest && (
                    <p className="text-xs text-gray-600 mb-6 font-mono bg-white/5 rounded-lg px-3 py-2 inline-block">
                        Error ID: {error.digest}
                    </p>
                )}

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="px-6 py-2.5 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors"
                    >
                        Try again
                    </button>
                    <button
                        onClick={() => { window.location.href = '/'; }}
                        className="px-6 py-2.5 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors"
                    >
                        Go home
                    </button>
                </div>
            </div>
        </div>
    );
}
