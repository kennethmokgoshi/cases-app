'use client';
import { toast } from '@zenowethu/ui';
import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type UnansweredCase = {
    caseId: string;
    fileNumber: string;
    status: string;
    clientName: string;
    clientEmail: string | null;
    clientPhone: string | null;
    lastInboundAt: string;
    lastInboundContent: string;
    channel: string | null;
    hoursSinceInbound: number;
};

export default function UnansweredEmails() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    
    const [items, setItems] = useState<UnansweredCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [threshold, setThreshold] = useState<number>(2);
    const [lookback, setLookback] = useState<number>(48);
    const [selectedItem, setSelectedItem] = useState<UnansweredCase | null>(null);

    useEffect(() => {
        if (authStatus === 'authenticated' && session?.user?.role !== 'ADMIN') {
            router.push('/');
        } else if (authStatus === 'authenticated') {
            fetchItems();
        }
    }, [session, authStatus, router, threshold, lookback]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                threshold: threshold.toString(),
                lookbackHours: lookback.toString(),
            });
            const res = await fetch(`/api/dashboard/unanswered-emails?${params.toString()}`);
            const data = await res.json();
            if (data.cases) {
                setItems(data.cases);
            }
        } catch (error) {
            console.error('Failed to fetch unanswered emails:', error);
            toast.error('Failed to load unanswered emails');
        } finally {
            setLoading(false);
        }
    };

    if (authStatus === 'loading' || (loading && items.length === 0)) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (session?.user?.role !== 'ADMIN') {
        return null;
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Link href="/admin" className="text-gray-400 hover:text-white">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-3xl font-bold text-white">Unanswered Messages</h1>
                    </div>
                    <p className="text-gray-400">Review inbound client messages that haven't received an auto-reply or staff response.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={fetchItems} className="px-4 py-2 bg-zeno-blue/30 text-white border border-zeno-blue/50 rounded-lg hover:bg-zeno-blue/50 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6 items-center">
                <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-400">Wait Time (hrs):</label>
                    <select
                        value={threshold}
                        onChange={e => setThreshold(Number(e.target.value))}
                        className="px-3 py-1.5 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan text-sm"
                    >
                        <option value={1}>1 hour</option>
                        <option value={2}>2 hours</option>
                        <option value={4}>4 hours</option>
                        <option value={12}>12 hours</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-400">Lookback (hrs):</label>
                    <select
                        value={lookback}
                        onChange={e => setLookback(Number(e.target.value))}
                        className="px-3 py-1.5 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan text-sm"
                    >
                        <option value={24}>24 hours</option>
                        <option value={48}>48 hours</option>
                        <option value={72}>72 hours</option>
                        <option value={168}>1 week</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-zeno-blue/50 border-b border-zeno-blue/50 text-gray-300">
                                <th className="px-6 py-4 font-medium">Wait Time</th>
                                <th className="px-6 py-4 font-medium">Client</th>
                                <th className="px-6 py-4 font-medium">Case</th>
                                <th className="px-6 py-4 font-medium">Channel</th>
                                <th className="px-6 py-4 font-medium max-w-xs">Message Preview</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zeno-blue/20">
                            {items.map(item => (
                                <tr key={item.caseId} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded border ${item.hoursSinceInbound > 24 ? 'bg-red-500/20 text-red-300 border-red-500/30' : item.hoursSinceInbound > 4 ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'}`}>
                                            {item.hoursSinceInbound} hours
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">
                                        {item.clientName}
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">
                                        <Link href={`/cases/${item.caseId}`} className="hover:underline hover:text-zeno-cyan text-zeno-cyan font-medium">
                                            Case {item.fileNumber}
                                        </Link>
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        {item.channel || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400 max-w-xs truncate">
                                        {item.lastInboundContent}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => setSelectedItem(item)}
                                            className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-gray-300 text-xs transition-colors"
                                        >
                                            View Message
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {items.length === 0 && !loading && (
                    <div className="p-8 text-center text-gray-400">
                        No unanswered messages found in this timeframe. Excellent!
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedItem && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zeno-gray rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-white/10 flex flex-col">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                Inbound Message
                            </h2>
                            <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-white">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500 block">Client</span>
                                    <span className="text-gray-300">{selectedItem.clientName}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Case</span>
                                    <span className="text-gray-300">Case {selectedItem.fileNumber}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Channel</span>
                                    <span className="text-gray-300">{selectedItem.channel || 'Unknown'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Received At</span>
                                    <span className="text-gray-300">{new Date(selectedItem.lastInboundAt).toLocaleString()} ({selectedItem.hoursSinceInbound} hours ago)</span>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-2">Message Content</h3>
                                <div className="bg-black/50 border border-white/5 p-4 rounded-lg text-gray-300 text-sm whitespace-pre-wrap">
                                    {selectedItem.lastInboundContent}
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-white/10 shrink-0 flex justify-between items-center">
                            <Link 
                                href={`/cases/${selectedItem.caseId}?tab=activity`}
                                className="px-4 py-2 bg-zeno-cyan text-black hover:bg-zeno-cyan/90 rounded-lg transition-colors font-medium flex items-center gap-2"
                            >
                                Open Case & Reply
                            </Link>
                            <button onClick={() => setSelectedItem(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
