'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApprovedBy {
    id:        string;
    firstName: string;
    lastName:  string;
}

interface DebtReviewDoc {
    id:               string;
    documentType:     string;
    status:           string;
    fileUrl:          string | null;
    sentToConsumerAt: string | null;
    approvedAt:       string | null;
    approvedBy:       ApprovedBy | null;
    sentToCreditors:  boolean;
    sentToCreditorAt: string | null;
    emailsSentTo:     string | null; // JSON array
}

interface MissingEmail {
    accountId:    string;
    creditorName: string;
    providerName: string | null;
}

interface DebtReviewData {
    caseId:        string;
    fileNumber:    string;
    documents:     DebtReviewDoc[];
    docsByType:    Record<string, DebtReviewDoc>;
    documentTypes: string[];
    letterheadUrl: string | null;
    missingEmails: MissingEmail[];
}

interface DebtReviewTabProps {
    caseId: string;
    canApprove: boolean; // isAdmin || isExecutive || isSeniorManager || isManager
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOC_LABELS: Record<string, string> = {
    FORM_16:                     'Form 16',
    FORM_17_1:                   'Form 17.1',
    SECTION_86_NOTICE:           'Section 86(2) Notice',
    DEBT_RESTRUCTURING_PROPOSAL: 'Debt Restructuring Proposal',
};

const DOC_DESCRIPTIONS: Record<string, string> = {
    FORM_16:                     'Application for Debt Review — Section 86(1) NCA',
    FORM_17_1:                   'Notification to Credit Providers',
    SECTION_86_NOTICE:           'Notice of Application — Section 86(2) NCA',
    DEBT_RESTRUCTURING_PROPOSAL: 'Proposed Repayment Schedule for Creditors',
};

const STATUS_STYLES: Record<string, string> = {
    DRAFT:              'bg-zinc-700/50 text-zinc-300',
    SENT_FOR_SIGNING:   'bg-blue-500/20 text-blue-300',
    SIGNED:             'bg-purple-500/20 text-purple-300',
    APPROVED:           'bg-emerald-500/20 text-emerald-300',
    SENT_TO_CREDITORS:  'bg-teal-500/20 text-teal-300',
};

const STATUS_LABELS: Record<string, string> = {
    DRAFT:             'Draft',
    SENT_FOR_SIGNING:  'Sent to Consumer',
    SIGNED:            'Signed',
    APPROVED:          'Approved',
    SENT_TO_CREDITORS: 'Sent to Creditors',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function DebtReviewTab({ caseId, canApprove }: DebtReviewTabProps) {
    const [data,    setData]    = useState<DebtReviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState<string | null>(null);

    // Per-document loading states
    const [generating,     setGenerating]     = useState<Record<string, boolean>>({});
    const [approving,      setApproving]      = useState<Record<string, boolean>>({});
    const [sendingConsumer,setSendingConsumer] = useState<Record<string, boolean>>({});
    const [sendingCreditors, setSendingCreditors] = useState(false);

    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`/api/cases/${caseId}/debt-review`);
            if (!res.ok) throw new Error('Failed to load debt review documents');
            const json = await res.json();
            setData(json);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleGenerate = async (documentType: string) => {
        setGenerating(prev => ({ ...prev, [documentType]: true }));
        try {
            const res = await fetch(`/api/cases/${caseId}/debt-review/generate`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ documentType }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Generate failed');
            showToast(`${DOC_LABELS[documentType]} generated successfully`);
            await fetchData();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Generate failed', 'error');
        } finally {
            setGenerating(prev => ({ ...prev, [documentType]: false }));
        }
    };

    const handleApprove = async (doc: DebtReviewDoc) => {
        setApproving(prev => ({ ...prev, [doc.id]: true }));
        try {
            const res = await fetch(`/api/cases/${caseId}/debt-review/${doc.id}/approve`, {
                method: 'PATCH',
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Approve failed');
            showToast(`${DOC_LABELS[doc.documentType]} approved`);
            await fetchData();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Approve failed', 'error');
        } finally {
            setApproving(prev => ({ ...prev, [doc.id]: false }));
        }
    };

    const handleSendConsumer = async (doc: DebtReviewDoc) => {
        setSendingConsumer(prev => ({ ...prev, [doc.id]: true }));
        try {
            const res = await fetch(`/api/cases/${caseId}/debt-review/${doc.id}/send-consumer`, {
                method: 'POST',
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Send failed');
            showToast(`${DOC_LABELS[doc.documentType]} sent to consumer`);
            await fetchData();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Send failed', 'error');
        } finally {
            setSendingConsumer(prev => ({ ...prev, [doc.id]: false }));
        }
    };

    const handleSendCreditors = async () => {
        setSendingCreditors(true);
        try {
            const res = await fetch(`/api/cases/${caseId}/debt-review/send-creditors`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({}),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Send to creditors failed');
            showToast(`Documents sent to ${json.sentTo?.length ?? 0} creditor(s)`);
            await fetchData();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Send to creditors failed', 'error');
        } finally {
            setSendingCreditors(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-zinc-400">
                <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mr-3" />
                Loading debt review documents…
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-red-300 text-sm">
                {error}
                <button onClick={fetchData} className="ml-4 underline text-red-400">Retry</button>
            </div>
        );
    }

    if (!data) return null;

    const allDocTypes      = ['FORM_16', 'FORM_17_1', 'SECTION_86_NOTICE', 'DEBT_RESTRUCTURING_PROPOSAL'];
    const hasApprovedDocs  = data.documents.some(d => d.status === 'APPROVED');
    const allSentToCreditors = data.documents.length > 0 && data.documents.every(d => d.sentToCreditors);

    return (
        <div className="space-y-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl transition-all ${
                    toast.type === 'success'
                        ? 'bg-emerald-500/90 text-white'
                        : 'bg-red-500/90 text-white'
                }`}>
                    {toast.msg}
                </div>
            )}

            {/* Missing email warning */}
            {data.missingEmails.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm">
                    <p className="font-semibold text-amber-300 mb-2">
                        Credit provider email addresses missing ({data.missingEmails.length})
                    </p>
                    <p className="text-amber-400/80 mb-3 text-xs">
                        The following creditors have no email address in the Credit Providers registry.
                        Update them before sending documents to creditors.
                    </p>
                    <ul className="space-y-1">
                        {data.missingEmails.map(m => (
                            <li key={m.accountId} className="flex items-center gap-2 text-amber-300/90 text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                                {m.creditorName}
                                {m.providerName && m.providerName !== m.creditorName && (
                                    <span className="text-amber-400/60">({m.providerName})</span>
                                )}
                            </li>
                        ))}
                    </ul>
                    <a
                        href="/admin/credit-providers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-xs text-amber-300 underline hover:text-amber-200"
                    >
                        Go to Credit Providers registry →
                    </a>
                </div>
            )}

            {/* Document cards */}
            <div className="grid gap-4">
                {allDocTypes.map(docType => {
                    const doc = data.docsByType[docType] as DebtReviewDoc | undefined;
                    const isGenerating = generating[docType];
                    const isApproving  = doc ? approving[doc.id]      : false;
                    const isSending    = doc ? sendingConsumer[doc.id] : false;

                    return (
                        <div key={docType} className="bg-zeno-blue/20 border border-white/10 rounded-xl p-5">
                            <div className="flex items-start justify-between gap-4">
                                {/* Left: label + description */}
                                <div className="min-w-0">
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <h3 className="font-bold text-white text-sm">{DOC_LABELS[docType]}</h3>
                                        {doc && (
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[doc.status] ?? 'bg-zinc-700 text-zinc-300'}`}>
                                                {STATUS_LABELS[doc.status] ?? doc.status}
                                            </span>
                                        )}
                                        {!doc && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
                                                Not generated
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-1">{DOC_DESCRIPTIONS[docType]}</p>

                                    {/* Meta */}
                                    {doc && (
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                                            {doc.approvedBy && (
                                                <span>Approved by {doc.approvedBy.firstName} {doc.approvedBy.lastName}</span>
                                            )}
                                            {doc.sentToConsumerAt && (
                                                <span>Sent to consumer {new Date(doc.sentToConsumerAt).toLocaleDateString('en-ZA')}</span>
                                            )}
                                            {doc.sentToCreditorAt && (
                                                <span>Sent to creditors {new Date(doc.sentToCreditorAt).toLocaleDateString('en-ZA')}</span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Right: actions */}
                                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                                    {/* View PDF */}
                                    {doc?.fileUrl && (
                                        <a
                                            href={doc.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-700/60 text-zinc-200 hover:bg-zinc-600/60 transition-colors"
                                        >
                                            View PDF
                                        </a>
                                    )}

                                    {/* Generate / Regenerate */}
                                    <button
                                        onClick={() => handleGenerate(docType)}
                                        disabled={isGenerating}
                                        className="text-xs px-3 py-1.5 rounded-lg bg-teal-600/20 text-teal-300 hover:bg-teal-600/30 border border-teal-600/30 transition-colors disabled:opacity-50"
                                    >
                                        {isGenerating ? 'Generating…' : doc ? 'Regenerate' : 'Generate'}
                                    </button>

                                    {/* Send to Consumer */}
                                    {doc?.fileUrl && doc.status !== 'SENT_TO_CREDITORS' && (
                                        <button
                                            onClick={() => handleSendConsumer(doc)}
                                            disabled={isSending}
                                            className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-600/30 transition-colors disabled:opacity-50"
                                        >
                                            {isSending ? 'Sending…' : 'Email Consumer'}
                                        </button>
                                    )}

                                    {/* Approve */}
                                    {canApprove && doc?.fileUrl && doc.status !== 'APPROVED' && doc.status !== 'SENT_TO_CREDITORS' && (
                                        <button
                                            onClick={() => handleApprove(doc)}
                                            disabled={isApproving}
                                            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-600/30 transition-colors disabled:opacity-50"
                                        >
                                            {isApproving ? 'Approving…' : 'Approve'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Send to Creditors — bulk action */}
            {hasApprovedDocs && !allSentToCreditors && (
                <div className="bg-teal-500/10 border border-teal-500/30 rounded-xl p-5 flex items-center justify-between gap-4">
                    <div>
                        <p className="font-semibold text-teal-300 text-sm">Ready to send to credit providers</p>
                        <p className="text-xs text-teal-400/80 mt-1">
                            All approved documents will be emailed to each linked credit provider simultaneously.
                        </p>
                    </div>
                    <button
                        onClick={handleSendCreditors}
                        disabled={sendingCreditors || data.missingEmails.length > 0}
                        className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-500 transition-colors disabled:opacity-50"
                    >
                        {sendingCreditors ? 'Sending…' : 'Send to Creditors'}
                    </button>
                </div>
            )}

            {/* All done */}
            {allSentToCreditors && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 text-sm text-emerald-300">
                    All debt review documents have been sent to the credit providers.
                </div>
            )}
        </div>
    );
}
