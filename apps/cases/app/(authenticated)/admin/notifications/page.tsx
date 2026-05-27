'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, toast } from '@zenowethu/ui';
import Link from 'next/link';

type NotificationItem = {
    id: string;
    channel: string;
    recipient: string;
    subject: string | null;
    body: string;
    status: string;
    retryCount: number;
    lastError: string | null;
    nextRetryAt: string | null;
    createdAt: string;
    case: {
        id: string;
        fileNumber: string;
        client: { id: string; firstName: string; lastName: string } | null;
    } | null;
};

export default function FailedNotificationsPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();

    const [items, setItems] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterChannel, setFilterChannel] = useState<string>('');
    const [selectedItem, setSelectedItem] = useState<NotificationItem | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        if (authStatus === 'authenticated' && !session?.user?.isAdmin) {
            router.push('/');
        } else if (authStatus === 'authenticated') {
            fetchItems();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, authStatus, router, filterStatus, filterChannel]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus) params.set('status', filterStatus);
            if (filterChannel) params.set('channel', filterChannel);
            const res = await fetch(`/api/admin/notifications/failed?${params.toString()}`);
            const data = await res.json();
            if (data.data) setItems(data.data);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
            toast.error('Failed to load notifications');
        } finally {
            setLoading(false);
        }
    };

    const handleRetry = async (id: string) => {
        setActionLoading(id);
        try {
            const res = await fetch(`/api/admin/notifications/failed/${id}/retry`, { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success('Retry sent successfully');
                fetchItems();
                if (selectedItem?.id === id) setSelectedItem(null);
            } else {
                toast.error(data.error || 'Retry failed');
            }
        } catch {
            toast.error('Network error — please try again');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReview = async (id: string, newStatus: 'CANCELLED' | 'SUCCESS') => {
        setActionLoading(id);
        try {
            const res = await fetch(`/api/admin/notifications/failed/${id}/review`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                toast.success(newStatus === 'CANCELLED' ? 'Notification cancelled' : 'Marked as handled');
                fetchItems();
                if (selectedItem?.id === id) setSelectedItem(null);
            } else {
                const data = await res.json();
                toast.error(data.error || 'Action failed');
            }
        } catch {
            toast.error('Network error — please try again');
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Success</span>;
            case 'FAILED_FINAL':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-red-500/20 text-red-300 border border-red-500/30">Failed (Final)</span>;
            case 'PENDING_RETRY':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Pending Retry</span>;
            case 'HUMAN_REVIEW':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">Needs Review</span>;
            case 'CANCELLED':
                return <span className="px-2 py-1 text-xs font-medium rounded bg-gray-500/20 text-gray-400 border border-gray-500/30">Cancelled</span>;
            default:
                return <span className="px-2 py-1 text-xs font-medium rounded bg-gray-500/20 text-gray-300 border border-gray-500/30">{status}</span>;
        }
    };

    const getChannelIcon = (channel: string) => {
        switch (channel) {
            case 'EMAIL':
                return (
                    <span className="flex items-center gap-1 text-blue-300">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Email
                    </span>
                );
            case 'SMS':
                return (
                    <span className="flex items-center gap-1 text-green-300">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        SMS
                    </span>
                );
            case 'WHATSAPP':
                return (
                    <span className="flex items-center gap-1 text-emerald-300">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        WhatsApp
                    </span>
                );
            default:
                return <span className="text-gray-400">{channel}</span>;
        }
    };

    if (authStatus === 'loading' || (loading && items.length === 0)) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (!session?.user?.isAdmin) return null;

    const failedCount = items.filter(i => i.status === 'FAILED_FINAL' || i.status === 'PENDING_RETRY').length;
    const reviewCount = items.filter(i => i.status === 'HUMAN_REVIEW').length;

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
                        <h1 className="text-3xl font-bold text-white">Failed Notifications</h1>
                    </div>
                    <p className="text-gray-400">Messages that failed to send — retry or escalate for manual handling.</p>
                </div>
                <button onClick={fetchItems} disabled={loading} className="px-4 py-2 bg-zeno-blue/30 text-white border border-zeno-blue/50 rounded-lg hover:bg-zeno-blue/50 flex items-center gap-2 disabled:opacity-50 transition-colors">
                    <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total', value: items.length, color: 'text-white' },
                    { label: 'Pending Retry', value: items.filter(i => i.status === 'PENDING_RETRY').length, color: 'text-amber-300' },
                    { label: 'Failed Final', value: items.filter(i => i.status === 'FAILED_FINAL').length, color: 'text-red-300' },
                    { label: 'Needs Review', value: reviewCount, color: 'text-purple-300' },
                ].map(stat => (
                    <div key={stat.label} className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-4 text-center">
                        <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                        <div className="text-gray-500 text-xs mt-1">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Urgent banner */}
            {(failedCount > 0 || reviewCount > 0) && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <p className="text-red-300 text-sm">
                        {failedCount > 0 && <span><strong>{failedCount}</strong> notification{failedCount !== 1 ? 's' : ''} failed or pending retry. </span>}
                        {reviewCount > 0 && <span><strong>{reviewCount}</strong> item{reviewCount !== 1 ? 's' : ''} require{reviewCount === 1 ? 's' : ''} human review.</span>}
                    </p>
                </div>
            )}

            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="px-4 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan text-sm"
                >
                    <option value="">All Statuses</option>
                    <option value="PENDING_RETRY">Pending Retry</option>
                    <option value="FAILED_FINAL">Failed Final</option>
                    <option value="HUMAN_REVIEW">Needs Review</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="SUCCESS">Success</option>
                </select>
                <select
                    value={filterChannel}
                    onChange={e => setFilterChannel(e.target.value)}
                    className="px-4 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan text-sm"
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
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Case / Client</th>
                                <th className="px-6 py-4 font-medium">Recipient</th>
                                <th className="px-6 py-4 font-medium">Retries</th>
                                <th className="px-6 py-4 font-medium">Created</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zeno-blue/20">
                            {items.map(item => (
                                <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4">{getChannelIcon(item.channel)}</td>
                                    <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                                    <td className="px-6 py-4 text-gray-300">
                                        {item.case ? (
                                            <div>
                                                <Link href={`/cases/${item.case.id}`} className="text-zeno-cyan hover:underline font-medium text-xs">
                                                    Case {item.case.fileNumber}
                                                </Link>
                                                {item.case.client && (
                                                    <div className="text-gray-500 text-xs mt-0.5">
                                                        {item.case.client.firstName} {item.case.client.lastName}
                                                    </div>
                                                )}
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400 text-xs">{item.recipient}</td>
                                    <td className="px-6 py-4 text-gray-400">
                                        <span className={item.retryCount >= 3 ? 'text-red-400 font-medium' : ''}>{item.retryCount}</span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 text-xs whitespace-nowrap">
                                        {new Date(item.createdAt).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setSelectedItem(item)}
                                                className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-gray-300 text-xs transition-colors"
                                            >
                                                View
                                            </button>
                                            {item.status !== 'SUCCESS' && item.status !== 'CANCELLED' && (
                                                <button
                                                    onClick={() => handleRetry(item.id)}
                                                    disabled={actionLoading === item.id}
                                                    className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 rounded text-xs transition-colors disabled:opacity-50"
                                                >
                                                    {actionLoading === item.id ? '...' : 'Retry'}
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
                        No failed notifications found. All clear!
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedItem && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zeno-gray rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-white/10 flex flex-col">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                Notification Detail
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
                                    <span className="text-gray-500 block">Channel</span>
                                    <span className="text-gray-300">{selectedItem.channel}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Recipient</span>
                                    <span className="text-gray-300">{selectedItem.recipient}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Retry Count</span>
                                    <span className={`font-medium ${selectedItem.retryCount >= 3 ? 'text-red-300' : 'text-gray-300'}`}>{selectedItem.retryCount}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Created</span>
                                    <span className="text-gray-300">{new Date(selectedItem.createdAt).toLocaleString()}</span>
                                </div>
                                {selectedItem.nextRetryAt && (
                                    <div className="col-span-2">
                                        <span className="text-gray-500 block">Next Retry At</span>
                                        <span className="text-gray-300">{new Date(selectedItem.nextRetryAt).toLocaleString()}</span>
                                    </div>
                                )}
                                {selectedItem.case && (
                                    <div className="col-span-2">
                                        <span className="text-gray-500 block">Case</span>
                                        <Link href={`/cases/${selectedItem.case.id}`} className="text-zeno-cyan hover:underline">
                                            Case {selectedItem.case.fileNumber}
                                            {selectedItem.case.client && ` — ${selectedItem.case.client.firstName} ${selectedItem.case.client.lastName}`}
                                        </Link>
                                    </div>
                                )}
                            </div>

                            {selectedItem.subject && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-400 mb-1">Subject</h3>
                                    <p className="text-gray-300 text-sm">{selectedItem.subject}</p>
                                </div>
                            )}

                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-2">Message Body</h3>
                                <div className="bg-black/50 border border-white/5 p-4 rounded-lg text-gray-300 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                                    {selectedItem.body}
                                </div>
                            </div>

                            {selectedItem.lastError && (
                                <div>
                                    <h3 className="text-sm font-semibold text-red-400 mb-2">Last Error</h3>
                                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-red-200 text-sm font-mono whitespace-pre-wrap">
                                        {selectedItem.lastError}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-white/10 shrink-0 flex justify-between items-center gap-3">
                            <div className="flex gap-2">
                                {selectedItem.status !== 'SUCCESS' && selectedItem.status !== 'CANCELLED' && (
                                    <>
                                        <button
                                            onClick={() => handleRetry(selectedItem.id)}
                                            disabled={actionLoading === selectedItem.id}
                                            className="px-4 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 rounded-lg text-sm transition-colors disabled:opacity-50"
                                        >
                                            {actionLoading === selectedItem.id ? 'Sending...' : 'Retry Now'}
                                        </button>
                                        <button
                                            onClick={() => handleReview(selectedItem.id, 'SUCCESS')}
                                            disabled={actionLoading === selectedItem.id}
                                            className="px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-lg text-sm transition-colors disabled:opacity-50"
                                        >
                                            Mark as Handled
                                        </button>
                                        <button
                                            onClick={() => handleReview(selectedItem.id, 'CANCELLED')}
                                            disabled={actionLoading === selectedItem.id}
                                            className="px-4 py-2 bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30 rounded-lg text-sm transition-colors disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                    </>
                                )}
                            </div>
                            <button onClick={() => setSelectedItem(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white text-sm transition-colors">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
