'use client'

import { useState } from 'react'

type Payment = {
  id: string
  amount: number
  date: string
  method: string
  reference: string | null
  category: string
  notes: string | null
  client: { firstName: string; lastName: string } | null
  case: { fileNumber: string } | null
}

interface EditPaymentModalProps {
  payment: Payment
  onClose: () => void
  onSuccess: (paymentId: string) => void
}

export function EditPaymentModal({ payment, onClose, onSuccess }: EditPaymentModalProps) {
  const [amount, setAmount]       = useState(String(payment.amount))
  const [date, setDate]           = useState(new Date(payment.date).toISOString().split('T')[0])
  const [method, setMethod]       = useState(payment.method)
  const [reference, setReference] = useState(payment.reference ?? '')
  const [category, setCategory]   = useState(payment.category)
  const [notes, setNotes]         = useState(payment.notes ?? '')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/finance/payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, date, method, reference, category, notes }) })
      if (res.ok) {
        onSuccess(payment.id)
        onClose()
      } else {
        const err = await res.json()
        setError(typeof err.error === 'string' ? err.error : 'Could not save changes — check the fields and try again')
      }
    } catch {
      setError('Network error — changes were not saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--color-bg-secondary)] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-semibold text-lg">Edit Payment</h2>
            {(payment.client || payment.case) && (
              <p className="text-gray-400 text-xs mt-0.5">
                {payment.client && `${payment.client.firstName} ${payment.client.lastName}`}
                {payment.case && <span className="text-cyan-400 ml-2 font-mono">{payment.case.fileNumber}</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        {/* Fields */}
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Amount (ZAR)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
                <option value="EFT">EFT</option>
                <option value="CASH">Cash</option>
                <option value="DEBIT_ORDER">Debit Order</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
                <option value="DEPOSIT">Deposit</option>
                <option value="INSTALLMENT">Installment</option>
                <option value="SERVICE_FEE">Service Fee</option>
                <option value="LEGAL_FEE">Legal Fee</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Reference</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. EFT-20260221-001"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 focus:outline-none resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !amount || parseFloat(amount) <= 0 || !date}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
