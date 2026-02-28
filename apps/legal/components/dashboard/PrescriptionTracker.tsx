'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function PrescriptionTracker() {
    const [matters, setMatters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPrescriptionMatters();
    }, []);

    async function fetchPrescriptionMatters() {
        try {
            // Fetch matters specifically of type PRESCRIPTION
            const res = await fetch('/api/legal/matters?type=PRESCRIPTION');
            if (res.ok) {
                const data = await res.json();
                setMatters(data);
            }
        } catch (error) {
            console.error('Failed to fetch prescription matters:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleGenerateLeter(id: string, e: React.MouseEvent) {
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
                a.download = `Section126B_Notice_${id.substring(0, 8)}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else {
                alert('Failed to generate Section 126B Notice');
            }
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF');
        }
    }

    async function handleRunCheck() {
        // For demonstration, we use a fixed caseId or prompt for one if needed
        // In a real scenario, this would likely be the context of the user's current case
        const caseId = prompt('Enter Case ID for Prescription Batch Check:');
        if (!caseId) return;

        setLoading(true);
        try {
            const res = await fetch('/api/legal/prescription/check', {
                method: 'POST',
                body: JSON.stringify({ caseId }),
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.ok) {
                const data = await res.json();
                alert(data.message);
                fetchPrescriptionMatters();
            } else {
                alert('Batch check failed');
            }
        } catch (error) {
            console.error('Error running check:', error);
            alert('Error running check');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-full flex flex-col">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <span className="text-2xl">⚖️</span>
                Prescription Tracker (Sec 126B)
            </h3>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                    </div>
                ) : matters.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-gray-500 text-sm">No prescribed debt cases tracked yet.</p>
                        <p className="text-[10px] text-gray-600 mt-1">Run a batch check to identify potential wins.</p>
                    </div>
                ) : (
                    matters.map(m => (
                        <div key={m.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 hover:border-amber-500/30 transition-all group">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="font-bold text-white group-hover:text-amber-400 transition-colors uppercase">{m.creditorName}</h4>
                                    <p className="text-xs text-gray-500">A/C: {m.accountNumber || 'Unknown'}</p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                                        PRESCRIBED
                                    </span>
                                    <button
                                        onClick={(e) => handleGenerateLeter(m.id, e)}
                                        className="text-[10px] bg-amber-600/20 text-amber-400 hover:bg-amber-600 hover:text-white px-2 py-0.5 rounded transition-all border border-amber-500/30"
                                    >
                                        📄 126B Letter
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-700/50 flex justify-between items-center">
                                <p className="text-[10px] text-gray-400">Client: {m.Client?.firstName} {m.Client?.lastName}</p>
                                <span className="text-[10px] text-gray-500 uppercase">{m.status}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <button
                onClick={handleRunCheck}
                disabled={loading}
                className="w-full mt-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-amber-900/20 text-center text-sm disabled:opacity-50"
            >
                {loading ? 'Running Assessments...' : 'Run New Prescription Check'}
            </button>
        </div>
    );
}
