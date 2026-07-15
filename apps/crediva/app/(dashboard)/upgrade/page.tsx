'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@zenowethu/ui';

export default function UpgradePage() {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleUpgrade = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/upgrade', { method: 'POST' });
            if (res.ok) {
                toast.success('Upgrade successful! Welcome to Premium.');
                router.refresh();
                router.push('/dashboard');
            } else {
                toast.error('Upgrade failed — please try again');
            }
        } catch (error) {
            console.error(error);
            toast.error('Network error — please try again');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-12 px-6">
            <div className="text-center mb-12">
                <h1 className="text-3xl font-bold text-slate-900 mb-4">Credo Premium</h1>
                <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                    Take full control of your credit profile. Generate dispute letters, access your dedicated AI Credit Coach, and get a complete analysis of your credit health.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
                {/* Free Plan */}
                <div className="bg-white rounded-2xl border border-slate-200 p-8 flex flex-col">
                    <h2 className="text-xl font-semibold text-slate-900 mb-2">Basic</h2>
                    <div className="text-3xl font-bold text-slate-900 mb-6">Free</div>
                    <ul className="space-y-4 mb-8 flex-1">
                        <li className="flex gap-3 text-slate-600">
                            <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Credit Report Summary
                        </li>
                        <li className="flex gap-3 text-slate-600">
                            <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Basic Dashboard
                        </li>
                        <li className="flex gap-3 text-slate-400">
                            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            AI Credit Coach
                        </li>
                        <li className="flex gap-3 text-slate-400">
                            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            Automated Disputes
                        </li>
                    </ul>
                    <button className="w-full py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-medium bg-slate-50 cursor-not-allowed">
                        Current Plan
                    </button>
                </div>

                {/* Premium Plan */}
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 flex flex-col shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                        RECOMMENDED
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-2">Premium</h2>
                    <div className="text-3xl font-bold text-white mb-1">R 99<span className="text-lg font-normal text-slate-400">/mo</span></div>
                    <p className="text-slate-400 text-sm mb-6">Billed monthly. Cancel anytime.</p>
                    <ul className="space-y-4 mb-8 flex-1">
                        <li className="flex gap-3 text-slate-300">
                            <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Everything in Basic
                        </li>
                        <li className="flex gap-3 text-slate-300">
                            <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Unlimited AI Credit Coach
                        </li>
                        <li className="flex gap-3 text-slate-300">
                            <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Automated Dispute Letters
                        </li>
                        <li className="flex gap-3 text-slate-300">
                            <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Deep Credit Analysis & Flags
                        </li>
                    </ul>
                    <button 
                        onClick={handleUpgrade}
                        disabled={loading}
                        className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-medium transition-colors shadow-lg shadow-emerald-500/20"
                    >
                        {loading ? 'Processing...' : 'Upgrade Now (Mock Pay)'}
                    </button>
                </div>
            </div>
            
            <p className="text-center text-slate-500 text-sm mt-8">
                Payments securely processed via Peach Payments. We do not store your card details.
            </p>
        </div>
    );
}
