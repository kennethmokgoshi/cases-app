'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@zenowethu/ui';

export default function ConvertServiceRequestButton({ requestId, consumerId }: { requestId: string; consumerId: string }) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleConvert = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/service-requests/convert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, consumerId }),
            });
            const data = await res.json();
            
            if (res.ok && data.caseId) {
                router.push(`/admin/cases/${data.caseId}`);
            } else {
                toast.error(data.error || 'Failed to convert');
                setLoading(false);
            }
        } catch (error) {
            console.error(error);
            toast.error('Network error — please try again');
            setLoading(false);
        }
    };

    return (
        <button 
            onClick={handleConvert} 
            disabled={loading} 
            className="w-full py-2 px-4 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-medium text-sm transition-colors"
        >
            {loading ? 'Converting...' : 'Convert to Case'}
        </button>
    );
}
