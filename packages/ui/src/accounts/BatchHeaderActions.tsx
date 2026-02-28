'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BatchHeaderActions({ batchId, hasPending }: { batchId: string, hasPending: boolean }) {
    const [isPosting, setIsPosting] = useState(false);
    const router = useRouter();

    const handlePost = async () => {
        if (!confirm('Are you sure you want to post these payments? This will update client balances for all matched records.')) return;

        setIsPosting(true);
        try {
            const res = await fetch(`/api/accounts/batches/${batchId}/post`, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to post');
            }

            const data = await res.json();
            alert(data.message);
            router.refresh();
        } catch (e: any) {
            alert('Error posting batch: ' + e.message);
        } finally {
            setIsPosting(false);
        }
    };

    if (!hasPending) {
        return (
            <div className="px-4 py-2 bg-gray-500/20 text-gray-400 rounded-lg text-sm font-medium border border-gray-500/30">
                All Matched Posted
            </div>
        );
    }

    return (
        <button
            onClick={handlePost}
            disabled={isPosting}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {isPosting ? (
                <>
                    <svg className="animate-spin -ml-1 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Posting...
                </>
            ) : (
                <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Post Matched to Ledger
                </>
            )}
        </button>
    );
}
