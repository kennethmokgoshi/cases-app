'use client';
import { useState, useEffect } from 'react';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void> | void;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    variant?: 'danger' | 'default';
}

export function ConfirmDialog({
    isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', variant = 'default'
}: ConfirmDialogProps) {
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLoading(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm();
        } finally {
            setLoading(false);
        }
    };

    const headerBg = variant === 'danger' ? 'bg-red-500/10' : 'bg-zeno-cyan/10';
    const headerTextColor = variant === 'danger' ? 'text-red-500' : 'text-zeno-cyan';
    const btnColor = variant === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy shadow-cyan-500/20';
    const btnTextColor = variant === 'danger' ? 'text-white' : 'text-zeno-navy';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-zeno-navy border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className={`p-6 border-b border-white/10 flex justify-between items-center ${headerBg}`}>
                    <h2 className={`text-xl font-bold flex items-center gap-2 ${headerTextColor}`}>
                        {variant === 'danger' && (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        )}
                        {title}
                    </h2>
                    <button onClick={onClose} disabled={loading} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="text-gray-300 text-sm leading-relaxed">
                        {message}
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-zeno-blue/20">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm font-medium hover:bg-white/5 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className={`px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold rounded-lg shadow-lg transition-all flex items-center gap-2 ${btnColor} ${btnTextColor}`}
                    >
                        {loading && (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                        )}
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
