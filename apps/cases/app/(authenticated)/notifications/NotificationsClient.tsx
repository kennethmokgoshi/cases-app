'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

export type NotificationWithCase = {
    id: string;
    type: string;
    title: string;
    message: string;
    caseId: string | null;
    commentId: string | null;
    linkUrl: string | null;
    isRead: boolean;
    readAt: string | null;
    createdAt: string;
    case?: {
        fileNumber: string;
        client?: { firstName: string; lastName: string } | null;
    } | null;
};

type Props = {
    initialNotifications: NotificationWithCase[];
    totalUnread: number;
    /** Base path for case links - lets the B2B portal reuse this client pointed at its own case routes. */
    baseCasePath?: string;
};

const TYPE_META: Record<string, { label: string; icon: string; source: string; color: string; tab: string }> = {
    MENTION:               { label: 'Mention',              icon: '📣', source: 'Case Comment',      color: 'bg-purple-500/20 text-purple-300 border-purple-500/30', tab: 'ACTIVITY' },
    STATUS_CHANGE:         { label: 'Status Change',        icon: '🔄', source: 'Case Automation',   color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',       tab: 'ACTIVITY' },
    COMMENT:               { label: 'Comment',              icon: '💬', source: 'Case Comment',      color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', tab: 'ACTIVITY' },
    ASSIGNMENT:            { label: 'Assignment',           icon: '👤', source: 'Case Management',   color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',        tab: 'ACTIVITY' },
    SYSTEM_ALERT:          { label: 'System Alert',         icon: '⚠️',  source: 'Automation / DHS', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',  tab: 'ACTIVITY' },
    DEBT_REVIEW_REMOVAL:   { label: 'Debt Review Removal',  icon: '📋', source: 'DRR Trigger',       color: 'bg-orange-500/20 text-orange-300 border-orange-500/30',  tab: 'DEBT_REVIEW' },
    NEW_FILE:              { label: 'New File',             icon: '📁', source: 'XDS Bureau Sync',   color: 'bg-teal-500/20 text-teal-300 border-teal-500/30',        tab: 'DOCUMENTS' },
    NEW_LEAD:              { label: 'New Lead',             icon: '🌟', source: 'GHL / OPSGENTY',    color: 'bg-green-500/20 text-green-300 border-green-500/30',     tab: 'ACTIVITY' },
    OVERDUE:               { label: 'Overdue',              icon: '🚨', source: 'Overdue Scan',      color: 'bg-red-500/20 text-red-300 border-red-500/30',           tab: 'ACTIVITY' },
};

function getMeta(type: string) {
    return TYPE_META[type] ?? { label: type, icon: '🔔', source: 'System', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30', tab: 'ACTIVITY' };
}

/** Build the case URL so the right tab opens and the specific comment is highlighted */
function buildCaseUrl(n: NotificationWithCase, baseCasePath: string): string {
    if (!n.caseId) return n.linkUrl ?? '#';
    const meta = getMeta(n.type);
    const params = new URLSearchParams({ tab: meta.tab });
    if (n.commentId) params.set('comment', n.commentId);
    return `${baseCasePath}/${n.caseId}?${params.toString()}`;
}

const ALL_FILTER_TABS = [
    { key: 'ALL',                 label: 'All' },
    { key: 'OVERDUE',             label: 'Overdue' },
    { key: 'MENTION',             label: 'Mentions' },
    { key: 'ASSIGNMENT',          label: 'Assignments' },
    { key: 'STATUS_CHANGE',       label: 'Status Changes' },
    { key: 'COMMENT',             label: 'Comments' },
    { key: 'SYSTEM_ALERT',        label: 'System / DHS' },
    { key: 'NEW_LEAD',            label: 'New Leads' },
    { key: 'DEBT_REVIEW_REMOVAL', label: 'Debt Review Removal' },
    { key: 'NEW_FILE',            label: 'New File' },
];

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ConfirmDeleteModal({ count, onConfirm, onCancel }: {
    count: number;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
                className="relative bg-[#0d1f38] border border-red-500/30 rounded-2xl shadow-2xl p-6 max-w-sm w-full"
                onClick={e => e.stopPropagation()}
            >
                <p className="text-white font-semibold text-lg mb-2">Delete {count} read notification{count !== 1 ? 's' : ''}?</p>
                <p className="text-gray-400 text-sm mb-6">This cannot be undone. Notifications will be permanently removed.</p>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-xl text-sm transition-colors">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="flex-1 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl text-sm font-medium transition-colors">
                        Delete permanently
                    </button>
                </div>
            </div>
        </div>
    );
}

function DetailPanel({ n, allNotifications, onClose, onMarkRead, onMarkAllCaseRead, onDelete, isPending, baseCasePath }: {
    n: NotificationWithCase;
    allNotifications: NotificationWithCase[];
    onClose: () => void;
    onMarkRead: (id: string) => void;
    onMarkAllCaseRead: (caseId: string) => void;
    onDelete: (id: string) => void;
    isPending: boolean;
    baseCasePath: string;
}) {
    const meta = getMeta(n.type);
    const clientName = n.case?.client
        ? `${n.case.client.firstName} ${n.case.client.lastName}`
        : null;

    // Other unread notifications for the same case
    const otherCaseNotifications = n.caseId
        ? allNotifications.filter(x => x.caseId === n.caseId && x.id !== n.id)
        : [];
    const otherUnread = otherCaseNotifications.filter(x => !x.isRead);

    const caseUrl = buildCaseUrl(n, baseCasePath);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-lg bg-[#0d1f38] border border-white/15 rounded-2xl shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-white/10">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl flex-shrink-0 ${meta.color}`}>
                        {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-base leading-snug">{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{timeAgo(n.createdAt)} · {meta.source}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Full message */}
                <div className="p-5 space-y-4">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{n.message}</p>
                    </div>

                    {/* Metadata grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="bg-white/5 rounded-lg p-3">
                            <p className="text-gray-500 mb-1">Source</p>
                            <p className="text-gray-200 font-medium">{meta.source}</p>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3">
                            <p className="text-gray-500 mb-1">Received</p>
                            <p className="text-gray-200 font-medium">
                                {new Date(n.createdAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
                            </p>
                        </div>
                        {n.case?.fileNumber && (
                            <div className="bg-white/5 rounded-lg p-3">
                                <p className="text-gray-500 mb-1">Case</p>
                                <p className="text-gray-200 font-medium">{n.case.fileNumber}</p>
                            </div>
                        )}
                        {clientName && (
                            <div className="bg-white/5 rounded-lg p-3">
                                <p className="text-gray-500 mb-1">Client</p>
                                <p className="text-gray-200 font-medium">{clientName}</p>
                            </div>
                        )}
                        <div className="bg-white/5 rounded-lg p-3">
                            <p className="text-gray-500 mb-1">Status</p>
                            <p className={`font-medium ${n.isRead ? 'text-gray-400' : 'text-zeno-cyan'}`}>
                                {n.isRead
                                    ? `Read${n.readAt ? ' · ' + new Date(n.readAt).toLocaleDateString('en-ZA') : ''}`
                                    : 'Unread'}
                            </p>
                        </div>
                    </div>

                    {/* Other notifications for this case */}
                    {otherCaseNotifications.length > 0 && (
                        <div className={`rounded-xl border p-4 ${otherUnread.length > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/5 border-white/10'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className={`text-xs font-semibold ${otherUnread.length > 0 ? 'text-orange-300' : 'text-gray-400'}`}>
                                        {otherCaseNotifications.length} more notification{otherCaseNotifications.length !== 1 ? 's' : ''} for {n.case?.fileNumber}
                                        {otherUnread.length > 0 && ` · ${otherUnread.length} unread`}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {otherCaseNotifications.slice(0, 3).map(x => getMeta(x.type).label).join(', ')}
                                        {otherCaseNotifications.length > 3 && ` and ${otherCaseNotifications.length - 3} more`}
                                    </p>
                                </div>
                                {otherUnread.length > 0 && n.caseId && (
                                    <button
                                        onClick={() => onMarkAllCaseRead(n.caseId!)}
                                        disabled={isPending}
                                        className="flex-shrink-0 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                                    >
                                        Mark all read
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-2 p-4 border-t border-white/10">
                    {n.caseId && (
                        <Link
                            href={caseUrl}
                            onClick={() => {
                                // Mark ALL notifications for this case as read when opening the case
                                if (n.caseId) onMarkAllCaseRead(n.caseId);
                                onClose();
                            }}
                            className="flex-1 text-center px-4 py-2.5 bg-zeno-cyan/20 hover:bg-zeno-cyan/30 text-zeno-cyan border border-zeno-cyan/30 rounded-xl text-sm font-medium transition-colors"
                        >
                            Open case {n.case?.fileNumber ?? ''}
                            {otherCaseNotifications.length > 0 && (
                                <span className="ml-1.5 text-xs opacity-70">+{otherCaseNotifications.length} more</span>
                            )}
                        </Link>
                    )}
                    {!n.caseId && n.linkUrl && (
                        <Link
                            href={n.linkUrl}
                            onClick={onClose}
                            className="flex-1 text-center px-4 py-2.5 bg-zeno-cyan/20 hover:bg-zeno-cyan/30 text-zeno-cyan border border-zeno-cyan/30 rounded-xl text-sm font-medium transition-colors"
                        >
                            View details →
                        </Link>
                    )}
                    {!n.isRead && (
                        <button
                            onClick={() => { onMarkRead(n.id); onClose(); }}
                            disabled={isPending}
                            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-xl text-sm transition-colors disabled:opacity-50"
                        >
                            Mark read
                        </button>
                    )}
                    <button
                        onClick={() => { onDelete(n.id); onClose(); }}
                        disabled={isPending}
                        title="Permanently remove this notification"
                        className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm transition-colors disabled:opacity-50"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

export function NotificationsClient({ initialNotifications, baseCasePath = '/cases' }: Props) {
    const [notifications, setNotifications] = useState(initialNotifications);
    const [activeTab, setActiveTab] = useState('ALL');
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isPending, startTransition] = useTransition();

    const filtered = notifications.filter(n => {
        if (activeTab !== 'ALL' && n.type !== activeTab) return false;
        if (unreadOnly && n.isRead) return false;
        return true;
    });

    const unreadCount = notifications.filter(n => !n.isRead).length;
    const readCount = notifications.filter(n => n.isRead).length;
    const selectedNotification = selectedId ? notifications.find(n => n.id === selectedId) ?? null : null;

    const typeCounts = notifications.reduce<Record<string, number>>((acc, n) => {
        acc[n.type] = (acc[n.type] ?? 0) + 1;
        return acc;
    }, {});

    const markRead = (ids: string[]) => {
        startTransition(async () => {
            await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationIds: ids }),
            });
            setNotifications(prev => prev.map(n =>
                ids.includes(n.id) ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
            ));
        });
    };

    const markAllCaseRead = (caseId: string) => {
        const ids = notifications
            .filter(n => n.caseId === caseId && !n.isRead)
            .map(n => n.id);
        if (ids.length > 0) markRead(ids);
    };

    const markAllRead = () => {
        startTransition(async () => {
            await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true }),
            });
            setNotifications(prev => prev.map(n => ({
                ...n,
                isRead: true,
                readAt: n.readAt ?? new Date().toISOString(),
            })));
        });
    };

    const deleteOne = (id: string) => {
        startTransition(async () => {
            await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' });
            setNotifications(prev => prev.filter(n => n.id !== id));
        });
    };

    const deleteAllRead = () => {
        startTransition(async () => {
            await fetch('/api/notifications?deleteRead=true', { method: 'DELETE' });
            setNotifications(prev => prev.filter(n => !n.isRead));
            setShowDeleteConfirm(false);
        });
    };

    // Clicking a row opens the detail panel AND marks it as read (you're reading it)
    const handleRowClick = (n: NotificationWithCase) => {
        setSelectedId(n.id);
        if (!n.isRead) markRead([n.id]);
    };

    return (
        <>
            {selectedNotification && (
                <DetailPanel
                    n={selectedNotification}
                    allNotifications={notifications}
                    onClose={() => setSelectedId(null)}
                    onMarkRead={(id) => markRead([id])}
                    onMarkAllCaseRead={markAllCaseRead}
                    onDelete={deleteOne}
                    isPending={isPending}
                    baseCasePath={baseCasePath}
                />
            )}

            {showDeleteConfirm && (
                <ConfirmDeleteModal
                    count={readCount}
                    onConfirm={deleteAllRead}
                    onCancel={() => setShowDeleteConfirm(false)}
                />
            )}

            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Notifications</h1>
                        <p className="text-sm text-gray-400 mt-1">
                            {unreadCount > 0
                                ? `${unreadCount} unread · ${notifications.length} total`
                                : `All ${notifications.length} read`}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                disabled={isPending}
                                className="px-4 py-2 text-sm bg-zeno-blue/40 hover:bg-zeno-blue/60 text-white rounded-lg border border-white/10 transition-colors disabled:opacity-50"
                            >
                                Mark all read
                            </button>
                        )}
                        {readCount > 0 && (
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={isPending}
                                className="px-4 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 transition-colors disabled:opacity-50"
                            >
                                Delete read ({readCount})
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: 'Total',   value: notifications.length,                                                          color: 'text-white' },
                        { label: 'Unread',  value: unreadCount,                                                                   color: 'text-red-400' },
                        { label: 'Overdue', value: typeCounts['OVERDUE'] ?? 0,                                                    color: 'text-orange-400' },
                        { label: 'Alerts',  value: (typeCounts['SYSTEM_ALERT'] ?? 0) + (typeCounts['DEBT_REVIEW_REMOVAL'] ?? 0), color: 'text-yellow-400' },
                    ].map(stat => (
                        <div key={stat.label} className="bg-zeno-navy/60 border border-white/10 rounded-xl p-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</p>
                            <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Source breakdown */}
                {notifications.length > 0 && (
                    <div className="bg-zeno-navy/40 border border-white/10 rounded-xl p-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">By source — click to filter</p>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                                const meta = getMeta(type);
                                return (
                                    <button
                                        key={type}
                                        onClick={() => setActiveTab(prev => prev === type ? 'ALL' : type)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${meta.color} ${activeTab === type ? 'ring-2 ring-white/30' : 'opacity-80 hover:opacity-100'}`}
                                    >
                                        <span>{meta.icon}</span>
                                        <span>{meta.label}</span>
                                        <span className="bg-white/10 px-1.5 py-0.5 rounded-full">{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Filter tabs */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                    {ALL_FILTER_TABS.filter(t => t.key === 'ALL' || typeCounts[t.key]).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                activeTab === tab.key
                                    ? 'bg-zeno-cyan/20 text-zeno-cyan border border-zeno-cyan/30'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {tab.label}
                            {tab.key !== 'ALL' && typeCounts[tab.key] && (
                                <span className="ml-1.5 text-xs opacity-60">{typeCounts[tab.key]}</span>
                            )}
                        </button>
                    ))}
                    <div className="ml-auto flex-shrink-0">
                        <button
                            onClick={() => setUnreadOnly(v => !v)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                unreadOnly
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {unreadOnly ? 'Showing unread only' : 'Show unread only'}
                        </button>
                    </div>
                </div>

                {/* Notification list */}
                <div className="space-y-2">
                    {filtered.length === 0 ? (
                        <div className="text-center py-16 text-gray-500">
                            <p className="text-4xl mb-3">🔔</p>
                            <p className="text-lg font-medium text-gray-400">No notifications</p>
                            <p className="text-sm mt-1">
                                {unreadOnly ? 'No unread notifications in this category.' : 'Nothing here yet.'}
                            </p>
                        </div>
                    ) : (
                        filtered.map(n => {
                            const meta = getMeta(n.type);
                            const clientName = n.case?.client
                                ? `${n.case.client.firstName} ${n.case.client.lastName}`
                                : null;

                            // Count other notifications for same case to show badge
                            const caseNotifCount = n.caseId
                                ? notifications.filter(x => x.caseId === n.caseId && x.id !== n.id).length
                                : 0;

                            return (
                                <div
                                    key={n.id}
                                    className={`group relative rounded-xl border transition-colors cursor-pointer ${
                                        n.isRead
                                            ? 'bg-zeno-navy/30 border-white/5 hover:border-white/15'
                                            : 'bg-zeno-blue/20 border-zeno-cyan/20 hover:border-zeno-cyan/40'
                                    }`}
                                    onClick={() => handleRowClick(n)}
                                >
                                    <div className="flex items-start gap-4 p-4">
                                        {/* Unread dot */}
                                        <div className="mt-1 flex-shrink-0 w-2">
                                            {!n.isRead && <div className="w-2 h-2 bg-zeno-cyan rounded-full" />}
                                        </div>

                                        {/* Icon */}
                                        <div className={`flex-shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center text-lg ${meta.color}`}>
                                            {meta.icon}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm font-medium truncate ${n.isRead ? 'text-gray-400' : 'text-white'}`}>
                                                    {n.title}
                                                </p>
                                                <span className="flex-shrink-0 text-xs text-gray-600 whitespace-nowrap">{timeAgo(n.createdAt)}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>

                                            {/* Meta row */}
                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs ${meta.color}`}>
                                                    {meta.source}
                                                </span>
                                                {n.case?.fileNumber && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-gray-300">
                                                        📁 {n.case.fileNumber}
                                                        {clientName && <span className="text-gray-500 ml-1">· {clientName}</span>}
                                                    </span>
                                                )}
                                                {/* Badge: other notifications for same case */}
                                                {caseNotifCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/20 text-xs text-orange-400">
                                                        +{caseNotifCount} more for this case
                                                    </span>
                                                )}
                                                {n.isRead && <span className="text-xs text-gray-600">Read</span>}
                                            </div>
                                        </div>

                                        {/* Quick actions */}
                                        <div
                                            className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {!n.isRead && (
                                                <button
                                                    onClick={() => markRead([n.id])}
                                                    disabled={isPending}
                                                    title="Mark as read"
                                                    className="p-1.5 text-gray-500 hover:text-zeno-cyan rounded-lg hover:bg-white/5 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => deleteOne(n.id)}
                                                disabled={isPending}
                                                title="Delete permanently"
                                                className="p-1.5 text-gray-600 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {notifications.length > 0 && (
                    <p className="text-center text-xs text-gray-600 pb-4">
                        {filtered.length} of {notifications.length} notifications · Read notifications stay until you delete them
                    </p>
                )}
            </div>
        </>
    );
}
