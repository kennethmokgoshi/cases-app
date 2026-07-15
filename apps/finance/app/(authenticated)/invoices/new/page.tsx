'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SERVICES_MAP } from '@zenowethu/config'
import { useSession } from '@zenowethu/ui'

type AccountLine = {
  creditor:     string
  serviceKey:   string
  serviceLabel: string
  quantity:     number
  unitPrice:    number
}

type ClientResult = {
  id: string
  firstName: string
  lastName: string
  idNumber: string
  email?: string | null
  latestCase?: { id: string; fileNumber: string } | null
}

const SERVICES_LIST = Object.entries(SERVICES_MAP).map(([key, label]) => ({ key, label }))

function formatZAR(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(n)
}

function today()    { return new Date().toISOString().split('T')[0] }
function in30days() { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0] }

function emptyLine(): AccountLine {
  return { creditor: '', serviceKey: SERVICES_LIST[0]?.key ?? '', serviceLabel: SERVICES_LIST[0]?.label ?? '', quantity: 1, unitPrice: 0 }
}

export default function NewInvoicePage() {
  const router = useRouter()
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [docType, setDocType]   = useState<'INVOICE' | 'QUOTE'>('QUOTE')

  // Client search
  const [clientSearch, setClientSearch]     = useState('')
  const [clientResults, setClientResults]   = useState<ClientResult[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null)
  const [searchLoading, setSearchLoading]   = useState(false)
  const [caseId, setCaseId]                 = useState('')

  // Invoice details
  const [issuedAt, setIssuedAt]   = useState(today())
  const [dueAt, setDueAt]         = useState(in30days())
  const [reference, setReference] = useState('')
  const [notes, setNotes]         = useState('')
  const [vatRate, setVatRate]     = useState(0.15)

  // Account lines
  const [lines, setLines] = useState<AccountLine[]>([emptyLine()])

  // Banking
  const { data: session } = useSession()
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [bankAccountId, setBankAccountId] = useState('')
  const [useOwnBanking, setUseOwnBanking] = useState(false)

  const isAdmin = session?.user?.isAdmin === true;
  const isExecutive = (session?.user as any)?.isExecutive === true || (session?.user as any)?.role?.toUpperCase() === 'EXECUTIVE';
  const isFinance = (session?.user as any)?.role?.toUpperCase() === 'FINANCE' || (session?.user as any)?.userType?.toUpperCase() === 'FINANCE';
  const isManager = (session?.user as any)?.isManager === true || (session?.user as any)?.role?.toUpperCase() === 'MANAGER';
  const isSeniorManager = (session?.user as any)?.isSeniorManager === true || (session?.user as any)?.role?.toUpperCase() === 'SENIOR_MANAGER';
  const canChangeBank = isAdmin || isExecutive || isFinance || isManager || isSeniorManager;

  const subtotal  = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
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

  // Fetch bank accounts
  useEffect(() => {
    fetch('/api/finance/bank-accounts')
      .then(res => res.json())
      .then(data => {
        setBankAccounts(data.accounts || [])
        const def = data.accounts?.find((a: any) => a.isDefault)
        if (def) setBankAccountId(def.id)
      })
      .catch(err => console.error('Failed to fetch bank accounts', err))
  }, [])

  const selectClient = (c: ClientResult) => {
    setSelectedClient(c)
    setClientSearch(`${c.firstName} ${c.lastName}`)
    setClientResults([])
    if (c.latestCase) setCaseId(c.latestCase.id)
  }

  const updateLine = (i: number, field: keyof AccountLine, value: string | number) => {
    setLines(prev => prev.map((line, idx) => {
      if (idx !== i) return line
      if (field === 'serviceKey') {
        const found = SERVICES_LIST.find(s => s.key === value)
        return { ...line, serviceKey: String(value), serviceLabel: found?.label ?? String(value) }
      }
      return { ...line, [field]: value }
    }))
  }

  const addLine    = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    setError('')
    if (lines.some(l => !l.creditor.trim())) {
      setError('All rows must have a creditor / account name.'); return
    }
    if (!dueAt) { setError('Due date is required.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:      docType,
          clientId:  selectedClient?.id,
          caseId:    caseId || undefined,
          lineItems: lines.map(l => ({
            creditor:     l.creditor.trim(),
            serviceKey:   l.serviceKey,
            serviceLabel: l.serviceLabel,
            quantity:     l.quantity,
            unitPrice:    l.unitPrice,
          })),
          dueAt:     new Date(dueAt).toISOString(),
          vatRate,
          reference: reference.trim() || undefined,
          notes:     notes.trim()     || undefined,
          bankAccountId: useOwnBanking ? undefined : (bankAccountId || undefined),
          useOwnBanking: isAdmin && useOwnBanking ? true : undefined,
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to create document')
      }

      const invoice = await res.json()
      router.push(`/invoices/${invoice.id}`)
    } catch (e: unknown) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const docLabel = docType === 'QUOTE' ? 'Quotation' : 'Invoice'

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <a href="/invoices" className="text-gray-500 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <h1 className="text-xl font-bold text-white">New {docLabel}</h1>
      </div>

      {/* Document type toggle */}
      <div className="flex gap-2">
        {(['QUOTE', 'INVOICE'] as const).map(t => (
          <button
            key={t}
            onClick={() => setDocType(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              docType === t
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
            }`}
          >
            {t === 'QUOTE' ? 'Quotation' : 'Invoice'}
          </button>
        ))}
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
                onChange={e => {
                  setClientSearch(e.target.value)
                  if (!e.target.value) { setSelectedClient(null); setCaseId('') }
                }}
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
            <h2 className="text-sm font-semibold text-white">{docLabel} Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Issue Date</label>
                <input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  {docType === 'QUOTE' ? 'Valid Until' : 'Due Date'} *
                </label>
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
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Optional notes for client…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 resize-none"
              />
            </div>
          </div>

          {/* Banking Details */}
          <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Banking Details</h2>
              {!canChangeBank && (
                <span className="text-[10px] bg-white/5 text-gray-500 px-2 py-0.5 rounded border border-white/5 uppercase tracking-wider">Default Only</span>
              )}
            </div>

            {canChangeBank ? (
              <div className="space-y-3">
                {isAdmin && (
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={useOwnBanking}
                      onChange={e => setUseOwnBanking(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Use my own personal banking details instead
                  </label>
                )}
                {!useOwnBanking && (
                  <select
                    value={bankAccountId}
                    onChange={e => setBankAccountId(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="" className="bg-gray-900">Select Bank Account…</option>
                    {bankAccounts.map(a => (
                      <option key={a.id} value={a.id} className="bg-gray-900">
                        {a.bankName} - {a.accountNumber} {a.isDefault ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-gray-500 italic">
                  {useOwnBanking
                    ? 'Your own banking details (set on your Account page) will be used on this document.'
                    : 'You have permission to select a non-default bank account.'}
                </p>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                {bankAccounts.find(a => a.id === bankAccountId) ? (
                  <div className="text-sm">
                    <p className="text-white font-medium">{bankAccounts.find(a => a.id === bankAccountId).bankName}</p>
                    <p className="text-gray-500 text-xs">{bankAccounts.find(a => a.id === bankAccountId).accountNumber}</p>
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs italic">Loading default banking details…</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Account lines + Totals */}
        <div className="space-y-5">
          <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Accounts &amp; Services</h2>
                <p className="text-xs text-gray-500 mt-0.5">Add each credit account and the service applied to it</p>
              </div>
              <button
                onClick={addLine}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add account
              </button>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">
              <span className="col-span-4">Creditor / Account</span>
              <span className="col-span-4">Service</span>
              <span className="col-span-3 text-right">Price (ZAR)</span>
              <span className="col-span-1" />
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center group">
                  {/* Creditor name */}
                  <input
                    className="col-span-4 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                    placeholder="e.g. Nedbank"
                    value={line.creditor}
                    onChange={e => updateLine(i, 'creditor', e.target.value)}
                  />

                  {/* Service dropdown */}
                  <select
                    className="col-span-4 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    value={line.serviceKey}
                    onChange={e => updateLine(i, 'serviceKey', e.target.value)}
                  >
                    {SERVICES_LIST.map(s => (
                      <option key={s.key} value={s.key} className="bg-gray-900">{s.label}</option>
                    ))}
                  </select>

                  {/* Price */}
                  <input
                    className="col-span-3 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:border-emerald-500/50"
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.unitPrice}
                    onChange={e => updateLine(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                  />

                  {/* Remove */}
                  <div className="col-span-1 flex justify-end">
                    {lines.length > 1 && (
                      <button
                        onClick={() => removeLine(i)}
                        className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            ) : `Create ${docLabel}`}
          </button>

          <p className="text-xs text-gray-600 text-center">
            A unique link will be generated so the client can view and download this {docLabel.toLowerCase()} in the Crediva App.
          </p>
        </div>
      </div>
    </div>
  )
}
