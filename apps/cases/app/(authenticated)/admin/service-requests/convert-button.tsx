'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

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
                alert(data.error || 'Failed to convert');
                setLoading(false);
            }
        } catch (error) {
            console.error(error);
            alert('Network error');
            setLoading(false);
        }
    };

    return (
        <Button 
            onClick={handleConvert} 
            disabled={loading} 
            className="w-full bg-slate-900 hover:bg-slate-800 text-white"
        >
            {loading ? 'Converting...' : 'Convert to Case'}
        </Button>
    );
}
