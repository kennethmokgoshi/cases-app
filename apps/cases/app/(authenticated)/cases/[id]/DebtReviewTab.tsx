'use client';

import { useState, useEffect, useCallback } from 'react';
import { GenerateClearanceButton } from '@/components/GenerateClearanceButton';

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

interface OpenAccountRow {
    id:                string;
    creditorName:      string;
    providerName:      string | null;
    accountNumber:     string | null;
    accountType:       string;
    openDate:          string | null;
    balance:           number;
    monthlyInstalment: number | null;
    lastPaymentDate:   string | null;
    lastUpdate:        string;
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

interface AffordabilityCheck {
    dhsStatus:    string | null;
    isDhsStatusA: boolean;
    isDhsStatusC: boolean;
    isDhsStatusD3: boolean;
    isDhsStatusD4: boolean;
    rescissionDocuments: string[];
    d4F1GeneratedDocuments: string[];
    d4F2GeneratedDocuments: string[];
    summary: {
        openAccounts:            number;
        closedAccounts:          number;
        totalOutstandingBalance: number;
        totalMonthlyInstalment:  number;
    };
    income: {
        payslipNetIncome:           number | null;
        payslipSource:              string | null;
        bankStatementSalaryDeposit: number | null;
        bankStatementSalaryDate:    string | null;
        bankConfirmed:              boolean;
        varianceAmount:             number | null;
        notes:                      string[];
    };
    isAffordable:         boolean | null;
    monthlySurplus:       number | null;
    rejectionRecommended: boolean;
    requiredDocuments:    string[];
    openAccountRows:      OpenAccountRow[];
}

interface DebtReviewTabProps {
    caseId: string;
    canApprove: boolean; // isAdmin || isExecutive || isSeniorManager || isManager
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOC_LABELS: Record<string, string> = {
    FORM_16:                     'Form 16',
    FORM_17_1:                   'Form 17.1',
    FORM_17_2A:                  'Form 17.2(a)',
    FORM_17_W:                   'Form 17.W',
    SECTION_86_NOTICE:           'Section 86(2) Notice',
    DEBT_RESTRUCTURING_PROPOSAL: 'Debt Restructuring Proposal',
    AFFORDABILITY_ASSESSMENT:    'Affordability Assessment',
    CONSUMER_INFO_RECORD:        'Record of Consumer Information',
    NOTICE_OF_MOTION:            'Notice of Motion',
    FOUNDING_AFFIDAVIT:          'Founding Affidavit',
    NOTICE_OF_SET_DOWN:          'Notice of Set Down',
    NOTICE_OF_MOTION_RESCISSION: 'Notice of Motion — Rescission',
    COURT_ORDER_GRANTED:         'Court Order Granted',
    PROOF_OF_SERVICE:            'Proof of Service',
    CERTIFIED_FORM_19:           'Certified Form 19',
    FORM_17_2C:                  'Form 17.2(c)',
    SECTION_71_72_STATEMENT:     'Statement: Sections 71(1)(b) and 72',
};

const DOC_DESCRIPTIONS: Record<string, string> = {
    FORM_16:                     'Application for Debt Review — Section 86(1) NCA',
    FORM_17_1:                   'Notification to Credit Providers',
    FORM_17_2A:                  'Rejection of Debt Review Application — Section 86(7)(a) NCA',
    FORM_17_W:                   'Withdrawal from Debt Review',
    SECTION_86_NOTICE:           'Notice of Application — Section 86(2) NCA',
    DEBT_RESTRUCTURING_PROPOSAL: 'Proposed Repayment Schedule for Creditors',
    AFFORDABILITY_ASSESSMENT:    'Income vs Instalments Determination — Section 86(6)(a) NCA',
    CONSUMER_INFO_RECORD:        'Record of Consumer Information Furnished',
    NOTICE_OF_MOTION:            'Application to Court for Debt Review Flag Removal',
    FOUNDING_AFFIDAVIT:          'Sworn Statement with Annexures as Filed at Court',
    NOTICE_OF_SET_DOWN:          'Notice of Hearing Date to Registrar and Respondent',
    NOTICE_OF_MOTION_RESCISSION: 'Application to Rescind the Debt Review Court Order',
    COURT_ORDER_GRANTED:         'Draft Court Order Directing Removal Across All Bureaux',
    PROOF_OF_SERVICE:            'Affidavit Confirming Service on Respondent and NCR',
    CERTIFIED_FORM_19:           'Clearance Certificate for settled restructured debts',
    FORM_17_2C:                  'Notification that all debts are settled except the mortgage',
    SECTION_71_72_STATEMENT:     'Statement confirming settled accounts and mortgage not in arrears',
};

const REJECTION_PACK: string[] = ['FORM_16', 'FORM_17_2A', 'AFFORDABILITY_ASSESSMENT', 'CONSUMER_INFO_RECORD'];

const RESCISSION_PACK: string[] = [
    'NOTICE_OF_MOTION', 'FOUNDING_AFFIDAVIT', 'NOTICE_OF_SET_DOWN',
    'NOTICE_OF_MOTION_RESCISSION', 'COURT_ORDER_GRANTED', 'PROOF_OF_SERVICE',
];

const D4_F1_PACK: string[] = [
    'CERTIFIED_FORM_19', 'FORM_17_2C',
    'DEBT_RESTRUCTURING_PROPOSAL', 'SECTION_71_72_STATEMENT',
];

const D4_F2_PACK: string[] = ['CERTIFIED_FORM_19'];

const zar = (n: number | null | undefined) =>
    n == null ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n);

const dateValue = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString('en-ZA') : '—';

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

    // Affordability check panel
    const [affordability,        setAffordability]        = useState<AffordabilityCheck | null>(null);
    const [affordabilityLoading, setAffordabilityLoading] = useState(true);
    const [generatingPack,       setGeneratingPack]       = useState(false);

    // Status C → G rescission pack
    const [generatingRescission, setGeneratingRescission] = useState(false);
    const [generatingD4F1,        setGeneratingD4F1]        = useState(false);
    const [generatingD4F2,        setGeneratingD4F2]        = useState(false);
    const [courtName,            setCourtName]            = useState('');
    const [courtCaseNumber,      setCourtCaseNumber]      = useState('');

    // Consumer document requests (paid-up letters, mortgage statement)
    const [requestingDoc, setRequestingDoc] = useState<Record<string, boolean>>({});

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

    const fetchAffordability = useCallback(async () => {
        try {
            setAffordabilityLoading(true);
            const res = await fetch(`/api/cases/${caseId}/affordability-check`);
            if (!res.ok) return; // panel is optional — fail quietly, cards still work
            setAffordability(await res.json());
        } catch {
            // non-blocking panel
        } finally {
            setAffordabilityLoading(false);
        }
    }, [caseId]);

    useEffect(() => { fetchData(); fetchAffordability(); }, [fetchData, fetchAffordability]);

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

    // Generates a set of documents sequentially through the debt-review pipeline.
    const generateDocumentPack = async (
        docTypes: string[],
        packLabel: string,
        setBusy: (v: boolean) => void,
        extraBody: Record<string, string> = {},
    ) => {
        setBusy(true);
        let generated = 0;
        try {
            for (const documentType of docTypes) {
                const res = await fetch(`/api/cases/${caseId}/debt-review/generate`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ documentType, ...extraBody }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error ?? `Failed to generate ${DOC_LABELS[documentType]}`);
                generated++;
            }
            showToast(`${packLabel} generated (${generated} documents) — review and approve before sending`);
            await fetchData();
        } catch (e) {
            showToast(
                e instanceof Error
                    ? `${e.message}${generated ? ` — ${generated} of ${docTypes.length} documents generated` : ''}`
                    : `${packLabel} generation failed`,
                'error'
            );
            if (generated > 0) await fetchData();
        } finally {
            setBusy(false);
        }
    };

    // DHS Status A rejection pack: Form 16, Form 17.2(a), Affordability
    // Assessment and Record of Consumer Information Furnished.
    const handleGenerateRejectionPack = () =>
        generateDocumentPack(REJECTION_PACK, 'Rejection pack', setGeneratingPack);

    // DHS Status C → G rescission pack: the six court documents.
    const handleGenerateRescissionPack = () => {
        const extra: Record<string, string> = {};
        if (courtName.trim())       extra.courtName       = courtName.trim();
        if (courtCaseNumber.trim()) extra.courtCaseNumber = courtCaseNumber.trim();
        extra.targetStatus = 'G';
        return generateDocumentPack(RESCISSION_PACK, 'Rescission pack', setGeneratingRescission, extra);
    };

    const handleGenerateD4F1Pack = () =>
        generateDocumentPack(D4_F1_PACK, 'D4 to F1 pack', setGeneratingD4F1, { targetStatus: 'F1' });

    const handleGenerateD4F2Pack = () =>
        generateDocumentPack(D4_F2_PACK, 'D4 to F2 pack', setGeneratingD4F2, { targetStatus: 'F2' });

    // Requests a document from the consumer via the Crediva portal + email.
    const handleRequestConsumerDoc = async (key: string, label: string, notes: string) => {
        setRequestingDoc(prev => ({ ...prev, [key]: true }));
        try {
            const res = await fetch(`/api/cases/${caseId}/document-requests`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ category: 'CORRESPONDENCE', label, notes }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Request failed');
            showToast('Request sent — the consumer has been notified via Crediva and email');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Document request failed', 'error');
        } finally {
            setRequestingDoc(prev => ({ ...prev, [key]: false }));
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

    // Court documents only get a card once generated (or when DHS status is C),
    // so the default list is not cluttered for ordinary debt review cases.
    const courtDocTypes = RESCISSION_PACK.filter(
        t => affordability?.isDhsStatusC || affordability?.isDhsStatusD3 || affordability?.isDhsStatusD4 || data.docsByType[t]
    );
    const d4DocTypes = ['CERTIFIED_FORM_19', 'FORM_17_2C', 'SECTION_71_72_STATEMENT'].filter(
        t => affordability?.isDhsStatusD4 || data.docsByType[t]
    );
    const allDocTypes      = Array.from(new Set([
        'FORM_16', 'FORM_17_1', 'FORM_17_2A', 'SECTION_86_NOTICE',
        'DEBT_RESTRUCTURING_PROPOSAL', 'AFFORDABILITY_ASSESSMENT',
        'CONSUMER_INFO_RECORD', ...courtDocTypes, ...d4DocTypes, 'FORM_17_W',
    ]));
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

            {/* Credit report & affordability check */}
            <div className="bg-zeno-blue/20 border border-white/10 rounded-xl p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h3 className="font-bold text-white text-sm">Credit Report & Affordability Check</h3>
                    {affordability?.dhsStatus && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-300">
                            DHS Status: {affordability.dhsStatus}
                        </span>
                    )}
                </div>

                {affordabilityLoading ? (
                    <div className="flex items-center gap-3 text-zinc-400 text-sm py-6">
                        <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                        Checking credit report and income…
                    </div>
                ) : !affordability ? (
                    <p className="text-xs text-zinc-500 mt-3">
                        Affordability check unavailable — add credit accounts and analyse a payslip and bank statement.
                    </p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
                            {[
                                ['Open Accounts',       String(affordability.summary.openAccounts)],
                                ['Closed Accounts',     String(affordability.summary.closedAccounts)],
                                ['Outstanding Balance', zar(affordability.summary.totalOutstandingBalance)],
                                ['Monthly Instalments', zar(affordability.summary.totalMonthlyInstalment)],
                                ['Net Income (Payslip)', zar(affordability.income.payslipNetIncome)],
                                ['Bank Salary Deposit',  zar(affordability.income.bankStatementSalaryDeposit)],
                            ].map(([label, value]) => (
                                <div key={label} className="bg-black/20 rounded-lg p-3">
                                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
                                    <p className="text-sm font-bold text-white mt-1">{value}</p>
                                </div>
                            ))}
                        </div>

                        {affordability.openAccountRows.length > 0 && (
                            <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                                <table className="w-full min-w-[900px] text-xs">
                                    <thead className="bg-black/25 text-zinc-500 uppercase tracking-wide">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold">Credit provider</th>
                                            <th className="px-3 py-2 text-left font-semibold">Account no.</th>
                                            <th className="px-3 py-2 text-left font-semibold">Open date</th>
                                            <th className="px-3 py-2 text-right font-semibold">Balance</th>
                                            <th className="px-3 py-2 text-right font-semibold">Monthly instalment</th>
                                            <th className="px-3 py-2 text-left font-semibold">Last payment</th>
                                            <th className="px-3 py-2 text-left font-semibold">Last update</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {affordability.openAccountRows.map(account => (
                                            <tr key={account.id} className="bg-black/10">
                                                <td className="px-3 py-2 text-zinc-200">
                                                    <span className="font-medium">{account.providerName ?? account.creditorName}</span>
                                                    <span className="ml-2 text-zinc-600">{account.accountType.replace(/_/g, ' ')}</span>
                                                </td>
                                                <td className="px-3 py-2 text-zinc-400">{account.accountNumber ?? '—'}</td>
                                                <td className="px-3 py-2 text-zinc-400">{dateValue(account.openDate)}</td>
                                                <td className="px-3 py-2 text-right text-zinc-200 font-medium">{zar(account.balance)}</td>
                                                <td className="px-3 py-2 text-right text-zinc-200 font-medium">{zar(account.monthlyInstalment)}</td>
                                                <td className="px-3 py-2 text-zinc-400">{dateValue(account.lastPaymentDate)}</td>
                                                <td className="px-3 py-2 text-zinc-400">{dateValue(account.lastUpdate)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Income verification badge + notes */}
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                affordability.income.bankConfirmed
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-amber-500/20 text-amber-300'
                            }`}>
                                {affordability.income.bankConfirmed
                                    ? 'Income verified against bank statement'
                                    : 'Income not verified against bank statement'}
                            </span>
                            {affordability.monthlySurplus != null && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    affordability.monthlySurplus >= 0
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-red-500/20 text-red-300'
                                }`}>
                                    Monthly {affordability.monthlySurplus >= 0 ? 'surplus' : 'shortfall'}: {zar(Math.abs(affordability.monthlySurplus))}
                                </span>
                            )}
                        </div>
                        {affordability.income.notes.length > 0 && (
                            <ul className="mt-2 space-y-0.5">
                                {affordability.income.notes.map((note, i) => (
                                    <li key={i} className="text-[11px] text-zinc-500">• {note}</li>
                                ))}
                            </ul>
                        )}

                        {/* Verdict + rejection pack */}
                        {affordability.rejectionRecommended && (
                            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                                <div className="min-w-0">
                                    <p className="font-semibold text-red-300 text-sm">
                                        Consumer is NOT over-indebted — application must be rejected
                                        {affordability.isDhsStatusA && ' (DHS Status A → should be Status B)'}
                                    </p>
                                    <p className="text-xs text-red-400/80 mt-1">
                                        Total monthly instalments ({zar(affordability.summary.totalMonthlyInstalment)}) are less than the
                                        verified net income ({zar(affordability.income.payslipNetIncome)}). Generate the rejection pack:
                                        Form 16, Form 17.2(a), Affordability Assessment and Record of Consumer Information Furnished.
                                        Staff approval is still required before anything is sent.
                                    </p>
                                </div>
                                <button
                                    onClick={handleGenerateRejectionPack}
                                    disabled={generatingPack}
                                    className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-colors disabled:opacity-50"
                                >
                                    {generatingPack ? 'Generating pack…' : 'Generate Rejection Pack'}
                                </button>
                            </div>
                        )}
                        {affordability.isAffordable === false && (
                            <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300">
                                Total monthly instalments exceed the consumer&apos;s net income — the consumer appears
                                over-indebted and debt review is the appropriate process.
                            </div>
                        )}
                        {affordability.isAffordable === true && !affordability.rejectionRecommended && (
                            <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
                                Instalments are less than the payslip net income, but the income could not be verified
                                against a bank statement salary deposit. Analyse a recent bank statement before
                                generating the rejection pack, or verify the income manually.
                            </div>
                        )}

                        {/* Status C / D3 / D4 to G: court order rescission pack */}
                        {(affordability.isDhsStatusC || affordability.isDhsStatusD3 || affordability.isDhsStatusD4) && (
                            <div className="mt-4 bg-violet-500/10 border border-violet-500/30 rounded-xl p-4">
                                <p className="font-semibold text-violet-300 text-sm">
                                    DHS Status {affordability.dhsStatus} - court order rescission path (to Status G)
                                </p>
                                <p className="text-xs text-violet-400/80 mt-1">
                                    The consumer is under debt review with a court order. To exit, a magistrate must
                                    rescind the order. Generate the six-document rescission pack: Notice of Motion,
                                    Founding Affidavit, Notice of Set Down, Notice of Motion — Rescission, Court Order
                                    Granted (draft) and Proof of Service. Each document requires staff approval; the
                                    Court Order Granted must be replaced with the stamped order once the court grants it.
                                </p>
                                <div className="mt-3 flex items-end gap-3 flex-wrap">
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-wide text-violet-400/70 mb-1">
                                            Court Name (optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={courtName}
                                            onChange={e => setCourtName(e.target.value)}
                                            placeholder="e.g. Magistrate's Court, Pretoria North"
                                            className="w-64 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-xs placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-wide text-violet-400/70 mb-1">
                                            Court Case Number (optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={courtCaseNumber}
                                            onChange={e => setCourtCaseNumber(e.target.value)}
                                            placeholder="e.g. 12345/2026"
                                            className="w-44 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-xs placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                                        />
                                    </div>
                                    <button
                                        onClick={handleGenerateRescissionPack}
                                        disabled={generatingRescission}
                                        className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-colors disabled:opacity-50"
                                    >
                                        {generatingRescission ? 'Generating pack…' : 'Generate Rescission Pack'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Status D4 to F1/F2: clearance certificate paths */}
                        {affordability.isDhsStatusD4 && (
                            <div className="mt-4 bg-sky-500/10 border border-sky-500/30 rounded-xl p-4">
                                <p className="font-semibold text-sky-300 text-sm">
                                    DHS Status D4 - choose the clearance path
                                </p>
                                <p className="text-xs text-sky-400/80 mt-1">
                                    Use Status F1 when all restructured debts are settled except the mortgage. Use Status F2
                                    when all restructured debts are settled. Paid-up or prescription letters must still be
                                    uploaded by the consumer, requested through Crediva, or requested by email from creditors.
                                    Mortgage not-in-arrears evidence can be the credit report or a statement of account.
                                </p>
                                <div className="mt-3 flex gap-3 flex-wrap">
                                    <button
                                        onClick={handleGenerateD4F1Pack}
                                        disabled={generatingD4F1}
                                        className="px-5 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors disabled:opacity-50"
                                    >
                                        {generatingD4F1 ? 'Generating pack...' : 'Generate D4 to F1 Pack'}
                                    </button>
                                    <button
                                        onClick={handleGenerateD4F2Pack}
                                        disabled={generatingD4F2}
                                        className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-50"
                                    >
                                        {generatingD4F2 ? 'Generating pack...' : 'Generate D4 to F2 Pack'}
                                    </button>
                                    <GenerateClearanceButton
                                        caseId={caseId}
                                        dhsStatus={affordability?.dhsStatus}
                                        documents={data?.documents}
                                        onDocumentGenerated={fetchData}
                                        variant="tab"
                                    />
                                </div>
                                <p className="text-[11px] text-sky-400/70 mt-3">
                                    F1 generated PDFs: Certified Form 19, Form 17.2(c), restructuring proposal and
                                    sections 71(1)(b)/72 statement. F2 generated PDF: Certified Form 19.
                                </p>
                                <div className="mt-3 flex gap-3 flex-wrap">
                                    <button
                                        onClick={() => handleRequestConsumerDoc(
                                            'PAID_UP_LETTERS',
                                            'Paid-up / prescription letters for all settled accounts',
                                            'Please upload the paid-up or prescription letters from each credit provider whose account has been settled. If you do not have them, request them from the credit providers — we can assist if needed.'
                                        )}
                                        disabled={requestingDoc['PAID_UP_LETTERS']}
                                        className="text-xs px-4 py-2 rounded-lg bg-sky-600/20 text-sky-300 hover:bg-sky-600/30 border border-sky-600/30 transition-colors disabled:opacity-50"
                                    >
                                        {requestingDoc['PAID_UP_LETTERS'] ? 'Requesting…' : 'Request Paid-up Letters from Consumer'}
                                    </button>
                                    <button
                                        onClick={() => handleRequestConsumerDoc(
                                            'MORTGAGE_STATEMENT',
                                            'Mortgage statement of account (proof the bond is not in arrears)',
                                            'Please upload your latest home loan / bond statement of account showing the account is up to date. This is required for the F1 (settled except mortgage) clearance path.'
                                        )}
                                        disabled={requestingDoc['MORTGAGE_STATEMENT']}
                                        className="text-xs px-4 py-2 rounded-lg bg-sky-600/20 text-sky-300 hover:bg-sky-600/30 border border-sky-600/30 transition-colors disabled:opacity-50"
                                    >
                                        {requestingDoc['MORTGAGE_STATEMENT'] ? 'Requesting…' : 'Request Mortgage Statement (F1)'}
                                    </button>
                                </div>
                                <p className="text-[11px] text-sky-400/60 mt-2">
                                    Requests open an upload task on the consumer&apos;s Crediva portal and email them a link.
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>

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
