'use client';

import { useSession } from '@zenowethu/ui';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type CommissionStage =
    | 'NEW_LEAD' | 'ADMIN_FEE_PAID' | 'QUOTE_SUBMITTED' | 'QUOTE_ACCEPTED'
    | 'DEPOSIT_PAID' | 'PAYING_INSTALMENTS' | 'UP_TO_DATE'
    | 'ARREARS_1M' | 'ARREARS_2M' | 'ARREARS_3M' | 'ARREARS_4M_PLUS'
    | 'HANDED_OVER' | 'SETTLED';

const STAGE_LABELS: Record<CommissionStage, string> = {
    NEW_LEAD:          'New Lead',
    ADMIN_FEE_PAID:    'Admin Fee Paid',
    QUOTE_SUBMITTED:   'Quote Submitted',
    QUOTE_ACCEPTED:    'Quote Accepted',
    DEPOSIT_PAID:      'Deposit Paid',
    PAYING_INSTALMENTS:'Paying Instalments',
    UP_TO_DATE:        'Up to Date',
    ARREARS_1M:        '1 Month in Arrears',
    ARREARS_2M:        '2 Months in Arrears',
    ARREARS_3M:        '3 Months in Arrears',
    ARREARS_4M_PLUS:   '4+ Months in Arrears',
    HANDED_OVER:       'Handed Over',
    SETTLED:           'Settled',
};

const STAGE_ORDER: CommissionStage[] = [
    'NEW_LEAD', 'ADMIN_FEE_PAID', 'QUOTE_SUBMITTED', 'QUOTE_ACCEPTED',
    'DEPOSIT_PAID', 'PAYING_INSTALMENTS', 'UP_TO_DATE',
    'ARREARS_1M', 'ARREARS_2M', 'ARREARS_3M', 'ARREARS_4M_PLUS',
    'HANDED_OVER', 'SETTLED',
];

const ELIGIBLE_STAGES = new Set<CommissionStage>(['DEPOSIT_PAID', 'PAYING_INSTALMENTS', 'UP_TO_DATE', 'SETTLED']);

type Commission = {
    id: string;
    stage: CommissionStage;
    isEligible: boolean;
    isPaid: boolean;
    paidAt: string | null;
    commissionAmount: number | null;
    paymentRef: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    case: {
        id: string;
        fileNumber: string;
        status: string;
        createdAt: string;
        client: { firstName: string; lastName: string; idNumber: string; phone: string | null };
    };
    paidBy: { firstName: string; lastName: string } | null;
};

type Referrer = {
    id: string;
    firstName: string;
    lastName: string;
    idNumber: string | null;
    email: string | null;
    cellNumber: string | null;
    bankName: string | null;
    accountNumber: string | null;
    accountType: string | null;
    branchCode: string | null;
    accountHolderName: string | null;
    isActive: boolean;
    notes: string | null;
};

type Summary = {
    total: number;
    eligible: number;
    paid: number;
    unpaidEligible: number;
    totalAmountOwed: number;
    totalAmountPaid: number;
};

function stageColor(stage: CommissionStage, isEligible: boolean) {
    if (ELIGIBLE_STAGES.has(stage) && isEligible) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (stage === 'HANDED_OVER' || stage.startsWith('ARREARS')) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-blue-300 bg-blue-500/10 border-blue-500/30';
}

function formatZAR(amount: number) {
    return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

export default function ReferrerDetailPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const params = useParams();
    const referrerId = params.id as string;

    const [referrer, setReferrer] = useState<Referrer | null>(null);
    const [commissions, setCommissions] = useState<Commission[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);

    // Edit commission drawer
    const [editTarget, setEditTarget] = useState<Commission | null>(null);
    const [editForm, setEditForm] = useState({ stage: '' as CommissionStage, commissionAmount: '', paymentRef: '', notes: '', isPaid: false });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    const isManager = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager || session?.user?.role === 'MANAGER';

    useEffect(() => {
        if (status === 'authenticated' && !isManager) router.push('/');
    }, [session, status, isManager, router]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/referrers/${referrerId}/commission`);
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            setReferrer(data.referrer);
            setCommissions(data.commissions);
            setSummary(data.summary);
        } catch {
            // silently retain stale state
        } finally {
            setLoading(false);
        }
    }, [referrerId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    function openEdit(c: Commission) {
        setEditTarget(c);
        setEditForm({
            stage: c.stage,
            commissionAmount: c.commissionAmount != null ? String(c.commissionAmount) : '',
            paymentRef: c.paymentRef ?? '',
            notes: c.notes ?? '',
            isPaid: c.isPaid,
        });
        setSaveError('');
    }

    async function handleSave() {
        if (!editTarget) return;
        setSaving(true);
        setSaveError('');
        try {
            const payload: Record<string, unknown> = {
                stage: editForm.stage,
                commissionAmount: editForm.commissionAmount ? parseFloat(editForm.commissionAmount) : null,
                paymentRef: editForm.paymentRef.trim() || null,
                notes: editForm.notes.trim() || null,
                isPaid: editForm.isPaid,
            };
            const res = await fetch(`/api/admin/referrers/${referrerId}/commission/${editTarget.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) { setSaveError(json.error ?? 'Save failed'); return; }
            setEditTarget(null);
            fetchData();
        } catch {
            setSaveError('Network error');
        } finally {
            setSaving(false);
        }
    }

    async function quickMarkPaid(c: Commission) {
        try {
            await fetch(`/api/admin/referrers/${referrerId}/commission/${c.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isPaid: true }),
            });
            fetchData();
        } catch { /* silent */ }
    }

    if (status === 'loading' || loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zeno-cyan"></div>
            </div>
        );
    }

    if (!isManager) return null;

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <Link href="/admin/referrers" className="text-gray-400 hover:text-white text-sm transition-colors">← Referrer Registry</Link>
                    </div>
                    <h1 className="text-2xl font-bold text-white">
                        {referrer ? `${referrer.firstName} ${referrer.lastName}` : '—'}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">Commission & Client Progress Tracker</p>
                </div>
                <div className="flex items-center gap-3">
                    {referrer && (
                        <>
                            <a
                                href={`/api/admin/referrers/${referrer.id}/statement`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-white/5 border border-white/10 text-white font-medium px-4 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm flex items-center gap-2"
                            >
                                Download Statement
                            </a>
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${referrer.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                {referrer.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Referrer quick-info */}
            {referrer && (
                <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                        <p className="text-xs text-gray-400 mb-0.5">Cell</p>
                        <p className="text-white">{referrer.cellNumber ?? '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 mb-0.5">Email</p>
                        <p className="text-white">{referrer.email ?? '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 mb-0.5">Bank</p>
                        <p className="text-white">{referrer.bankName ?? '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 mb-0.5">Account #</p>
                        <p className="text-white font-mono text-xs">{referrer.accountNumber ?? '—'}</p>
                    </div>
                    {referrer.accountType && (
                        <div>
                            <p className="text-xs text-gray-400 mb-0.5">Account Type</p>
                            <p className="text-white">{referrer.accountType}</p>
                        </div>
                    )}
                    {referrer.branchCode && (
                        <div>
                            <p className="text-xs text-gray-400 mb-0.5">Branch Code</p>
                            <p className="text-white font-mono text-xs">{referrer.branchCode}</p>
                        </div>
                    )}
                    {referrer.accountHolderName && (
                        <div>
                            <p className="text-xs text-gray-400 mb-0.5">Account Holder</p>
                            <p className="text-white">{referrer.accountHolderName}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Summary stats */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                    {[
                        { label: 'Total Referrals', value: summary.total, color: 'text-white' },
                        { label: 'Eligible', value: summary.eligible, color: 'text-emerald-400' },
                        { label: 'Paid Out', value: summary.paid, color: 'text-blue-400' },
                        { label: 'Unpaid Eligible', value: summary.unpaidEligible, color: 'text-amber-400' },
                        { label: 'Amount Owed', value: summary.totalAmountOwed > 0 ? formatZAR(summary.totalAmountOwed) : '—', color: 'text-amber-400' },
                        { label: 'Amount Paid', value: summary.totalAmountPaid > 0 ? formatZAR(summary.totalAmountPaid) : '—', color: 'text-emerald-400' },
                    ].map((s) => (
                        <div key={s.label} className="bg-zeno-blue/30 border border-zeno-blue/50 rounded-xl p-4">
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Commission notice */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-300 text-xs mb-5">
                Commission is payable only after the referred client has <strong>paid deposit</strong>, <strong>settled</strong>, or a <strong>debit order has gone through</strong> (Paying Instalments / Up to Date).
            </div>

            {/* Commission table */}
            <div className="bg-zeno-blue/20 border border-zeno-blue/40 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zeno-blue/40">
                    <h2 className="text-sm font-semibold text-white">Referred Clients &amp; Commission Status</h2>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zeno-blue/40">
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Client</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">File #</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Commission Stage</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Eligible</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Amount</th>
                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Payment Status</th>
                            <th className="py-3 px-4"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {commissions.length === 0 ? (
                            <tr><td colSpan={7} className="py-12 text-center text-gray-400">No commission records yet. Records are created automatically when a referred client advances through case statuses.</td></tr>
                        ) : commissions.map((c) => (
                            <tr key={c.id} className="border-b border-zeno-blue/20 hover:bg-zeno-blue/20 transition-colors">
                                <td className="py-3 px-4">
                                    <Link href={`/cases/${c.case.id}`} className="text-white font-medium hover:text-zeno-cyan transition-colors">
                                        {c.case.client.firstName} {c.case.client.lastName}
                                    </Link>
                                    <div className="text-gray-500 text-xs font-mono">{c.case.client.idNumber}</div>
                                </td>
                                <td className="py-3 px-4 text-gray-300 font-mono text-xs">{c.case.fileNumber}</td>
                                <td className="py-3 px-4">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${stageColor(c.stage, c.isEligible)}`}>
                                        {STAGE_LABELS[c.stage]}
                                    </span>
                                </td>
                                <td className="py-3 px-4">
                                    {c.isEligible ? (
                                        <span className="text-emerald-400 text-xs font-semibold">Yes</span>
                                    ) : (
                                        <span className="text-gray-500 text-xs">No</span>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-gray-300 text-xs">
                                    {c.commissionAmount != null ? formatZAR(Number(c.commissionAmount)) : <span className="text-gray-600">Not set</span>}
                                </td>
                                <td className="py-3 px-4">
                                    {c.isPaid ? (
                                        <div>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">Paid</span>
                                            {c.paidAt && <div className="text-gray-500 text-xs mt-0.5">{new Date(c.paidAt).toLocaleDateString('en-ZA')}</div>}
                                            {c.paidBy && <div className="text-gray-500 text-xs">{c.paidBy.firstName} {c.paidBy.lastName}</div>}
                                        </div>
                                    ) : c.isEligible ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">Unpaid — Due</span>
                                    ) : (
                                        <span className="text-gray-600 text-xs">Not yet due</span>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-2 justify-end">
                                        {c.isEligible && !c.isPaid && (
                                            <button
                                                onClick={() => quickMarkPaid(c)}
                                                className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                                            >
                                                Mark Paid
                                            </button>
                                        )}
                                        <button
                                            onClick={() => openEdit(c)}
                                            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors"
                                        >
                                            Edit
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit drawer */}
            {editTarget && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setEditTarget(null)}>
                    <div className="bg-zeno-dark border-l border-zeno-blue/40 w-full max-w-md h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-zeno-dark border-b border-zeno-blue/40 px-6 py-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-bold text-white">Edit Commission</h2>
                                <p className="text-xs text-gray-400">{editTarget.case.client.firstName} {editTarget.case.client.lastName} — {editTarget.case.fileNumber}</p>
                            </div>
                            <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-white transition-colors">✕</button>
                        </div>

                        <div className="p-6 space-y-5">
                            {saveError && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{saveError}</div>
                            )}

                            {/* Stage */}
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Commission Stage</label>
                                <select
                                    value={editForm.stage}
                                    onChange={(e) => setEditForm((f) => ({ ...f, stage: e.target.value as CommissionStage }))}
                                    className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zeno-cyan/50"
                                >
                                    {STAGE_ORDER.map((s) => (
                                        <option key={s} value={s}>
                                            {STAGE_LABELS[s]}{ELIGIBLE_STAGES.has(s) ? ' ✓ eligible' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Commission Amount (ZAR)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editForm.commissionAmount}
                                    onChange={(e) => setEditForm((f) => ({ ...f, commissionAmount: e.target.value }))}
                                    placeholder="e.g. 500.00"
                                    className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50"
                                />
                            </div>

                            {/* Payment ref */}
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Payment Reference</label>
                                <input
                                    type="text"
                                    value={editForm.paymentRef}
                                    onChange={(e) => setEditForm((f) => ({ ...f, paymentRef: e.target.value }))}
                                    placeholder="EFT ref / receipt number"
                                    className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50"
                                />
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Notes</label>
                                <textarea
                                    value={editForm.notes}
                                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                                    rows={3}
                                    className="w-full bg-zeno-blue/30 border border-zeno-blue/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50 resize-none"
                                    placeholder="Any payment notes..."
                                />
                            </div>

                            {/* Paid toggle */}
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={editForm.isPaid}
                                    onChange={(e) => setEditForm((f) => ({ ...f, isPaid: e.target.checked }))}
                                    className="w-4 h-4 accent-zeno-cyan"
                                />
                                <span className="text-sm text-gray-300">Mark commission as paid</span>
                            </label>
                        </div>

                        <div className="sticky bottom-0 bg-zeno-dark border-t border-zeno-blue/40 px-6 py-4 flex justify-end gap-3">
                            <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-zeno-cyan text-zeno-dark font-semibold px-5 py-2 rounded-lg hover:bg-zeno-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                            >
                                {saving ? 'Saving…' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
