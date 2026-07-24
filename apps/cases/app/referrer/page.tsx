'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { signOut, useSession, confirm, toast } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';

type ReferrerProfile = {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    cellNumber: string | null;
    bankName: string | null;
    accountNumber: string | null;
    accountType: string | null;
    branchCode: string | null;
    accountHolderName: string | null;
    referrerType: string;
    clientDiscountPercent: number | null;
    commissionType: string;
    fixedCommissionAmount: number;
};

type PortalStatusTone = 'settled' | 'completed' | 'progress' | 'detour' | 'attention' | 'lost' | 'neutral';

type ReferralRow = {
    caseId: string;
    fileNumber: string;
    consumerLabel: string;
    referralStatus: string;
    statusTone: PortalStatusTone;
    caseStatus: string;
    createdAt: string;
    settledAt: string | null;
    completedAt: string | null;
    quoteTotal: number | null;
    quoteDate: string | null;
    quoteStatuses: string[];
    totalPaid: number;
    paidThisMonth: number;
    paidLastMonth: number;
    commissionId: string | null;
    commissionAmount: number;
    commissionStage: string;
    commissionStatus: string;
    isEligible: boolean;
    isPaid: boolean;
    paidAt: string | null;
    paymentRef: string | null;
    lastUpdatedAt: string;
};

type PaymentQuery = {
    id: string;
    caseId: string;
    commissionId: string | null;
    fileNumber: string;
    consumerLabel: string;
    status: string;
    claimedPaidAt: string | null;
    claimedAmount: number;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
};

type PortalComment = {
    id: string;
    content: string;
    createdAt: string;
    authorName: string;
    fromReferrer: boolean;
};

type ReferralDetail = {
    caseId: string;
    fileNumber: string;
    consumerLabel: string;
    createdAt: string;
    lastUpdatedAt: string;
    referralStatus: string;
    commissionStage: string;
    referrerType: string;
    clientDiscountPercent: number | null;
    services: string[];
    financials: {
        quoteTotal: number | null;
        totalPaid: number;
        outstanding: number | null;
        payments: { id: string; amount: number; date: string }[];
    } | null;
    documents: { id: string; label: string; uploadedAt: string }[];
    workflow: {
        label: string;
        description: string | null;
        categoryName: string | null;
        stageNumber: number | null;
        isLost: boolean;
        isOverdue: boolean;
        percent: number;
        barClass: string;
    };
    statusHistory: { id: string; from: string | null; to: string; timestamp: string }[];
    commission: { amount: number; status: string; paidAt: string | null; paymentRef: string | null };
    comments: PortalComment[];
    pendingQuote: { id: string; invoiceNumber: string; total: number } | null;
};

type DiscountPartnerSummary = {
    totalReferrals: number;
    referralsThisMonth: number;
    referralsLastMonth: number;
    totalInProgress: number;
    inProgressThisMonth: number;
    inProgressLastMonth: number;
    totalSettledNotCompleted: number;
    settledNotCompletedThisMonth: number;
    settledNotCompletedLastMonth: number;
    totalCompletedNotSettled: number;
    completedNotSettledThisMonth: number;
    completedNotSettledLastMonth: number;
    totalBothSettledAndCompleted: number;
    bothSettledAndCompletedThisMonth: number;
    bothSettledAndCompletedLastMonth: number;
    totalLost: number;
    lostThisMonth: number;
    lostLastMonth: number;
    totalQuoted: number;
    quotedThisMonth: number;
    quotedLastMonth: number;
    totalPaid: number;
    paidThisMonth: number;
    paidLastMonth: number;
    totalSettledPaid: number;
    settledPaidThisMonth: number;
    settledPaidLastMonth: number;
    totalCompletedOutstanding: number;
    completedOutstandingThisMonth: number;
    completedOutstandingLastMonth: number;
    totalExpectedRevenue: number;
    expectedRevenueThisMonth: number;
    expectedRevenueLastMonth: number;
};

type MissingClientReport = {
    id: string;
    clientName: string;
    idNumber: string | null;
    notes: string | null;
    status: string;
    linkedCaseId: string | null;
    createdAt: string;
};

type QuoteStats = {
    totalCount: number;
    totalAmount: number;
    acceptedCount: number;
    acceptedAmount: number;
    pendingCount: number;
    pendingAmount: number;
    rejectedCount: number;
    rejectedAmount: number;
};

type PortalSummary = {
    referrer: ReferrerProfile;
    summary: {
        totalReferrals: number;
        commissionEarned: number;
        commissionPending: number;
        commissionPaid: number;
    };
    discountSummary: DiscountPartnerSummary | null;
    quoteStats: QuoteStats | null;
    referrals: ReferralRow[];
    paymentQueries: PaymentQuery[];
    missingClientReports: MissingClientReport[];
};

type ProfileForm = {
    email: string;
    cellNumber: string;
    bankName: string;
    accountNumber: string;
    accountType: string;
    branchCode: string;
    accountHolderName: string;
};

// Colour language for referral statuses: settled = happy green, completed =
// bright gold (job done, payment outstanding), progress = we're on it,
// detour = stumbling block we're working through, attention = overdue.
const STATUS_TONE_CLASSES: Record<PortalStatusTone, string> = {
    settled: 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300',
    completed: 'border-yellow-400/50 bg-yellow-400/15 text-yellow-300',
    progress: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
    detour: 'border-orange-400/50 bg-orange-400/15 text-orange-300',
    attention: 'border-red-400/50 bg-red-400/15 text-red-300',
    lost: 'border-slate-500/40 bg-slate-500/10 text-slate-400',
    neutral: 'border-white/10 bg-white/[0.04] text-slate-200',
};

function statusToneClass(tone?: PortalStatusTone): string {
    return STATUS_TONE_CLASSES[tone ?? 'neutral'] ?? STATUS_TONE_CLASSES.neutral;
}

const STAGE_LABELS: Record<string, string> = {
    NEW_LEAD: 'New Lead',
    ADMIN_FEE_PAID: 'Admin Fee Paid',
    QUOTE_SUBMITTED: 'Quote Submitted',
    QUOTE_ACCEPTED: 'Quote Accepted',
    DEPOSIT_PAID: 'Deposit Paid',
    PAYING_INSTALMENTS: 'Paying instalments',
    UP_TO_DATE: 'Up to Date',
    ARREARS_1M: '1 Month in Arrears',
    ARREARS_2M: '2 Months in Arrears',
    ARREARS_3M: '3 Months in Arrears',
    ARREARS_4M_PLUS: '4+ Months in Arrears',
    HANDED_OVER: 'Handed Over',
    SETTLED: 'Settled',
};

function getStageToneClass(stage: string): string {
    switch (stage) {
        case 'NEW_LEAD':
            return 'border-slate-500/40 bg-slate-500/10 text-slate-300';
        case 'ADMIN_FEE_PAID':
        case 'QUOTE_SUBMITTED':
        case 'QUOTE_ACCEPTED':
            return 'border-blue-400/40 bg-blue-400/10 text-blue-200';
        case 'DEPOSIT_PAID':
        case 'PAYING_INSTALMENTS':
        case 'UP_TO_DATE':
            return 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200';
        case 'ARREARS_1M':
        case 'ARREARS_2M':
        case 'ARREARS_3M':
            return 'border-orange-400/50 bg-orange-400/15 text-orange-300';
        case 'ARREARS_4M_PLUS':
        case 'HANDED_OVER':
            return 'border-red-400/50 bg-red-400/15 text-red-300';
        case 'SETTLED':
            return 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300';
        default:
            return 'border-white/10 bg-white/[0.04] text-slate-200';
    }
}

/** True when the date falls in the calendar month `monthOffset` months ago (0 = this month, 1 = last month). */
function isInCalendarMonth(value: string | null, monthOffset: 0 | 1): boolean {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
}

function calendarMonthName(monthOffset: 0 | 1): string {
    const now = new Date();
    return new Intl.DateTimeFormat('en-ZA', { month: 'long' })
        .format(new Date(now.getFullYear(), now.getMonth() - monthOffset, 1));
}

type ReferralFilterId =
    | 'all'
    | 'referrals-this-month'
    | 'referrals-last-month'
    | 'in-progress'
    | 'in-progress-this-month'
    | 'in-progress-last-month'
    | 'settled-not-completed'
    | 'settled-not-completed-this-month'
    | 'settled-not-completed-last-month'
    | 'completed-not-settled'
    | 'completed-not-settled-this-month'
    | 'completed-not-settled-last-month'
    | 'both-settled-and-completed'
    | 'both-settled-and-completed-this-month'
    | 'both-settled-and-completed-last-month'
    | 'work-pipeline'
    | 'work-pipeline-in-progress'
    | 'work-pipeline-settled'
    | 'completed-work'
    | 'completed-work-outstanding'
    | 'completed-work-paid'
    | 'lost'
    | 'lost-this-month'
    | 'lost-last-month'
    | 'not-quoted'
    | 'quoted'
    | 'quoted-this-month'
    | 'quoted-last-month'
    | 'quoted-accepted'
    | 'quoted-pending'
    | 'quoted-declined'
    | 'paid'
    | 'paid-this-month'
    | 'paid-last-month'
    | 'settled-paid'
    | 'settled-paid-this-month'
    | 'settled-paid-last-month'
    | 'completed-outstanding'
    | 'completed-outstanding-this-month'
    | 'completed-outstanding-last-month'
    | 'expected-revenue'
    | 'expected-revenue-this-month'
    | 'expected-revenue-last-month';

const REFERRAL_FILTERS: Record<ReferralFilterId, { label: string; matches: (row: ReferralRow) => boolean }> = {
    'all': { label: 'All referrals', matches: () => true },
    'referrals-this-month': { label: 'Referred this month', matches: (row) => isInCalendarMonth(row.createdAt, 0) },
    'referrals-last-month': { label: 'Referred last month', matches: (row) => isInCalendarMonth(row.createdAt, 1) },
    'in-progress': { label: 'In progress', matches: (row) => row.statusTone !== 'settled' && row.statusTone !== 'completed' && row.statusTone !== 'lost' },
    'in-progress-this-month': { label: 'In progress this month', matches: (row) => row.statusTone !== 'settled' && row.statusTone !== 'completed' && row.statusTone !== 'lost' && isInCalendarMonth(row.createdAt, 0) },
    'in-progress-last-month': { label: 'In progress last month', matches: (row) => row.statusTone !== 'settled' && row.statusTone !== 'completed' && row.statusTone !== 'lost' && isInCalendarMonth(row.createdAt, 1) },
    'settled-not-completed': { label: 'Settled (not completed)', matches: (row) => row.statusTone === 'settled' },
    'settled-not-completed-this-month': { label: 'Settled this month', matches: (row) => row.statusTone === 'settled' && isInCalendarMonth(row.settledAt, 0) },
    'settled-not-completed-last-month': { label: 'Settled last month', matches: (row) => row.statusTone === 'settled' && isInCalendarMonth(row.settledAt, 1) },
    'completed-not-settled': { label: 'Completed — payment outstanding', matches: (row) => row.statusTone === 'completed' },
    'completed-not-settled-this-month': { label: 'Completed this month', matches: (row) => row.statusTone === 'completed' && isInCalendarMonth(row.completedAt, 0) },
    'completed-not-settled-last-month': { label: 'Completed last month', matches: (row) => row.statusTone === 'completed' && isInCalendarMonth(row.completedAt, 1) },
    'both-settled-and-completed': { label: 'Both settled and completed', matches: (row) => row.statusTone === 'settled' && row.statusTone === 'completed' },
    'both-settled-and-completed-this-month': { label: 'Both settled and completed this month', matches: (row) => row.statusTone === 'settled' && row.statusTone === 'completed' && isInCalendarMonth(row.completedAt, 0) },
    'both-settled-and-completed-last-month': { label: 'Both settled and completed last month', matches: (row) => row.statusTone === 'settled' && row.statusTone === 'completed' && isInCalendarMonth(row.completedAt, 1) },
    'work-pipeline': { label: 'Work Pipeline', matches: (row) => row.statusTone === 'progress' || row.statusTone === 'detour' || row.statusTone === 'attention' || row.statusTone === 'neutral' },
    'work-pipeline-in-progress': { label: 'In Progress (being worked)', matches: (row) => row.statusTone === 'progress' || row.statusTone === 'detour' || row.statusTone === 'attention' || row.statusTone === 'neutral' },
    'work-pipeline-settled': { label: 'Settled (awaiting work)', matches: (row) => row.statusTone === 'settled' },
    'completed-work': { label: 'Completed Work', matches: (row) => row.statusTone === 'completed' },
    'completed-work-outstanding': { label: 'Awaiting Payment', matches: (row) => row.statusTone === 'completed' },
    'completed-work-paid': { label: 'Fully Paid', matches: (row) => row.statusTone === 'settled' },
    'lost': { label: 'Lost', matches: (row) => row.statusTone === 'lost' },
    'lost-this-month': { label: 'Lost this month', matches: (row) => row.statusTone === 'lost' && isInCalendarMonth(row.createdAt, 0) },
    'lost-last-month': { label: 'Lost last month', matches: (row) => row.statusTone === 'lost' && isInCalendarMonth(row.createdAt, 1) },
    'not-quoted': { label: 'Not Quoted', matches: (row) => !row.quoteStatuses || row.quoteStatuses.length === 0 },
    'quoted': { label: 'Quoted', matches: (row) => row.quoteStatuses && row.quoteStatuses.length > 0 },
    'quoted-this-month': { label: 'Quoted this month', matches: (row) => row.quoteTotal != null && row.quoteTotal > 0 && isInCalendarMonth(row.quoteDate, 0) },
    'quoted-last-month': { label: 'Quoted last month', matches: (row) => row.quoteTotal != null && row.quoteTotal > 0 && isInCalendarMonth(row.quoteDate, 1) },
    'quoted-accepted': { label: 'Quote accepted', matches: (row) => row.quoteStatuses && row.quoteStatuses.some((status) => ['ACCEPTED', 'CONVERTED', 'PAID', 'PARTIALLY_PAID'].includes(status)) },
    'quoted-pending': { label: 'Quote pending', matches: (row) => row.quoteStatuses && row.quoteStatuses.some((status) => ['SENT', 'OVERDUE'].includes(status)) },
    'quoted-declined': { label: 'Quote declined', matches: (row) => row.quoteStatuses && row.quoteStatuses.some((status) => ['REJECTED', 'CANCELLED'].includes(status)) },
    'paid': { label: 'Files with payments', matches: (row) => row.totalPaid > 0 },
    'paid-this-month': { label: 'Paid this month', matches: (row) => row.paidThisMonth > 0 },
    'paid-last-month': { label: 'Paid last month', matches: (row) => row.paidLastMonth > 0 },
    'settled-paid': { label: 'Settled Amount', matches: (row) => row.statusTone === 'settled' && row.totalPaid > 0 },
    'settled-paid-this-month': { label: 'Settled Paid this month', matches: (row) => row.statusTone === 'settled' && row.paidThisMonth > 0 },
    'settled-paid-last-month': { label: 'Settled Paid last month', matches: (row) => row.statusTone === 'settled' && row.paidLastMonth > 0 },
    'completed-outstanding': { label: 'Outstanding Balance (Completed files)', matches: (row) => row.statusTone === 'completed' && (row.quoteTotal ?? 0) - row.totalPaid > 0 },
    'completed-outstanding-this-month': { label: 'Outstanding Balance (Completed files) this month', matches: (row) => row.statusTone === 'completed' && (row.quoteTotal ?? 0) - row.totalPaid > 0 && isInCalendarMonth(row.completedAt, 0) },
    'completed-outstanding-last-month': { label: 'Outstanding Balance (Completed files) last month', matches: (row) => row.statusTone === 'completed' && (row.quoteTotal ?? 0) - row.totalPaid > 0 && isInCalendarMonth(row.completedAt, 1) },
    'expected-revenue': { label: 'Expected Revenue files', matches: (row) => (row.quoteStatuses && row.quoteStatuses.some((status) => ['ACCEPTED', 'CONVERTED', 'PAID', 'PARTIALLY_PAID'].includes(status))) || (row.statusTone === 'completed' && (row.quoteTotal ?? 0) - row.totalPaid > 0) },
    'expected-revenue-this-month': { label: 'Expected Revenue files this month', matches: (row) => (row.quoteStatuses && row.quoteStatuses.some((status) => ['ACCEPTED', 'CONVERTED', 'PAID', 'PARTIALLY_PAID'].includes(status)) && isInCalendarMonth(row.quoteDate, 0)) || (row.statusTone === 'completed' && (row.quoteTotal ?? 0) - row.totalPaid > 0 && isInCalendarMonth(row.completedAt, 0)) },
    'expected-revenue-last-month': { label: 'Expected Revenue files last month', matches: (row) => (row.quoteStatuses && row.quoteStatuses.some((status) => ['ACCEPTED', 'CONVERTED', 'PAID', 'PARTIALLY_PAID'].includes(status)) && isInCalendarMonth(row.quoteDate, 1)) || (row.statusTone === 'completed' && (row.quoteTotal ?? 0) - row.totalPaid > 0 && isInCalendarMonth(row.completedAt, 1)) },
};

function formatMoney(value: number): string {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
    }).format(value);
}

function formatDate(value: string | null): string {
    if (!value) return 'Pending';
    return new Intl.DateTimeFormat('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(value));
}

function toProfileForm(profile: ReferrerProfile): ProfileForm {
    return {
        email: profile.email ?? '',
        cellNumber: profile.cellNumber ?? '',
        bankName: profile.bankName ?? '',
        accountNumber: profile.accountNumber ?? '',
        accountType: profile.accountType ?? '',
        branchCode: profile.branchCode ?? '',
        accountHolderName: profile.accountHolderName ?? '',
    };
}

function nullableFormValue(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export default function ReferrerPortalPage() {
    const router = useRouter();
    const { status } = useSession();
    const [portalData, setPortalData] = useState<PortalSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMessage, setProfileMessage] = useState('');
    const [selectedCaseId, setSelectedCaseId] = useState('');
    const [claimedPaidAt, setClaimedPaidAt] = useState('');
    const [claimedAmount, setClaimedAmount] = useState('');
    const [queryNotes, setQueryNotes] = useState('');
    const [querySubmitting, setQuerySubmitting] = useState(false);
    const [queryMessage, setQueryMessage] = useState('');
    const [detail, setDetail] = useState<ReferralDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const [commentText, setCommentText] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [commentError, setCommentError] = useState('');
    const [referralFilter, setReferralFilter] = useState<ReferralFilterId>('all');

    // Missing Client reporting state
    const [showMissingClientModal, setShowMissingClientModal] = useState(false);
    const [missingClientName, setMissingClientName] = useState('');
    const [missingClientIdNumber, setMissingClientIdNumber] = useState('');
    const [missingClientNotes, setMissingClientNotes] = useState('');
    const [missingClientSubmitting, setMissingClientSubmitting] = useState(false);
    const [missingClientMessage, setMissingClientMessage] = useState('');

    // Not My Client modal state
    const [showNotMyClientModal, setShowNotMyClientModal] = useState(false);
    const [notMyClientSubmitting, setNotMyClientSubmitting] = useState(false);

    // Payment Report state
    const [showPaymentReportModal, setShowPaymentReportModal] = useState(false);
    const [reportPaymentAmount, setReportPaymentAmount] = useState('');
    const [reportPaymentDate, setReportPaymentDate] = useState('');
    const [reportPaymentNotes, setReportPaymentNotes] = useState('');
    const [reportPaymentFile, setReportPaymentFile] = useState<File | null>(null);
    const [reportPaymentSubmitting, setReportPaymentSubmitting] = useState(false);
    const [reportPaymentError, setReportPaymentError] = useState('');

    // Quote Decision state
    const [quoteDecisionSubmitting, setQuoteDecisionSubmitting] = useState(false);
    const [quoteDecisionModal, setQuoteDecisionModal] = useState<{
        isOpen: boolean;
        decision: 'ACCEPT' | 'REJECT';
        error?: string;
    } | null>(null);

    // Claim Client state
    const [showClaimClientModal, setShowClaimClientModal] = useState(false);
    const [claimClientName, setClaimClientName] = useState('');
    const [claimClientIdNumber, setClaimClientIdNumber] = useState('');
    const [claimClientCellNumber, setClaimClientCellNumber] = useState('');
    const [claimClientNotes, setClaimClientNotes] = useState('');
    const [claimClientSubmitting, setClaimClientSubmitting] = useState(false);
    const [claimClientMessage, setClaimClientMessage] = useState('');

    // Upload Document state
    const [showUploadDocModal, setShowUploadDocModal] = useState(false);
    const [uploadDocType, setUploadDocType] = useState('ID_DOCUMENT');
    const [uploadDocFile, setUploadDocFile] = useState<File | null>(null);
    const [uploadDocNotes, setUploadDocNotes] = useState('');
    const [uploadDocSubmitting, setUploadDocSubmitting] = useState(false);
    const [uploadDocError, setUploadDocError] = useState('');

    // Feedback Request state
    const [feedbackRequestSubmitting, setFeedbackRequestSubmitting] = useState(false);
    const [quoteRequestSubmitting, setQuoteRequestSubmitting] = useState(false);

    async function handleMissingClientSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!missingClientName.trim()) return;

        setMissingClientSubmitting(true);
        setMissingClientMessage('');
        try {
            const res = await fetch('/api/referrer-portal/missing-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientName: missingClientName.trim(),
                    idNumber: missingClientIdNumber.trim() || undefined,
                    notes: missingClientNotes.trim() || undefined,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setMissingClientMessage(json.error ?? 'Failed to submit report');
                return;
            }
            setMissingClientMessage('Report submitted successfully to Zenowethu staff!');
            setMissingClientName('');
            setMissingClientIdNumber('');
            setMissingClientNotes('');
            void loadPortal();
            setTimeout(() => {
                setShowMissingClientModal(false);
                setMissingClientMessage('');
            }, 2500);
        } catch {
            setMissingClientMessage('Failed to submit report');
        } finally {
            setMissingClientSubmitting(false);
        }
    }

    async function handleNotMyClientConfirm() {
        if (!selectedCaseId) return;
        setNotMyClientSubmitting(true);
        try {
            const res = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: '[FLAG] This is not my client. Please verify assignment.' }),
            });
            const json = await res.json();
            if (res.ok && json.comment) {
                setDetail((current) => current ? { ...current, comments: [...current.comments, json.comment] } : current);
            }
        } catch {
            // error handled in modal
        } finally {
            setNotMyClientSubmitting(false);
            setShowNotMyClientModal(false);
        }
    }

    async function handlePaymentReportSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedCaseId || !reportPaymentAmount || !reportPaymentDate || !reportPaymentFile) {
            setReportPaymentError('Please fill all required fields and upload proof of payment.');
            return;
        }

        setReportPaymentSubmitting(true);
        setReportPaymentError('');

        try {
            const formData = new FormData();
            formData.append('amount', reportPaymentAmount);
            formData.append('date', reportPaymentDate);
            formData.append('notes', reportPaymentNotes);
            formData.append('proofOfPayment', reportPaymentFile);

            const res = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}/payment-report`, {
                method: 'POST',
                body: formData,
            });

            const json = await res.json();
            if (!res.ok) {
                setReportPaymentError(json.error ?? 'Failed to submit payment report');
                return;
            }

            const detailRes = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}`, { cache: 'no-store' });
            if (detailRes.ok) {
                const detailJson = await detailRes.json();
                setDetail(detailJson);
            }
            
            void loadPortal();

            toast.success('Payment reported and proof of payment uploaded successfully!');
            setShowPaymentReportModal(false);
            setReportPaymentAmount('');
            setReportPaymentDate('');
            setReportPaymentNotes('');
            setReportPaymentFile(null);
        } catch {
            setReportPaymentError('Failed to submit payment report');
        } finally {
            setReportPaymentSubmitting(false);
        }
    }

    function handleQuoteDecisionSubmit(decision: 'ACCEPT' | 'REJECT') {
        setQuoteDecisionModal({
            isOpen: true,
            decision,
        });
    }

    async function handleConfirmQuoteDecision() {
        if (!quoteDecisionModal || !selectedCaseId) return;
        const { decision } = quoteDecisionModal;

        setQuoteDecisionSubmitting(true);
        setQuoteDecisionModal(prev => prev ? { ...prev, error: undefined } : null);

        try {
            const res = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}/quote-decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision }),
            });
            const json = await res.json();
            if (!res.ok) {
                setQuoteDecisionModal(prev => prev ? { ...prev, error: json.error ?? 'Failed to submit quote decision' } : null);
                return;
            }

            const detailRes = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}`, { cache: 'no-store' });
            if (detailRes.ok) {
                const detailJson = await detailRes.json();
                setDetail(detailJson);
            }
            void loadPortal();
            setQuoteDecisionModal(null);
        } catch {
            setQuoteDecisionModal(prev => prev ? { ...prev, error: 'Failed to submit quote decision' } : null);
        } finally {
            setQuoteDecisionSubmitting(false);
        }
    }

    async function handleClaimClientSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!claimClientName.trim()) return;

        setClaimClientSubmitting(true);
        setClaimClientMessage('');
        try {
            const res = await fetch('/api/referrer-portal/claim-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientName: claimClientName.trim(),
                    idNumber: claimClientIdNumber.trim() || undefined,
                    cellNumber: claimClientCellNumber.trim() || undefined,
                    notes: claimClientNotes.trim() || undefined,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setClaimClientMessage(json.error ?? 'Failed to submit claim request');
                return;
            }
            setClaimClientMessage(json.message ?? 'Claim request submitted successfully!');
            setClaimClientName('');
            setClaimClientIdNumber('');
            setClaimClientCellNumber('');
            setClaimClientNotes('');
            void loadPortal();
            setTimeout(() => {
                setShowClaimClientModal(false);
                setClaimClientMessage('');
            }, 3000);
        } catch {
            setClaimClientMessage('Failed to submit claim request');
        } finally {
            setClaimClientSubmitting(false);
        }
    }

    async function handleUploadDocSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedCaseId || !uploadDocFile) {
            setUploadDocError('Please select a file to upload.');
            return;
        }

        setUploadDocSubmitting(true);
        setUploadDocError('');

        try {
            const formData = new FormData();
            formData.append('documentType', uploadDocType);
            formData.append('notes', uploadDocNotes);
            formData.append('file', uploadDocFile);

            const res = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}/documents`, {
                method: 'POST',
                body: formData,
            });

            const json = await res.json();
            if (!res.ok) {
                setUploadDocError(json.error ?? 'Failed to upload document');
                return;
            }

            const detailRes = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}`, { cache: 'no-store' });
            if (detailRes.ok) {
                const detailJson = await detailRes.json();
                setDetail(detailJson);
            }

            toast.success('Document uploaded successfully!');
            setShowUploadDocModal(false);
            setUploadDocType('ID_DOCUMENT');
            setUploadDocFile(null);
            setUploadDocNotes('');
        } catch {
            setUploadDocError('Failed to upload document');
        } finally {
            setUploadDocSubmitting(false);
        }
    }

    async function handleRequestFeedback() {
        if (!selectedCaseId) return;
        const confirmFlag = await confirm('Would you like to request a feedback update on this case from Zenowethu staff?');
        if (!confirmFlag) return;

        setFeedbackRequestSubmitting(true);
        try {
            const res = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}/feedback-request`, {
                method: 'POST',
            });
            const json = await res.json();
            if (!res.ok) {
                toast.error(json.error ?? 'Failed to request feedback');
                return;
            }
            if (json.comment) {
                setDetail((current) => current ? { ...current, comments: [...current.comments, json.comment] } : current);
            }
            toast.success('Feedback request logged and staff notified!');
        } catch {
            toast.error('Failed to request feedback');
        } finally {
            setFeedbackRequestSubmitting(false);
        }
    }

    async function handleRequestQuote() {
        if (!selectedCaseId) return;
        const confirmFlag = await confirm('Would you like to request a quote for this case from Zenowethu staff?');
        if (!confirmFlag) return;

        setQuoteRequestSubmitting(true);
        try {
            const res = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}/quote-request`, {
                method: 'POST',
            });
            const json = await res.json();
            if (!res.ok) {
                toast.error(json.error ?? 'Failed to request quote');
                return;
            }
            if (json.comment) {
                setDetail((current) => current ? { ...current, comments: [...current.comments, json.comment] } : current);
            }
            toast.success('Quote request logged and staff notified!');
        } catch {
            toast.error('Failed to request quote');
        } finally {
            setQuoteRequestSubmitting(false);
        }
    }

    async function loadPortal() {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/referrer-portal/summary', { cache: 'no-store' });
            const json = await res.json();
            if (!res.ok) {
                setError(json.error ?? 'Unable to load portal');
                return;
            }
            setPortalData(json);
            setProfileForm(toProfileForm(json.referrer));
            if (!selectedCaseId && json.referrals?.[0]) setSelectedCaseId(json.referrals[0].caseId);
        } catch {
            setError('Unable to load portal');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (status === 'unauthenticated') router.replace('/login');
        if (status === 'authenticated') {
            void loadPortal();
        }
    }, [status]);

    const selectedReferral = useMemo(
        () => portalData?.referrals.find((referral) => referral.caseId === selectedCaseId) ?? null,
        [portalData, selectedCaseId],
    );

    const visibleReferrals = useMemo(
        () => (portalData?.referrals ?? []).filter(REFERRAL_FILTERS[referralFilter].matches),
        [portalData, referralFilter],
    );

    useEffect(() => {
        if (visibleReferrals.length > 0) {
            setSelectedCaseId(visibleReferrals[0].caseId);
        } else {
            setSelectedCaseId('');
        }
    }, [referralFilter]);

    const isNotMyClientFlagged = useMemo(() => {
        if (!detail?.comments) return false;
        return detail.comments.some((comment) =>
            comment.content.includes('[FLAG] This is not my client')
        );
    }, [detail]);

    function toggleReferralFilter(id: ReferralFilterId) {
        setReferralFilter((current) => (current === id ? 'all' : id));
        document.getElementById('referral-tracking')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    useEffect(() => {
        if (!selectedCaseId) {
            setDetail(null);
            return;
        }

        let cancelled = false;
        setDetailLoading(true);
        setDetailError('');
        setCommentError('');

        (async () => {
            try {
                const res = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}`, { cache: 'no-store' });
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok) {
                    setDetail(null);
                    setDetailError(json.error ?? 'Unable to load referral detail');
                    return;
                }
                setDetail(json);
            } catch {
                if (!cancelled) {
                    setDetail(null);
                    setDetailError('Unable to load referral detail');
                }
            } finally {
                if (!cancelled) setDetailLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [selectedCaseId]);

    async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedCaseId || !commentText.trim()) return;

        setCommentSubmitting(true);
        setCommentError('');
        try {
            const res = await fetch(`/api/referrer-portal/referrals/${selectedCaseId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: commentText.trim() }),
            });
            const json = await res.json();
            if (!res.ok) {
                setCommentError(json.error ?? 'Message could not be sent');
                return;
            }
            setDetail((current) => current ? { ...current, comments: [...current.comments, json.comment] } : current);
            setCommentText('');
        } catch {
            setCommentError('Message could not be sent');
        } finally {
            setCommentSubmitting(false);
        }
    }

    async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!profileForm) return;

        setProfileSaving(true);
        setProfileMessage('');
        try {
            const res = await fetch('/api/referrer-portal/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: nullableFormValue(profileForm.email),
                    cellNumber: nullableFormValue(profileForm.cellNumber),
                    bankName: nullableFormValue(profileForm.bankName),
                    accountNumber: nullableFormValue(profileForm.accountNumber),
                    accountType: nullableFormValue(profileForm.accountType),
                    branchCode: nullableFormValue(profileForm.branchCode),
                    accountHolderName: nullableFormValue(profileForm.accountHolderName),
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setProfileMessage(json.error ?? 'Profile update failed');
                return;
            }
            setPortalData((current) => current ? { ...current, referrer: json.referrer } : current);
            setProfileForm(toProfileForm(json.referrer));
            setProfileMessage('Profile updated');
        } catch {
            setProfileMessage('Profile update failed');
        } finally {
            setProfileSaving(false);
        }
    }

    async function handleQuerySubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedCaseId) return;

        setQuerySubmitting(true);
        setQueryMessage('');
        try {
            const res = await fetch('/api/referrer-portal/payment-queries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    caseId: selectedCaseId,
                    claimedPaidAt: claimedPaidAt || null,
                    claimedAmount: claimedAmount ? Number(claimedAmount) : null,
                    notes: queryNotes,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setQueryMessage(json.error ?? 'Follow-up could not be submitted');
                return;
            }

            setPortalData((current) => current ? {
                ...current,
                paymentQueries: [json.paymentQuery, ...current.paymentQueries],
            } : current);
            setClaimedPaidAt('');
            setClaimedAmount('');
            setQueryNotes('');
            setQueryMessage('Follow-up submitted');
        } catch {
            setQueryMessage('Follow-up could not be submitted');
        } finally {
            setQuerySubmitting(false);
        }
    }

    if (status === 'loading' || loading) {
        return (
            <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
                <div className="h-10 w-10 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin" />
            </main>
        );
    }

    if (error || !portalData || !profileForm) {
        return (
            <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
                <section className="max-w-md rounded-lg border border-red-400/30 bg-red-500/10 p-6 text-center">
                    <h1 className="text-xl font-semibold">Portal unavailable</h1>
                    <p className="mt-2 text-sm text-red-100">{error || 'No linked referrer profile was found.'}</p>
                    <button
                        type="button"
                        onClick={() => router.replace('/login')}
                        className="mt-5 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950"
                    >
                        Back to login
                    </button>
                </section>
            </main>
        );
    }

    const { referrer, summary, discountSummary, quoteStats, referrals, paymentQueries, missingClientReports } = portalData;

    // Discount referrers earn no commission — their clients get discounted
    // pricing instead, so the portal shows referral flow and client money
    // (quotes/payments) rather than payouts.
    const isDiscountReferrer = referrer.referrerType === 'DISCOUNT';

    // Monthly scoreboard for referrers: every stat is clickable and
    // filters the tracking table to the files behind the number.
    // Merged groups: In Progress includes Settled Not Completed; Completed includes Both Settled & Completed
    const discountGroups: {
        title: string;
        caption: string;
        accentText: string;
        accentBar: string;
        stats: { id: ReferralFilterId; label: string; value: number; delta?: number }[];
        breakdown?: { label: string; count: number; subtext?: string }[];
    }[] | null = discountSummary
        ? [
            {
                title: 'Referrals',
                caption: 'Files you have sent our way',
                accentText: 'text-cyan-300',
                accentBar: 'bg-cyan-400',
                stats: [
                    { id: 'all', label: 'All time', value: discountSummary.totalReferrals },
                    {
                        id: 'referrals-this-month',
                        label: calendarMonthName(0),
                        value: discountSummary.referralsThisMonth,
                        delta: discountSummary.referralsThisMonth - discountSummary.referralsLastMonth,
                    },
                    { id: 'referrals-last-month', label: calendarMonthName(1), value: discountSummary.referralsLastMonth },
                ],
            },
            {
                title: 'Work Pipeline',
                caption: 'Cases being worked or awaiting work',
                accentText: 'text-sky-300',
                accentBar: 'bg-sky-400',
                stats: [
                    {
                        id: 'work-pipeline' as ReferralFilterId,
                        label: 'All time',
                        value: discountSummary.totalInProgress + discountSummary.totalSettledNotCompleted
                    },
                    {
                        id: 'work-pipeline' as ReferralFilterId,
                        label: calendarMonthName(0),
                        value: discountSummary.inProgressThisMonth + discountSummary.settledNotCompletedThisMonth,
                        delta: (discountSummary.inProgressThisMonth + discountSummary.settledNotCompletedThisMonth) - (discountSummary.inProgressLastMonth + discountSummary.settledNotCompletedLastMonth),
                    },
                    { id: 'work-pipeline' as ReferralFilterId, label: calendarMonthName(1), value: discountSummary.inProgressLastMonth + discountSummary.settledNotCompletedLastMonth },
                ],
                breakdown: [
                    { label: 'In Progress', count: discountSummary.totalInProgress, subtext: 'being worked' },
                    { label: 'Paid Upfront', count: discountSummary.totalSettledNotCompleted, subtext: 'awaiting work' },
                ]
            },
            {
                title: 'Completed Work',
                caption: 'Work done with payment status',
                accentText: 'text-emerald-300',
                accentBar: 'bg-emerald-400',
                stats: [
                    {
                        id: 'completed-work' as ReferralFilterId,
                        label: 'All time',
                        value: discountSummary.totalCompletedNotSettled + discountSummary.totalBothSettledAndCompleted
                    },
                    {
                        id: 'completed-work' as ReferralFilterId,
                        label: calendarMonthName(0),
                        value: discountSummary.completedNotSettledThisMonth + discountSummary.bothSettledAndCompletedThisMonth,
                        delta: (discountSummary.completedNotSettledThisMonth + discountSummary.bothSettledAndCompletedThisMonth) - (discountSummary.completedNotSettledLastMonth + discountSummary.bothSettledAndCompletedLastMonth),
                    },
                    { id: 'completed-work' as ReferralFilterId, label: calendarMonthName(1), value: discountSummary.completedNotSettledLastMonth + discountSummary.bothSettledAndCompletedLastMonth },
                ],
                breakdown: [
                    { label: 'Awaiting Payment', count: discountSummary.totalCompletedNotSettled, subtext: 'invoice outstanding' },
                    { label: 'Fully Paid', count: discountSummary.totalBothSettledAndCompleted, subtext: 'settled & completed' },
                ]
            },
            {
                title: 'Lost',
                caption: 'Withdrawn or cancelled',
                accentText: 'text-slate-400',
                accentBar: 'bg-slate-500',
                stats: [
                    { id: 'lost', label: 'All time', value: discountSummary.totalLost },
                    {
                        id: 'lost-this-month',
                        label: calendarMonthName(0),
                        value: discountSummary.lostThisMonth,
                        delta: discountSummary.lostThisMonth - discountSummary.lostLastMonth,
                    },
                    { id: 'lost-last-month', label: calendarMonthName(1), value: discountSummary.lostLastMonth },
                ],
            },
        ]
        : null;

    // Quotes stats card — shown only for discount referrers who receive quotes
    const notQuotedCount = referrals.filter((r) => !r.quoteStatuses || r.quoteStatuses.length === 0).length;
    const quotesStatCards: { id: ReferralFilterId; label: string; value: string; accent: string; accentBar: string; caption: string }[] | null =
        isDiscountReferrer && quoteStats
            ? [
                {
                    id: 'not-quoted',
                    label: 'Not Quoted',
                    value: `${notQuotedCount} Clients`,
                    accent: 'text-slate-300',
                    accentBar: 'bg-slate-400',
                    caption: 'No quotation created yet',
                },
                {
                    id: 'quoted',
                    label: 'Total Quotes',
                    value: `${quoteStats.totalCount} Quotes`,
                    accent: 'text-violet-300',
                    accentBar: 'bg-violet-400',
                    caption: `Total value: ${formatMoney(quoteStats.totalAmount)}`,
                },
                {
                    id: 'quoted-accepted',
                    label: 'Accepted Quotes',
                    value: `${quoteStats.acceptedCount} Accepted`,
                    accent: 'text-emerald-300',
                    accentBar: 'bg-emerald-400',
                    caption: `Value: ${formatMoney(quoteStats.acceptedAmount)}`,
                },
                {
                    id: 'quoted-pending',
                    label: 'Pending Quotes',
                    value: `${quoteStats.pendingCount} Pending`,
                    accent: 'text-amber-300',
                    accentBar: 'bg-amber-400',
                    caption: `Value: ${formatMoney(quoteStats.pendingAmount)}`,
                },
                {
                    id: 'quoted-declined',
                    label: 'Declined Quotes',
                    value: `${quoteStats.rejectedCount} Declined`,
                    accent: 'text-rose-300',
                    accentBar: 'bg-rose-400',
                    caption: `Value: ${formatMoney(quoteStats.rejectedAmount)}`,
                },
            ]
            : null;

    const discountMoneyGroups = isDiscountReferrer && discountSummary
        ? [
            {
                title: 'Quoted',
                accentBar: 'bg-violet-400',
                total: { id: 'quoted' as ReferralFilterId, label: 'Total Quoted', value: formatMoney(discountSummary.totalQuoted), valueClass: 'text-white' },
                months: [
                    { id: 'quoted-this-month' as ReferralFilterId, label: `Quoted — ${calendarMonthName(0)}`, value: formatMoney(discountSummary.quotedThisMonth), valueClass: 'text-white' },
                    { id: 'quoted-last-month' as ReferralFilterId, label: `Quoted — ${calendarMonthName(1)}`, value: formatMoney(discountSummary.quotedLastMonth), valueClass: 'text-white' },
                ]
            },
            {
                title: 'Expected Revenue',
                accentBar: 'bg-indigo-400',
                total: { id: 'expected-revenue' as ReferralFilterId, label: 'Expected Revenue', value: formatMoney(discountSummary.totalExpectedRevenue), valueClass: 'text-indigo-300' },
                months: [
                    { id: 'expected-revenue-this-month' as ReferralFilterId, label: `Expected — ${calendarMonthName(0)}`, value: formatMoney(discountSummary.expectedRevenueThisMonth), valueClass: 'text-indigo-300' },
                    { id: 'expected-revenue-last-month' as ReferralFilterId, label: `Expected — ${calendarMonthName(1)}`, value: formatMoney(discountSummary.expectedRevenueLastMonth), valueClass: 'text-indigo-300' },
                ]
            },
            {
                title: 'Out Standing Balance',
                accentBar: 'bg-yellow-400',
                total: { id: 'completed-outstanding' as ReferralFilterId, label: 'Outstanding Balance', value: formatMoney(discountSummary.totalCompletedOutstanding), valueClass: 'text-yellow-300' },
                months: [
                    { id: 'completed-outstanding-this-month' as ReferralFilterId, label: `Outstanding — ${calendarMonthName(0)}`, value: formatMoney(discountSummary.completedOutstandingThisMonth), valueClass: 'text-yellow-300' },
                    { id: 'completed-outstanding-last-month' as ReferralFilterId, label: `Outstanding — ${calendarMonthName(1)}`, value: formatMoney(discountSummary.completedOutstandingLastMonth), valueClass: 'text-yellow-300' },
                ]
            },
            {
                title: 'Paid',
                accentBar: 'bg-emerald-400',
                total: { id: 'paid' as ReferralFilterId, label: 'Total Paid', value: formatMoney(discountSummary.totalPaid), valueClass: 'text-emerald-300' },
                months: [
                    { id: 'paid-this-month' as ReferralFilterId, label: `Paid — ${calendarMonthName(0)}`, value: formatMoney(discountSummary.paidThisMonth), valueClass: 'text-emerald-300' },
                    { id: 'paid-last-month' as ReferralFilterId, label: `Paid — ${calendarMonthName(1)}`, value: formatMoney(discountSummary.paidLastMonth), valueClass: 'text-emerald-300' },
                ]
            },
            {
                title: 'Settled',
                accentBar: 'bg-teal-400',
                total: { id: 'settled-paid' as ReferralFilterId, label: 'Settled Amount', value: formatMoney(discountSummary.totalSettledPaid), valueClass: 'text-teal-300' },
                months: [
                    { id: 'settled-paid-this-month' as ReferralFilterId, label: `Paid — ${calendarMonthName(0)}`, value: formatMoney(discountSummary.settledPaidThisMonth), valueClass: 'text-teal-300' },
                    { id: 'settled-paid-last-month' as ReferralFilterId, label: `Paid — ${calendarMonthName(1)}`, value: formatMoney(discountSummary.settledPaidLastMonth), valueClass: 'text-teal-300' },
                ]
            }
        ]
        : null;

    const commissionGroups = !isDiscountReferrer && summary
        ? [
            {
                title: 'Referrals',
                caption: 'Files you have sent our way',
                accentText: 'text-cyan-300',
                accentBar: 'bg-cyan-400',
                value: summary.totalReferrals.toString(),
            },
            {
                title: 'Commission Earned',
                caption: 'Total approved payouts (paid + pending)',
                accentText: 'text-blue-300',
                accentBar: 'bg-blue-400',
                value: formatMoney(summary.commissionEarned),
            },
            {
                title: 'Pending Payout',
                caption: 'Commissions waiting for payment',
                accentText: 'text-yellow-300',
                accentBar: 'bg-yellow-400',
                value: formatMoney(summary.commissionPending),
            },
            {
                title: 'Paid Out',
                caption: 'Commissions successfully paid out',
                accentText: 'text-emerald-300',
                accentBar: 'bg-emerald-400',
                value: formatMoney(summary.commissionPaid),
            },
        ]
        : null;

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100">
            <header className="border-b border-white/10 bg-slate-950/95">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                    <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
                            {referrer.referrerType === 'HYBRID'
                                ? 'Referrer Portal · B2B Partner'
                                : isDiscountReferrer
                                ? 'Referrer Portal · Discount Partner'
                                : 'Referrer Portal'}
                        </p>
                        <h1 className="mt-1 text-2xl font-semibold text-white">
                            {referrer.firstName} {referrer.lastName}
                        </h1>
                        {referrer.referrerType === 'HYBRID' ? (
                            <p className="mt-1 text-sm text-slate-300">
                                B2B Branch Account · Your clients get {referrer.clientDiscountPercent != null ? `${referrer.clientDiscountPercent}%` : '0%'} discount, and you earn commission on referrals.
                            </p>
                        ) : isDiscountReferrer ? (
                            <p className="mt-1 text-sm text-slate-300">
                                Your clients get discounted pricing
                                {referrer.clientDiscountPercent != null ? ` (${referrer.clientDiscountPercent}% off)` : ''} — no commission applies.
                            </p>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={async () => {
                                await signOut({ redirect: false });
                                window.location.replace('/login');
                            }}
                            className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {commissionGroups && (
                    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {commissionGroups.map((group) => (
                            <div key={group.title} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between">
                                <div>
                                    <div className={`h-1 -mx-4 -mt-4 mb-3 ${group.accentBar}`} />
                                    <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${group.accentText}`}>{group.title}</p>
                                    <p className="mt-0.5 text-[11px] text-slate-400 leading-normal">{group.caption}</p>
                                </div>
                                <p className="mt-4 text-2xl font-bold text-white">{group.value}</p>
                            </div>
                        ))}
                    </section>
                )}

                {discountGroups && (
                    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {discountGroups.map((group) => (
                            <div key={group.title} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                                <div className={`h-1 ${group.accentBar}`} />
                                <div className="px-4 pb-2 pt-3">
                                    <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${group.accentText}`}>{group.title}</p>
                                    <p className="mt-0.5 text-[11px] text-slate-400">{group.caption}</p>
                                </div>
                                <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
                                    {group.stats.map((stat, idx) => (
                                        <button
                                            key={`${stat.id}-${idx}`}
                                            type="button"
                                            onClick={() => toggleReferralFilter(stat.id)}
                                            title={`Show files: ${REFERRAL_FILTERS[stat.id].label}`}
                                            className={`px-3 py-3 text-left transition-colors hover:bg-white/[0.07] ${referralFilter === stat.id ? 'bg-white/[0.08]' : ''}`}
                                        >
                                            <p className="text-[11px] uppercase tracking-wide text-slate-400">{stat.label}</p>
                                            <p className="mt-1 text-2xl font-semibold text-white">{stat.value}</p>
                                            {stat.delta != null && (
                                                <p className={`mt-1 text-[11px] font-medium ${stat.delta > 0 ? 'text-emerald-300' : stat.delta < 0 ? 'text-orange-300' : 'text-slate-400'}`}>
                                                    {stat.delta > 0
                                                        ? `▲ ${stat.delta} up on last month`
                                                        : stat.delta < 0
                                                            ? `▼ ${Math.abs(stat.delta)} down on last month`
                                                            : 'Level with last month'}
                                                </p>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                {group.breakdown && (
                                    <div className="border-t border-white/10 px-3 py-2 text-xs text-slate-400">
                                        {group.breakdown.map((item) => {
                                            const filterId = group.title === 'Work Pipeline'
                                                ? (item.subtext?.includes('being worked') ? 'work-pipeline-in-progress' : 'work-pipeline-settled')
                                                : (item.subtext?.includes('invoice') ? 'completed-work-outstanding' : 'completed-work-paid');
                                            return (
                                                <button
                                                    key={item.label}
                                                    type="button"
                                                    onClick={() => toggleReferralFilter(filterId as ReferralFilterId)}
                                                    title={`Show files: ${item.label}`}
                                                    className="w-full flex justify-between py-1 text-left transition-colors hover:text-cyan-300 cursor-pointer"
                                                >
                                                    <span className="hover:underline">{item.label}</span>
                                                    <span className="text-white">{item.count} {item.subtext ? `(${item.subtext})` : ''}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </section>
                )}

                {discountMoneyGroups && (
                    <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {discountMoneyGroups.map((group) => (
                            <div key={group.title} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] flex flex-col justify-between">
                                <div>
                                    <div className={`h-1 ${group.accentBar}`} />
                                    <button
                                        type="button"
                                        onClick={() => toggleReferralFilter(group.total.id)}
                                        title={`Show files: ${REFERRAL_FILTERS[group.total.id].label}`}
                                        className={`w-full px-4 py-4 text-left transition-colors hover:bg-white/[0.07] ${referralFilter === group.total.id ? 'bg-white/[0.08] ring-1 ring-inset ring-cyan-300/30' : ''}`}
                                    >
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{group.total.label}</p>
                                        <p className={`mt-2 text-3xl font-bold ${group.total.valueClass}`}>{group.total.value}</p>
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 divide-x divide-white/10 border-t border-white/10">
                                    {group.months.map((month) => (
                                        <button
                                            key={month.id}
                                            type="button"
                                            onClick={() => toggleReferralFilter(month.id)}
                                            title={`Show files: ${REFERRAL_FILTERS[month.id].label}`}
                                            className={`px-3 py-3 text-left transition-colors hover:bg-white/[0.07] ${referralFilter === month.id ? 'bg-white/[0.08] ring-1 ring-inset ring-cyan-300/30' : ''}`}
                                        >
                                            <p className="text-[11px] uppercase tracking-wide text-slate-400">{month.label}</p>
                                            <p className={`mt-1 text-lg font-semibold ${month.valueClass}`}>{month.value}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </section>
                )}

                {quotesStatCards && (
                    <section className="mt-3">
                        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                            <div className="h-1 bg-violet-400" />
                            <div className="px-4 pb-2 pt-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-300">Quotes</p>
                                <p className="mt-0.5 text-[11px] text-slate-400">Quotations issued for your referred clients</p>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 border-t border-white/10">
                                {quotesStatCards.map((card) => (
                                    <button
                                        key={card.id}
                                        type="button"
                                        onClick={() => toggleReferralFilter(card.id)}
                                        title={`Filter: ${REFERRAL_FILTERS[card.id].label}`}
                                        className={`px-4 py-4 text-left transition-colors hover:bg-white/[0.07] ${referralFilter === card.id ? 'bg-white/[0.08]' : ''} border-r border-b border-white/10`}
                                    >
                                        <p className="text-[11px] uppercase tracking-wide text-slate-400">{card.label}</p>
                                        <p className={`mt-1 text-3xl font-bold ${card.accent}`}>{card.value}</p>
                                        <p className="mt-1 text-[10px] text-slate-500">{card.caption}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                <section className="mt-6">
                    <div id="referral-tracking" className="rounded-lg border border-white/10 bg-white/[0.03]">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                            <div>
                                <h2 className="text-base font-semibold text-white">Referral tracking</h2>
                                <p className="text-xs text-slate-400">Click a referral to see its progress and ask questions.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {referralFilter !== 'all' && (
                                    <button
                                        type="button"
                                        onClick={() => setReferralFilter('all')}
                                        className="flex items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-300/20"
                                    >
                                        {REFERRAL_FILTERS[referralFilter].label}
                                        <span aria-hidden="true">×</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setShowClaimClientModal(true)}
                                    className="rounded-md border border-cyan-400 bg-cyan-500/20 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/30"
                                >
                                    Claim a Client
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowMissingClientModal(true)}
                                    className="rounded-md border border-cyan-400 bg-cyan-500/20 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/30"
                                >
                                    Report Missing Client
                                </button>
                                <span className="text-xs text-slate-400">
                                    {referralFilter === 'all'
                                        ? `${referrals.length} clients`
                                        : `${visibleReferrals.length} of ${referrals.length} clients`}
                                    {(missingClientReports?.length ?? 0) > 0 && referralFilter === 'all' && (
                                        <span className="ml-2 text-amber-400/70">· {missingClientReports.length} unclaimed</span>
                                    )}
                                </span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/10 text-sm">
                                <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3">File</th>
                                        <th className="px-4 py-3">Consumer</th>
                                        {isDiscountReferrer ? (
                                            <>
                                                <th className="px-4 py-3">Status</th>
                                                <th className="px-4 py-3">Quote</th>
                                                <th className="px-4 py-3">Paid</th>
                                                <th className="px-4 py-3">Referred</th>
                                                <th className="px-4 py-3">Last activity</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-4 py-3">Stage</th>
                                                <th className="px-4 py-3 text-center">Deposit Paid</th>
                                                <th className="px-4 py-3">Payment Status</th>
                                                <th className="px-4 py-3">Status</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/10">
                                    {visibleReferrals.map((referral) => {
                                        if (isDiscountReferrer) {
                                            return (
                                                <tr
                                                    key={referral.caseId}
                                                    onClick={() => setSelectedCaseId(referral.caseId)}
                                                    className={`cursor-pointer transition-colors ${referral.caseId === selectedCaseId ? 'bg-cyan-300/[0.07]' : 'hover:bg-white/[0.03]'}`}
                                                >
                                                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-cyan-100">{referral.fileNumber}</td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-white">{referral.consumerLabel}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium ${statusToneClass(referral.statusTone)}`}>
                                                            {referral.referralStatus}
                                                        </span>
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-slate-100">
                                                        {referral.quoteTotal != null ? formatMoney(referral.quoteTotal) : <span className="text-slate-500">No quote</span>}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3">
                                                        {referral.totalPaid > 0
                                                            ? <span className="text-emerald-300">{formatMoney(referral.totalPaid)}</span>
                                                            : <span className="text-slate-500">—</span>}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatDate(referral.createdAt)}</td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatDate(referral.lastUpdatedAt)}</td>
                                                </tr>
                                            );
                                        }

                                        const stage = referral.commissionStage ?? 'NEW_LEAD';
                                        
                                        // 1. Quoted: yes or no
                                        const isQuoted = (referral.quoteTotal != null && referral.quoteTotal > 0) || !['NEW_LEAD', 'ADMIN_FEE_PAID'].includes(stage);
                                        
                                        // 2. Deposit paid: yes or no
                                        const isDepositPaid = !['NEW_LEAD', 'ADMIN_FEE_PAID', 'QUOTE_SUBMITTED', 'QUOTE_ACCEPTED'].includes(stage);
                                        
                                        // 3. Settled or still paying
                                        const agreementStatus = stage === 'SETTLED' ? 'Settled' : isDepositPaid ? 'Still paying' : 'Not started';
                                        const agreementToneClass = stage === 'SETTLED'
                                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                            : isDepositPaid
                                                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                                                : 'border-slate-700 bg-slate-800/40 text-slate-400';
                                                
                                        // 4. Up to date or overdue arrears
                                        let paymentStatus = 'Not started';
                                        let paymentToneClass = 'border-slate-700 bg-slate-800/40 text-slate-400';
                                        if (stage === 'ARREARS_1M') {
                                            paymentStatus = 'Overdue 1 month';
                                            paymentToneClass = 'border-amber-500/40 bg-amber-500/10 text-amber-300';
                                        } else if (stage === 'ARREARS_2M') {
                                            paymentStatus = 'Overdue 2 months';
                                            paymentToneClass = 'border-amber-500/40 bg-amber-500/10 text-amber-300';
                                        } else if (stage === 'ARREARS_3M') {
                                            paymentStatus = 'Overdue 3 months';
                                            paymentToneClass = 'border-amber-500/40 bg-amber-500/10 text-amber-300';
                                        } else if (stage === 'ARREARS_4M_PLUS' || stage === 'HANDED_OVER') {
                                            paymentStatus = '4+ months in arrears';
                                            paymentToneClass = 'border-rose-500/40 bg-rose-500/10 text-rose-300';
                                        } else if (['DEPOSIT_PAID', 'PAYING_INSTALMENTS', 'UP_TO_DATE', 'SETTLED'].includes(stage)) {
                                            paymentStatus = 'Up to date';
                                            paymentToneClass = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
                                        }

                                        return (
                                            <tr
                                                key={referral.caseId}
                                                onClick={() => setSelectedCaseId(referral.caseId)}
                                                className={`cursor-pointer transition-colors ${referral.caseId === selectedCaseId ? 'bg-cyan-300/[0.07]' : 'hover:bg-white/[0.03]'}`}
                                            >
                                                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-cyan-100">{referral.fileNumber}</td>
                                                <td className="whitespace-nowrap px-4 py-3 text-white">{referral.consumerLabel}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${getStageToneClass(stage)}`}>
                                                        {STAGE_LABELS[stage] ?? stage}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${isDepositPaid ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/40 text-slate-400'}`}>
                                                        {isDepositPaid ? 'Yes' : 'No'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${paymentToneClass}`}>
                                                        {paymentStatus}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${agreementToneClass}`}>
                                                        {agreementStatus}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {visibleReferrals.length === 0 && (
                                        <tr>
                                            <td className="px-4 py-8 text-center text-slate-400" colSpan={isDiscountReferrer ? 7 : 6}>
                                                {referrals.length === 0
                                                    ? 'No referrals are linked yet.'
                                                    : <>No files match “{REFERRAL_FILTERS[referralFilter].label}” yet. <button type="button" onClick={() => setReferralFilter('all')} className="text-cyan-300 underline underline-offset-2">Show all files</button></>}
                                            </td>
                                        </tr>
                                    )}
                                    {/* ── Unclaimed / Missing Client rows (always shown at the bottom when filter is 'all') ── */}
                                    {isDiscountReferrer && referralFilter === 'all' && (missingClientReports ?? []).map((report) => (
                                        <tr key={`missing-${report.id}`} className="opacity-70 hover:opacity-90 transition-opacity">
                                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">—</td>
                                            <td className="whitespace-nowrap px-4 py-3">
                                                <span className="text-slate-300">{report.clientName}</span>
                                                {report.idNumber && <span className="ml-2 text-xs text-slate-500">{report.idNumber}</span>}
                                            </td>
                                            <td className="px-4 py-3" colSpan={isDiscountReferrer ? 4 : 3}>
                                                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                                                    Unclaimed — pending verification
                                                </span>
                                                {report.notes && <span className="ml-3 text-xs text-slate-500">{report.notes}</span>}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-slate-500 text-xs">{formatDate(report.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {selectedCaseId && (
                    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.03]">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                            <div>
                                <h2 className="text-base font-semibold text-white">
                                    Referral detail{detail ? ` — ${detail.fileNumber}` : ''}
                                </h2>
                                {detail && (
                                    <p className="text-xs text-slate-400">
                                        {detail.consumerLabel} · Referred {formatDate(detail.createdAt)} · Last activity {formatDate(detail.lastUpdatedAt)}
                                    </p>
                                )}
                            </div>
                            {detail && (
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleRequestFeedback}
                                        disabled={feedbackRequestSubmitting}
                                        className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
                                    >
                                        {feedbackRequestSubmitting ? 'Requesting...' : 'Request Feedback'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowNotMyClientModal(true)}
                                        disabled={notMyClientSubmitting || isNotMyClientFlagged}
                                        className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                                            isNotMyClientFlagged
                                                ? 'border-red-500/40 bg-red-500/20 text-red-300'
                                                : 'border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20'
                                        }`}
                                    >
                                        {notMyClientSubmitting ? 'Flagging...' : isNotMyClientFlagged ? 'Flagged as Not Yours' : 'Not My Client'}
                                    </button>
                                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusToneClass(selectedReferral?.statusTone)}`}>
                                        {detail.referralStatus}
                                    </span>
                                </div>
                            )}
                        </div>

                        {detailLoading && (
                            <div className="flex items-center justify-center px-4 py-10">
                                <div className="h-8 w-8 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin" />
                            </div>
                        )}

                        {!detailLoading && detail && isNotMyClientFlagged && (
                            <div className="mx-4 mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-red-200 flex items-start gap-3">
                                <span className="text-xl leading-none">⚠️</span>
                                <div>
                                    <p className="text-sm font-semibold">Flagged: Not Your Client</p>
                                    <p className="text-xs text-red-300/80 mt-0.5">You have flagged this case as not belonging to you. Zenowethu staff are verifying the case assignment.</p>
                                </div>
                            </div>
                        )}

                        {!detailLoading && detailError && (
                            <p className="px-4 py-6 text-sm text-red-200">{detailError}</p>
                        )}

                        {!detailLoading && detail && (
                            <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                <div className="space-y-5">
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold text-white">Case progress</h3>
                                            <span className="text-xs text-slate-400">
                                                {detail.workflow.isLost
                                                    ? 'Closed'
                                                    : detail.workflow.stageNumber
                                                        ? `Stage ${detail.workflow.stageNumber} of 10`
                                                        : 'In progress'}
                                            </span>
                                        </div>
                                        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                                            <div
                                                className={`h-full rounded-full transition-all ${detail.workflow.barClass}`}
                                                style={{ width: `${detail.workflow.isLost ? 100 : detail.workflow.percent}%` }}
                                            />
                                        </div>
                                        <p className="mt-2 text-sm text-white">
                                            {detail.workflow.label}
                                            {detail.workflow.categoryName ? (
                                                <span className="text-slate-400"> · {detail.workflow.categoryName}</span>
                                            ) : null}
                                        </p>
                                        {detail.workflow.description && (
                                            <p className="mt-1 text-xs text-slate-400">{detail.workflow.description}</p>
                                        )}
                                    </div>

                                    {isDiscountReferrer && detail.pendingQuote && (
                                        <div className="rounded-md border border-cyan-400/40 bg-cyan-400/10 p-3">
                                            <h3 className="text-sm font-semibold text-white">Pending Quotation</h3>
                                            <p className="mt-1 text-xs text-slate-300">
                                                Quote <strong>{detail.pendingQuote.invoiceNumber}</strong> is ready: 
                                                <span className="ml-1.5 text-sm font-semibold text-cyan-300">{formatMoney(detail.pendingQuote.total)}</span>
                                            </p>
                                            <div className="mt-3 flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleQuoteDecisionSubmit('ACCEPT')}
                                                    disabled={quoteDecisionSubmitting}
                                                    className="flex-1 rounded bg-emerald-500/80 hover:bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                                                >
                                                    {quoteDecisionSubmitting ? 'Processing...' : 'Accept Quote'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleQuoteDecisionSubmit('REJECT')}
                                                    disabled={quoteDecisionSubmitting}
                                                    className="flex-1 rounded bg-red-500/80 hover:bg-red-600/80 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                                                >
                                                    {quoteDecisionSubmitting ? 'Processing...' : 'Decline Quote'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {detail.services.length > 0 && (
                                        <div className="rounded-md border border-white/10 bg-slate-900/70 p-3">
                                            <h3 className="text-sm font-semibold text-white">Requested services</h3>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {detail.services.map((service) => (
                                                    <span
                                                        key={service}
                                                        className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100"
                                                    >
                                                        {service}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {isDiscountReferrer && (
                                        <div className="rounded-md border border-white/10 bg-slate-900/70 p-3">
                                            <h3 className="text-sm font-semibold text-white">Client finances</h3>
                                            <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                                                <div>
                                                    <dt className="text-xs text-slate-400">Quote</dt>
                                                    <dd className="text-white flex items-center gap-2 flex-wrap">
                                                        <span>{detail.financials?.quoteTotal != null ? formatMoney(detail.financials.quoteTotal) : 'No quote yet'}</span>
                                                        {detail.financials?.quoteTotal == null && (
                                                            <button
                                                                type="button"
                                                                onClick={handleRequestQuote}
                                                                disabled={quoteRequestSubmitting}
                                                                className="rounded border border-cyan-400 bg-cyan-500/20 px-1.5 py-0.5 text-[10px] leading-tight text-cyan-200 hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
                                                            >
                                                                {quoteRequestSubmitting ? 'Requesting...' : 'request a quote'}
                                                            </button>
                                                        )}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-slate-400">Total paid</dt>
                                                    <dd className="text-emerald-300">{formatMoney(detail.financials?.totalPaid ?? 0)}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-slate-400">Balance</dt>
                                                    <dd className="text-white">
                                                        {detail.financials?.outstanding != null ? formatMoney(detail.financials.outstanding) : '—'}
                                                    </dd>
                                                </div>
                                            </dl>
                                            <h4 className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Payments received</h4>
                                            {(detail.financials?.payments.length ?? 0) === 0 ? (
                                                <p className="mt-1.5 text-sm text-slate-400">No payments recorded yet.</p>
                                            ) : (
                                                <ul className="mt-1.5 space-y-1.5">
                                                    {detail.financials!.payments.map((payment) => (
                                                        <li key={payment.id} className="flex items-center justify-between gap-3 text-sm">
                                                            <span className="text-emerald-300">{formatMoney(payment.amount)}</span>
                                                            <span className="whitespace-nowrap text-xs text-slate-400">{formatDate(payment.date)}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            <p className="mt-3 border-t border-white/10 pt-2 text-xs text-slate-400">
                                                This client receives your discounted pricing
                                                {referrer.clientDiscountPercent != null ? ` (${referrer.clientDiscountPercent}% off)` : ''}. No commission is tracked.
                                            </p>
                                        </div>
                                    )}

                                    <div className="rounded-md border border-white/10 bg-slate-900/70 p-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold text-white">Report Client Payment</h3>
                                            <button
                                                type="button"
                                                onClick={() => setShowPaymentReportModal(true)}
                                                className="rounded border border-cyan-400 bg-cyan-500/20 px-2.5 py-1 text-xs text-cyan-200 hover:bg-cyan-500/30 transition-colors"
                                            >
                                                Submit Proof of Payment
                                            </button>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-400">
                                            Report payments made by this client directly to Zenowethu staff.
                                        </p>
                                    </div>

                                    <div className="rounded-md border border-white/10 bg-slate-900/70 p-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold text-white">Documents on file</h3>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowUploadDocModal(true)}
                                                    className="rounded border border-cyan-400 bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-200 hover:bg-cyan-500/30 transition-colors"
                                                >
                                                    Upload Document
                                                </button>
                                                <span className="text-xs text-slate-400">{detail.documents.length} received</span>
                                            </div>
                                        </div>
                                        {detail.documents.length === 0 ? (
                                            <p className="mt-2 text-sm text-slate-400">
                                                No documents received yet — reminding your client to submit their documents helps the case move faster.
                                            </p>
                                        ) : (
                                            <ul className="mt-2 space-y-1.5">
                                                {detail.documents.map((doc) => (
                                                    <li key={doc.id} className="flex items-center justify-between gap-3 text-sm">
                                                        <span className="flex items-center gap-2 text-slate-200">
                                                            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400/80" />
                                                            {doc.label}
                                                        </span>
                                                        <span className="whitespace-nowrap text-xs text-slate-400">{formatDate(doc.uploadedAt)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>

                                    <div>
                                        <h3 className="text-sm font-semibold text-white">Progress history</h3>
                                        <ol className="mt-2 space-y-2">
                                            {detail.statusHistory.map((entry) => (
                                                <li key={entry.id} className="flex items-start gap-3 rounded-md border border-white/10 bg-slate-900/70 px-3 py-2">
                                                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-cyan-300/70" />
                                                    <div>
                                                        <p className="text-sm text-white">{entry.to}</p>
                                                        <p className="text-xs text-slate-400">
                                                            {entry.from ? `From ${entry.from} · ` : ''}{formatDate(entry.timestamp)}
                                                        </p>
                                                    </div>
                                                </li>
                                            ))}
                                            {detail.statusHistory.length === 0 && (
                                                <li className="rounded-md border border-white/10 bg-slate-900/70 px-3 py-3 text-sm text-slate-400">
                                                    No progress updates recorded yet.
                                                </li>
                                            )}
                                        </ol>
                                    </div>
                                </div>

                                <div className="flex min-h-[320px] flex-col rounded-md border border-white/10 bg-slate-900/70">
                                    <div className="border-b border-white/10 px-3 py-2">
                                        <h3 className="text-sm font-semibold text-white">Case discussion</h3>
                                        <p className="text-xs text-slate-400">Ask anything about this referral — the Zenowethu team replies here.</p>
                                    </div>
                                    <div className="flex-1 space-y-3 overflow-y-auto p-3">
                                        {detail.comments.map((comment) => (
                                            <div
                                                key={comment.id}
                                                className={`max-w-[85%] rounded-lg border px-3 py-2 ${comment.fromReferrer
                                                    ? 'ml-auto border-cyan-300/30 bg-cyan-300/10'
                                                    : 'border-white/10 bg-white/[0.05]'}`}
                                            >
                                                <p className="text-xs font-medium text-cyan-100">
                                                    {comment.fromReferrer ? 'You' : comment.authorName}
                                                </p>
                                                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-100">{comment.content}</p>
                                                <p className="mt-1 text-[11px] text-slate-400">{formatDate(comment.createdAt)}</p>
                                            </div>
                                        ))}
                                        {detail.comments.length === 0 && (
                                            <p className="rounded-md border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-400">
                                                No messages yet. Ask a question about this referral below.
                                            </p>
                                        )}
                                    </div>
                                    <form onSubmit={handleCommentSubmit} className="border-t border-white/10 p-3">
                                        <textarea
                                            value={commentText}
                                            onChange={(event) => setCommentText(event.target.value)}
                                            className="min-h-20 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
                                            placeholder="Type your question or comment about this case..."
                                            maxLength={4000}
                                            required
                                        />
                                        <div className="mt-2 flex items-center justify-between gap-3">
                                            <p className="text-xs text-red-300">{commentError}</p>
                                            <button
                                                type="submit"
                                                disabled={commentSubmitting || !commentText.trim()}
                                                className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {commentSubmitting ? 'Sending...' : 'Send message'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                <section className="mt-6">
                    <form onSubmit={handleProfileSave} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <h2 className="text-base font-semibold text-white">
                            {referrer.referrerType === 'HYBRID'
                                ? 'Profile, banking & partner discount'
                                : isDiscountReferrer
                                ? 'Profile'
                                : 'Profile and banking'}
                        </h2>
                        {referrer.referrerType === 'HYBRID' ? (
                            <p className="mt-1 text-xs text-slate-400">
                                B2B Partner settings: Your clients benefit from a {referrer.clientDiscountPercent != null ? `${referrer.clientDiscountPercent}%` : '0%'} discount. Please provide banking details below to receive commission payouts.
                            </p>
                        ) : isDiscountReferrer ? (
                            <p className="mt-1 text-xs text-slate-400">Banking details are not needed — discount referrers receive no payouts.</p>
                        ) : null}
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            {(isDiscountReferrer
                                ? [
                                    ['email', 'Email address', 'email'],
                                    ['cellNumber', 'Cell number', 'text'],
                                ]
                                : [
                                    ['email', 'Email address', 'email'],
                                    ['cellNumber', 'Cell number', 'text'],
                                    ['bankName', 'Bank name', 'text'],
                                    ['accountHolderName', 'Account holder', 'text'],
                                    ['accountNumber', 'Account number', 'text'],
                                    ['branchCode', 'Branch code', 'text'],
                                ]
                            ).map(([field, label, type]) => (
                                <label key={field} className="block text-sm">
                                    <span className="text-slate-300">{label}</span>
                                    <input
                                        type={type}
                                        value={profileForm[field as keyof ProfileForm]}
                                        onChange={(event) => setProfileForm({ ...profileForm, [field]: event.target.value })}
                                        className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                    />
                                </label>
                            ))}
                            {!isDiscountReferrer && (
                                <label className="block text-sm">
                                    <span className="text-slate-300">Account type</span>
                                    <select
                                        value={profileForm.accountType}
                                        onChange={(event) => setProfileForm({ ...profileForm, accountType: event.target.value })}
                                        className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                    >
                                        <option value="">Not set</option>
                                        <option value="CHEQUE">Cheque</option>
                                        <option value="SAVINGS">Savings</option>
                                        <option value="CURRENT">Current</option>
                                    </select>
                                </label>
                            )}
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={profileSaving}
                                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                            >
                                {profileSaving ? 'Saving...' : 'Save details'}
                            </button>
                            {profileMessage && <p className="text-sm text-cyan-100">{profileMessage}</p>}
                        </div>
                    </form>
                </section>
            </div>

            {showMissingClientModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900 p-6 shadow-xl">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-base font-semibold text-white">Report Missing Client</h3>
                            <button
                                type="button"
                                onClick={() => setShowMissingClientModal(false)}
                                className="text-slate-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleMissingClientSubmit} className="mt-4 space-y-4">
                            <label className="block text-sm">
                                <span className="text-slate-300">Client's Full Name <span className="text-red-400">*</span></span>
                                <input
                                    type="text"
                                    required
                                    value={missingClientName}
                                    onChange={(e) => setMissingClientName(e.target.value)}
                                    placeholder="e.g. Sipho Nkosi"
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Client's SA ID Number (13 digits)</span>
                                <input
                                    type="text"
                                    maxLength={13}
                                    value={missingClientIdNumber}
                                    onChange={(e) => setMissingClientIdNumber(e.target.value.replace(/\D/g, ''))}
                                    placeholder="e.g. 8001015009087"
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Additional details / Notes</span>
                                <textarea
                                    value={missingClientNotes}
                                    onChange={(e) => setMissingClientNotes(e.target.value)}
                                    placeholder="Any details to help us find the client..."
                                    rows={3}
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            {missingClientMessage && (
                                <p className={`text-sm ${missingClientMessage.includes('successfully') ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {missingClientMessage}
                                </p>
                            )}
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowMissingClientModal(false)}
                                    className="rounded px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={missingClientSubmitting}
                                    className="rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
                                >
                                    {missingClientSubmitting ? 'Submitting...' : 'Submit Report'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showPaymentReportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900 p-6 shadow-xl">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-base font-semibold text-white">Report Client Payment</h3>
                            <button
                                type="button"
                                onClick={() => setShowPaymentReportModal(false)}
                                className="text-slate-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handlePaymentReportSubmit} className="mt-4 space-y-4">
                            <label className="block text-sm">
                                <span className="text-slate-300">Amount Paid (R) <span className="text-red-400">*</span></span>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={reportPaymentAmount}
                                    onChange={(e) => setReportPaymentAmount(e.target.value)}
                                    placeholder="e.g. 1500.00"
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Date Paid <span className="text-red-400">*</span></span>
                                <input
                                    type="date"
                                    required
                                    value={reportPaymentDate}
                                    onChange={(e) => setReportPaymentDate(e.target.value)}
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Upload Proof of Payment <span className="text-red-400">*</span></span>
                                <input
                                    type="file"
                                    required
                                    accept="image/*,application/pdf"
                                    onChange={(e) => setReportPaymentFile(e.target.files?.[0] ?? null)}
                                    className="mt-1.5 w-full text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white file:hover:bg-white/15"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Additional notes</span>
                                <textarea
                                    value={reportPaymentNotes}
                                    onChange={(e) => setReportPaymentNotes(e.target.value)}
                                    placeholder="e.g. Paid via Capitec EFT"
                                    rows={2}
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            {reportPaymentError && (
                                <p className="text-sm text-red-400">
                                    {reportPaymentError}
                                </p>
                            )}
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPaymentReportModal(false)}
                                    className="rounded px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={reportPaymentSubmitting}
                                    className="rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
                                >
                                    {reportPaymentSubmitting ? 'Uploading...' : 'Submit Report'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showClaimClientModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900 p-6 shadow-xl">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-base font-semibold text-white">Claim a Client</h3>
                            <button
                                type="button"
                                onClick={() => setShowClaimClientModal(false)}
                                className="text-slate-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleClaimClientSubmit} className="mt-4 space-y-4">
                            <p className="text-xs text-slate-400">
                                If you referred a client but do not see them on your dashboard, submit a claim request below. Zenowethu staff will verify and link them.
                            </p>
                            <label className="block text-sm">
                                <span className="text-slate-300">Client's Full Name <span className="text-red-400">*</span></span>
                                <input
                                    type="text"
                                    required
                                    value={claimClientName}
                                    onChange={(e) => setClaimClientName(e.target.value)}
                                    placeholder="e.g. Sipho Nkosi"
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Client's SA ID Number (13 digits)</span>
                                <input
                                    type="text"
                                    maxLength={13}
                                    value={claimClientIdNumber}
                                    onChange={(e) => setClaimClientIdNumber(e.target.value.replace(/\D/g, ''))}
                                    placeholder="e.g. 8001015009087"
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Client's Cell Number</span>
                                <input
                                    type="text"
                                    value={claimClientCellNumber}
                                    onChange={(e) => setClaimClientCellNumber(e.target.value.replace(/[^\d+]/g, ''))}
                                    placeholder="e.g. 0821234567"
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Supporting details / Notes</span>
                                <textarea
                                    value={claimClientNotes}
                                    onChange={(e) => setClaimClientNotes(e.target.value)}
                                    placeholder="Any context to help us verify your referral (e.g. date referred)..."
                                    rows={3}
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            {claimClientMessage && (
                                <p className={`text-sm ${claimClientMessage.includes('successfully') || claimClientMessage.includes('submitted') ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {claimClientMessage}
                                </p>
                            )}
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowClaimClientModal(false)}
                                    className="rounded px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={claimClientSubmitting}
                                    className="rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
                                >
                                    {claimClientSubmitting ? 'Submitting...' : 'Submit Claim'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showUploadDocModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900 p-6 shadow-xl">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-base font-semibold text-white">Upload Case Document</h3>
                            <button
                                type="button"
                                onClick={() => setShowUploadDocModal(false)}
                                className="text-slate-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleUploadDocSubmit} className="mt-4 space-y-4">
                            <label className="block text-sm">
                                <span className="text-slate-300">Document Type <span className="text-red-400">*</span></span>
                                <select
                                    value={uploadDocType}
                                    onChange={(e) => setUploadDocType(e.target.value)}
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                >
                                    <option value="ID_DOCUMENT">ID Document</option>
                                    <option value="CONSENT_FORM">Consent Form</option>
                                    <option value="POWER_OF_ATTORNEY">Power of Attorney</option>
                                    <option value="PAYSLIP">Payslip</option>
                                    <option value="BANK_STATEMENT">Bank Statement</option>
                                    <option value="FORM_17_1">Form 17.1</option>
                                    <option value="FORM_17_W">Form 17.W</option>
                                    <option value="COURT_ORDER">Court Order</option>
                                    <option value="OTHER">Other / General Document</option>
                                </select>
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Choose File <span className="text-red-400">*</span></span>
                                <input
                                    type="file"
                                    required
                                    accept="image/*,application/pdf"
                                    onChange={(e) => setUploadDocFile(e.target.files?.[0] ?? null)}
                                    className="mt-1.5 w-full text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white file:hover:bg-white/15"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Additional notes</span>
                                <textarea
                                    value={uploadDocNotes}
                                    onChange={(e) => setUploadDocNotes(e.target.value)}
                                    placeholder="Any details to help Zenowethu staff identify this document..."
                                    rows={2}
                                    className="mt-1.5 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            {uploadDocError && (
                                <p className="text-sm text-red-400">
                                    {uploadDocError}
                                </p>
                            )}
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowUploadDocModal(false)}
                                    className="rounded px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploadDocSubmitting}
                                    className="rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
                                >
                                    {uploadDocSubmitting ? 'Uploading...' : 'Upload'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Not My Client – Premium Confirmation Modal ── */}
            {showNotMyClientModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                        onClick={() => setShowNotMyClientModal(false)}
                    />

                    {/* Modal card */}
                    <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800 to-slate-900 shadow-2xl shadow-black/60">

                        {/* Coloured accent bar at the top */}
                        <div className="h-1 w-full bg-gradient-to-r from-red-500 via-orange-400 to-red-600" />

                        {/* Content */}
                        <div className="px-6 pb-6 pt-5">
                            {/* Warning icon */}
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                </svg>
                            </div>

                            <h3 className="text-center text-base font-semibold text-white">
                                Not Your Client?
                            </h3>
                            <p className="mt-2 text-center text-sm leading-relaxed text-slate-400">
                                You are about to flag{' '}
                                <span className="font-medium text-slate-200">
                                    {detail?.fileNumber ?? 'this file'}
                                </span>{' '}
                                as not belonging to you. A notification will be sent to Zenowethu staff to verify the case assignment.
                            </p>

                            {/* Divider */}
                            <div className="my-5 h-px w-full bg-white/[0.07]" />

                            {/* What will happen bullets */}
                            <ul className="space-y-2 text-xs text-slate-400">
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 flex-shrink-0 text-orange-400">⚠</span>
                                    A flag comment will be posted on the case discussion thread.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 flex-shrink-0 text-cyan-400">🔔</span>
                                    The assigned case manager will receive an in-app alert.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 flex-shrink-0 text-slate-400">ℹ</span>
                                    No data is deleted — staff will investigate and respond.
                                </li>
                            </ul>

                            {/* Actions */}
                            <div className="mt-6 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowNotMyClientModal(false)}
                                    disabled={notMyClientSubmitting}
                                    className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleNotMyClientConfirm}
                                    disabled={notMyClientSubmitting}
                                    className="flex-1 rounded-xl bg-gradient-to-r from-red-600 to-red-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-900/40 transition-all hover:from-red-500 hover:to-red-400 disabled:opacity-50"
                                >
                                    {notMyClientSubmitting ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                            Flagging…
                                        </span>
                                    ) : 'Yes, Flag This File'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Quote Decision – Premium Confirmation Modal ── */}
            {quoteDecisionModal && quoteDecisionModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                        onClick={() => !quoteDecisionSubmitting && setQuoteDecisionModal(null)}
                    />

                    {/* Modal card */}
                    <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800 to-slate-900 shadow-2xl shadow-black/60">

                        {/* Coloured accent bar at the top */}
                        <div className={`h-1 w-full bg-gradient-to-r ${
                            quoteDecisionModal.decision === 'ACCEPT'
                                ? 'from-emerald-500 via-teal-400 to-emerald-600'
                                : 'from-red-500 via-orange-400 to-red-600'
                        }`} />

                        {/* Content */}
                        <div className="px-6 pb-6 pt-5">
                            {/* Icon */}
                            {quoteDecisionModal.decision === 'ACCEPT' ? (
                                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                                    </svg>
                                </div>
                            ) : (
                                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                    </svg>
                                </div>
                            )}

                            <h3 className="text-center text-base font-semibold text-white">
                                {quoteDecisionModal.decision === 'ACCEPT' ? 'Accept Quotation?' : 'Decline Quotation?'}
                            </h3>
                            <p className="mt-2 text-center text-sm leading-relaxed text-slate-400">
                                {quoteDecisionModal.decision === 'ACCEPT' ? (
                                    <>
                                        You are about to accept quote{' '}
                                        <span className="font-medium text-slate-200">
                                            {detail?.pendingQuote?.invoiceNumber ?? 'this quote'}
                                        </span>{' '}
                                        valued at{' '}
                                        <span className="font-semibold text-emerald-400">
                                            {detail?.pendingQuote ? formatMoney(detail.pendingQuote.total) : ''}
                                        </span>.
                                    </>
                                ) : (
                                    <>
                                        You are about to decline quote{' '}
                                        <span className="font-medium text-slate-200">
                                            {detail?.pendingQuote?.invoiceNumber ?? 'this quote'}
                                        </span>{' '}
                                        valued at{' '}
                                        <span className="font-semibold text-red-400">
                                            {detail?.pendingQuote ? formatMoney(detail.pendingQuote.total) : ''}
                                        </span>.
                                    </>
                                )}
                            </p>

                            {/* Divider */}
                            <div className="my-5 h-px w-full bg-white/[0.07]" />

                            {/* What will happen bullets */}
                            <ul className="space-y-2 text-xs text-slate-400">
                                {quoteDecisionModal.decision === 'ACCEPT' ? (
                                    <>
                                        <li className="flex items-start gap-2">
                                            <span className="mt-0.5 flex-shrink-0 text-emerald-400">✓</span>
                                            The payment restructuring schedule will be initiated.
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="mt-0.5 flex-shrink-0 text-cyan-400">🔔</span>
                                            The assigned case manager will be notified of your approval.
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="mt-0.5 flex-shrink-0 text-slate-400">ℹ</span>
                                            A confirmation record will be added to the case discussion.
                                        </li>
                                    </>
                                ) : (
                                    <>
                                        <li className="flex items-start gap-2">
                                            <span className="mt-0.5 flex-shrink-0 text-red-400">⚠</span>
                                            The current quotation will be marked as rejected.
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="mt-0.5 flex-shrink-0 text-cyan-400">🔔</span>
                                            The case manager will receive an alert to revise proposal details.
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="mt-0.5 flex-shrink-0 text-slate-400">ℹ</span>
                                            The client will not be billed until a new quote is issued and accepted.
                                        </li>
                                    </>
                                )}
                            </ul>

                            {quoteDecisionModal.error && (
                                <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-xs text-red-300 text-center">
                                    {quoteDecisionModal.error}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="mt-6 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setQuoteDecisionModal(null)}
                                    disabled={quoteDecisionSubmitting}
                                    className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmQuoteDecision}
                                    disabled={quoteDecisionSubmitting}
                                    className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white shadow-lg transition-all disabled:opacity-50 ${
                                        quoteDecisionModal.decision === 'ACCEPT'
                                            ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-emerald-900/40 hover:from-emerald-500 hover:to-emerald-400'
                                            : 'bg-gradient-to-r from-red-600 to-red-500 shadow-red-900/40 hover:from-red-500 hover:to-red-400'
                                    }`}
                                >
                                    {quoteDecisionSubmitting ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                            {quoteDecisionModal.decision === 'ACCEPT' ? 'Accepting…' : 'Declining…'}
                                        </span>
                                    ) : (
                                        quoteDecisionModal.decision === 'ACCEPT' ? 'Yes, Accept Quote' : 'Yes, Decline Quote'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
