'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { signOut, useSession } from '@zenowethu/ui';
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
};

type DiscountPartnerSummary = {
    totalReferrals: number;
    referralsThisMonth: number;
    referralsLastMonth: number;
    totalCompleted: number;
    completedThisMonth: number;
    completedLastMonth: number;
    totalSettled: number;
    settledThisMonth: number;
    settledLastMonth: number;
    totalQuoted: number;
    quotedThisMonth: number;
    quotedLastMonth: number;
    totalPaid: number;
    paidThisMonth: number;
    paidLastMonth: number;
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
    referrals: ReferralRow[];
    paymentQueries: PaymentQuery[];
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
    | 'completed'
    | 'completed-this-month'
    | 'completed-last-month'
    | 'settled'
    | 'settled-this-month'
    | 'settled-last-month'
    | 'quoted'
    | 'quoted-this-month'
    | 'quoted-last-month'
    | 'paid'
    | 'paid-this-month'
    | 'paid-last-month';

const REFERRAL_FILTERS: Record<ReferralFilterId, { label: string; matches: (row: ReferralRow) => boolean }> = {
    'all': { label: 'All referrals', matches: () => true },
    'referrals-this-month': { label: 'Referred this month', matches: (row) => isInCalendarMonth(row.createdAt, 0) },
    'referrals-last-month': { label: 'Referred last month', matches: (row) => isInCalendarMonth(row.createdAt, 1) },
    'completed': { label: 'Completed — payment outstanding', matches: (row) => row.statusTone === 'completed' },
    'completed-this-month': { label: 'Completed this month', matches: (row) => row.statusTone === 'completed' && isInCalendarMonth(row.completedAt, 0) },
    'completed-last-month': { label: 'Completed last month', matches: (row) => row.statusTone === 'completed' && isInCalendarMonth(row.completedAt, 1) },
    'settled': { label: 'Settled', matches: (row) => row.statusTone === 'settled' },
    'settled-this-month': { label: 'Settled this month', matches: (row) => row.statusTone === 'settled' && isInCalendarMonth(row.settledAt, 0) },
    'settled-last-month': { label: 'Settled last month', matches: (row) => row.statusTone === 'settled' && isInCalendarMonth(row.settledAt, 1) },
    'quoted': { label: 'Quoted', matches: (row) => row.quoteTotal != null && row.quoteTotal > 0 },
    'quoted-this-month': { label: 'Quoted this month', matches: (row) => row.quoteTotal != null && row.quoteTotal > 0 && isInCalendarMonth(row.quoteDate, 0) },
    'quoted-last-month': { label: 'Quoted last month', matches: (row) => row.quoteTotal != null && row.quoteTotal > 0 && isInCalendarMonth(row.quoteDate, 1) },
    'paid': { label: 'Files with payments', matches: (row) => row.totalPaid > 0 },
    'paid-this-month': { label: 'Paid this month', matches: (row) => row.paidThisMonth > 0 },
    'paid-last-month': { label: 'Paid last month', matches: (row) => row.paidLastMonth > 0 },
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

    const { referrer, summary, discountSummary, referrals, paymentQueries } = portalData;

    // Discount referrers earn no commission — their clients get discounted
    // pricing instead, so the portal shows referral flow and client money
    // (quotes/payments) rather than payouts.
    const isDiscountReferrer = referrer.referrerType === 'DISCOUNT';

    // Monthly scoreboard for referrers: every stat is clickable and
    // filters the tracking table to the files behind the number.
    const discountGroups: {
        title: string;
        caption: string;
        accentText: string;
        accentBar: string;
        stats: { id: ReferralFilterId; label: string; value: number; delta?: number }[];
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
                title: 'Completed',
                caption: 'Job done — payment still outstanding',
                accentText: 'text-yellow-300',
                accentBar: 'bg-yellow-400',
                stats: [
                    { id: 'completed', label: 'All time', value: discountSummary.totalCompleted },
                    {
                        id: 'completed-this-month',
                        label: calendarMonthName(0),
                        value: discountSummary.completedThisMonth,
                        delta: discountSummary.completedThisMonth - discountSummary.completedLastMonth,
                    },
                    { id: 'completed-last-month', label: calendarMonthName(1), value: discountSummary.completedLastMonth },
                ],
            },
            {
                title: 'Settled',
                caption: 'Done, dusted, and fully paid',
                accentText: 'text-emerald-300',
                accentBar: 'bg-emerald-400',
                stats: [
                    { id: 'settled', label: 'All time', value: discountSummary.totalSettled },
                    {
                        id: 'settled-this-month',
                        label: calendarMonthName(0),
                        value: discountSummary.settledThisMonth,
                        delta: discountSummary.settledThisMonth - discountSummary.settledLastMonth,
                    },
                    { id: 'settled-last-month', label: calendarMonthName(1), value: discountSummary.settledLastMonth },
                ],
            },
        ]
        : null;

    const discountMoneyCards = null;

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100">
            <header className="border-b border-white/10 bg-slate-950/95">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                    <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
                            {isDiscountReferrer ? 'Referrer Portal · Discount Partner' : 'Referrer Portal'}
                        </p>
                        <h1 className="mt-1 text-2xl font-semibold text-white">
                            {referrer.firstName} {referrer.lastName}
                        </h1>
                        {isDiscountReferrer && (
                            <p className="mt-1 text-sm text-slate-300">
                                Your clients get discounted pricing
                                {referrer.clientDiscountPercent != null ? ` (${referrer.clientDiscountPercent}% off)` : ''} — no commission applies.
                            </p>
                        )}
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
                {discountGroups && (
                    <section className="grid gap-3 lg:grid-cols-3">
                        {discountGroups.map((group) => (
                            <div key={group.title} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                                <div className={`h-1 ${group.accentBar}`} />
                                <div className="px-4 pb-2 pt-3">
                                    <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${group.accentText}`}>{group.title}</p>
                                    <p className="mt-0.5 text-[11px] text-slate-400">{group.caption}</p>
                                </div>
                                <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
                                    {group.stats.map((stat) => (
                                        <button
                                            key={stat.id}
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
                            </div>
                        ))}
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
                                <span className="text-xs text-slate-400">
                                    {referralFilter === 'all'
                                        ? `${referrals.length} records`
                                        : `${visibleReferrals.length} of ${referrals.length} records`}
                                </span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/10 text-sm">
                                <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3">File</th>
                                        <th className="px-4 py-3">Consumer</th>
                                        <th className="px-4 py-3">Stage</th>
                                        <th className="px-4 py-3">Quoted</th>
                                        <th className="px-4 py-3 text-center">Deposit Paid</th>
                                        <th className="px-4 py-3">Payment Status</th>
                                        <th className="px-4 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/10">
                                    {visibleReferrals.map((referral) => {
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
                                                <td className="px-4 py-3">
                                                    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${isQuoted ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/40 text-slate-400'}`}>
                                                        {isQuoted ? 'Yes' : 'No'}
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
                                            <td className="px-4 py-8 text-center text-slate-400" colSpan={7}>
                                                {referrals.length === 0
                                                    ? 'No referrals are linked yet.'
                                                    : <>No files match “{REFERRAL_FILTERS[referralFilter].label}” yet. <button type="button" onClick={() => setReferralFilter('all')} className="text-cyan-300 underline underline-offset-2">Show all files</button></>}
                                            </td>
                                        </tr>
                                    )}
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
                                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusToneClass(selectedReferral?.statusTone)}`}>
                                    {detail.referralStatus}
                                </span>
                            )}
                        </div>

                        {detailLoading && (
                            <div className="flex items-center justify-center px-4 py-10">
                                <div className="h-8 w-8 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin" />
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


                                    <div className="rounded-md border border-white/10 bg-slate-900/70 p-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold text-white">Documents on file</h3>
                                            <span className="text-xs text-slate-400">{detail.documents.length} received</span>
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
                        <h2 className="text-base font-semibold text-white">{isDiscountReferrer ? 'Profile' : 'Profile and banking'}</h2>
                        {isDiscountReferrer && (
                            <p className="mt-1 text-xs text-slate-400">Banking details are not needed — discount referrers receive no payouts.</p>
                        )}
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
        </main>
    );
}
