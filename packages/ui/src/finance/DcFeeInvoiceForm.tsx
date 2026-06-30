'use client';

/**
 * DcFeeInvoiceForm — shared capture & generate form for a Debt Counsellor Fee
 * Invoice / Quotation. Used by both the Cases app (inside a modal, pre-filled
 * from a case) and the Finance app (standalone page). All business logic
 * (catalogue, schema, VAT maths) comes from `@zenowethu/shared-lib`; the API
 * routes it calls (`/api/dc-fee-invoices*`, `/api/cases/[id]/dc-fee-invoice`)
 * exist in both apps so the same relative URLs work in either.
 *
 * Styling uses theme-neutral Tailwind utilities so it renders correctly against
 * both apps' dark themes.
 */

import { useMemo, useState } from 'react';
import {
  DC_FEE_REASONS,
  dcFeeReasonLabel,
  dcFeeDocLabel,
  dcFeeInvoiceInputSchema,
  computeDcFeeTotals,
  type DcFeeReasonKey,
} from '@zenowethu/shared-lib';
import { toast } from '../ui/Toaster';

interface LineRow {
  reasonKey: DcFeeReasonKey;
  description: string;
  amount: string;
}

export interface DcFeeInvoiceFormProps {
  /** When set, the invoice is created against this case and logged on its timeline. */
  caseId?: string;
  /** Optional link to the Zenowethu consumer record (standalone / client-picker flows). */
  clientId?: string;
  // Prefill — all optional.
  dcName?: string | null;
  dcEmail?: string | null;
  dcTradingName?: string | null;
  clientFirstName?: string | null;
  clientLastName?: string | null;
  clientIdNumber?: string | null;
  /** Shows an ✕ in the header and is called when the user is done. */
  onClose?: () => void;
}

const fmtZAR = (n: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(n);

const inputCls =
  'w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-400/60';

export function DcFeeInvoiceForm(props: DcFeeInvoiceFormProps) {
  const { caseId, clientId, onClose } = props;

  const [documentType, setDocumentType] = useState<'INVOICE' | 'QUOTE'>('INVOICE');
  const docLabel = dcFeeDocLabel(documentType);
  const [dcName, setDcName] = useState(props.dcName ?? '');
  const [dcEmail, setDcEmail] = useState(props.dcEmail ?? '');
  const [dcTradingName, setDcTradingName] = useState(props.dcTradingName ?? '');
  const [clientFirstName, setClientFirstName] = useState(props.clientFirstName ?? '');
  const [clientLastName, setClientLastName] = useState(props.clientLastName ?? '');
  const [clientIdNumber, setClientIdNumber] = useState(props.clientIdNumber ?? '');
  const [applyVat, setApplyVat] = useState(true);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<LineRow[]>([
    { reasonKey: 'COMMISSION_PAID_OUT', description: dcFeeReasonLabel('COMMISSION_PAID_OUT'), amount: '' },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: string; invoiceNumber: string; total: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const totals = useMemo(
    () => computeDcFeeTotals(rows.map((r) => ({ amount: parseFloat(r.amount) || 0 })), applyVat),
    [rows, applyVat],
  );

  const addRow = () => setRows((r) => [...r, { reasonKey: 'OTHER', description: '', amount: '' }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<LineRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const onReasonChange = (i: number, reasonKey: DcFeeReasonKey) => {
    const row = rows[i];
    const wasDefault = !row.description.trim() || row.description === dcFeeReasonLabel(row.reasonKey);
    updateRow(i, {
      reasonKey,
      description: wasDefault && reasonKey !== 'OTHER' ? dcFeeReasonLabel(reasonKey) : row.description,
    });
  };

  const handleSubmit = async () => {
    const payload = {
      dcName: dcName.trim(),
      dcEmail: dcEmail.trim(),
      dcTradingName: dcTradingName.trim(),
      clientFirstName: clientFirstName.trim(),
      clientLastName: clientLastName.trim(),
      clientIdNumber: clientIdNumber.trim(),
      applyVat,
      notes: notes.trim(),
      documentType,
      lineItems: rows.map((r) => ({
        reasonKey: r.reasonKey,
        description: r.description.trim() || dcFeeReasonLabel(r.reasonKey),
        amount: parseFloat(r.amount),
      })),
    };

    const parsed = dcFeeInvoiceInputSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first ? first.message : 'Please check the form and try again.');
      return;
    }

    setSubmitting(true);
    try {
      const url = caseId ? `/api/cases/${caseId}/dc-fee-invoice` : '/api/dc-fee-invoices';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientId ? { ...parsed.data, clientId } : parsed.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to create document.');
        return;
      }
      setCreated({ id: data.id, invoiceNumber: data.invoiceNumber, total: data.total });
      toast.success(`${docLabel} ${data.invoiceNumber} created.`);
    } catch {
      toast.error('Connection failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = () => {
    if (created) window.open(`/api/dc-fee-invoices/${created.id}/pdf`, '_blank');
  };

  const handleEmail = async () => {
    if (!created) return;
    setSending(true);
    try {
      const res = await fetch(`/api/dc-fee-invoices/${created.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to email the document.');
        return;
      }
      setSent(true);
      toast.success(`${docLabel} emailed to ${data.sentTo}.`);
    } catch {
      toast.error('Connection failed. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold text-white">Debt Counsellor Fee {docLabel}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {documentType === 'QUOTE' ? 'Quote' : 'Invoice'} the requesting debt counsellor for fees the consumer still owes Zenowethu.
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        )}
      </div>

      {created ? (
        /* ── Success ─────────────────────────────────────────────── */
        <div className="space-y-5">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
            <p className="text-sm text-emerald-300 font-semibold">{docLabel} {created.invoiceNumber} created</p>
            <p className="text-xs text-gray-400 mt-1">
              {documentType === 'QUOTE' ? 'Quoted total' : 'Total due'}: {fmtZAR(created.total)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleDownload} className="px-4 py-2 bg-cyan-600/20 border border-cyan-600/40 text-cyan-300 rounded-lg text-sm font-semibold hover:bg-cyan-600/30 transition-all">
              Download PDF
            </button>
            <button onClick={handleEmail} disabled={sending || sent} className="px-4 py-2 bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 rounded-lg text-sm font-semibold hover:bg-indigo-600/30 transition-all disabled:opacity-50">
              {sending ? 'Sending…' : sent ? 'Emailed ✓' : 'Email to Debt Counsellor'}
            </button>
            <button
              onClick={() => { setCreated(null); setSent(false); }}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              New {docLabel.toLowerCase()}
            </button>
            {onClose && (
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors ml-auto">Done</button>
            )}
          </div>
        </div>
      ) : (
        /* ── Form ────────────────────────────────────────────────── */
        <div className="space-y-6">
          {/* Document type toggle */}
          <div className="inline-flex rounded-lg border border-white/15 p-0.5 bg-black/20">
            {(['QUOTE', 'INVOICE'] as const).map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => setDocumentType(dt)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  documentType === dt ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {dt === 'QUOTE' ? 'Quotation' : 'Invoice'}
              </button>
            ))}
          </div>

          {/* Debt counsellor */}
          <section className="space-y-3">
            <h3 className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Bill To — Debt Counsellor</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Debt Counsellor Name <span className="text-red-400">*</span></label>
                <input value={dcName} onChange={(e) => setDcName(e.target.value)} className={inputCls} placeholder="Full name" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email</label>
                <input value={dcEmail} onChange={(e) => setDcEmail(e.target.value)} className={inputCls} placeholder="dc@example.co.za" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Trading Name</label>
                <input value={dcTradingName} onChange={(e) => setDcTradingName(e.target.value)} className={inputCls} placeholder="t/a …" />
              </div>
            </div>
          </section>

          {/* Consumer */}
          <section className="space-y-3">
            <h3 className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Consumer (fees relate to)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name <span className="text-red-400">*</span></label>
                <input value={clientFirstName} onChange={(e) => setClientFirstName(e.target.value)} className={inputCls} placeholder="First name" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Surname <span className="text-red-400">*</span></label>
                <input value={clientLastName} onChange={(e) => setClientLastName(e.target.value)} className={inputCls} placeholder="Surname" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">ID Number <span className="text-red-400">*</span></label>
                <input value={clientIdNumber} onChange={(e) => setClientIdNumber(e.target.value)} className={inputCls} placeholder="13-digit SA ID" maxLength={13} />
              </div>
            </div>
          </section>

          {/* Fee lines */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Fees</h3>
              <button onClick={addRow} className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold">+ Add fee</button>
            </div>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <select value={row.reasonKey} onChange={(e) => onReasonChange(i, e.target.value as DcFeeReasonKey)} className={`${inputCls} col-span-4`}>
                    {DC_FEE_REASONS.map((r) => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </select>
                  <input value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} className={`${inputCls} col-span-5`} placeholder="Description" />
                  <input
                    value={row.amount}
                    onChange={(e) => updateRow(i, { amount: e.target.value.replace(/[^0-9.]/g, '') })}
                    className={`${inputCls} col-span-2 text-right`}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                  <button
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    className="col-span-1 text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-500 text-lg leading-none pt-1.5"
                    title="Remove fee"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section>
            <label className="block text-xs text-gray-400 mb-1">Notes <span className="text-gray-500">(optional — printed on the document)</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="e.g. Payment terms, reference instructions…" />
          </section>

          {/* Totals + VAT */}
          <section className="bg-black/20 rounded-lg p-4 space-y-2">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={applyVat} onChange={(e) => setApplyVat(e.target.checked)} className="accent-cyan-500" />
              Apply 15% VAT (Zenowethu VAT 4590307072)
            </label>
            <div className="flex justify-between text-xs text-gray-400"><span>Subtotal</span><span>{fmtZAR(totals.subtotal)}</span></div>
            <div className="flex justify-between text-xs text-gray-400"><span>VAT ({Math.round(totals.vatRate * 100)}%)</span><span>{fmtZAR(totals.vatAmount)}</span></div>
            <div className="flex justify-between text-sm text-white font-bold border-t border-white/15 pt-2"><span>Total Due</span><span className="text-cyan-300">{fmtZAR(totals.total)}</span></div>
          </section>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
            {onClose && (
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm flex items-center gap-2"
            >
              {submitting && <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />}
              {submitting ? 'Creating…' : `Create ${docLabel}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
