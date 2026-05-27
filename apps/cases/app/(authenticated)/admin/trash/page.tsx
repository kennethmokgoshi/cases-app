'use client';
import { confirm } from '@zenowethu/ui';


import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@zenowethu/ui';
import Link from 'next/link';

type TrashedCase = {
    id: string;
    fileNumber: string;
    status: string;
    deletedAt: string;
    daysRemaining: number;
    purgeAt: string;
    deletedBy: { firstName: string; lastName: string } | null;
    client: { firstName: string; lastName: string; idNumber: string };
};

export default function TrashPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [cases, setCases] = useState<TrashedCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [purging, setPurging] = useState(false);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const isAdmin = session?.user?.isAdmin === true || session?.user?.role?.toUpperCase() === 'ADMIN';

    useEffect(() => {
        if (status === 'authenticated' && !isAdmin) {
            router.push('/');
        }
    }, [session, status, isAdmin, router]);

    async function fetchTrash() {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/trash');
            if (res.ok) setCases(await res.json());
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { fetchTrash(); }, []);

    async function handleRestore(id: string, fileNumber: string) {
        setRestoringId(id);
        setMessage(null);
        try {
            const res = await fetch(`/api/cases/${id}/restore`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: data.message });
                setCases(prev => prev.filter(c => c.id !== id));
            } else {
                setMessage({ type: 'error', text: data.error || `Failed to restore ${fileNumber}` });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setRestoringId(null);
        }
    }

    async function handlePurgeExpired() {
        if (!await confirm('Permanently delete all cases that have been in trash for 30+ days? This cannot be undone.')) return;
        setPurging(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/trash', { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: data.message });
                await fetchTrash();
            } else {
                setMessage({ type: 'error', text: data.error || 'Purge failed' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setPurging(false);
        }
    }

    if (status === 'loading' || loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan" />
            </div>
        );
    }

    if (!isAdmin) return null;

    const expiredCount = cases.filter(c => c.daysRemaining === 0).length;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Link href="/admin" className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Deleted Files
                        </h1>
                        <p className="text-gray-400 text-sm mt-0.5">
                            Cases are permanently deleted after 30 calendar days. You can restore any case within that window.
                        </p>
                    </div>
                </div>

                {expiredCount > 0 && (
                    <button
                        onClick={handlePurgeExpired}
                        disabled={purging}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {purging ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        )}
                        Purge {expiredCount} Expired {expiredCount === 1 ? 'Case' : 'Cases'}
                    </button>
                )}
            </div>

            {/* Status message */}
            {message && (
                <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
                    message.type === 'success'
                        ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                        : 'bg-red-500/10 border border-red-500/30 text-red-400'
                }`}>
                    {message.type === 'success' ? (
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    )}
                    {message.text}
                </div>
            )}

            {/* Empty state */}
            {cases.length === 0 ? (
                <div className="text-center py-20 bg-white/3 border border-white/10 rounded-xl">
                    <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <p className="text-gray-400 text-lg">Trash is empty</p>
                    <p className="text-gray-600 text-sm mt-1">Deleted cases will appear here for 30 days before permanent removal</p>
                </div>
            ) : (
                <div className="bg-white/3 border border-white/10 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/10 text-left">
                                <th className="px-4 py-3 text-gray-400 font-medium">File Number</th>
                                <th className="px-4 py-3 text-gray-400 font-medium">Client</th>
                                <th className="px-4 py-3 text-gray-400 font-medium">ID Number</th>
                                <th className="px-4 py-3 text-gray-400 font-medium">Status at Deletion</th>
                                <th className="px-4 py-3 text-gray-400 font-medium">Deleted By</th>
                                <th className="px-4 py-3 text-gray-400 font-medium">Deleted On</th>
                                <th className="px-4 py-3 text-gray-400 font-medium">Purge Date</th>
                                <th className="px-4 py-3 text-gray-400 font-medium text-center">Days Left</th>
                                <th className="px-4 py-3 text-gray-400 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {cases.map(c => {
                                const isExpired = c.daysRemaining === 0;
                                const isUrgent = c.daysRemaining <= 3 && !isExpired;
                                return (
                                    <tr key={c.id} className={`transition-colors ${isExpired ? 'bg-red-500/5' : 'hover:bg-white/3'}`}>
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-white font-medium">{c.fileNumber}</span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-300">
                                            {c.client.firstName} {c.client.lastName}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.client.idNumber}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 rounded text-xs bg-white/5 text-gray-400 font-mono">
                                                {c.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-400">
                                            {c.deletedBy ? `${c.deletedBy.firstName} ${c.deletedBy.lastName}` : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400">
                                            {new Date(c.deletedAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400">
                                            {new Date(c.purgeAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {isExpired ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                                                    Expired
                                                </span>
                                            ) : (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    isUrgent
                                                        ? 'bg-orange-500/20 text-orange-400'
                                                        : 'bg-white/5 text-gray-400'
                                                }`}>
                                                    {c.daysRemaining}d
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {!isExpired && (
                                                <button
                                                    onClick={() => handleRestore(c.id, c.fileNumber)}
                                                    disabled={restoringId === c.id}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zeno-cyan/10 border border-zeno-cyan/20 text-zeno-cyan text-xs font-medium rounded-lg hover:bg-zeno-cyan/20 transition-colors disabled:opacity-50"
                                                >
                                                    {restoringId === c.id ? (
                                                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-zeno-cyan border-t-transparent" />
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                    )}
                                                    Restore
                                                </button>
                                            )}
                                            {isExpired && (
                                                <span className="text-xs text-gray-600 italic">Awaiting purge</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-500">
                        <span>{cases.length} file{cases.length !== 1 ? 's' : ''} in trash</span>
                        {expiredCount > 0 && (
                            <span className="text-red-400">{expiredCount} expired — will be removed on next purge</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
