'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PoaType    = 'STANDARD' | 'WESBANK';
type PoaChannel = 'EMAIL' | 'WHATSAPP';

interface SendPoaModalProps {
    isOpen:     boolean;
    onClose:    () => void;
    caseId:     string;
    clientName: string;
    clientEmail?:    string | null;
    clientPhone?:    string | null;
    // Joint client support
    jointClientName?:  string | null;
    jointClientEmail?: string | null;
    jointClientPhone?: string | null;
    // DRR awareness — passed from case record
    services?:   string | null;   // JSON array string, e.g. '["Debt Review Flag Removal"]'
    dcName?:     string | null;
    dcNcrdcNo?:  string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SendPoaModal({
    isOpen,
    onClose,
    caseId,
    clientName,
    clientEmail,
    clientPhone,
    jointClientName,
    jointClientEmail,
    jointClientPhone,
    services,
    dcName,
    dcNcrdcNo,
}: SendPoaModalProps) {
    const [poaType,    setPoaType]    = useState<PoaType>('STANDARD');
    const [channel,    setChannel]    = useState<PoaChannel>('EMAIL');
    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState('');
    const [success,    setSuccess]    = useState('');
    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [successDetails, setSuccessDetails] = useState<{ sent: string[]; skipped: string[] }>({ sent: [], skipped: [] });

    if (!isOpen) return null;

    // ── DRR awareness ────────────────────────────────────────────────────────
    const serviceList: string[] = (() => {
        try { return JSON.parse(services ?? '[]'); } catch { return []; }
    })();
    const isDRR = serviceList.some(s => s.toLowerCase().includes('flag removal'));
    const dcMissing = isDRR && (!dcName || !dcNcrdcNo);
    // Block send when Standard POA is selected for a DRR case with no DC details
    const sendBlocked = poaType === 'STANDARD' && dcMissing;

    const handleSend = async () => {
        setError('');
        setSuccess('');
        setMissingFields([]);
        setSuccessDetails({ sent: [], skipped: [] });
        setLoading(true);

        try {
            const res = await fetch(`/api/cases/${caseId}/poa`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    type: poaType,
                    channel,
                    includeJointClient: !!jointClientName && (
                        (channel === 'EMAIL' && jointClientEmail) ||
                        (channel === 'WHATSAPP' && jointClientPhone)
                    ),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.error === 'incomplete_staff_profile') {
                    setMissingFields(data.missingFields ?? []);
                    setError(data.message ?? 'Your staff profile is incomplete.');
                } else {
                    setError(data.error ?? 'Something went wrong. Please try again.');
                }
                return;
            }

            const channelLabel = channel === 'EMAIL' ? 'email' : 'WhatsApp';
            const sent = data.sentTo ?? [clientName];
            const skipped = data.skippedClients ?? [];

            setSuccessDetails({ sent, skipped });
            let message = `POA sent successfully via ${channelLabel}`;
            if (sent.length > 1) {
                message += ` to ${sent.join(' & ')}.`;
            } else {
                message += ` to ${sent[0]}.`;
            }
            setSuccess(message);
        } catch {
            setError('Network error. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setError('');
        setSuccess('');
        setMissingFields([]);
        setSuccessDetails({ sent: [], skipped: [] });
        setPoaType('STANDARD');
        setChannel('EMAIL');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-navy-900">
                    <div>
                        <h2 className="text-lg font-bold text-white">Send Power of Attorney</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Generate and send a pre-filled POA to <span className="text-white font-medium">{clientName}</span>
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5">

                    {/* POA Type */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            POA Type
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setPoaType('STANDARD')}
                                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                                    poaType === 'STANDARD'
                                        ? 'border-blue-500 bg-blue-500/10 text-white'
                                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                                }`}
                            >
                                <div className="font-semibold text-sm">Standard ZDM POA</div>
                                <div className="text-xs mt-0.5 opacity-70">Credit bureau & debt counselling</div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setPoaType('WESBANK')}
                                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                                    poaType === 'WESBANK'
                                        ? 'border-amber-500 bg-amber-500/10 text-white'
                                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                                }`}
                            >
                                <div className="font-semibold text-sm">Wesbank POA</div>
                                <div className="text-xs mt-0.5 opacity-70">Specific to Wesbank account dealings</div>
                            </button>
                        </div>

                        {poaType === 'WESBANK' && (
                            <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                                <span className="text-amber-400 mt-0.5">⚠</span>
                                <p className="text-xs text-amber-300">
                                    The Wesbank POA includes your staff details as the Authorised Agent.
                                    Ensure your <strong>ID Number</strong> and <strong>Residential Address</strong> are
                                    set in <a href="/account" className="underline hover:text-amber-200">Account Settings</a> before sending.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* DRR — DC details missing warning */}
                    {isDRR && poaType === 'STANDARD' && (
                        <div className={`rounded-xl border px-4 py-3 ${dcMissing ? 'border-amber-500/40 bg-amber-500/10' : 'border-green-500/30 bg-green-500/10'}`}>
                            <div className="flex items-start gap-2">
                                <span className={`text-lg leading-none mt-0.5 ${dcMissing ? 'text-amber-400' : 'text-green-400'}`}>
                                    {dcMissing ? '⚠' : '✓'}
                                </span>
                                <div>
                                    <p className={`text-xs font-semibold mb-1 ${dcMissing ? 'text-amber-300' : 'text-green-300'}`}>
                                        {dcMissing
                                            ? 'Debt Review Flag Removal — DC details required'
                                            : 'Debt Review Flag Removal — DC details on file'}
                                    </p>
                                    {dcMissing ? (
                                        <>
                                            <p className="text-xs text-amber-200 leading-relaxed">
                                                This case is a <strong>Debt Review Flag Removal</strong>. Section 4 of the Standard POA
                                                must include the current debt counsellor&apos;s name and NCRDC number so the consumer can authorise
                                                the transfer.
                                            </p>
                                            <p className="text-xs text-amber-200 mt-1.5 leading-relaxed">
                                                Please run <strong>DHS Auto-Fill</strong> on this case first (use the DHS Lookup button),
                                                then return here to send the POA.
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-xs text-green-200">
                                            DC: <strong>{dcName}</strong> &nbsp;·&nbsp; NCRDC: <strong>{dcNcrdcNo}</strong>
                                            <br />Section 4 will be pre-filled automatically.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Delivery Channel */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            Send Via
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setChannel('EMAIL')}
                                disabled={!clientEmail}
                                className={`rounded-xl border px-4 py-3 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                    channel === 'EMAIL'
                                        ? 'border-blue-500 bg-blue-500/10 text-white'
                                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                                }`}
                            >
                                <div className="font-semibold text-sm">Email</div>
                                <div className="text-xs mt-0.5 opacity-70 truncate">
                                    {clientEmail ?? 'No email on file'}
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setChannel('WHATSAPP')}
                                disabled={!clientPhone}
                                className={`rounded-xl border px-4 py-3 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                    channel === 'WHATSAPP'
                                        ? 'border-green-500 bg-green-500/10 text-white'
                                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                                }`}
                            >
                                <div className="font-semibold text-sm">WhatsApp</div>
                                <div className="text-xs mt-0.5 opacity-70">
                                    {clientPhone ?? 'No phone on file'}
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Recipients */}
                    <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                        <p className="text-xs font-semibold text-gray-300 mb-3">Will be sent via {channel === 'EMAIL' ? 'Email' : 'WhatsApp'}:</p>
                        <div className="space-y-2">
                            {/* Primary Client */}
                            <div className="flex items-start gap-2">
                                <span className="text-green-400 text-sm mt-0.5">✓</span>
                                <div>
                                    <p className="text-xs font-medium text-white">{clientName}</p>
                                    <p className="text-xs text-gray-400">
                                        {channel === 'EMAIL' ? clientEmail || '(no email on file)' : clientPhone || '(no phone on file)'}
                                    </p>
                                </div>
                            </div>

                            {/* Joint Client */}
                            {jointClientName && (
                                <div className="flex items-start gap-2">
                                    {(channel === 'EMAIL' ? jointClientEmail : jointClientPhone) ? (
                                        <>
                                            <span className="text-green-400 text-sm mt-0.5">✓</span>
                                            <div>
                                                <p className="text-xs font-medium text-white">{jointClientName}</p>
                                                <p className="text-xs text-gray-400">
                                                    {channel === 'EMAIL' ? jointClientEmail : jointClientPhone}
                                                </p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-amber-400 text-sm mt-0.5">⚠</span>
                                            <div>
                                                <p className="text-xs font-medium text-amber-300">{jointClientName}</p>
                                                <p className="text-xs text-amber-200">
                                                    No {channel === 'EMAIL' ? 'email' : 'phone'} on file — update client record to send
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/10">
                            <p className="text-xs text-gray-400">Each recipient gets a personalised PDF with their details pre-filled. They can sign online or manually.</p>
                        </div>
                    </div>

                    {/* Error / incomplete profile warning */}
                    {error && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                            <p className="text-sm text-red-400 font-medium">{error}</p>
                            {missingFields.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs text-red-300 mb-1">Missing fields in your staff profile:</p>
                                    <ul className="text-xs text-red-300 space-y-0.5">
                                        {missingFields.map(f => <li key={f}>• {f}</li>)}
                                    </ul>
                                    <a
                                        href="/account"
                                        className="inline-block mt-2 text-xs text-amber-400 underline hover:text-amber-300"
                                    >
                                        Go to Account Settings to update your profile →
                                    </a>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Success */}
                    {success && (
                        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
                            <p className="text-sm text-green-400 font-medium">{success}</p>
                            {successDetails.skipped.length > 0 && (
                                <p className="text-xs text-amber-300 mt-2">
                                    Note: {successDetails.skipped.join(', ')} {successDetails.skipped.length === 1 ? 'was' : 'were'} skipped (no contact info for this channel).
                                </p>
                            )}
                            <p className="text-xs text-green-300 mt-1">
                                Each recipient will sign and return their document. Once received, upload it under Documents.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        {success ? 'Close' : 'Cancel'}
                    </button>

                    {!success && (
                        <button
                            onClick={handleSend}
                            disabled={loading || (!clientEmail && !clientPhone) || sendBlocked}
                            title={sendBlocked ? 'Run DHS Auto-Fill first to get the current debt counsellor details' : undefined}
                            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                poaType === 'WESBANK'
                                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                            }`}
                        >
                            {loading ? 'Sending...' : `Send ${poaType === 'WESBANK' ? 'Wesbank ' : ''}POA via ${channel === 'EMAIL' ? 'Email' : 'WhatsApp'}`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
