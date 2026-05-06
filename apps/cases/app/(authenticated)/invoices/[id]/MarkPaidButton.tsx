'use client'

import { useState } from 'react'

export default function MarkPaidButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false)

  const handle = async () => {
    if (!confirm('Mark this invoice as paid?')) return
    setLoading(true)
    await fetch(`/api/finance/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PAID' }),
    })
    window.location.reload()
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20"
    >
      {loading ? (
        <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-emerald-400" />
      ) : '✓'} Mark Paid
    </button>
  )
}
