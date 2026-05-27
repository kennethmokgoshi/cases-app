'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

interface PremiumGateProps {
    isPremium: boolean;
    featureName: string;
    children: React.ReactNode;
}

export function PremiumGate({ isPremium, featureName, children }: PremiumGateProps) {
    const router = useRouter();

    if (isPremium) {
        return <>{children}</>;
    }

    return (
        <div className="relative h-full w-full">
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl">
                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-8 max-w-md text-center">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Upgrade to Premium</h2>
                    <p className="text-slate-600 mb-6">
                        Unlock {featureName} and take full control of your credit profile with Credo Premium.
                    </p>
                    <button
                        onClick={() => router.push('/upgrade')}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                    >
                        View Plans
                    </button>
                </div>
            </div>
            
            {/* Blurred background content */}
            <div className="opacity-40 select-none pointer-events-none h-full overflow-hidden blur-[1px]">
                {children}
            </div>
        </div>
    );
}
