'use client';

/**
 * FeeDocumentsPanel — the "Invoices & Payments" block on a case's Documents tab.
 *
 * Lists every invoice / proof of payment on the case and gives each the next
 * action: send or forward it, and (for our own invoices) record payment. Also
 * generates the consumer's legal fee invoice. The case status is moved by the
 * API; this component only reports what happened.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    DEFAULT_LEGAL_FEE_AMOUNT,
    FEE_DOCUMENT_TYPES,
    formatStatus,
    getFeeDocumentInfo,
    isFeeDocumentType,
} from '@zenowethu/shared-lib';
import { confirm } from './providers/ConfirmProvider';

type PanelDocument = { id: string; type: string; fileName: string; fileUrl: string; uploadedAt: string };

type History = {
    documentId: string;
    lastSentAt: string | null;
    lastSentNote: string | null;
    paidAmount: number;
    lastPaidAt: string | null;
};

type StatusChange = { moved: boolean; toStatus?: string; message?: string };

type Action =
    | { kind: 'send'; docId: string }
    | { kind: 'pay'; docId: string }
    | { kind: 'legal' }
    | null;

const PAYMENT_METHODS = ['EFT', 'CASH', 'DEBIT_ORDER', 'CARD', 'OTHER'] as const;

const formatZar = (n: number) =>
    new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(n);

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });

function describeStatus(change?: StatusChange): string {
    if (change?.moved && change.toStatus) return ` Case status set to "${formatStatus(change.toStatus)}".`;
    return change?.message ? ` (${change.message})` : '';
}

async function readError(res: Response, fallback: string): Promise<string> {
    try {
        const body = await res.json();
        return body.error || fallback;
    } catch {
        return fallback;
    }
}

export function FeeDocumentsPanel({ caseId, documents, onChanged }: {
    caseId: string;
    documents: PanelDocument[];
    /** Called after any successful action; `statusMoved` tells the page to refresh the case. */
    onChanged: (statusMoved: boolean) => void;
}) {
    const feeDocs = documents.filter(d => isFeeDocumentType(d.type));
    const [history, setHistory] = useState<Record<string, History>>({});
    const [historyError, setHistoryError] = useState('');
    const [defaultLegalFee, setDefaultLegalFee] = useState<number>(DEFAULT_LEGAL_FEE_AMOUNT);
    const [action, setAction] = useState<Action>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Form fields for the open action
    const [note, setNote] = useState('');
    const [amount, setAmount] = useState('');
    const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
    const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('EFT');
    const [reference, setReference] = useState('');

    const docIds = feeDocs.map(d => d.id).join(',');

    const loadHistory = useCallback(async () => {
        try {
            const res = await fetch(`/api/cases/${caseId}/fee-documents`);
            if (!res.ok) throw new Error(await readError(res, 'Could not load invoice history'));
            const { history: rows, legalFeeAmount } = await res.json() as { history: History[]; legalFeeAmount?: number };
            setHistory(Object.fromEntries(rows.map(r => [r.documentId, r])));
            if (legalFeeAmount) setDefaultLegalFee(legalFeeAmount);
            setHistoryError('');
        } catch (e) {
            setHistoryError(e instanceof Error ? e.message : 'Could not load invoice history');
        }
    }, [caseId, docIds]);

    useEffect(() => { loadHistory(); }, [loadHistory]);

    const openAction = (next: Action) => {
        setAction(next);
        setError('');
        setSuccess('');
        setNote('');
        setReference('');
        setMethod('EFT');
        setPaidAt(new Date().toISOString().slice(0, 10));
        setAmount(next?.kind === 'legal' ? String(defaultLegalFee) : '');
    };

    const finish = (message: string, change?: StatusChange) => {
        setSuccess(message + describeStatus(change));
        setAction(null);
        loadHistory();
        onChanged(!!change?.moved);
    };

    const handleSend = async (doc: PanelDocument) => {
        const info = getFeeDocumentInfo(doc.type);
        if (!info) return;
        const recipient = info.sendTo === 'DC' ? 'the debt counsellor (with the signed POA and ID)' : 'the consumer';
        const ok = await confirm({
            title: info.sendLabel,
            message: `Email "${doc.fileName}" to ${recipient}?`,
            confirmText: info.sendLabel,
        });
        if (!ok) return;

        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/cases/${caseId}/fee-documents/${doc.id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: note.trim() || undefined }),
            });
            if (!res.ok) throw new Error(await readError(res, 'Could not send the document'));
            const data = await res.json() as { recipient?: string; statusChange?: StatusChange; mandateSummary?: string };
            finish(
                `Sent to ${data.recipient}.${data.mandateSummary ? ` ${data.mandateSummary}.` : ''}`,
                data.statusChange,
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not send the document');
        } finally {
            setBusy(false);
        }
    };

    const handleMarkPaid = async (doc: PanelDocument) => {
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) {
            setError('Enter the amount that was paid');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/cases/${caseId}/fee-documents/${doc.id}/mark-paid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: value, paidAt, method, reference: reference.trim() || undefined }),
            });
            if (!res.ok) throw new Error(await readError(res, 'Could not record the payment'));
            const data = await res.json() as { statusChange?: StatusChange };
            finish(`Payment of ${formatZar(value)} recorded.`, data.statusChange);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not record the payment');
        } finally {
            setBusy(false);
        }
    };

    const handleGenerateLegalFee = async () => {
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) {
            setError('Enter the legal fee amount');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/cases/${caseId}/legal-fee-invoice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: value }),
            });
            if (!res.ok) throw new Error(await readError(res, 'Could not generate the legal fee invoice'));
            const data = await res.json() as { invoiceNumber: string; statusChange?: StatusChange };
            finish(`Legal fee invoice ${data.invoiceNumber} generated — use "Send to consumer" below.`, data.statusChange);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not generate the legal fee invoice');
        } finally {
            setBusy(false);
        }
    };

    const inputClass = 'px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400';

    return (
        <div className="mb-6 p-4 bg-zeno-navy/50 rounded-lg border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p className="text-sm font-medium text-white">🧾 Invoices & Payments</p>
                <button
                    type="button"
                    onClick={() => openAction(action?.kind === 'legal' ? null : { kind: 'legal' })}
                    disabled={busy}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50"
                >
                    + Generate legal fee invoice
                </button>
            </div>

            {error && <div className="mb-3 p-2.5 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">{error}</div>}
            {success && <div className="mb-3 p-2.5 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300 text-sm">{success}</div>}
            {historyError && <p className="mb-3 text-xs text-amber-300">⚠ {historyError}</p>}

            {action?.kind === 'legal' && (
                <div className="mb-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-xs text-gray-300">
                        Legal fee amount (R, no VAT added)
                        <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={`${inputClass} w-40`} />
                    </label>
                    <button type="button" onClick={handleGenerateLegalFee} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-amber-500 text-zeno-navy font-semibold hover:bg-amber-400 disabled:opacity-50">
                        {busy ? 'Generating…' : 'Generate invoice'}
                    </button>
                    <button type="button" onClick={() => openAction(null)} disabled={busy} className="px-3 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                </div>
            )}

            {feeDocs.length === 0 ? (
                <p className="text-xs text-gray-400">
                    No invoices or proof of payment yet. Upload one below using an &quot;Invoices &amp; Payments&quot; type
                    ({FEE_DOCUMENT_TYPES.map(d => d.label).join(', ')}) and the case status updates automatically.
                </p>
            ) : (
                <ul className="space-y-2">
                    {feeDocs.map(doc => {
                        const info = getFeeDocumentInfo(doc.type)!;
                        const h = history[doc.id];
                        const isSending = action?.kind === 'send' && action.docId === doc.id;
                        const isPaying = action?.kind === 'pay' && action.docId === doc.id;
                        return (
                            <li key={doc.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs uppercase tracking-wide text-amber-300">{info.label}</p>
                                        <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-white hover:underline break-all">{doc.fileName}</a>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            Uploaded {formatDate(doc.uploadedAt)}
                                            {h?.lastSentAt ? ` · Sent ${formatDate(h.lastSentAt)}` : ' · Not sent yet'}
                                            {info.payable && (h?.paidAmount ? ` · Paid ${formatZar(h.paidAmount)}` : ' · Unpaid')}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openAction(isSending ? null : { kind: 'send', docId: doc.id })}
                                            disabled={busy}
                                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-50"
                                        >
                                            {h?.lastSentAt ? `${info.sendLabel} again` : info.sendLabel}
                                        </button>
                                        {info.payable && (
                                            <button
                                                type="button"
                                                onClick={() => openAction(isPaying ? null : { kind: 'pay', docId: doc.id })}
                                                disabled={busy}
                                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 disabled:opacity-50"
                                            >
                                                Mark paid
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isSending && (
                                    <div className="mt-3 flex flex-col gap-2">
                                        <textarea
                                            value={note}
                                            onChange={e => setNote(e.target.value)}
                                            rows={2}
                                            placeholder="Optional note added above the standard message"
                                            className={inputClass}
                                        />
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => handleSend(doc)} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-cyan-500 text-zeno-navy font-semibold hover:bg-cyan-400 disabled:opacity-50">
                                                {busy ? 'Sending…' : info.sendLabel}
                                            </button>
                                            <button type="button" onClick={() => openAction(null)} disabled={busy} className="px-3 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                                        </div>
                                    </div>
                                )}

                                {isPaying && (
                                    <div className="mt-3 flex flex-wrap items-end gap-3">
                                        <label className="flex flex-col gap-1 text-xs text-gray-300">
                                            Amount paid (R)
                                            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={`${inputClass} w-32`} />
                                        </label>
                                        <label className="flex flex-col gap-1 text-xs text-gray-300">
                                            Date paid
                                            <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} className={inputClass} />
                                        </label>
                                        <label className="flex flex-col gap-1 text-xs text-gray-300">
                                            Method
                                            <select value={method} onChange={e => setMethod(e.target.value as typeof method)} className={inputClass}>
                                                {PAYMENT_METHODS.map(m => <option key={m} value={m} className="bg-zeno-navy">{m.replace('_', ' ')}</option>)}
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-1 text-xs text-gray-300">
                                            Reference
                                            <input type="text" value={reference} onChange={e => setReference(e.target.value)} className={`${inputClass} w-40`} />
                                        </label>
                                        <button type="button" onClick={() => handleMarkPaid(doc)} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-green-500 text-zeno-navy font-semibold hover:bg-green-400 disabled:opacity-50">
                                            {busy ? 'Saving…' : 'Record payment'}
                                        </button>
                                        <button type="button" onClick={() => openAction(null)} disabled={busy} className="px-3 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
