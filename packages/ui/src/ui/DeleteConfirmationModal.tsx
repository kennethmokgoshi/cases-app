'use client';
import { useState, useEffect } from 'react';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    title: string;
    message: React.ReactNode;
    requireInput?: string; // If set, user must type this.
    confirmText?: string;
}

export function DeleteConfirmationModal({
    isOpen, onClose, onConfirm, title, message, requireInput, confirmText = 'Delete'
}: DeleteConfirmationModalProps) {
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setInputValue('');
            setLoading(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isInputValid = !requireInput || inputValue === requireInput;

    const handleConfirm = async () => {
        if (!isInputValid) return;
        setLoading(true);
        try {
            await onConfirm();
            onClose();
        } catch (error) {
            logger.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-zeno-navy border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-red-500/10">
                    <h2 className="text-xl font-bold text-red-500 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
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

                    {requireInput && (
                        <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                            <label className="block text-sm text-gray-400 mb-2">
                                To confirm, type <span className="font-mono font-bold text-white select-all">{requireInput}</span> below:
                            </label>
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                className="w-full px-4 py-2 bg-zeno-blue border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all font-mono text-sm"
                                placeholder={requireInput}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && isInputValid) {
                                        handleConfirm();
                                    }
                                }}
                            />
                        </div>
                    )}
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
                        disabled={!isInputValid || loading}
                        className="px-6 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg shadow-lg shadow-red-500/20 transition-all flex items-center gap-2"
                    >
                        {loading && (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        )}
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
