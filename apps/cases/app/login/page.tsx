'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn } from '@zenowethu/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function LoginContent() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    // Display error from URL params (e.g., from auth error redirect)
    useEffect(() => {
        const urlError = searchParams.get('error');
        if (urlError) {
            setError(decodeURIComponent(urlError));
        }
    }, [searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await signIn('credentials', {
                email,
                password,
                redirect: false,
                callbackUrl: '/' });

            if (result?.error) {
                // If it's a specific known error, show it. Otherwise show generic.
                if (result.error === 'CredentialsSignin' || result.error === 'Configuration') {
                    // NextAuth v5 returns "Configuration" for invalid credentials or config issues
                    setError('Invalid email or password');
                } else if (result.error.includes('Email not recognised')) {
                    setError('Email not recognised');
                } else if (result.error.includes('Invalid password')) {
                    setError('Invalid password');
                } else if (result.error.includes('Account is locked')) {
                    setError('Account is locked');
                } else {
                    // Fallback to the error message returned (stripping "Error: " if present)
                    setError(result.error.replace('Error: ', '') || 'Invalid email or password');
                }
            } else if (result?.ok) {
                // Wait for session cookie to be set before redirecting
                // Use window.location for full page reload with session cookie
                window.location.href = '/';
            }
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zeno-navy flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-zeno-cyan to-zeno-navy rounded-xl flex items-center justify-center border-2 border-zeno-cyan/50 mb-4">
                        <div className="w-6 h-6 bg-zeno-orange rotate-45"></div>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">ZENOWETHU</h1>
                    <p className="text-gray-400 mt-2">Case Management System</p>
                </div>

                {/* Login Form */}
                <div className="bg-zeno-blue/50 rounded-2xl p-8 border border-zeno-blue">
                    <h2 className="text-xl font-semibold text-white mb-6 text-center">Sign In</h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-zeno-navy border border-zeno-blue rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-zeno-cyan focus:border-transparent transition-all"
                                placeholder="you@zenowethu.co.za"
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 pr-12 bg-zeno-navy border border-zeno-blue rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-zeno-cyan focus:border-transparent transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                >
                                    {showPassword ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            <div className="flex justify-end mt-1">
                                <Link
                                    href="/forgot-password"
                                    className="text-xs text-zeno-cyan hover:text-white transition-colors"
                                >
                                    Forgot your password?
                                </Link>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-zeno-cyan to-cyan-600 hover:from-cyan-600 hover:to-zeno-cyan text-zeno-navy font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center text-gray-500 text-sm mt-6">
                    © 2025 Zenowethu. All rights reserved.
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zeno-navy flex items-center justify-center p-4">
                <div className="text-white text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-zeno-cyan border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p>Loading...</p>
                </div>
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}

