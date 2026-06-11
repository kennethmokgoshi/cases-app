'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    SA_BANKS,
    lookupBranchCode,
    deriveMandateTerms,
    type Frequency,
    type TermField,
    type MandateTerms,
} from '../../../../lib/mandate-calc';
import {
    buildMandateChecklist,
    mandateProgress,
    nextMandateAction,
    type MandateLike,
} from '../../../../lib/mandate-status';

const ACCOUNT_TYPES = ['Cheque', 'Savings', 'Transmission'] as const;

type ApiMandate = {
    id: string;
    requested: boolean;
    status: string;
    bankName: string | null;
    accountHolderName: string | null;
    accountNumber: string | null;
    accountType: string | null;
    branchCode: string | null;
    amount: string | null;
    frequency: string;
    numInstalments: number | null;
    debitOrderDay: number | null;
    firstCollectionDate: string | null;
    lastCollectionDate: string | null;
    sentAt: string | null;
    signedReturnedAt: string | null;
    signedDocumentId: string | null;
    nupayDocumentId: string | null;
    nupayReference: string | null;
    notes: string | null;
};

type ApiResponse = {
    case: {
        id: string;
        fileNumber: string;
        serviceFee: string | null;
        instalments: number;
        totalDebtAmount: string | null;
        totalMonthlyInstallment: string | null;
    };
    client: {
        bankName: string | null;
        accountHolderName: string | null;
        accountNumber: string | null;
        accountType: string | null;
        branchCode: string | null;
        debitOrderDay: number | null;
        firstName: string;
        lastName: string;
    };
    mandate: ApiMandate | null;
};

type FormState = {
    requested: boolean;
    bankName: string;
    accountHolderName: string;
    accountNumber: string;
    accountType: string;
    branchCode: string;
    debitOrderDay: string;
    notes: string;
} & MandateTerms;

function emptyTerms(): MandateTerms {
    return {
        totalAmount: null,
        monthlyInstalment: null,
        numInstalments: null,
        frequency: 'MONTHLY',
        firstCollectionDate: null,
        lastCollectionDate: null,
    };
}

function moneyStr(n: number | null): string {
    return n == null ? '' : String(n);
}

function formatRand(n: number | null): string {
    if (n == null) return '—';
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n);
}

export default function MandateForm({ caseId }: { caseId: string }) {
    const [form, setForm] = useState<FormState | null>(null);
    const [mandate, setMandate] = useState<ApiMandate | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [branchAuto, setBranchAuto] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/finance/cases/${caseId}/mandate`);
            if (!res.ok) throw new Error(`Failed to load mandate (${res.status})`);
            const data: ApiResponse = await res.json();
            const m = data.mandate;
            const c = data.client;

            // Seed monthly instalment / total from the case if the mandate has none yet.
            const seededMonthly = m?.amount != null ? Number(m.amount) : (data.case.totalMonthlyInstallment != null ? Number(data.case.totalMonthlyInstallment) : null);

            const terms = deriveMandateTerms({
                totalAmount: data.case.totalDebtAmount != null ? Number(data.case.totalDebtAmount) : null,
                monthlyInstalment: seededMonthly,
                numInstalments: m?.numInstalments ?? null,
                frequency: (m?.frequency as Frequency) ?? 'MONTHLY',
                firstCollectionDate: m?.firstCollectionDate ? m.firstCollectionDate.slice(0, 10) : null,
                lastCollectionDate: m?.lastCollectionDate ? m.lastCollectionDate.slice(0, 10) : null,
            });

            setForm({
                requested: m?.requested ?? false,
                bankName: m?.bankName ?? c.bankName ?? '',
                accountHolderName: m?.accountHolderName ?? c.accountHolderName ?? `${c.firstName} ${c.lastName}`.trim(),
                accountNumber: m?.accountNumber ?? c.accountNumber ?? '',
                accountType: m?.accountType ?? c.accountType ?? '',
                branchCode: m?.branchCode ?? c.branchCode ?? '',
                debitOrderDay: String(m?.debitOrderDay ?? c.debitOrderDay ?? ''),
                notes: m?.notes ?? '',
                ...terms,
            });
            setMandate(m);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load mandate');
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => { load(); }, [load]);

    // Recompute the (total, monthly, count, last-date) relationships whenever an
    // input that participates in them changes.
    const updateTerms = (patch: Partial<MandateTerms>, justEdited: TermField) => {
        setForm(prev => {
            if (!prev) return prev;
            const next = deriveMandateTerms({ ...prev, ...patch }, justEdited);
            return { ...prev, ...next };
        });
    };

    const onBankChange = (bankName: string) => {
        setForm(prev => {
            if (!prev) return prev;
            const code = lookupBranchCode(bankName);
            // Auto-fill the branch code unless the user has manually typed one.
            const shouldFill = code && (branchAuto || !prev.branchCode);
            if (code && shouldFill) setBranchAuto(true);
            return { ...prev, bankName, branchCode: shouldFill ? code! : prev.branchCode };
        });
    };

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm(prev => (prev ? { ...prev, [key]: value } : prev));

    const checklist = useMemo(() => {
        if (!form) return [];
        const like: MandateLike = {
            requested: form.requested,
            status: mandate?.status ?? 'DRAFT',
            amount: form.monthlyInstalment,
            bankName: form.bankName || null,
            accountNumber: form.accountNumber || null,
            branchCode: form.branchCode || null,
            sentAt: mandate?.sentAt ?? null,
            signedReturnedAt: mandate?.signedReturnedAt ?? null,
            signedDocumentId: mandate?.signedDocumentId ?? null,
            nupayDocumentId: mandate?.nupayDocumentId ?? null,
            nupayReference: mandate?.nupayReference ?? null,
        };
        return buildMandateChecklist(like);
    }, [form, mandate]);

    const progress = useMemo(() => {
        if (!form) return 0;
        return mandateProgress({
            requested: form.requested,
            status: mandate?.status ?? 'DRAFT',
            amount: form.monthlyInstalment,
            bankName: form.bankName || null,
            accountNumber: form.accountNumber || null,
            branchCode: form.branchCode || null,
            sentAt: mandate?.sentAt ?? null,
            signedReturnedAt: mandate?.signedReturnedAt ?? null,
            signedDocumentId: mandate?.signedDocumentId ?? null,
            nupayDocumentId: mandate?.nupayDocumentId ?? null,
            nupayReference: mandate?.nupayReference ?? null,
        });
    }, [form, mandate]);

    const nextAction = useMemo(() => {
        if (!form) return null;
        return nextMandateAction({
            requested: form.requested,
            status: mandate?.status ?? 'DRAFT',
            amount: form.monthlyInstalment,
            bankName: form.bankName || null,
            accountNumber: form.accountNumber || null,
            branchCode: form.branchCode || null,
            sentAt: mandate?.sentAt ?? null,
            signedReturnedAt: mandate?.signedReturnedAt ?? null,
            signedDocumentId: mandate?.signedDocumentId ?? null,
            nupayDocumentId: mandate?.nupayDocumentId ?? null,
            nupayReference: mandate?.nupayReference ?? null,
        });
    }, [form, mandate]);

    const save = async () => {
        if (!form) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/finance/cases/${caseId}/mandate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requested: form.requested,
                    bankName: form.bankName || null,
                    accountHolderName: form.accountHolderName || null,
                    accountNumber: form.accountNumber || null,
                    accountType: form.accountType || null,
                    branchCode: form.branchCode || null,
                    debitOrderDay: form.debitOrderDay ? Number(form.debitOrderDay) : null,
                    amount: form.monthlyInstalment ?? null,
                    frequency: form.frequency,
                    numInstalments: form.numInstalments ?? null,
                    firstCollectionDate: form.firstCollectionDate || null,
                    lastCollectionDate: form.lastCollectionDate || null,
                    notes: form.notes || null,
                    saveBankingToClient: true,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                const msg = typeof data.error === 'string' ? data.error : 'Validation failed — check the fields and try again.';
                throw new Error(msg);
            }
            setMandate(data.mandate);
            setSavedAt(Date.now());
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to save mandate');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-6 flex items-center gap-3 text-gray-400 text-sm">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-400" />
                Loading debit-order mandate…
            </div>
        );
    }

    if (!form) {
        return (
            <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-6">
                <p className="text-red-400 text-sm mb-3">{error ?? 'Could not load the mandate.'}</p>
                <button onClick={load} className="px-3 py-1.5 text-xs bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-400 rounded-lg transition-colors">
                    Retry
                </button>
            </div>
        );
    }

    const inputCls = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50';
    const labelCls = 'block text-xs text-gray-500 uppercase tracking-wider mb-1';
    const derivedHint = 'text-[10px] text-cyan-400/80 mt-0.5';

    return (
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5">
            {/* Header + progress */}
            <div className="p-5 border-b border-white/5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className="text-white font-semibold">Debit Order Mandate</h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Auto-fills branch codes and works out instalments, total and last collection date for you.
                        </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                        {mandate?.status ?? 'DRAFT'}
                    </span>
                </div>
                <div className="mt-4">
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                        <span className="text-xs text-gray-500">{progress}% set up</span>
                        {nextAction && <span className="text-xs text-amber-400">Next: {nextAction}</span>}
                    </div>
                </div>
            </div>

            <div className="p-5 space-y-6">
                {/* Consent */}
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={form.requested}
                        onChange={e => set('requested', e.target.checked)}
                        className="w-4 h-4 rounded accent-cyan-500"
                    />
                    <span className="text-sm text-gray-300">Consumer has requested / consented to a debit-order mandate</span>
                </label>

                {/* Banking details — bank picker auto-fills branch code */}
                <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Bank Account Details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Bank</label>
                            <select value={SA_BANKS.some(b => b.name === form.bankName) ? form.bankName : (form.bankName ? '__other__' : '')} onChange={e => onBankChange(e.target.value === '__other__' ? '' : e.target.value)} className={inputCls}>
                                <option value="">Select bank…</option>
                                {SA_BANKS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                                <option value="__other__">Other / type manually</option>
                            </select>
                            {!SA_BANKS.some(b => b.name === form.bankName) && (
                                <input
                                    value={form.bankName}
                                    onChange={e => onBankChange(e.target.value)}
                                    placeholder="Type bank name"
                                    className={`${inputCls} mt-2`}
                                />
                            )}
                        </div>
                        <div>
                            <label className={labelCls}>Branch code</label>
                            <input
                                value={form.branchCode}
                                onChange={e => { setBranchAuto(false); set('branchCode', e.target.value); }}
                                placeholder="Auto-filled from bank"
                                className={inputCls}
                            />
                            {branchAuto && form.branchCode && (
                                <p className={derivedHint}>✓ Universal branch code auto-filled</p>
                            )}
                        </div>
                        <div>
                            <label className={labelCls}>Account holder</label>
                            <input value={form.accountHolderName} onChange={e => set('accountHolderName', e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Account number</label>
                            <input value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Account type</label>
                            <select value={form.accountType} onChange={e => set('accountType', e.target.value)} className={inputCls}>
                                <option value="">Select…</option>
                                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Debit order day (1–31)</label>
                            <input type="number" min={1} max={31} value={form.debitOrderDay} onChange={e => set('debitOrderDay', e.target.value)} className={inputCls} />
                        </div>
                    </div>
                </div>

                {/* Payment terms — the dynamic triangle */}
                <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Payment Terms</h3>
                    <p className="text-[11px] text-gray-600 mb-3">Enter any two of total, monthly instalment and number of instalments — the third is worked out automatically.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className={labelCls}>Total amount to be paid</label>
                            <input
                                inputMode="decimal"
                                value={moneyStr(form.totalAmount)}
                                onChange={e => updateTerms({ totalAmount: e.target.value === '' ? null : Number(e.target.value) }, 'totalAmount')}
                                placeholder="e.g. 6000"
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Monthly instalment</label>
                            <input
                                inputMode="decimal"
                                value={moneyStr(form.monthlyInstalment)}
                                onChange={e => updateTerms({ monthlyInstalment: e.target.value === '' ? null : Number(e.target.value) }, 'monthlyInstalment')}
                                placeholder="e.g. 500"
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Number of instalments</label>
                            <input
                                type="number"
                                min={1}
                                value={form.numInstalments ?? ''}
                                onChange={e => updateTerms({ numInstalments: e.target.value === '' ? null : Number(e.target.value) }, 'numInstalments')}
                                placeholder="auto"
                                className={inputCls}
                            />
                            {form.numInstalments != null && form.totalAmount != null && form.monthlyInstalment != null && (
                                <p className={derivedHint}>{form.numInstalments} × {formatRand(form.monthlyInstalment)} = {formatRand(form.totalAmount)}</p>
                            )}
                        </div>
                        <div>
                            <label className={labelCls}>Frequency</label>
                            <select value={form.frequency} onChange={e => updateTerms({ frequency: e.target.value as Frequency }, 'frequency')} className={inputCls}>
                                <option value="MONTHLY">Monthly</option>
                                <option value="WEEKLY">Weekly</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>First collection date</label>
                            <input
                                type="date"
                                value={form.firstCollectionDate ?? ''}
                                onChange={e => updateTerms({ firstCollectionDate: e.target.value || null }, 'firstCollectionDate')}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Last collection date</label>
                            <input
                                type="date"
                                value={form.lastCollectionDate ?? ''}
                                onChange={e => set('lastCollectionDate', e.target.value || null)}
                                className={inputCls}
                            />
                            {form.lastCollectionDate && form.firstCollectionDate && form.numInstalments && (
                                <p className={derivedHint}>✓ Auto-calculated from first date + {form.numInstalments} {form.frequency === 'WEEKLY' ? 'weeks' : 'months'}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Notes */}
                <div>
                    <label className={labelCls}>Notes</label>
                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={inputCls} placeholder="Optional internal notes about this mandate" />
                </div>

                {/* Checklist */}
                <div className="bg-white/3 rounded-lg border border-white/5 p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mandate checklist</p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                        {checklist.map(item => (
                            <li key={item.key} className="flex items-center gap-2 text-sm">
                                <span className={item.done ? 'text-emerald-400' : 'text-gray-600'}>{item.done ? '✓' : '○'}</span>
                                <span className={item.done ? 'text-gray-300' : 'text-gray-500'}>{item.label}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Feedback */}
                {error && <p className="text-sm text-red-400">{error}</p>}
                {savedAt && !error && <p className="text-sm text-emerald-400">Mandate saved ✓</p>}

                {/* Actions */}
                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        onClick={save}
                        disabled={saving}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                        {saving ? 'Saving…' : 'Save mandate'}
                    </button>
                    <a
                        href={`/api/finance/cases/${caseId}/mandate/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-lg text-sm font-medium transition-colors"
                    >
                        Generate mandate PDF ↗
                    </a>
                </div>
            </div>
        </div>
    );
}
