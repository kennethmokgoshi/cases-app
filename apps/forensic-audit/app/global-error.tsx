'use client';

import { useEffect } from 'react';
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

/**
 * Global error boundary — catches errors thrown by the root layout.tsx itself.
 * Must include its own <html> and <body> tags because the root layout
 * is unavailable when this renders.
 */
export default function GlobalError({
    error,
    reset }: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // TODO (Round 3): replace with a proper error tracking service (e.g. Sentry)
        logger.error('[Global Error Boundary]', error);
    }, [error]);

    return (
        <html lang="en">
            <body style={{
                margin: 0,
                background: '#0f1117',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                <div style={{ textAlign: 'center', padding: '2rem', maxWidth: '28rem', width: '100%' }}>
                    <div style={{
                        width: '5rem', height: '5rem', borderRadius: '50%',
                        background: 'rgba(239,68,68,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1.5rem' }}>
                        <svg width="40" height="40" fill="none" stroke="#f87171" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.694-.833-3.464 0L3.34 16.5C2.57 17.333 3.532 19 5.072 19z" />
                        </svg>
                    </div>

                    <h2 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        Critical Error
                    </h2>
                    <p style={{ color: '#9ca3af', marginBottom: '2rem', fontSize: '0.875rem', lineHeight: 1.6 }}>
                        The application encountered a fatal error and could not recover.
                    </p>

                    {error.digest && (
                        <p style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: '1.5rem', fontFamily: 'monospace' }}>
                            Error ID: {error.digest}
                        </p>
                    )}

                    <button
                        onClick={reset}
                        style={{
                            padding: '0.625rem 1.5rem', background: '#06b6d4', color: 'black',
                            fontWeight: 600, borderRadius: '0.5rem', border: 'none', cursor: 'pointer',
                            marginRight: '0.75rem' }}
                    >
                        Try again
                    </button>
                    <button
                        onClick={() => { window.location.href = '/'; }}
                        style={{
                            padding: '0.625rem 1.5rem', background: 'rgba(255,255,255,0.1)',
                            color: 'white', fontWeight: 600, borderRadius: '0.5rem',
                            border: 'none', cursor: 'pointer' }}
                    >
                        Go home
                    </button>
                </div>
            </body>
        </html>
    );
}
