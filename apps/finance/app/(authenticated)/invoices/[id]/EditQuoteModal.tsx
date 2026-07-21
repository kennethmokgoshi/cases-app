'use client'

import { useState, useEffect } from 'react'

export interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  creditor?: string
  serviceKey?: string
  serviceLabel?: string
}

export interface BankAccount {
  id: string
  bankName: string
  accountName: string
  accountNumber: string
  branchCode?: string | null
  accountType: string
  isDefault?: boolean
}

export default function EditQuoteModal({
  invoiceId,
  invoiceNumber,
  initialLineItems,
  initialBankAccountId,
  vatRate = 0.15,
}: {
  invoiceId: string
  invoiceNumber: string
  initialLineItems: LineItem[]
  initialBankAccountId: string | null
  vatRate?: number
}) {
  const [open, setOpen] = useState(false)
  const [lineItems, setLineItems] = useState<LineItem[]>(
    initialLineItems.length > 0
      ? initialLineItems
      : [{ description: '', quantity: 1, unitPrice: 0 }]
  )
  const [bankAccountId, setBankAccountId] = useState<string>(initialBankAccountId || '')
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loadingBanks, setLoadingBanks] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) {
      setLoadingBanks(true)
      fetch('/api/finance/bank-accounts')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setBankAccounts(data)
          }
        })
        .catch(() => {})
        .finally(() => setLoadingBanks(false))
    }
  }, [open])

  const handleAddItem = () => {
    setLineItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0 }])
  }

  const handleRemoveItem = (index: number) => {
    if (lineItems.length === 1) return
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: keyof LineItem, value: any) => {
    setLineItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const subtotal = lineItems.reduce((acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
  const vatAmount = subtotal * vatRate
  const total = subtotal + vatAmount

  const handleSave = async () => {
    setError('')
    for (let i = 0; i < lineItems.length; i++) {
      if (!lineItems[i].description.trim()) {
        setError(`Item #${i + 1} requires a description`)
        return
      }
      if (lineItems[i].quantity <= 0) {
        setError(`Item #${i + 1} must have a quantity greater than 0`)
        return
      }
      if (lineItems[i].unitPrice < 0) {
        setError(`Item #${i + 1} cannot have a negative price`)
        return
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/finance/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineItems,
          bankAccountId: bankAccountId || null,
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to update quote')
      }

      setSaved(true)
      setTimeout(() => {
        setOpen(false)
        window.location.reload()
      }, 1200)
    } catch (err: unknown) {
      setError((err as Error).message)
    } fontally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true)
          setSaved(false)
          setError('')
        }}
        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-colors border border-amber-500/20 font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        Edit Quote & Banking
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl p-6 my-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Edit Quote {invoiceNumber}</h2>
                <p className="text-xs text-gray-400">Modify items or update payment banking details for this quote</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {saved ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white font-medium text-lg">Quote Updated Successfully!</p>
                <p className="text-gray-400 text-sm mt-1">Refreshing quote view...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">
                    {error}
                  </div>
                )}

                {/* Bank Details Selector */}
                <div className="space-y-2 bg-white/5 p-4 rounded-xl border border-white/5">
                  <label className="text-sm font-medium text-amber-400 block">Payment Bank Account</label>
                  <p className="text-xs text-gray-400">Select the bank account the client will use to make payment (Capitec, Standard Bank, FNB, etc.)</p>
                  {loadingBanks ? (
                    <p className="text-xs text-gray-500">Loading bank accounts...</p>
                  ) : (
                    <select
                      value={bankAccountId}
                      onChange={(e) => setBankAccountId(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                    >
                      <option value="">-- Select Bank Account --</option>
                      {bankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.bankName} - {account.accountName} ({account.accountNumber}){account.isDefault ? ' [Default]' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Line Items Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-white">Line Items</label>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Item
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {lineItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 bg-white/5 p-3 rounded-lg border border-white/5"
                      >
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            placeholder="Description (e.g. Debt Counselling Fee / Dispute Submission)"
                            value={item.description}
                            onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-gray-400 block mb-0.5">Qty</label>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full bg-slate-900 border border-white/10 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500/50"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 block mb-0.5">Unit Price (ZAR)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) => handleItemChange(idx, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
                                className="w-full bg-slate-900 border border-white/10 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500/50"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="text-right pl-2 pt-1 min-w-20">
                          <p className="text-[10px] text-gray-400">Total</p>
                          <p className="text-xs font-mono font-medium text-white">
                            R {((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}
                          </p>
                          {lineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-red-400 hover:text-red-300 text-xs mt-2 transition-colors"
                              title="Remove item"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Calculation Summary */}
                <div className="bg-slate-900/80 p-4 rounded-xl border border-white/10 space-y-1.5 font-mono text-xs text-gray-300">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>R {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>VAT ({(vatRate * 100).toFixed(0)}%):</span>
                    <span>R {vatAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-white text-sm pt-2 border-t border-white/10">
                    <span>Total Amount:</span>
                    <span className="text-emerald-400">R {total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving Changes...' : 'Save Quote & Banking'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
