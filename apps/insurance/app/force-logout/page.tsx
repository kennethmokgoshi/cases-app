'use client';

import { useEffect, useState } from 'react';
import { logger } from '@zenowethu/shared-lib/src/logger';

export default function ForceLogoutPage() {
    const [status, setStatus] = useState('Clearing session...');

    useEffect(() => {
        const logout = () => {
            try {
                setStatus('Clearing cookies...');

                // Clear all cookies
                if (typeof document !== 'undefined') {
                    document.cookie.split(";").forEach((c) => {
                        document.cookie = c
                            .replace(/^ +/, "")
                            .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                    });
                }

                setStatus('Clearing storage...');

                // Clear localStorage and sessionStorage
                if (typeof window !== 'undefined') {
                    localStorage.clear();
                    sessionStorage.clear();
                }

                setStatus('Done! Redirecting to login...');

                // Force redirect after a short delay
                setTimeout(() => {
                    window.location.href = '/login';
                }, 1000);

            } catch (error) {
                logger.error('Logout error:', error);
                setStatus('Redirecting...');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 500);
            }
        };

        // Run logout immediately
        logout();
    }, []);

    return (
        <div className="min-h-screen bg-zeno-navy flex items-center justify-center">
            <div className="text-center">
                <div className="mb-4">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-zeno-cyan mx-auto"></div>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Logging Out</h1>
                <p className="text-gray-400">{status}</p>
                <p className="text-xs text-gray-500 mt-4">Clearing all session data...</p>
            </div>
        </div>
    );
}
