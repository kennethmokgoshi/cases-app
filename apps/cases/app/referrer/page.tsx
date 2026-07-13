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

type ReferralRow = {
    caseId: string;
    fileNumber: string;
    consumerLabel: string;
    referralStatus: string;
    caseStatus: string;
    createdAt: string;
    commissionId: string | null;
    commissionAmount: number;
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

type PortalSummary = {
    referrer: ReferrerProfile;
    summary: {
        totalReferrals: number;
        commissionEarned: number;
        commissionPending: number;
        commissionPaid: number;
    };
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

    const { referrer, summary, referrals, paymentQueries } = portalData;

    // Discount referrers earn no commission — their clients get discounted
    // pricing instead, so the portal shows referral progress without payouts.
    const isDiscountReferrer = referrer.referrerType === 'DISCOUNT';
    const settledCount = referrals.filter((referral) => referral.referralStatus === 'Settled').length;

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
                        {!isDiscountReferrer && (
                            <a
                                href="/api/referrer-portal/statement"
                                className="rounded-md border border-cyan-300/40 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-300/10"
                            >
                                Download statement
                            </a>
                        )}
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
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {(isDiscountReferrer
                        ? [
                            ['Total referrals', String(summary.totalReferrals)],
                            ['In progress', String(summary.totalReferrals - settledCount)],
                            ['Settled', String(settledCount)],
                            ['Client discount', referrer.clientDiscountPercent != null ? `${referrer.clientDiscountPercent}%` : 'Applied on quotes'],
                        ]
                        : [
                            ['Total referrals', String(summary.totalReferrals)],
                            ['Commission earned', formatMoney(summary.commissionEarned)],
                            ['Commission pending', formatMoney(summary.commissionPending)],
                            ['Commission paid', formatMoney(summary.commissionPaid)],
                        ]
                    ).map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
                            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                        </div>
                    ))}
                </section>

                <section className={`mt-6 grid gap-6 ${isDiscountReferrer ? '' : 'xl:grid-cols-[minmax(0,1fr)_360px]'}`}>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03]">
                        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                            <div>
                                <h2 className="text-base font-semibold text-white">Referral tracking</h2>
                                <p className="text-xs text-slate-400">Click a referral to see its progress and ask questions.</p>
                            </div>
                            <span className="text-xs text-slate-400">{referrals.length} records</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/10 text-sm">
                                <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3">File</th>
                                        <th className="px-4 py-3">Consumer</th>
                                        <th className="px-4 py-3">Status</th>
                                        {isDiscountReferrer ? (
                                            <>
                                                <th className="px-4 py-3">Referred</th>
                                                <th className="px-4 py-3">Last activity</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-4 py-3">Commission</th>
                                                <th className="px-4 py-3">Payout</th>
                                                <th className="px-4 py-3">Reference</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/10">
                                    {referrals.map((referral) => (
                                        <tr
                                            key={referral.caseId}
                                            onClick={() => setSelectedCaseId(referral.caseId)}
                                            className={`cursor-pointer transition-colors ${referral.caseId === selectedCaseId ? 'bg-cyan-300/[0.07]' : 'hover:bg-white/[0.03]'}`}
                                        >
                                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-cyan-100">{referral.fileNumber}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-white">{referral.consumerLabel}</td>
                                            <td className="px-4 py-3">
                                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-200">
                                                    {referral.referralStatus}
                                                </span>
                                            </td>
                                            {isDiscountReferrer ? (
                                                <>
                                                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatDate(referral.createdAt)}</td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatDate(referral.lastUpdatedAt)}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="whitespace-nowrap px-4 py-3 text-slate-100">{formatMoney(referral.commissionAmount)}</td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">{referral.commissionStatus}</td>
                                                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">{referral.paymentRef ?? 'Pending'}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                    {referrals.length === 0 && (
                                        <tr>
                                            <td className="px-4 py-8 text-center text-slate-400" colSpan={isDiscountReferrer ? 5 : 6}>No referrals are linked yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {!isDiscountReferrer && (
                    <form onSubmit={handleQuerySubmit} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <h2 className="text-base font-semibold text-white">Missing payment follow-up</h2>
                        <div className="mt-4 space-y-4">
                            <label className="block text-sm">
                                <span className="text-slate-300">Referral</span>
                                <select
                                    value={selectedCaseId}
                                    onChange={(event) => setSelectedCaseId(event.target.value)}
                                    className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                    required
                                >
                                    {referrals.map((referral) => (
                                        <option key={referral.caseId} value={referral.caseId}>
                                            {referral.fileNumber} - {referral.consumerLabel}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {selectedReferral && (
                                <div className="rounded-md border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-xs text-cyan-100">
                                    Current payout status: {selectedReferral.commissionStatus}
                                </div>
                            )}
                            <label className="block text-sm">
                                <span className="text-slate-300">Date paid by client</span>
                                <input
                                    type="date"
                                    value={claimedPaidAt}
                                    onChange={(event) => setClaimedPaidAt(event.target.value)}
                                    className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Claimed amount</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={claimedAmount}
                                    onChange={(event) => setClaimedAmount(event.target.value)}
                                    className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                    placeholder="0.00"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-300">Follow-up note</span>
                                <textarea
                                    value={queryNotes}
                                    onChange={(event) => setQueryNotes(event.target.value)}
                                    className="mt-1 min-h-28 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-cyan-300"
                                    placeholder="Tell us what should be checked."
                                    required
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={querySubmitting || referrals.length === 0}
                                className="w-full rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {querySubmitting ? 'Submitting...' : 'Submit follow-up'}
                            </button>
                            {queryMessage && <p className="text-sm text-cyan-100">{queryMessage}</p>}
                        </div>
                    </form>
                    )}
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
                                <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
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

                                    {isDiscountReferrer ? (
                                        <div className="rounded-md border border-white/10 bg-slate-900/70 p-3">
                                            <h3 className="text-sm font-semibold text-white">Client benefit</h3>
                                            <p className="mt-2 text-sm text-slate-300">
                                                This client receives your discounted pricing
                                                {referrer.clientDiscountPercent != null ? ` (${referrer.clientDiscountPercent}% off)` : ''}.
                                                No commission is tracked on this referral.
                                            </p>
                                        </div>
                                    ) : (
                                    <div className="rounded-md border border-white/10 bg-slate-900/70 p-3">
                                        <h3 className="text-sm font-semibold text-white">Commission</h3>
                                        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <dt className="text-xs text-slate-400">Amount</dt>
                                                <dd className="text-white">{formatMoney(detail.commission.amount)}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-slate-400">Status</dt>
                                                <dd className="text-white">{detail.commission.status}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-slate-400">Paid on</dt>
                                                <dd className="text-slate-200">{formatDate(detail.commission.paidAt)}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-slate-400">Reference</dt>
                                                <dd className="font-mono text-xs text-slate-200">{detail.commission.paymentRef ?? 'Pending'}</dd>
                                            </div>
                                        </dl>
                                    </div>
                                    )}

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

                <section className={`mt-6 grid gap-6 ${isDiscountReferrer ? '' : 'lg:grid-cols-2'}`}>
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

                    {!isDiscountReferrer && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold text-white">Follow-up history</h2>
                            <span className="text-xs text-slate-400">{paymentQueries.length} submitted</span>
                        </div>
                        <div className="mt-4 space-y-3">
                            {paymentQueries.map((query) => (
                                <div key={query.id} className="rounded-md border border-white/10 bg-slate-900/80 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-mono text-xs text-cyan-100">{query.fileNumber}</p>
                                            <p className="mt-1 text-sm text-white">{query.consumerLabel}</p>
                                        </div>
                                        <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-200">{query.status}</span>
                                    </div>
                                    <p className="mt-2 text-xs text-slate-400">
                                        Submitted {formatDate(query.createdAt)}
                                        {query.claimedAmount > 0 ? ` for ${formatMoney(query.claimedAmount)}` : ''}
                                    </p>
                                    {query.notes && <p className="mt-2 text-sm text-slate-300">{query.notes}</p>}
                                </div>
                            ))}
                            {paymentQueries.length === 0 && (
                                <p className="rounded-md border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-400">
                                    No payment follow-ups submitted yet.
                                </p>
                            )}
                        </div>
                    </div>
                    )}
                </section>
            </div>
        </main>
    );
}
