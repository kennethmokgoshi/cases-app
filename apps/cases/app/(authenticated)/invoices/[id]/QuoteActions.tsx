'use client'

import { useState } from 'react'
import { confirm } from '@zenowethu/ui'
import { useRouter } from 'next/navigation'

/**
 * Accept / reject actions for quotations in the Cases app. Mirrors the Finance
 * app behaviour via the shared decision endpoint, so the quote status stays in
 * sync across both apps and acceptance advances the case workflow when that is
 * a forward move.
 */
export default function QuoteActions({
  quoteId,
  quoteNumber,
  status,
}: {
  quoteId: string
  quoteNumber: string
  status: string
}) {
  const router = useRouter()
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decide = async (decision: 'ACCEPTED' | 'REJECTED') => {
    const verb = decision === 'ACCEPTED' ? 'accepted' : 'rejected'
    if (!await confirm(`Record that the consumer ${verb} quote ${quoteNumber}?`)) return
    setActing(true)
    setError(null)
    try {
      const res = await fetch(`/api/finance/quotes/${quoteId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record decision')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record decision')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {error && <span className="text-xs text-red-400">{error}</span>}
      {(status === 'DRAFT' || status === 'SENT' || status === 'REJECTED') && (
        <button
          onClick={() => decide('ACCEPTED')}
          disabled={acting}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20 disabled:opacity-50"
        >
          {acting ? (
            <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-emerald-400" />
          ) : '✓'} Mark as Accepted
        </button>
      )}
      {(status === 'DRAFT' || status === 'SENT' || status === 'ACCEPTED') && (
        <button
          onClick={() => decide('REJECTED')}
          disabled={acting}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20 disabled:opacity-50"
        >
          ✗ Mark as Rejected
        </button>
      )}
    </div>
  )
}
