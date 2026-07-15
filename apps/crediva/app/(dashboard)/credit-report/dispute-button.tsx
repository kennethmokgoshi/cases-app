'use client';

import { useState } from 'react';
import { toast } from '@zenowethu/ui';

interface Props {
    type: string;
    creditorName: string;
    accountNumber: string;
    disputeGrounds: string[];
    label: string;
    className?: string;
}

export function DisputeButton({ type, creditorName, accountNumber, disputeGrounds, label, className }: Props) {
    const [loading, setLoading] = useState(false);

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/crediva/disputes/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, creditorName, accountNumber, disputeGrounds }),
            });
            const data = await res.json();
            
            if (res.ok) {
                toast.success(data.message || 'Letter saved to vault');
            } else {
                toast.error(data.error || 'Failed to generate letter');
            }
        } catch (err) {
            console.error(err);
            toast.error('Network error — please try again');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleGenerate}
            disabled={loading}
            className={className}
        >
            {loading ? 'Generating...' : label}
        </button>
    );
}
