'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const logger = {
    error: (...args: unknown[]) => console.error('[NotificationBell]', ...args),
};

type Notification = {
    id: string;
    type: string;
    title: string;
    message: string;
    caseId: string | null;
    linkUrl: string | null;
    isRead: boolean;
    createdAt: string;
};

const TYPE_ICONS: Record<string, string> = {
    MENTION: '📣',
    STATUS_CHANGE: '🔄',
    COMMENT: '💬',
    ASSIGNMENT: '👤',
    SYSTEM_ALERT: '⚠️',
    DEBT_REVIEW_REMOVAL: '📋',
    NEW_FILE: '📁',
    NEW_LEAD: '🌟',
    OVERDUE: '🚨',
};

export function NotificationBell({ viewAllHref = '/notifications' }: { viewAllHref?: string } = {}) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    // null = not yet fetched (don't show badge yet); number = live count
    const [unreadCount, setUnreadCount] = useState<number | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/notifications?limit=10');
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications ?? []);
                setUnreadCount(data.unreadCount ?? 0);
            }
            // On non-ok response (401, 500 etc), keep the previous count — don't reset to 0
        } catch {
            // Network error — keep previous count so badge doesn't flicker to 0
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAllRead = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true }),
            });
            if (res.ok) {
                setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                setUnreadCount(0);
            }
        } catch (err) {
            logger.error('Failed to mark all as read', err);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (notificationId: string) => {
        try {
            const res = await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationIds: [notificationId] }),
            });
            if (res.ok) {
                setNotifications(prev =>
                    prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
                );
                setUnreadCount(prev => (prev !== null ? Math.max(0, prev - 1) : 0));
            }
        } catch (err) {
            logger.error('Failed to mark as read', err);
        }
    };

    const deleteNotification = async (notificationId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const wasUnread = notifications.find(n => n.id === notificationId)?.isRead === false;
        try {
            const res = await fetch(`/api/notifications?id=${notificationId}`, { method: 'DELETE' });
            if (res.ok) {
                setNotifications(prev => prev.filter(n => n.id !== notificationId));
                if (wasUnread) {
                    setUnreadCount(prev => (prev !== null ? Math.max(0, prev - 1) : 0));
                }
            }
        } catch (err) {
            logger.error('Failed to delete notification', err);
        }
    };

    const deleteAllRead = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/notifications?deleteRead=true', { method: 'DELETE' });
            if (res.ok) {
                setNotifications(prev => prev.filter(n => !n.isRead));
            }
        } catch (err) {
            logger.error('Failed to clear read notifications', err);
        } finally {
            setLoading(false);
        }
    };

    // Only show badge once we have real data (null = loading)
    const showBadge = unreadCount !== null && unreadCount > 0;

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-400 hover:text-white transition-colors"
                aria-label={`Notifications${showBadge ? ` (${unreadCount} unread)` : ''}`}
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                </svg>
                {showBadge && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                        {unreadCount! > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-zeno-navy border border-white/10 rounded-xl shadow-xl z-50">
                    <div className="flex items-center justify-between p-4 border-b border-white/10">
                        <h3 className="text-white font-semibold">
                            Notifications
                            {unreadCount !== null && unreadCount > 0 && (
                                <span className="ml-2 text-xs text-red-400 font-normal">{unreadCount} unread</span>
                            )}
                        </h3>
                        <div className="flex gap-2">
                            {notifications.some(n => n.isRead) && (
                                <button
                                    onClick={deleteAllRead}
                                    disabled={loading}
                                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                                >
                                    Clear read
                                </button>
                            )}
                            {unreadCount !== null && unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    disabled={loading}
                                    className="text-xs text-zeno-cyan hover:text-cyan-300 disabled:opacity-50"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {unreadCount === null ? (
                            <p className="p-4 text-gray-500 text-sm text-center">Loading...</p>
                        ) : notifications.length === 0 ? (
                            <p className="p-4 text-gray-500 text-sm text-center">No notifications</p>
                        ) : (
                            notifications.map(notification => (
                                <div
                                    key={notification.id}
                                    className={`relative group border-b border-white/5 hover:bg-zeno-blue/30 transition-colors ${!notification.isRead ? 'bg-zeno-blue/20' : ''}`}
                                >
                                    <Link
                                        href={notification.linkUrl || viewAllHref}
                                        onClick={() => {
                                            if (!notification.isRead) markAsRead(notification.id);
                                            setIsOpen(false);
                                        }}
                                        className="block p-4 pr-10"
                                    >
                                        <div className="flex gap-3">
                                            <span className="text-lg flex-shrink-0">
                                                {TYPE_ICONS[notification.type] ?? '🔔'}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm ${!notification.isRead ? 'text-white font-medium' : 'text-gray-300'}`}>
                                                    {notification.title}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                                    {notification.message}
                                                </p>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    {mounted ? new Date(notification.createdAt).toLocaleString() : ''}
                                                </p>
                                            </div>
                                            {!notification.isRead && (
                                                <div className="w-2 h-2 bg-zeno-cyan rounded-full flex-shrink-0 mt-2" />
                                            )}
                                        </div>
                                    </Link>
                                    <button
                                        onClick={(e) => deleteNotification(notification.id, e)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Dismiss"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-3 border-t border-white/10 text-center">
                        <Link
                            href={viewAllHref}
                            onClick={() => setIsOpen(false)}
                            className="text-xs text-zeno-cyan hover:text-cyan-300 font-medium transition-colors"
                        >
                            View all notifications →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
