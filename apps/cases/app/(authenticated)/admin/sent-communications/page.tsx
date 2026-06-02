'use client';

import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type SentItem = {
    id: string;
    channel: string;
    recipient: string;
    message: string;
    htmlBody: string | null;
    statusCode: string | null;
    provider: string;
    sentAt: string;
    case: { id: string; fileNumber: string; client: { firstName: string; lastName: string } } | null;
    sender: { id: string; name: string | null; email: string } | null;
};

type Pagination = {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export default function SentCommunicationsPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();

    const [items, setItems] = useState<SentItem[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<SentItem | null>(null);

    const [filterChannel, setFilterChannel] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');
    const [page, setPage] = useState(1);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterChannel) params.append('channel', filterChannel);
            if (filterSearch) params.append('search', filterSearch);
            if (filterFrom) params.append('from', filterFrom);
            if (filterTo) params.append('to', filterTo);
            params.append('page', String(page));

            const res = await fetch(`/api/admin/notifications/sent?${params.toString()}`);
            const data = await res.json();
            setItems(data.data ?? []);
            setPagination(data.pagination ?? null);
        } catch {
            // handled silently — empty state shown
        } finally {
            setLoading(false);
        }
    }, [filterChannel, filterSearch, filterFrom, filterTo, page]);

    useEffect(() => {
        if (authStatus === 'authenticated' && !session?.user?.isAdmin) {
            router.push('/');
        } else if (authStatus === 'authenticated') {
            fetchItems();
        }
    }, [authStatus, session, router, fetchItems]);

    const channelIcon = (ch: string) => {
        switch (ch) {
            case 'EMAIL': return '📧';
            case 'SMS': return '📱';
            case 'WHATSAPP': return '💬';
            default: return '🔔';
        }
    };

    const channelBadge = (ch: string) => {
        const map: Record<string, string> = {
            EMAIL: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
            SMS: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            WHATSAPP: 'bg-green-500/20 text-green-300 border-green-500/30',
        };
        return (
            <span className={`px-2 py-1 text-xs font-medium rounded border ${map[ch] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30'}`}>
                {channelIcon(ch)} {ch}
            </span>
        );
    };

    if (authStatus === 'loading' || (loading && items.length === 0)) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan" />
            </div>
        );
    }

    if (!session?.user?.isAdmin) return null;

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
                        <h1 className="text-3xl font-bold text-white">Sent Communications</h1>
                    </div>
                    <p className="text-gray-400">
                        All successfully delivered emails, SMS, and WhatsApp messages
                        {pagination && <span className="ml-2 text-zeno-cyan font-medium">— {pagination.total.toLocaleString()} total</span>}
                    </p>
                </div>
                <button
                    onClick={() => { setPage(1); fetchItems(); }}
                    className="px-4 py-2 bg-zeno-blue/30 text-white border border-zeno-blue/50 rounded-lg hover:bg-zeno-blue/50 flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                <select
                    value={filterChannel}
                    onChange={e => { setFilterChannel(e.target.value); setPage(1); }}
                    className="px-4 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan"
                >
                    <option value="">All Channels</option>
                    <option value="EMAIL">Email</option>
                    <option value="SMS">SMS</option>
                    <option value="WHATSAPP">WhatsApp</option>
                </select>
                <input
                    type="text"
                    placeholder="Search recipient, message, case, client..."
                    value={filterSearch}
                    onChange={e => { setFilterSearch(e.target.value); setPage(1); }}
                    className="px-4 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan min-w-[280px]"
                />
                <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">From</span>
                    <input
                        type="date"
                        value={filterFrom}
                        onChange={e => { setFilterFrom(e.target.value); setPage(1); }}
                        className="px-3 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan"
                    />
                    <span className="text-gray-400 text-sm">To</span>
                    <input
                        type="date"
                        value={filterTo}
                        onChange={e => { setFilterTo(e.target.value); setPage(1); }}
                        className="px-3 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white focus:outline-none focus:border-zeno-cyan"
                    />
                    {(filterFrom || filterTo) && (
                        <button
                            onClick={() => { setFilterFrom(''); setFilterTo(''); setPage(1); }}
                            className="text-gray-400 hover:text-white text-sm"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-zeno-blue/50 border-b border-zeno-blue/50 text-gray-300">
                                <th className="px-6 py-4 font-medium">Channel</th>
                                <th className="px-6 py-4 font-medium">Recipient</th>
                                <th className="px-6 py-4 font-medium">Preview</th>
                                <th className="px-6 py-4 font-medium">Case / Client</th>
                                <th className="px-6 py-4 font-medium">Provider</th>
                                <th className="px-6 py-4 font-medium">Sent At</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zeno-blue/20">
                            {items.map(item => (
                                <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4">{channelBadge(item.channel)}</td>
                                    <td className="px-6 py-4 text-gray-200 font-medium">{item.recipient}</td>
                                    <td className="px-6 py-4 text-gray-400 max-w-xs">
                                        <span className="truncate block">{item.message.slice(0, 80)}{item.message.length > 80 ? '…' : ''}</span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">
                                        {item.case ? (
                                            <Link href={`/cases/${item.case.id}`} className="hover:underline hover:text-zeno-cyan block">
                                                {item.case.fileNumber}
                                            </Link>
                                        ) : (
                                            <span className="text-gray-500">—</span>
                                        )}
                                        {item.case?.client && (
                                            <span className="text-gray-500 text-xs">
                                                {item.case.client.firstName} {item.case.client.lastName}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 text-xs rounded bg-white/5 text-gray-400 border border-white/10">
                                            {item.provider}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-400 whitespace-nowrap">
                                        {new Date(item.sentAt).toLocaleString('en-ZA', {
                                            day: '2-digit', month: 'short', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit',
                                        })}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => setSelected(item)}
                                            className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-gray-300 text-xs transition-colors"
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {items.length === 0 && !loading && (
                    <div className="p-12 text-center">
                        <div className="text-4xl mb-3">📭</div>
                        <p className="text-gray-400">No sent communications found for the selected filters.</p>
                    </div>
                )}

                {loading && (
                    <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-zeno-cyan mx-auto" />
                    </div>
                )}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                    <p className="text-gray-400 text-sm">
                        Showing {((pagination.page - 1) * pagination.pageSize) + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total.toLocaleString()}
                    </p>
                    <div className="flex gap-2">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                            className="px-4 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white disabled:opacity-40 hover:bg-zeno-blue/50"
                        >
                            Previous
                        </button>
                        <span className="px-4 py-2 text-gray-300">
                            Page {pagination.page} of {pagination.totalPages}
                        </span>
                        <button
                            disabled={page === pagination.totalPages}
                            onClick={() => setPage(p => p + 1)}
                            className="px-4 py-2 bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg text-white disabled:opacity-40 hover:bg-zeno-blue/50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {/* Detail modal */}
            {selected && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zeno-gray rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-white/10 flex flex-col">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                {channelBadge(selected.channel)}
                                <span>Message Detail</span>
                            </h2>
                            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-5">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500 block mb-1">Recipient</span>
                                    <span className="text-gray-200">{selected.recipient}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block mb-1">Provider</span>
                                    <span className="text-gray-200">{selected.provider}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block mb-1">Sent At</span>
                                    <span className="text-gray-200">
                                        {new Date(selected.sentAt).toLocaleString('en-ZA', {
                                            day: '2-digit', month: 'long', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                                        })}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block mb-1">Case</span>
                                    {selected.case ? (
                                        <Link href={`/cases/${selected.case.id}`} className="text-zeno-cyan hover:underline">
                                            {selected.case.fileNumber} — {selected.case.client.firstName} {selected.case.client.lastName}
                                        </Link>
                                    ) : (
                                        <span className="text-gray-500">—</span>
                                    )}
                                </div>
                                {selected.sender && (
                                    <div>
                                        <span className="text-gray-500 block mb-1">Sent By</span>
                                        <span className="text-gray-200">{selected.sender.name ?? selected.sender.email}</span>
                                    </div>
                                )}
                                {selected.statusCode && (
                                    <div>
                                        <span className="text-gray-500 block mb-1">Status Trigger</span>
                                        <span className="text-gray-200 font-mono text-xs">{selected.statusCode}</span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-2">Message Content</h3>
                                {selected.htmlBody ? (
                                    <div
                                        className="bg-white rounded-lg p-4 text-gray-900 text-sm overflow-auto max-h-96"
                                        dangerouslySetInnerHTML={{ __html: selected.htmlBody }}
                                    />
                                ) : (
                                    <pre className="bg-black/50 border border-white/5 p-4 rounded-lg text-gray-300 text-xs whitespace-pre-wrap font-sans max-h-96 overflow-auto">
                                        {selected.message}
                                    </pre>
                                )}
                            </div>
                        </div>

                        <div className="p-6 border-t border-white/10 shrink-0 flex justify-end">
                            <button
                                onClick={() => setSelected(null)}
                                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
