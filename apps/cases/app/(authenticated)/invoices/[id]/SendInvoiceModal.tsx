'use client'

import { useState } from 'react'

export default function SendInvoiceModal({
  invoiceId,
  invoiceNumber,
  defaultEmail,
  hasBankingDetails,
  isAdmin,
}: {
  invoiceId: string
  invoiceNumber: string
  defaultEmail: string
  hasBankingDetails: boolean
  isAdmin: boolean
}) {
  const [open, setOpen]       = useState(false)
  const [to, setTo]           = useState(defaultEmail)
  const [subject, setSubject] = useState(`Invoice ${invoiceNumber} from Zenowethu`)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  const canSend = isAdmin || hasBankingDetails

  const handleSend = async () => {
    if (!to) { setError('Email address is required'); return }
    setError('')
    setSending(true)
    try {
      const res = await fetch(`/api/finance/invoices/${invoiceId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, message }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to send')
      }
      setSent(true)
      setTimeout(() => { setOpen(false); window.location.reload() }, 1500)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!canSend}
        title={!canSend ? 'Banking details required. Contact an admin to send.' : undefined}
        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-blue-400 rounded-lg transition-colors border border-blue-500/20"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Send
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/10 shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Send Invoice</h2>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {!hasBankingDetails && isAdmin && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg px-3 py-2 text-xs mb-4">
                No banking details on this invoice — sending as admin without payment instructions.
              </div>
            )}

            {sent ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white font-medium">Invoice sent!</p>
                <p className="text-gray-500 text-sm mt-1">Sent to {to}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">{error}</div>
                )}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">To *</label>
                  <input
                    type="email"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    placeholder="client@example.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Message (optional)</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={3}
                    placeholder="Add a personal message…"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                  />
                </div>
                <p className="text-xs text-gray-600">The PDF will be attached automatically.</p>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="w-full py-2.5 bg-blue-500 hover:bg-blue-400 disabled:bg-blue-500/40 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {sending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Sending…
                    </>
                  ) : 'Send Invoice'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
