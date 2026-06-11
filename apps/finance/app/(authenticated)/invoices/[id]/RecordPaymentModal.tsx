'use client'

import { useState } from 'react'

const METHODS = ['EFT', 'CASH', 'DEBIT_ORDER', 'CARD', 'PAYROLL', 'OTHER'] as const

export default function RecordPaymentModal({
  invoiceId,
  invoiceNumber,
  balanceDue,
}: {
  invoiceId: string
  invoiceNumber: string
  balanceDue: number
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(balanceDue > 0 ? balanceDue.toFixed(2) : '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [method, setMethod] = useState<string>('EFT')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Enter a payment amount greater than zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/finance/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount:    parsedAmount,
          date:      new Date(`${date}T12:00:00Z`).toISOString(),
          method,
          reference: reference || undefined,
          notes:     notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record payment')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Record Payment
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && setOpen(false)}>
          <div
            className="w-full max-w-md bg-[var(--color-bg-secondary)] rounded-xl border border-white/10 p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-bold text-white">Record Payment</h2>
              <p className="text-xs text-gray-500 mt-0.5">Against invoice {invoiceNumber}</p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Amount (R) *</label>
                <input
                  type="number" min="0.01" step="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Date *</label>
                <input
                  type="date" value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Method *</label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              >
                {METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Reference</label>
              <input
                type="text" value={reference} maxLength={100}
                onChange={e => setReference(e.target.value)}
                placeholder="Bank reference, receipt number…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes</label>
              <textarea
                value={notes} maxLength={1000} rows={2}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving && <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />}
                {saving ? 'Saving…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
