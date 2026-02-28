'use client';

import { useState } from 'react';
import Link from 'next/link';
import { logger } from '@zenowethu/shared-lib';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await res.json();
            if (res.ok) {
                setMessage({
                    type: 'success',
                    text: 'If an account exists with this email, a reset link has been sent. Please check your inbox (and spam folder).'
                });
                if (data.debugToken) {
                    logger.info({ msg: 'DEBUG: Reset Link', url: `${window.location.origin}/reset-password?token=${data.debugToken}` });
                }
            } else {
                setMessage({ type: 'error', text: data.error || 'Something went wrong' });
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
                    <p className="text-gray-400 mt-2">Password Recovery</p>
                </div>

                <div className="bg-zeno-blue/50 rounded-2xl p-8 border border-zeno-blue">
                    <h2 className="text-xl font-semibold text-white mb-6 text-center">Reset Password</h2>

                    <p className="text-gray-400 text-sm mb-6 text-center">
                        Enter your email address and we&apos;ll send you a link to reset your password.
                    </p>

                    {message.text && (
                        <div className={`mb-6 p-4 rounded-xl text-center text-sm font-medium border ${message.type === 'success'
                            ? 'bg-green-500/10 border-green-500/20 text-green-400'
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                            {message.text}
                        </div>
                    )}

                    {!message.text || message.type === 'error' ? (
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

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 bg-gradient-to-r from-zeno-cyan to-cyan-600 hover:from-cyan-600 hover:to-zeno-cyan text-zeno-navy font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-zeno-cyan/10"
                            >
                                {loading ? 'Sending link...' : 'Send Reset Link'}
                            </button>
                        </form>
                    ) : null}

                    <div className="mt-8 pt-6 border-t border-white/5 text-center">
                        <Link href="/login" className="text-zeno-cyan hover:text-white text-sm font-medium transition-colors">
                            Back to Login
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
