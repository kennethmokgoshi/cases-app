'use client';
import { toast } from '@zenowethu/ui';
import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type NotificationQueueItem = {
    id: string;
    channel: string;
    recipient: string;
    subject: string | null;
    body: string;
    status: string;
    retryCount: number;
    lastError: string | null;
    createdAt: string;
    nextRetryAt: string | null;
    case: { id: string; fileNumber: string; client: { firstName: string; lastName: string } } | null;
};

export default function FailedCommunications() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    
    const [items, setItems] = useState<NotificationQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterChannel, setFilterChannel] = useState<string>('');
    const [selectedItem, setSelectedItem] = useState<NotificationQueueItem | null>(null);

    useEffect(() => {
        if (authStatus === 'authenticated' && session?.user?.role !== 'ADMIN') {
            router.push('/');
        } else if (authStatus === 'authenticated') {
            fetchItems();
        }
    }, [session, authStatus, router, filterStatus, filterChannel]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus) params.append('status', filterStatus);
            if (filterChannel) params.append('channel', filterChannel);
            
            const res = await fetch(`/api/admin/notifications/failed?${params.toString()}`);
            const data = await res.json();
            if (data.data) {
                setItems(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch communications:', error);
            toast.error('Failed to load failed communications');
        } finally {
            setLoading(false);
        }
    };

    const handleRetry = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/notifications/failed/${id}/retry`, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Retry failed');
            }
            toast.success('Retry dispatched successfully');
            fetchItems();
            setSelectedItem(null);
        } catch (error: any) {
            toast.error(error.message);
            fetchItems();
        }
    };

    const handleReview = async (id: string, status: 'SUCCESS' | 'CANCELLED') => {
        try {
            const res = await fetch(`/api/admin/notifications/failed/${id}/review`, { 
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if (!res.ok) throw new Error('Update failed');
            toast.success(`Marked as ${status}`);
            fetchItems();
            setSelectedItem(null);
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Success</span>;
            case 'PENDING_RETRY':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Pending Retry</span>;
            case 'HUMAN_REVIEW':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-red-500/20 text-red-300 border border-red-500/30">Needs Review</span>;
            case 'CANCELLED':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-gray-500/20 text-gray-300 border border-gray-500/30">Cancelled</span>;
            default:
                return <span className="px-2 py-1 text-xs font-medium rounded bg-gray-500/20 text-gray-300 border border-gray-500/30">{status}</span>;
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
                        <h1 className="text-3xl font-bold text-white">Failed Communications</h1>
                    </div>
                    <p className="text-gray-400">Review and retry failed notifications</p>
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
            <div className="flex gap-4 mb-6">
                <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="px-4 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan"
                >
                    <option value="">All Statuses</option>
                    <option value="PENDING_RETRY">Pending Retry</option>
                    <option value="HUMAN_REVIEW">Needs Review</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="SUCCESS">Success</option>
                </select>
                <select
                    value={filterChannel}
                    onChange={e => setFilterChannel(e.target.value)}
                    className="px-4 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan"
                >
                    <option value="">All Channels</option>
                    <option value="EMAIL">Email</option>
                    <option value="SMS">SMS</option>
                    <option value="WHATSAPP">WhatsApp</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-zeno-blue/50 border-b border-zeno-blue/50 text-gray-300">
                                <th className="px-6 py-4 font-medium">Channel</th>
                                <th className="px-6 py-4 font-medium">Recipient</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Case</th>
                                <th className="px-6 py-4 font-medium">Failed At</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zeno-blue/20">
                            {items.map(item => (
                                <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white">{item.channel}</td>
                                    <td className="px-6 py-4 text-gray-300">{item.recipient}</td>
                                    <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                                    <td className="px-6 py-4 text-gray-300">
                                        {item.case ? (
                                            <Link href={`/cases/${item.case.id}`} className="hover:underline hover:text-zeno-cyan">
                                                Case {item.case.fileNumber}
                                            </Link>
                                        ) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        {new Date(item.createdAt).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setSelectedItem(item)}
                                                className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-gray-300 text-xs transition-colors"
                                            >
                                                Details
                                            </button>
                                            {item.status !== 'SUCCESS' && item.status !== 'CANCELLED' && (
                                                <button
                                                    onClick={() => handleRetry(item.id)}
                                                    className="px-3 py-1 bg-zeno-cyan/20 text-zeno-cyan border border-zeno-cyan/30 hover:bg-zeno-cyan/30 rounded text-xs transition-colors"
                                                >
                                                    Retry Now
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {items.length === 0 && !loading && (
                    <div className="p-8 text-center text-gray-400">
                        No failed communications found.
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedItem && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zeno-gray rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-white/10 flex flex-col">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                Communication Details
                                {getStatusBadge(selectedItem.status)}
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
                                    <span className="text-gray-500 block">Recipient</span>
                                    <span className="text-gray-300">{selectedItem.recipient}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Channel</span>
                                    <span className="text-gray-300">{selectedItem.channel}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Retry Count</span>
                                    <span className="text-gray-300">{selectedItem.retryCount}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Failed At</span>
                                    <span className="text-gray-300">{new Date(selectedItem.createdAt).toLocaleString()}</span>
                                </div>
                            </div>

                            {selectedItem.lastError && (
                                <div>
                                    <h3 className="text-sm font-semibold text-red-400 mb-2">Last Error Message</h3>
                                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-red-200 text-sm font-mono whitespace-pre-wrap">
                                        {selectedItem.lastError}
                                    </div>
                                </div>
                            )}

                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-2">Message Content</h3>
                                <pre className="bg-black/50 border border-white/5 p-4 rounded-lg text-gray-300 text-xs whitespace-pre-wrap font-sans">
                                    {selectedItem.subject && <span className="block font-bold mb-2">Subject: {selectedItem.subject}</span>}
                                    {selectedItem.body}
                                </pre>
                            </div>
                        </div>
                        <div className="p-6 border-t border-white/10 shrink-0 flex justify-between items-center">
                            <div className="flex gap-2">
                                {selectedItem.status !== 'SUCCESS' && selectedItem.status !== 'CANCELLED' && (
                                    <>
                                        <button 
                                            onClick={() => handleRetry(selectedItem.id)} 
                                            className="px-4 py-2 bg-zeno-cyan text-black hover:bg-zeno-cyan/90 rounded-lg transition-colors font-medium"
                                        >
                                            Retry Now
                                        </button>
                                        <button 
                                            onClick={() => handleReview(selectedItem.id, 'CANCELLED')} 
                                            className="px-4 py-2 bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-colors"
                                        >
                                            Cancel Message
                                        </button>
                                        <button 
                                            onClick={() => handleReview(selectedItem.id, 'SUCCESS')} 
                                            className="px-4 py-2 bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
                                        >
                                            Mark Resolved
                                        </button>
                                    </>
                                )}
                            </div>
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
