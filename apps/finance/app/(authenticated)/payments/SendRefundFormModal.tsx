'use client'

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RefundFormRecipient {
  name:     string
  email:    string
  phone?:   string
  caseRef?: string
}

interface Props {
  /** Pre-filled consumer details (from a payment row or left empty for manual) */
  prefill?: RefundFormRecipient
  /** Custom trigger — defaults to the amber header button */
  trigger?: (onClick: () => void) => React.ReactNode
  /** Called after successful send */
  onSent?: (sentTo: string) => void
}

const OVERCHARGE_OPTIONS = [
  { value: 'debit_order_overcharge', label: 'Debit Order Overcharge',         desc: 'Debited more than the agreed instalment amount' },
  { value: 'double_debit',           label: 'Double Debit',                   desc: 'Debited twice in the same month / collection run' },
  { value: 'unauthorised_debit',     label: 'Unauthorised Debit',             desc: 'Debit taken without agreement or after cancellation' },
  { value: 'other',                  label: 'Other Overcharge / Billing Error', desc: 'Any other billing error (consumer will describe in the form)' },
] as const

type OverchargeType = (typeof OVERCHARGE_OPTIONS)[number]['value']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SendRefundFormModal({ prefill, trigger, onSent }: Props) {
  const [open, setOpen]       = useState(false)
  const [name, setName]       = useState(prefill?.name    ?? '')
  const [email, setEmail]     = useState(prefill?.email   ?? '')
  const [phone, setPhone]     = useState(prefill?.phone   ?? '')
  const [caseRef, setCaseRef] = useState(prefill?.caseRef ?? '')
  const [message, setMessage] = useState('')
  const [types, setTypes]     = useState<OverchargeType[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  function openModal() {
    // Reset state on open (in case prefill changed between renders)
    setName(prefill?.name    ?? '')
    setEmail(prefill?.email  ?? '')
    setPhone(prefill?.phone  ?? '')
    setCaseRef(prefill?.caseRef ?? '')
    setMessage('')
    setTypes([])
    setError('')
    setSent(false)
    setOpen(true)
  }

  function toggleType(t: OverchargeType) {
    setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  async function handleSend() {
    if (!name.trim())  { setError('Consumer name is required');  return }
    if (!email.trim()) { setError('Email address is required');  return }
    if (!types.length) { setError('Select at least one overcharge type'); return }
    setError('')
    setSending(true)
    try {
      const res = await fetch('/api/finance/refund-form/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          consumerName:    name.trim(),
          email:           email.trim(),
          phone:           phone.trim() || undefined,
          caseRef:         caseRef.trim() || undefined,
          overchargeTypes: types,
          message:         message.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; sentTo?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setSent(true)
      onSent?.(email.trim())
      setTimeout(() => setOpen(false), 2200)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const defaultTrigger = (
    <button
      onClick={openModal}
      className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 rounded-lg text-sm font-semibold transition-colors"
    >
      {/* Receipt / refund icon */}
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
      </svg>
      Send Refund Form
    </button>
  )

  return (
    <>
      {trigger ? trigger(openModal) : defaultTrigger}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/10 shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Send Refund Request Form</h2>
                  <p className="text-xs text-gray-500">The fillable PDF will be emailed to the consumer</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-white transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Body ── */}
            {sent ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white font-semibold text-base">Refund form sent!</p>
                <p className="text-gray-400 text-sm mt-1">Sent to <span className="text-amber-400">{email}</span></p>
                <p className="text-gray-600 text-xs mt-2">The consumer will receive the fillable PDF and instructions.</p>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-5">

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">
                    {error}
                  </div>
                )}

                {/* Consumer details */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Consumer Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Full Name *</label>
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Consumer's full legal name"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Email Address *</label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="consumer@email.com"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Cell / Phone</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="083 000 0000"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Case / File Reference</label>
                      <input
                        type="text"
                        value={caseRef}
                        onChange={e => setCaseRef(e.target.value)}
                        placeholder="e.g. ZEN-2026-00123 (optional)"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Overcharge types */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Overcharge Type * <span className="normal-case font-normal text-gray-600">(tick all that apply)</span>
                  </p>
                  <div className="space-y-2">
                    {OVERCHARGE_OPTIONS.map(opt => {
                      const checked = types.includes(opt.value)
                      return (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            checked
                              ? 'bg-amber-500/10 border-amber-500/30'
                              : 'bg-white/3 border-white/8 hover:border-white/15'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleType(opt.value)}
                            className="mt-0.5 accent-amber-500"
                          />
                          <div>
                            <p className={`text-sm font-medium ${checked ? 'text-amber-300' : 'text-white'}`}>
                              {opt.label}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Personal message */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Personal Message <span className="text-gray-600">(optional)</span></label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={3}
                    placeholder="Add a personalised note to the consumer… (leave blank for the default message)"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none resize-none"
                  />
                </div>

                {/* Info note */}
                <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg px-3 py-2.5 text-xs text-gray-400 flex gap-2">
                  <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  The consumer will receive the 2-page Zenowethu-branded fillable PDF attached to a personalised email. Processing time is 5–10 business days upon receipt of the completed form.
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 font-medium rounded-xl transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending}
                    className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/40 text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {sending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Send Refund Form
                      </>
                    )}
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
