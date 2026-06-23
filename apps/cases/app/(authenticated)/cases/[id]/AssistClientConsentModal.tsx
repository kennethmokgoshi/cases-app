'use client';

import { useState } from 'react';
import { toast } from '@zenowethu/ui';

interface AssistClientConsentModalProps {
    isOpen: boolean;
    onClose: () => void;
    caseId: string;
    declineReason: string;
}

export function AssistClientConsentModal({
    isOpen,
    onClose,
    caseId,
    declineReason,
}: AssistClientConsentModalProps) {
    const [draftEmail, setDraftEmail] = useState<string>('');
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [clientInfo, setClientInfo] = useState<{
        clientName: string;
        clientId: string;
        idNumber: string;
        currentDc: string;
        whatsappNumber: string | null;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Load and draft email when modal opens
    const handleLoadDraft = async () => {
        if (!isOpen || draftEmail) return;

        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/cases/${caseId}/dhs-decline/draft-client-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ declineReason }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to draft email');
            }

            const data = await res.json();
            setDraftEmail(data.draftEmail);
            setEditedContent(data.draftEmail);
            setClientInfo({
                clientName: data.clientName,
                clientId: data.clientId,
                idNumber: data.idNumber,
                currentDc: data.currentDc,
                whatsappNumber: data.whatsappNumber,
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to draft email';
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async () => {
        if (!clientInfo?.whatsappNumber) {
            setError('Client does not have a WhatsApp number on file');
            toast.error('Client does not have a WhatsApp number on file');
            return;
        }

        setIsSending(true);
        setError(null);
        try {
            const res = await fetch(`/api/cases/${caseId}/dhs-decline/send-client-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    emailContent: isEditing ? editedContent : draftEmail,
                    clientId: clientInfo.clientId,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to send message');
            }

            const data = await res.json();
            toast.success(data.message || 'Message sent successfully');
            onClose();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen) return null;

    // Load draft on first open
    if (!draftEmail && !isLoading && !error) {
        handleLoadDraft();
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Assist Client to Consent
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={isSending}
                        className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4">
                    {isLoading && (
                        <div className="text-center py-8">
                            <div className="inline-block animate-spin">
                                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            </div>
                            <p className="mt-2 text-gray-600">Drafting email...</p>
                        </div>
                    )}

                    {error && !isLoading && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {clientInfo && draftEmail && !isLoading && (
                        <>
                            {/* Client Info */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                <h3 className="font-semibold text-gray-900 mb-2">Client Information</h3>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <p className="text-gray-600">Name</p>
                                        <p className="font-medium text-gray-900">{clientInfo.clientName}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600">ID (last 4)</p>
                                        <p className="font-medium text-gray-900">{clientInfo.idNumber.slice(-4)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600">Current DC</p>
                                        <p className="font-medium text-gray-900">{clientInfo.currentDc}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600">WhatsApp</p>
                                        <p className="font-medium text-gray-900">
                                            {clientInfo.whatsappNumber ? '✓ On file' : '✗ Not on file'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Email Preview / Editor */}
                            <div className="mb-4">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-semibold text-gray-900">
                                        {isEditing ? 'Edit Message' : 'Message Preview'}
                                    </label>
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        disabled={isSending}
                                        className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                                    >
                                        {isEditing ? 'Done Editing' : 'Edit'}
                                    </button>
                                </div>

                                {isEditing ? (
                                    <textarea
                                        value={editedContent}
                                        onChange={(e) => setEditedContent(e.target.value)}
                                        disabled={isSending}
                                        className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 text-sm font-mono resize-none disabled:opacity-50"
                                        rows={12}
                                    />
                                ) : (
                                    <div className="p-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 text-sm whitespace-pre-wrap font-sans">
                                        {draftEmail}
                                    </div>
                                )}
                            </div>

                            {/* Info Box */}
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
                                <p>
                                    <strong>Note:</strong> This message will be sent to the client via WhatsApp. They will receive it
                                    as a text message. Make sure the message is clear and actionable.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSending}
                        className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={isSending || isLoading || !draftEmail || !clientInfo?.whatsappNumber}
                        className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSending ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Sending…
                            </>
                        ) : (
                            <>💬 Send via WhatsApp</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
