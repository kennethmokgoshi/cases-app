'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PoaType    = 'STANDARD' | 'WESBANK';
type PoaChannel = 'EMAIL' | 'WHATSAPP';
/** SEND = deliver only · SAVE = file under Documents only · SEND_AND_SAVE = both */
type PoaMode    = 'SEND' | 'SAVE' | 'SEND_AND_SAVE';

interface SavedDocument {
    name:     string;
    fileName: string;
    fileUrl:  string;
}

interface DeliveryFailure {
    name:   string;
    reason: string;
}

/** Raw shape returned by POST /api/cases/[id]/poa */
export interface PoaApiResponse {
    success?:        boolean;
    error?:          string;
    message?:        string;
    missingFields?:  string[];
    sentTo?:         string[];
    savedDocuments?: SavedDocument[];
    skippedClients?: string[];
    failures?:       DeliveryFailure[];
}

export interface PoaResultView {
    ok:            boolean;
    /** Success summary when ok, error text otherwise. */
    message:       string;
    missingFields: string[];
    sent:          string[];
    saved:         SavedDocument[];
    skipped:       string[];
    failures:      DeliveryFailure[];
}

/**
 * Turn an API response into what the modal shows.
 *
 * The API is the only authority on what actually happened — a request that
 * delivered nothing must never be reported as a successful send.
 */
export function interpretPoaResponse(
    httpOk:  boolean,
    data:    PoaApiResponse,
    channel: PoaChannel,
): PoaResultView {
    const sent:     string[]          = data.sentTo ?? [];
    const saved:    SavedDocument[]   = data.savedDocuments ?? [];
    const skipped:  string[]          = data.skippedClients ?? [];
    const failures: DeliveryFailure[] = data.failures ?? [];

    if (!httpOk || data.success === false || (sent.length === 0 && saved.length === 0)) {
        const isProfileError = data.error === 'incomplete_staff_profile';
        return {
            ok: false,
            message: isProfileError
                ? (data.message ?? 'Your staff profile is incomplete.')
                : (data.error ?? 'The POA could not be processed. Please try again.'),
            missingFields: isProfileError ? (data.missingFields ?? []) : [],
            sent: [],
            saved: [],
            skipped,
            failures,
        };
    }

    const parts: string[] = [];
    if (sent.length > 0)  parts.push(`sent via ${channel === 'EMAIL' ? 'email' : 'WhatsApp'} to ${sent.join(' & ')}`);
    if (saved.length > 0) parts.push(`saved to case Documents for ${saved.map(d => d.name).join(' & ')}`);

    return {
        ok: true,
        message: `POA ${parts.join(', and ')}.`,
        missingFields: [],
        sent,
        saved,
        skipped,
        failures,
    };
}

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
    /** Called after a POA is saved to case Documents, so the parent can refresh. */
    onSaved?:    () => void;
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
    onSaved,
}: SendPoaModalProps) {
    const [poaType,    setPoaType]    = useState<PoaType>('STANDARD');
    const [channel,    setChannel]    = useState<PoaChannel>('EMAIL');
    const [mode,       setMode]       = useState<PoaMode>('SEND');
    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState('');
    const [success,    setSuccess]    = useState('');
    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [failures,   setFailures]   = useState<DeliveryFailure[]>([]);
    const [successDetails, setSuccessDetails] = useState<{ sent: string[]; saved: SavedDocument[]; skipped: string[] }>({ sent: [], saved: [], skipped: [] });

    if (!isOpen) return null;

    // ── Mode helpers ─────────────────────────────────────────────────────────
    const wantsSend = mode === 'SEND' || mode === 'SEND_AND_SAVE';
    const wantsSave = mode === 'SAVE' || mode === 'SEND_AND_SAVE';
    const channelLabel = channel === 'EMAIL' ? 'Email' : 'WhatsApp';

    // ── DRR awareness ────────────────────────────────────────────────────────
    const serviceList: string[] = (() => {
        try { return JSON.parse(services ?? '[]'); } catch { return []; }
    })();
    const isDRR = serviceList.some(s => s.toLowerCase().includes('flag removal'));
    const dcMissing = isDRR && (!dcName || !dcNcrdcNo);
    // Block send when Standard POA is selected for a DRR case with no DC details
    const sendBlocked = poaType === 'STANDARD' && dcMissing;
    // Saving needs no contact details — only sending does.
    const noContactOnFile = wantsSend && !clientEmail && !clientPhone;

    const resetResults = () => {
        setError('');
        setSuccess('');
        setMissingFields([]);
        setFailures([]);
        setSuccessDetails({ sent: [], saved: [], skipped: [] });
    };

    const handleSubmit = async () => {
        resetResults();
        setLoading(true);

        try {
            const res = await fetch(`/api/cases/${caseId}/poa`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    type: poaType,
                    mode,
                    // Channel is only meaningful when we are delivering.
                    channel: wantsSend ? channel : undefined,
                    includeJointClient: !!jointClientName && (
                        !wantsSend ||
                        (channel === 'EMAIL' && !!jointClientEmail) ||
                        (channel === 'WHATSAPP' && !!jointClientPhone)
                    ),
                }),
            });

            const data: PoaApiResponse = await res.json();

            // The API is the authority on what happened — never assume a send worked.
            const result = interpretPoaResponse(res.ok, data, channel);

            setFailures(result.failures);
            setSuccessDetails({ sent: result.sent, saved: result.saved, skipped: result.skipped });

            if (!result.ok) {
                setMissingFields(result.missingFields);
                setError(result.message);
                return;
            }

            setSuccess(result.message);
            if (result.saved.length > 0) onSaved?.();
        } catch {
            setError('Network error. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        resetResults();
        setPoaType('STANDARD');
        setChannel('EMAIL');
        setMode('SEND');
        onClose();
    };

    const modeOptions: Array<{ value: PoaMode; label: string; hint: string }> = [
        { value: 'SEND',          label: `Send only`,   hint: `Deliver via ${channelLabel}` },
        { value: 'SEND_AND_SAVE', label: 'Send & save', hint: 'Deliver and file a copy' },
        { value: 'SAVE',          label: 'Save only',   hint: 'File under Documents' },
    ];

    const actionLabel = loading
        ? (wantsSend ? 'Sending...' : 'Saving...')
        : mode === 'SAVE'
            ? `Save ${poaType === 'WESBANK' ? 'Wesbank ' : ''}POA to Documents`
            : mode === 'SEND_AND_SAVE'
                ? `Send via ${channelLabel} & Save`
                : `Send ${poaType === 'WESBANK' ? 'Wesbank ' : ''}POA via ${channelLabel}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-navy-900">
                    <div>
                        <h2 className="text-lg font-bold text-white">Power of Attorney</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Generate a pre-filled POA for <span className="text-white font-medium">{clientName}</span> — send it, save it, or both
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

                    {/* What to do with it */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            What should we do with it?
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {modeOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setMode(opt.value)}
                                    className={`rounded-xl border px-3 py-3 text-left transition-all ${
                                        mode === opt.value
                                            ? 'border-blue-500 bg-blue-500/10 text-white'
                                            : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                                    }`}
                                >
                                    <div className="font-semibold text-xs">{opt.label}</div>
                                    <div className="text-[11px] mt-0.5 opacity-70 leading-tight">{opt.hint}</div>
                                </button>
                            ))}
                        </div>
                        {wantsSave && (
                            <p className="mt-2 text-xs text-gray-400">
                                A copy is filed under <strong className="text-gray-300">Documents</strong> as a Zenowethu POA,
                                ready to download, print or hand over.
                            </p>
                        )}
                    </div>

                    {/* Delivery Channel */}
                    {wantsSend && (
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
                    )}

                    {/* Recipients */}
                    <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                        <p className="text-xs font-semibold text-gray-300 mb-3">
                            {wantsSend
                                ? `Will be sent via ${channelLabel}:`
                                : 'A personalised POA will be generated for:'}
                        </p>
                        <div className="space-y-2">
                            {/* Primary Client */}
                            <div className="flex items-start gap-2">
                                <span className="text-green-400 text-sm mt-0.5">✓</span>
                                <div>
                                    <p className="text-xs font-medium text-white">{clientName}</p>
                                    {wantsSend && (
                                        <p className="text-xs text-gray-400">
                                            {channel === 'EMAIL' ? clientEmail || '(no email on file)' : clientPhone || '(no phone on file)'}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Joint Client */}
                            {jointClientName && (
                                <div className="flex items-start gap-2">
                                    {(!wantsSend || (channel === 'EMAIL' ? jointClientEmail : jointClientPhone)) ? (
                                        <>
                                            <span className="text-green-400 text-sm mt-0.5">✓</span>
                                            <div>
                                                <p className="text-xs font-medium text-white">{jointClientName}</p>
                                                {wantsSend && (
                                                    <p className="text-xs text-gray-400">
                                                        {channel === 'EMAIL' ? jointClientEmail : jointClientPhone}
                                                    </p>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-amber-400 text-sm mt-0.5">⚠</span>
                                            <div>
                                                <p className="text-xs font-medium text-amber-300">{jointClientName}</p>
                                                <p className="text-xs text-amber-200">
                                                    No {channel === 'EMAIL' ? 'email' : 'phone'} on file — update the client record, or use “Save only”
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/10">
                            <p className="text-xs text-gray-400">
                                {wantsSend
                                    ? 'Each recipient gets a personalised PDF with their details pre-filled. They can sign online or manually.'
                                    : 'Each PDF is pre-filled with that person’s details, ready for a manual signature.'}
                            </p>
                        </div>
                    </div>

                    {/* No contact details at all */}
                    {noContactOnFile && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                            <p className="text-xs text-amber-200">
                                This client has no email or phone number on file. Choose <strong>Save only</strong> to
                                generate the POA and file it under Documents instead.
                            </p>
                        </div>
                    )}

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
                            {failures.length > 0 && (
                                <ul className="mt-2 text-xs text-red-300 space-y-0.5">
                                    {failures.map(f => <li key={f.name}>• {f.name}: {f.reason}</li>)}
                                </ul>
                            )}
                            {successDetails.skipped.length > 0 && (
                                <p className="text-xs text-red-300 mt-2">
                                    {successDetails.skipped.join(', ')} {successDetails.skipped.length === 1 ? 'has' : 'have'} no contact details for this channel.
                                </p>
                            )}
                            <p className="text-xs text-red-300/80 mt-2">
                                Nothing was delivered. You can retry, or switch to <strong>Save only</strong> to file the POA
                                under Documents and share it manually.
                            </p>
                        </div>
                    )}

                    {/* Success */}
                    {success && (
                        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
                            <p className="text-sm text-green-400 font-medium">{success}</p>

                            {successDetails.saved.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs text-green-300 mb-1">Filed under Documents:</p>
                                    <ul className="text-xs space-y-0.5">
                                        {successDetails.saved.map(doc => (
                                            <li key={doc.fileUrl}>
                                                <a
                                                    href={doc.fileUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-300 underline hover:text-blue-200"
                                                >
                                                    {doc.fileName}
                                                </a>
                                                <span className="text-green-300/70"> — {doc.name}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {failures.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs text-amber-300 mb-1">Not everything succeeded:</p>
                                    <ul className="text-xs text-amber-200 space-y-0.5">
                                        {failures.map(f => <li key={f.name}>• {f.name}: {f.reason}</li>)}
                                    </ul>
                                </div>
                            )}

                            {successDetails.skipped.length > 0 && (
                                <p className="text-xs text-amber-300 mt-2">
                                    Note: {successDetails.skipped.join(', ')} {successDetails.skipped.length === 1 ? 'was' : 'were'} skipped (no contact info for this channel).
                                </p>
                            )}

                            {successDetails.sent.length > 0 && (
                                <p className="text-xs text-green-300 mt-1">
                                    Each recipient will sign and return their document. Once received, upload it under Documents.
                                </p>
                            )}
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
                            onClick={handleSubmit}
                            disabled={loading || noContactOnFile || sendBlocked}
                            title={sendBlocked ? 'Run DHS Auto-Fill first to get the current debt counsellor details' : undefined}
                            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                poaType === 'WESBANK'
                                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                            }`}
                        >
                            {actionLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
