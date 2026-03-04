'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
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

export function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fetch notifications
    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/notifications?limit=10');
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications);
                setUnreadCount(data.unreadCount);
            }
        } catch (error) {
            logger.error('Failed to fetch notifications', error);
        }
    };

    // Poll for new notifications every 30 seconds
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    // Track client-side hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Mark all as read
    const markAllRead = async () => {
        setLoading(true);
        try {
            await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true }) });
            setNotifications(notifications.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            logger.error('Failed to mark notifications as read', error);
        } finally {
            setLoading(false);
        }
    };

    // Mark single notification as read
    const markAsRead = async (notificationId: string) => {
        try {
            await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationIds: [notificationId] }) });
            setNotifications(notifications.map(n =>
                n.id === notificationId ? { ...n, isRead: true } : n
            ));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            logger.error('Failed to mark notification as read', error);
        }
    };

    // Delete single notification
    const deleteNotification = async (notificationId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await fetch(`/api/notifications?id=${notificationId}`, {
                method: 'DELETE' });
            setNotifications(notifications.filter(n => n.id !== notificationId));
            // If the deleted notification was unread, update the count
            const wasUnread = notifications.find(n => n.id === notificationId)?.isRead === false;
            if (wasUnread) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch (error) {
            logger.error('Failed to delete notification', error);
        }
    };

    // Delete all read notifications
    const deleteAllRead = async () => {
        setLoading(true);
        try {
            await fetch('/api/notifications?deleteRead=true', {
                method: 'DELETE' });
            setNotifications(notifications.filter(n => !n.isRead));
        } catch (error) {
            logger.error('Failed to delete read notifications', error);
        } finally {
            setLoading(false);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'MENTION': return '📣';
            case 'STATUS_CHANGE': return '🔄';
            case 'COMMENT': return '💬';
            case 'ASSIGNMENT': return '👤';
            default: return '🔔';
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-400 hover:text-white transition-colors"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-zeno-navy border border-white/10 rounded-xl shadow-xl z-50">
                    <div className="flex items-center justify-between p-4 border-b border-white/10">
                        <h3 className="text-white font-semibold">Notifications</h3>
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
                            {unreadCount > 0 && (
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
                        {notifications.length === 0 ? (
                            <p className="p-4 text-gray-500 text-sm text-center">No notifications</p>
                        ) : (
                            notifications.map(notification => (
                                <div
                                    key={notification.id}
                                    className={`relative group border-b border-white/5 hover:bg-zeno-blue/30 transition-colors ${!notification.isRead ? 'bg-zeno-blue/20' : ''
                                        }`}
                                >
                                    <Link
                                        href={notification.linkUrl || '#'}
                                        onClick={() => {
                                            if (!notification.isRead) markAsRead(notification.id);
                                            setIsOpen(false);
                                        }}
                                        className="block p-4 pr-10"
                                    >
                                        <div className="flex gap-3">
                                            <span className="text-lg">{getTypeIcon(notification.type)}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm ${!notification.isRead ? 'text-white font-medium' : 'text-gray-300'}`}>
                                                    {notification.title}
                                                </p>
                                                <p className="text-xs text-gray-500 truncate">{notification.message}</p>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    {mounted ? new Date(notification.createdAt).toLocaleString() : ''}
                                                </p>
                                            </div>
                                            {!notification.isRead && (
                                                <div className="w-2 h-2 bg-zeno-cyan rounded-full flex-shrink-0 mt-2" />
                                            )}
                                        </div>
                                    </Link>
                                    {/* Delete button - visible on hover for read notifications */}
                                    {notification.isRead && (
                                        <button
                                            onClick={(e) => deleteNotification(notification.id, e)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Delete notification"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

