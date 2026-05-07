'use client'

import { useState, useEffect } from 'react'
import { SERVICES_MAP } from '@zenowethu/config'

type AccountLine = {
  creditor:     string
  serviceKey:   string
  serviceLabel: string
  quantity:     number
  unitPrice:    number
}

type BankAccount = {
  id: string
  bankName: string
  accountName: string
  accountNumber: string
  branchCode?: string | null
  isDefault: boolean
}

const SERVICES_LIST = Object.entries(SERVICES_MAP).map(([key, label]) => ({ key, label }))

function formatZAR(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(n)
}

function in30days() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]
}

function emptyLine(serviceKey?: string, serviceLabel?: string): AccountLine {
  return {
    creditor:     '',
    serviceKey:   serviceKey ?? SERVICES_LIST[0]?.key ?? '',
    serviceLabel: serviceLabel ?? SERVICES_LIST[0]?.label ?? '',
    quantity:     1,
    unitPrice:    0,
  }
}

interface SendQuoteModalProps {
  isOpen:      boolean
  onClose:     () => void
  caseId:      string
  clientId:    string
  clientName:  string
  clientEmail: string | null | undefined
  services:    string | null // JSON array of service keys from the case
}

export default function SendQuoteModal({
  isOpen,
  onClose,
  caseId,
  clientId,
  clientName,
  clientEmail,
  services,
}: SendQuoteModalProps) {
  const [docType, setDocType]   = useState<'QUOTE' | 'INVOICE'>('QUOTE')
  const [dueAt, setDueAt]       = useState(in30days())
  const [reference, setReference] = useState('')
  const [notes, setNotes]       = useState('')
  const [vatRate, setVatRate]   = useState(0.15)
  const [lines, setLines]       = useState<AccountLine[]>([])

  const [bankAccounts, setBankAccounts]   = useState<BankAccount[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [bankLoaded, setBankLoaded]       = useState(false)

  const [step, setStep]         = useState<'form' | 'created' | 'sent'>('form')
  const [createdId, setCreatedId] = useState('')
  const [createdNumber, setCreatedNumber] = useState('')
  const [saving, setSaving]     = useState(false)
  const [sending, setSending]   = useState(false)
  const [sendTo, setSendTo]     = useState(clientEmail ?? '')
  const [error, setError]       = useState('')

  // Reset on open
  useEffect(() => {
    if (!isOpen) return
    setStep('form')
    setError('')
    setCreatedId('')
    setDocType('QUOTE')
    setDueAt(in30days())
    setReference('')
    setNotes('')
    setVatRate(0.15)
    setSendTo(clientEmail ?? '')

    // Pre-fill lines from case services
    const svcKeys: string[] = (() => { try { return JSON.parse(services ?? '[]') } catch { return [] } })()
    if (svcKeys.length > 0) {
      setLines(svcKeys.map(key => {
        const found = SERVICES_LIST.find(s => s.key === key)
        return emptyLine(key, found?.label)
      }))
    } else {
      setLines([emptyLine()])
    }
  }, [isOpen, services, clientEmail])

  // Load bank accounts once
  useEffect(() => {
    if (bankLoaded) return
    fetch('/api/finance/bank-accounts')
      .then(r => r.json())
      .then(d => {
        const accounts: BankAccount[] = d.accounts ?? []
        setBankAccounts(accounts)
        const def = accounts.find(a => a.isDefault)
        if (def) setSelectedBankId(def.id)
        setBankLoaded(true)
      })
      .catch(() => setBankLoaded(true))
  }, [bankLoaded])

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

  const subtotal  = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const vatAmount = subtotal * vatRate
  const total     = subtotal + vatAmount

  const handleCreate = async (andSend = false) => {
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
          type:          docType,
          clientId,
          caseId,
          bankAccountId: selectedBankId || undefined,
          lineItems:     lines.map(l => ({
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
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to create document')
      }

      const invoice = await res.json()
      setCreatedId(invoice.id)
      setCreatedNumber(invoice.invoiceNumber)

      if (andSend && sendTo) {
        await sendDoc(invoice.id)
      } else {
        setStep('created')
      }
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const sendDoc = async (id: string) => {
    setSending(true)
    try {
      const res = await fetch(`/api/finance/invoices/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:      sendTo,
          subject: `${docType === 'QUOTE' ? 'Quotation' : 'Invoice'} from Zenowethu`,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to send')
      }
      setStep('sent')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  if (!isOpen) return null

  const docLabel = docType === 'QUOTE' ? 'Quotation' : 'Invoice'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Create {docLabel}</h2>
              <p className="text-xs text-gray-500">{clientName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Success — created */}
          {step === 'created' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">{docLabel} created!</p>
                <p className="text-gray-500 text-sm mt-1 font-mono">{createdNumber}</p>
              </div>
              {clientEmail && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Send to client now?</p>
                  <input
                    type="email"
                    value={sendTo}
                    onChange={e => setSendTo(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 text-center"
                  />
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => sendDoc(createdId)}
                      disabled={sending}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
                    >
                      {sending ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : null}
                      Send via Email
                    </button>
                    <a
                      href={`/invoices/${createdId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm rounded-lg transition-colors"
                    >
                      View {docLabel}
                    </a>
                  </div>
                </div>
              )}
              {!clientEmail && (
                <div className="flex gap-2 justify-center">
                  <a
                    href={`/invoices/${createdId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg transition-colors"
                  >
                    View {docLabel} →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Success — sent */}
          {step === 'sent' && (
            <div className="text-center py-8 space-y-3">
              <div className="w-14 h-14 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-white font-semibold">{docLabel} sent!</p>
              <p className="text-gray-500 text-sm">Sent to {sendTo}</p>
              <a
                href={`/invoices/${createdId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm rounded-lg transition-colors"
              >
                View {docLabel} →
              </a>
            </div>
          )}

          {/* Form */}
          {step === 'form' && (
            <>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-2.5 text-sm">{error}</div>
              )}

              {/* Type toggle */}
              <div className="flex gap-2">
                {(['QUOTE', 'INVOICE'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setDocType(t)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                      docType === t
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    {t === 'QUOTE' ? 'Quotation' : 'Invoice'}
                  </button>
                ))}
              </div>

              {/* Services table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Services Requested</label>
                  <button onClick={addLine} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add row
                  </button>
                </div>

                <div className="grid grid-cols-12 gap-2 text-xs text-gray-600 uppercase tracking-wider mb-1.5 px-1">
                  <span className="col-span-4">Creditor / Account</span>
                  <span className="col-span-4">Service</span>
                  <span className="col-span-3 text-right">Amount</span>
                  <span className="col-span-1" />
                </div>

                <div className="space-y-2">
                  {lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center group">
                      <input
                        className="col-span-4 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                        placeholder="e.g. Nedbank"
                        value={line.creditor}
                        onChange={e => updateLine(i, 'creditor', e.target.value)}
                      />
                      <select
                        className="col-span-4 bg-[var(--color-bg-primary)] border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                        value={line.serviceKey}
                        onChange={e => updateLine(i, 'serviceKey', e.target.value)}
                      >
                        {SERVICES_LIST.map(s => (
                          <option key={s.key} value={s.key} className="bg-gray-900">{s.label}</option>
                        ))}
                      </select>
                      <input
                        className="col-span-3 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:border-emerald-500/50"
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.unitPrice}
                        onChange={e => updateLine(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                      />
                      <div className="col-span-1 flex justify-end">
                        {lines.length > 1 && (
                          <button onClick={() => removeLine(i)} className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
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
                <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>Subtotal</span><span>{formatZAR(subtotal)}</span>
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
                  <div className="flex justify-between font-bold text-white border-t border-white/10 pt-1.5">
                    <span>Total</span>
                    <span className="text-emerald-400">{formatZAR(total)}</span>
                  </div>
                </div>
              </div>

              {/* Date + Reference */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{docType === 'QUOTE' ? 'Valid Until' : 'Due Date'} *</label>
                  <input
                    type="date"
                    value={dueAt}
                    onChange={e => setDueAt(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Reference</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes for client…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                />
              </div>

              {/* Bank account */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block uppercase tracking-wider font-semibold">Banking Details</label>
                {!bankLoaded ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400" />
                ) : bankAccounts.length === 0 ? (
                  <p className="text-xs text-gray-600 italic">No bank accounts configured — document will use company defaults.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      !selectedBankId ? 'border-amber-500/40 bg-amber-500/5 text-amber-300' : 'border-white/10 text-gray-500 hover:border-white/20'
                    }`}>
                      <input type="radio" name="bank" value="" checked={!selectedBankId} onChange={() => setSelectedBankId('')} className="accent-amber-400" />
                      No bank details
                    </label>
                    {bankAccounts.map(bank => (
                      <label key={bank.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                        selectedBankId === bank.id ? 'border-emerald-500/40 bg-emerald-500/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'
                      }`}>
                        <input type="radio" name="bank" value={bank.id} checked={selectedBankId === bank.id} onChange={() => setSelectedBankId(bank.id)} className="accent-emerald-400" />
                        <span>
                          <span className="font-medium">{bank.bankName}</span>
                          <span className="text-xs text-gray-500 ml-1">·{bank.accountNumber}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Send email */}
              {clientEmail && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Send to client (optional — leave blank to save as draft)</label>
                  <input
                    type="email"
                    value={sendTo}
                    onChange={e => setSendTo(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                    placeholder={clientEmail}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'form' && (
          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3 flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
            {clientEmail && sendTo && (
              <button
                onClick={() => handleCreate(true)}
                disabled={saving || sending}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                {(saving || sending) && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                Create &amp; Send
              </button>
            )}
            <button
              onClick={() => handleCreate(false)}
              disabled={saving}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
            >
              {saving && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
              Create {docLabel}
            </button>
          </div>
        )}

        {(step === 'created' || step === 'sent') && (
          <div className="px-6 py-4 border-t border-white/5 flex justify-end flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
