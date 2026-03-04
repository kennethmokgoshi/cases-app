
'use client';

import { useState, useEffect } from 'react';
import { SERVICES_MAP } from '@zenowethu/config';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

interface EditServicesModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentServices: string[];
    onSave: (selectedServices: string[]) => Promise<void>;
}

export function EditServicesModal({ isOpen, onClose, currentServices, onSave }: EditServicesModalProps) {
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // Initialize state with current services when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedServices(currentServices || []);
        }
    }, [isOpen, currentServices]);

    const handleToggleService = (serviceId: string) => {
        if (selectedServices.includes(serviceId)) {
            setSelectedServices(selectedServices.filter(id => id !== serviceId));
        } else {
            setSelectedServices([...selectedServices, serviceId]);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await onSave(selectedServices);
            onClose();
        } catch (error) {
            logger.error('Failed to save services:', error);
            // Optionally set an error state here
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-zeno-navy border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold text-white">Edit Services Required</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <p className="text-gray-400 text-sm mb-4">Select the services required for this case:</p>
                    <div className="space-y-3">
                        {Object.entries(SERVICES_MAP).map(([id, label]) => (
                            <label key={id} className="flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                                <div className="flex h-5 items-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedServices.includes(id)}
                                        onChange={() => handleToggleService(id)}
                                        className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-zeno-cyan focus:ring-zeno-cyan focus:ring-offset-gray-900"
                                    />
                                </div>
                                <div className="text-sm text-gray-200">
                                    {label}
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-zeno-blue/20 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-6 py-2 bg-zeno-cyan text-zeno-navy font-bold rounded-lg hover:bg-cyan-400 disabled:opacity-50 transition-all shadow-lg shadow-zeno-cyan/20"
                    >
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}
