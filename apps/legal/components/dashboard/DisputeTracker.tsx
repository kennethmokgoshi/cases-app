'use client';
import { toast } from '@zenowethu/ui';


import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function DisputeTracker() {
    const [disputes, setDisputes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDisputes();
    }, []);

    async function fetchDisputes() {
        try {
            const res = await fetch('/api/legal/matters?type=DISPUTE');
            if (res.ok) {
                const data = await res.json();
                setDisputes(data);
            }
        } catch (error) {
            console.error('Failed to fetch disputes:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleGeneratePDF(id: string, e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();

        try {
            const res = await fetch(`/api/legal/matters/${id}/generate-pdf`, {
                method: 'POST',
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Dispute_Letter_${id.substring(0, 8)}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else {
                toast.error('Failed to generate PDF');
            }
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Error generating PDF');
        }
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-full flex flex-col">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <span className="text-2xl">⏱️</span>
                20-Day Dispute Clock
            </h3>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                    </div>
                ) : disputes.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-gray-500 text-sm">No active disputes found.</p>
                    </div>
                ) : (
                    disputes.map(d => {
                        const remaining = 20 - Math.floor(Math.abs(new Date().getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24) * (5 / 7));
                        const isUrgent = remaining <= 5;

                        return (
                            <div key={d.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 hover:border-blue-500/30 transition-all group">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 className="font-bold text-white group-hover:text-blue-400 transition-colors">{d.creditorName}</h4>
                                        <p className="text-xs text-gray-500">Ref: {d.accountNumber || 'N/A'}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${isUrgent ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                                            }`}>
                                            {remaining} Days Left
                                        </span>
                                        <button
                                            onClick={(e) => handleGeneratePDF(d.id, e)}
                                            className="text-[10px] bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white px-2 py-0.5 rounded transition-all border border-blue-500/30"
                                        >
                                            📄 Letter
                                        </button>
                                    </div>
                                </div>

                                <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${isUrgent ? 'bg-red-500' : 'bg-green-500'}`}
                                        style={{ width: `${(1 - remaining / 20) * 100}%` }}
                                    ></div>
                                </div>
                                <p className="text-right text-xs text-gray-500 mt-2">Client: {d.Client.firstName} {d.Client.lastName}</p>
                            </div>
                        );
                    })
                )}
            </div>

            <Link href="/cases/new?type=dispute" className="w-full mt-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-blue-900/20 text-center">
                Log New Section 72 Dispute
            </Link>
        </div>
    );
}
