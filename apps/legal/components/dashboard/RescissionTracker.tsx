'use client';
import { toast } from '@zenowethu/ui';


import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function RescissionTracker() {
    const [rescissions, setRescissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRescissions();
    }, []);

    async function fetchRescissions() {
        try {
            const res = await fetch('/api/legal/matters?type=RESCISSION');
            if (res.ok) {
                const data = await res.json();
                setRescissions(data);
            }
        } catch (error) {
            console.error('Failed to fetch rescissions:', error);
        } finally {
            setLoading(false);
        }
    }

    const getProgress = (status: string) => {
        switch (status) {
            case 'OPEN': return 5;
            case 'DRAFTING': return 15;
            case 'SERVICE': return 40;
            case 'HEARING': return 80;
            case 'GRANTED': return 100;
            default: return 5;
        }
    };

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
                a.download = `Rescission_Application_${id.substring(0, 8)}.pdf`;
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
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="text-2xl">⚖️</span>
                    Rule 49 Rescission Tracker
                </h3>
                <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full font-medium">
                    {rescissions.length} Active
                </span>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    </div>
                ) : rescissions.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-gray-500 text-sm">No active rescissions found.</p>
                    </div>
                ) : (
                    rescissions.map((item) => (
                        <Link key={item.id} href={`/cases/${item.caseId}`} className="block bg-gray-800/50 p-4 rounded-lg border border-gray-700 hover:border-blue-500/50 transition-colors cursor-pointer group">
                            <div className="flex justify-between mb-2">
                                <span className="font-bold text-gray-200 group-hover:text-blue-400 transition-colors">
                                    {item.Client.firstName} {item.Client.lastName}
                                </span>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={(e) => handleGeneratePDF(item.id, e)}
                                        className="text-[10px] bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white px-2 py-0.5 rounded transition-all border border-blue-500/30"
                                        title="Generate Rule 49 Application"
                                    >
                                        📄 PDF
                                    </button>
                                    <span className="text-xs font-mono text-gray-500">{item.Case.fileNumber}</span>
                                </div>
                            </div>

                            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-3">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${item.status === 'GRANTED' ? 'bg-green-500' :
                                        item.status === 'HEARING' ? 'bg-purple-500' :
                                            item.status === 'SERVICE' ? 'bg-orange-500' :
                                                'bg-blue-500'
                                        }`}
                                    style={{ width: `${getProgress(item.status)}%` }}
                                ></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <p className="text-gray-500 uppercase tracking-wider mb-0.5">Status</p>
                                    <p className="text-gray-300 font-medium truncate">{item.status}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-gray-500 uppercase tracking-wider mb-0.5">Updated</p>
                                    <p className="text-gray-400 font-medium">{new Date(item.updatedAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                        </Link>
                    ))
                )}
            </div>

            <Link href="/cases/new?type=rescission" className="w-full mt-6 py-3 border border-dashed border-gray-700 text-gray-400 rounded-lg hover:bg-gray-800 hover:text-white transition-all hover:border-blue-500/50 flex items-center justify-center gap-2 text-sm font-medium">
                <span>+</span> New Rescission Application
            </Link>
        </div>
    );
}
