'use client';

import { useState } from 'react';
import { toast } from '@zenowethu/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

type CourtDocType =
    | 'NOTICE_OF_MOTION'
    | 'FOUNDING_AFFIDAVIT'
    | 'NOTICE_OF_SET_DOWN'
    | 'NOTICE_OF_MOTION_RESCISSION'
    | 'COURT_ORDER_GRANTED'
    | 'PROOF_OF_SERVICE';

interface CourtDocDef {
    type:        CourtDocType;
    label:       string;
    description: string;
    icon:        string;
}

interface CourtDocsTabProps {
    caseId:      string;
    fileNumber:  string;
    clientEmail?: string | null;
}

// ── Document definitions ──────────────────────────────────────────────────────

const COURT_DOCS: CourtDocDef[] = [
    {
        type:        'NOTICE_OF_MOTION',
        label:       'Notice of Motion',
        description: 'Application to court for debt review flag removal — names applicant, states relief sought, lists annexures.',
        icon:        '⚖️',
    },
    {
        type:        'FOUNDING_AFFIDAVIT',
        label:       'Founding Affidavit',
        description: 'Sworn statement by applicant — includes account schedule if accounts exist, paid-up letter references if settled accounts exist.',
        icon:        '📜',
    },
    {
        type:        'NOTICE_OF_SET_DOWN',
        label:       'Notice of Set Down',
        description: 'Notifies registrar and respondent of the hearing date and documents filed.',
        icon:        '📅',
    },
    {
        type:        'NOTICE_OF_MOTION_RESCISSION',
        label:       'Notice of Motion — Rescission',
        description: 'Application to rescind or vary the debt review court order / consent order.',
        icon:        '🔄',
    },
    {
        type:        'COURT_ORDER_GRANTED',
        label:       'Court Order Granted',
        description: 'Draft court order directing all four credit bureaux and the NCR to remove the debt review flag.',
        icon:        '🏛️',
    },
    {
        type:        'PROOF_OF_SERVICE',
        label:       'Proof of Service',
        description: 'Affidavit confirming service of the application documents on the respondent and NCR.',
        icon:        '✅',
    },
];

// ── Modal ─────────────────────────────────────────────────────────────────────

interface GenerateModalProps {
    doc:         CourtDocDef;
    caseId:      string;
    fileNumber:  string;
    clientEmail?: string | null;
    onClose:     () => void;
}

function GenerateModal({ doc, caseId, fileNumber, clientEmail, onClose }: GenerateModalProps) {
    const [courtName,       setCourtName]       = useState('');
    const [courtCaseNumber, setCourtCaseNumber] = useState('');
    const [emailTo,         setEmailTo]         = useState(clientEmail ?? '');
    const [mode,            setMode]            = useState<'download' | 'email'>('download');
    const [loading,         setLoading]         = useState(false);

    async function handleGenerate() {
        setLoading(true);
        try {
            const body: Record<string, string> = { docType: doc.type };
            if (courtName.trim())       body.courtName       = courtName.trim();
            if (courtCaseNumber.trim()) body.courtCaseNumber = courtCaseNumber.trim();
            if (mode === 'email' && emailTo.trim()) body.emailTo = emailTo.trim();

            const res = await fetch(`/api/cases/${caseId}/court-docs`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(err.error ?? 'Generation failed');
            }

            if (mode === 'email') {
                const result = await res.json();
                toast.success(result.message ?? 'Document emailed successfully');
                onClose();
            } else {
                // Trigger browser download
                const blob = await res.blob();
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = `${doc.type.toLowerCase().replace(/_/g, '-')}-${fileNumber}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success(`${doc.label} downloaded`);
                onClose();
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to generate document');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                    <div>
                        <div className="text-xl mr-2 inline">{doc.icon}</div>
                        <h3 className="inline text-base font-semibold text-zinc-100">{doc.label}</h3>
                        <p className="mt-1 text-xs text-zinc-400">{doc.description}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-zinc-500 hover:text-zinc-300 ml-3 text-xl leading-none flex-shrink-0"
                    >
                        ×
                    </button>
                </div>

                {/* Optional court details */}
                <div className="space-y-3 mb-5">
                    <div>
                        <label className="block text-xs text-zinc-400 mb-1">Court Name <span className="text-zinc-600">(optional)</span></label>
                        <input
                            type="text"
                            placeholder="e.g. Magistrate's Court, Pretoria"
                            value={courtName}
                            onChange={e => setCourtName(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-zinc-400 mb-1">Court Case Number <span className="text-zinc-600">(optional)</span></label>
                        <input
                            type="text"
                            placeholder="e.g. 12345/2026"
                            value={courtCaseNumber}
                            onChange={e => setCourtCaseNumber(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                        />
                    </div>
                </div>

                {/* Mode toggle */}
                <div className="flex rounded-lg overflow-hidden border border-zinc-700 mb-5">
                    <button
                        onClick={() => setMode('download')}
                        className={`flex-1 py-2 text-sm font-medium transition-colors ${
                            mode === 'download'
                                ? 'bg-amber-500 text-zinc-900'
                                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                    >
                        ⬇ Download PDF
                    </button>
                    <button
                        onClick={() => setMode('email')}
                        className={`flex-1 py-2 text-sm font-medium transition-colors ${
                            mode === 'email'
                                ? 'bg-amber-500 text-zinc-900'
                                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                    >
                        ✉ Email PDF
                    </button>
                </div>

                {mode === 'email' && (
                    <div className="mb-5">
                        <label className="block text-xs text-zinc-400 mb-1">Send to email address</label>
                        <input
                            type="email"
                            placeholder="client@example.com"
                            value={emailTo}
                            onChange={e => setEmailTo(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                        />
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={loading || (mode === 'email' && !emailTo.trim())}
                        className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Generating…' : mode === 'email' ? 'Generate & Email' : 'Generate & Download'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function CourtDocsTab({ caseId, fileNumber, clientEmail }: CourtDocsTabProps) {
    const [activeDoc, setActiveDoc] = useState<CourtDocDef | null>(null);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-semibold text-zinc-100">Court Documents</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Generate personalised PDF court documents for debt review removal. Documents are pre-filled with case data — accounts and paid-up letter details are included only where they exist.
                    </p>
                </div>
            </div>

            {/* Document cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {COURT_DOCS.map((doc, i) => (
                    <div
                        key={doc.type}
                        className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 flex flex-col gap-3 transition-colors"
                    >
                        <div className="flex items-start gap-3">
                            {/* Number badge */}
                            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-amber-400">
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-base">{doc.icon}</span>
                                    <span className="text-sm font-semibold text-zinc-100">{doc.label}</span>
                                </div>
                                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{doc.description}</p>
                            </div>
                        </div>

                        <button
                            onClick={() => setActiveDoc(doc)}
                            className="w-full py-1.5 rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs font-medium transition-colors"
                        >
                            Generate PDF
                        </button>
                    </div>
                ))}
            </div>

            {/* Info note */}
            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-3 text-xs text-zinc-400 leading-relaxed">
                <strong className="text-zinc-300">What gets included automatically:</strong>
                <ul className="mt-1.5 space-y-1 list-disc list-inside">
                    <li>Client name, ID number, and contact details from the case record</li>
                    <li>Joint applicant details — only if a joint client is linked to this case</li>
                    <li>Credit account schedule (Annexure D) — only if this case has credit accounts</li>
                    <li>Paid-up letter references (Annexure E) — only for accounts marked CLOSED or with a paid-up document uploaded</li>
                    <li>Court name and case number — enter above if known, otherwise left blank for completion</li>
                </ul>
            </div>

            {/* Modal */}
            {activeDoc && (
                <GenerateModal
                    doc={activeDoc}
                    caseId={caseId}
                    fileNumber={fileNumber}
                    clientEmail={clientEmail}
                    onClose={() => setActiveDoc(null)}
                />
            )}
        </div>
    );
}
