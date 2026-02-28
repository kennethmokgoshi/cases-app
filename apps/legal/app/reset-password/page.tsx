'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        if (!token) {
            setMessage({ type: 'error', text: 'Invalid or missing reset token. Please request a new link.' });
        }
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match' });
            return;
        }

        setLoading(true);
        setMessage({ type: '', text: '' });

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }) });

            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: 'Password has been reset successfully! Redirecting to login...' });
                setTimeout(() => {
                    router.push('/login');
                }, 3000);
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to reset password' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An unexpected error occurred' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zeno-navy flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-zeno-cyan to-zeno-navy rounded-xl flex items-center justify-center border-2 border-zeno-cyan/50 mb-4">
                        <div className="w-6 h-6 bg-zeno-orange rotate-45"></div>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">ZENOWETHU</h1>
                    <p className="text-gray-400 mt-2">New Password Settlement</p>
                </div>

                <div className="bg-zeno-blue/50 rounded-2xl p-8 border border-zeno-blue">
                    <h2 className="text-xl font-semibold text-white mb-6 text-center">Set New Password</h2>

                    {message.text && (
                        <div className={`mb-6 p-4 rounded-xl text-center text-sm font-medium border ${message.type === 'success'
                                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                            {message.text}
                        </div>
                    )}

                    {token && message.type !== 'success' ? (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                                    New Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-zeno-navy border border-zeno-blue rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-zeno-cyan focus:border-transparent transition-all"
                                    placeholder="••••••••"
                                    required
                                    minLength={8}
                                />
                            </div>

                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                                    Confirm New Password
                                </label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-zeno-navy border border-zeno-blue rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-zeno-cyan focus:border-transparent transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 bg-gradient-to-r from-zeno-cyan to-cyan-600 hover:from-cyan-600 hover:to-zeno-cyan text-zeno-navy font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-zeno-cyan/10"
                            >
                                {loading ? 'Updating Password...' : 'Reset Password'}
                            </button>
                        </form>
                    ) : !token ? (
                        <div className="mt-8 pt-6 border-t border-white/5 text-center">
                            <Link href="/forgot-password" className="text-zeno-cyan hover:text-white text-sm font-medium transition-colors">
                                Request a new link
                            </Link>
                        </div>
                    ) : null}

                    {message.type !== 'success' && (
                        <div className="mt-8 pt-6 border-t border-white/5 text-center">
                            <Link href="/login" className="text-zeno-cyan hover:text-white text-sm font-medium transition-colors">
                                Back to Login
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zeno-navy flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zeno-cyan"></div>
            </div>
        }>
            <ResetPasswordForm />
        </Suspense>
    );
}
