'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { SignaturePad } from '@zenowethu/ui';

export default function SignPoaPage() {
    const router = useRouter();
    const params = useParams();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSaveSignature = async (signatureDataUrl: string) => {
        setLoading(true);
        setError('');
        
        try {
            const res = await fetch(`/api/consumer/poa/sign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    signatureImage: signatureDataUrl,
                    requestId: params.id 
                })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to sign document');

            setSuccess(true);
            setTimeout(() => {
                router.push('/documents');
            }, 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
                    <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h1 className="text-3xl font-bold text-white mb-4">Document Signed!</h1>
                <p className="text-gray-400 max-w-md">
                    Thank you. Your Power of Attorney has been digitally signed and submitted. 
                    You will be redirected to your documents shortly.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold text-white mb-2">Sign Power of Attorney</h1>
                <p className="text-gray-400">
                    Please provide your digital signature below to authorize Zenowethu Debt Management to act on your behalf.
                </p>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
                    {error}
                </div>
            )}

            <div className="grid md:grid-cols-2 gap-8 items-start">
                {/* Document Preview (Mock) */}
                <div className="bg-white/5 rounded-2xl p-8 border border-white/10 aspect-[1/1.414] relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 group-hover:to-black/40 transition-all"></div>
                    <div className="space-y-4 opacity-40">
                        <div className="h-4 bg-white/20 rounded w-3/4 mx-auto"></div>
                        <div className="h-2 bg-white/10 rounded w-1/2 mx-auto"></div>
                        <div className="space-y-2 pt-8">
                            {[...Array(12)].map((_, i) => (
                                <div key={i} className="h-1 bg-white/5 rounded w-full"></div>
                            ))}
                        </div>
                        <div className="pt-12 flex justify-between">
                            <div className="h-8 bg-white/10 rounded w-1/3"></div>
                            <div className="h-8 bg-white/10 rounded w-1/3"></div>
                        </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-zeno-navy/80 backdrop-blur-sm px-4 py-2 rounded-full border border-white/20 text-xs text-white">
                            Page 1 of 2
                        </div>
                    </div>
                </div>

                {/* Signature Pad */}
                <div className="space-y-6">
                    <SignaturePad 
                        onSave={handleSaveSignature}
                        title="Principal Signature"
                        description="Draw your signature inside the box. It will be legally embedded into your Power of Attorney."
                    />
                    
                    <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20 text-xs text-blue-300">
                        <p className="flex gap-2">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            This digital signature is legally binding under the Electronic Communications and Transactions Act. 
                            Your IP address and timestamp will be recorded with this signature.
                        </p>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center gap-3 text-zeno-cyan animate-pulse">
                            <div className="w-4 h-4 border-2 border-zeno-cyan border-t-transparent rounded-full animate-spin"></div>
                            Processing document...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
