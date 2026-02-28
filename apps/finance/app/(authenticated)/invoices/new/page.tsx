'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type LineItem = { description: string; quantity: number; unitPrice: number }
type ClientResult = { id: string; firstName: string; lastName: string; idNumber: string; email?: string | null; latestCase?: { id: string; fileNumber: string } | null }

function formatZAR(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(n)
}

function today() { return new Date().toISOString().split('T')[0] }
function in30days() {
  const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]
}

export default function NewInvoicePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Client search
  const [clientSearch, setClientSearch]   = useState('')
  const [clientResults, setClientResults] = useState<ClientResult[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  // Form fields
  const [caseId, setCaseId]       = useState('')
  const [issuedAt, setIssuedAt]   = useState(today())
  const [dueAt, setDueAt]         = useState(in30days())
  const [reference, setReference] = useState('')
  const [notes, setNotes]         = useState('')
  const [vatRate, setVatRate]     = useState(0.15)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ])

  // Computed totals
  const subtotal  = lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const vatAmount = subtotal * vatRate
  const total     = subtotal + vatAmount

  // Debounced client search
  useEffect(() => {
    if (clientSearch.length < 2) { setClientResults([]); return }
    const t = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/b2b/clients/search?q=${encodeURIComponent(clientSearch)}&limit=8`)
        if (res.ok) { const d = await res.json(); setClientResults(d.clients ?? []) }
      } finally { setSearchLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  const selectClient = (c: ClientResult) => {
    setSelectedClient(c)
    setClientSearch(`${c.firstName} ${c.lastName}`)
    setClientResults([])
    if (c.latestCase) setCaseId(c.latestCase.id)
  }

  const updateLineItem = (i: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  const removeLineItem = (i: number) => {
    setLineItems(prev => prev.filter((_, idx) => idx !== i))
  }

  const addLineItem = () => {
    setLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }])
  }

  const handleSubmit = async () => {
    setError('')
    if (lineItems.some(i => !i.description.trim())) {
      setError('All line items must have a description.'); return
    }
    if (!dueAt) { setError('Due date is required.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId:  selectedClient?.id,
          caseId:    caseId || undefined,
          lineItems: lineItems.map(i => ({ description: i.description.trim(), quantity: i.quantity, unitPrice: i.unitPrice })),
          dueAt:     new Date(dueAt).toISOString(),
          vatRate,
          reference: reference.trim() || undefined,
          notes:     notes.trim() || undefined }) })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to create invoice')
      }

      const invoice = await res.json()
      router.push(`/invoices/${invoice.id}`)
    } catch (e: unknown) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <a href="/invoices" className="text-gray-500 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <h1 className="text-xl font-bold text-white">New Invoice</h1>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Client + Details */}
        <div className="space-y-5">
          {/* Client search */}
          <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Client</h2>

            <div className="relative">
              <label className="text-xs text-gray-500 mb-1 block">Search client (name, ID number…)</label>
              <input
                type="text"
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); if (!e.target.value) { setSelectedClient(null); setCaseId('') } }}
                placeholder="Start typing…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              />
              {searchLoading && (
                <div className="absolute right-3 top-8 animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400" />
              )}
              {clientResults.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 bg-[var(--color-bg-primary)] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                  {clientResults.map(c => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => selectClient(c)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors"
                      >
                        <span className="text-white font-medium">{c.firstName} {c.lastName}</span>
                        <span className="ml-2 text-gray-500 text-xs">{c.idNumber}</span>
                        {c.latestCase && <span className="ml-2 text-gray-600 text-xs">#{c.latestCase.fileNumber}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedClient && (
              <div className="mt-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-sm">
                <p className="text-emerald-400 font-medium">{selectedClient.firstName} {selectedClient.lastName}</p>
                <p className="text-gray-500 text-xs mt-0.5">{selectedClient.idNumber}</p>
                {selectedClient.email && <p className="text-gray-500 text-xs">{selectedClient.email}</p>}
              </div>
            )}
          </div>

          {/* Dates & Reference */}
          <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Invoice Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Issue Date</label>
                <input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Due Date *</label>
                <input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Reference / PO Number</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional notes for client…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 resize-none"
              />
            </div>
          </div>
        </div>

        {/* RIGHT — Line Items + Totals */}
        <div className="space-y-5">
          <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Line Items</h2>
              <button onClick={addLineItem} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add item
              </button>
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">
              <span className="col-span-5">Description</span>
              <span className="col-span-2 text-center">Qty</span>
              <span className="col-span-3 text-right">Unit Price</span>
              <span className="col-span-2 text-right">Amount</span>
            </div>

            <div className="space-y-2">
              {lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center group">
                  <input
                    className="col-span-5 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                    placeholder="Description"
                    value={item.description}
                    onChange={e => updateLineItem(i, 'description', e.target.value)}
                  />
                  <input
                    className="col-span-2 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-emerald-500/50"
                    type="number" min={0.01} step={1}
                    value={item.quantity}
                    onChange={e => updateLineItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                  />
                  <input
                    className="col-span-3 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:border-emerald-500/50"
                    type="number" min={0} step={0.01}
                    value={item.unitPrice}
                    onChange={e => updateLineItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                  />
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <span className="text-xs text-gray-400">{formatZAR(item.quantity * item.unitPrice)}</span>
                    {lineItems.length > 1 && (
                      <button onClick={() => removeLineItem(i)} className="ml-1 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-5 pt-4 border-t border-white/5 space-y-2">
              <div className="flex justify-between text-sm text-gray-400">
                <span>Subtotal</span>
                <span>{formatZAR(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-gray-400">
                <span className="flex items-center gap-2">
                  VAT
                  <select
                    value={vatRate}
                    onChange={e => setVatRate(parseFloat(e.target.value))}
                    className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                  >
                    <option value={0.15}>15%</option>
                    <option value={0}>0%</option>
                  </select>
                </span>
                <span>{formatZAR(vatAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-white/10">
                <span>Total</span>
                <span className="text-emerald-400">{formatZAR(total)}</span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/40 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Creating…
              </>
            ) : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}
