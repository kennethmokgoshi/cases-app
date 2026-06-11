'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { confirm } from '@zenowethu/ui'
import DeleteDocumentButton from '@/components/finance/DeleteDocumentButton'

type Quote = {
  id: string
  invoiceNumber: string
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED' | 'CANCELLED'
  issuedAt: string
  dueAt: string
  total: number
  acceptedAt?: string | null
  rejectedAt?: string | null
  decisionNote?: string | null
  client: { id: string; firstName: string; lastName: string } | null
  case: { fileNumber: string } | null
  createdBy: { firstName: string; lastName: string } | null
  decidedBy: { firstName: string; lastName: string } | null
}

type QuoteStats = {
  issuedCount: number
  issuedValue: number
  pendingCount: number
  pendingValue: number
  rejectedCount: number
  rejectedValue: number
  convertedCount: number
  acceptanceRate: number | null
}

const TABS = [
  { key: 'issued',   label: 'Quotes Issued',    statuses: ['ACCEPTED', 'CONVERTED'] },
  { key: 'pending',  label: 'Awaiting Decision', statuses: ['DRAFT', 'SENT'] },
  { key: 'rejected', label: 'Rejected',          statuses: ['REJECTED'] },
  { key: 'all',      label: 'All Quotes',        statuses: [] },
] as const

type TabKey = typeof TABS[number]['key']

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  SENT:      'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  ACCEPTED:  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  REJECTED:  'bg-red-500/20 text-red-400 border border-red-500/30',
  CONVERTED: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  CANCELLED: 'bg-gray-500/10 text-gray-500 border border-gray-500/20' }

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', SENT: 'Sent', ACCEPTED: 'Accepted', REJECTED: 'Rejected',
  CONVERTED: 'Invoiced', CANCELLED: 'Cancelled' }

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [stats, setStats] = useState<QuoteStats | null>(null)
  const [tab, setTab] = useState<TabKey>('issued')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const fetchStats = useCallback(() => {
    fetch('/api/finance/quotes/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
  }, [])

  const fetchQuotes = useCallback(async (activeTab: TabKey = tab) => {
    setLoading(true)
    try {
      const statuses = TABS.find(t => t.key === activeTab)?.statuses ?? []
      const params = new URLSearchParams({ type: 'QUOTE', limit: '100' })
      if (search) params.set('search', search)
      if (statuses.length > 0) params.set('status', statuses.join(','))

      const res = await fetch(`/api/finance/invoices?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setQuotes(data.invoices)
    } catch {
      setMessage({ kind: 'error', text: 'Failed to load quotes. Please refresh.' })
    } finally {
      setLoading(false)
    }
  }, [tab, search])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchQuotes(tab) }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const recordDecision = async (quote: Quote, decision: 'ACCEPTED' | 'REJECTED') => {
    const verb = decision === 'ACCEPTED' ? 'accept' : 'reject'
    if (!await confirm(`Record that the client ${verb}ed quote ${quote.invoiceNumber}?`)) return
    setActingId(quote.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/finance/quotes/${quote.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record decision')
      setMessage({ kind: 'success', text: `Quote ${quote.invoiceNumber} marked as ${STATUS_LABELS[decision].toLowerCase()}.` })
      fetchQuotes()
      fetchStats()
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to record decision' })
    } finally {
      setActingId(null)
    }
  }

  const convertToInvoice = async (quote: Quote) => {
    if (!await confirm(`Convert quote ${quote.invoiceNumber} into an invoice? A new invoice number will be issued.`)) return
    setActingId(quote.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/finance/quotes/${quote.id}/convert`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to convert quote')
      setMessage({ kind: 'success', text: `Quote ${quote.invoiceNumber} converted to invoice ${data.invoiceNumber}.` })
      fetchQuotes()
      fetchStats()
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to convert quote' })
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Quotes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Quotes are listed as issued once the client has accepted them
          </p>
        </div>
        <Link
          href="/invoices/new"
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Quote
        </Link>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${message.kind === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
          {message.text}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Quotes Issued (Accepted)', value: `${stats.issuedCount}`, sub: formatZAR(stats.issuedValue), color: 'text-emerald-400' },
            { label: 'Awaiting Decision', value: `${stats.pendingCount}`, sub: formatZAR(stats.pendingValue), color: 'text-blue-400' },
            { label: 'Rejected', value: `${stats.rejectedCount}`, sub: formatZAR(stats.rejectedValue), color: 'text-red-400' },
            { label: 'Acceptance Rate', value: stats.acceptanceRate === null ? '—' : `${stats.acceptanceRate}%`, sub: `${stats.convertedCount} converted to invoice`, color: 'text-white' },
          ].map(card => (
            <div key={card.label} className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">{card.label}</p>
              <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs + search */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors border ${
                tab === t.key
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'text-gray-400 border-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="flex-1 min-w-48 flex gap-2 justify-end">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') fetchQuotes() }}
              placeholder="Quote #, client name…"
              className="w-full max-w-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
            />
            <button
              onClick={() => fetchQuotes()}
              className="px-4 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm rounded-lg transition-colors border border-emerald-500/20"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
          </div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-sm">
              {tab === 'issued'
                ? 'No accepted quotes yet. Quotes appear here once the client accepts them.'
                : 'No quotes found.'}
            </p>
            <Link href="/invoices/new" className="text-emerald-400 hover:underline text-sm mt-2 inline-block">Create a quote →</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Quote #</th>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left">Created By</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Decision</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {quotes.map(q => (
                  <tr key={q.id} className="hover:bg-white/3 transition-colors group">
                    <td className="px-4 py-3 font-mono text-gray-300 text-xs">{q.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      {q.client ? (
                        <Link href={`/clients/${q.client.id}`} className="text-white hover:text-emerald-400 hover:underline">
                          {q.client.firstName} {q.client.lastName}
                        </Link>
                      ) : (
                        <span className="text-gray-600 italic">No client</span>
                      )}
                      {q.case && <span className="ml-2 text-xs text-gray-600">#{q.case.fileNumber}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {q.createdBy ? `${q.createdBy.firstName} ${q.createdBy.lastName}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{formatDate(q.issuedAt)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {q.acceptedAt && <span className="text-emerald-400">Accepted {formatDate(q.acceptedAt)}</span>}
                      {q.rejectedAt && <span className="text-red-400">Rejected {formatDate(q.rejectedAt)}</span>}
                      {!q.acceptedAt && !q.rejectedAt && <span className="text-gray-600">—</span>}
                      {q.decidedBy && (
                        <span className="block text-gray-500">by {q.decidedBy.firstName} {q.decidedBy.lastName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white">{formatZAR(Number(q.total))}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[q.status] ?? STATUS_COLORS.DRAFT}`}>
                        {STATUS_LABELS[q.status] ?? q.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/invoices/${q.id}`} className="text-xs text-emerald-400 hover:underline">View</Link>
                        {(q.status === 'DRAFT' || q.status === 'SENT' || q.status === 'REJECTED') && (
                          <button
                            onClick={() => recordDecision(q, 'ACCEPTED')}
                            disabled={actingId === q.id}
                            className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded px-2 py-0.5 disabled:opacity-50"
                          >
                            Accept
                          </button>
                        )}
                        {(q.status === 'DRAFT' || q.status === 'SENT' || q.status === 'ACCEPTED') && (
                          <button
                            onClick={() => recordDecision(q, 'REJECTED')}
                            disabled={actingId === q.id}
                            className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded px-2 py-0.5 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        )}
                        {q.status === 'ACCEPTED' && (
                          <button
                            onClick={() => convertToInvoice(q)}
                            disabled={actingId === q.id}
                            className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 rounded px-2 py-0.5 disabled:opacity-50"
                          >
                            {actingId === q.id ? 'Working…' : 'Convert to Invoice'}
                          </button>
                        )}
                        {q.status !== 'CONVERTED' && (
                          <DeleteDocumentButton
                            documentId={q.id}
                            documentNumber={q.invoiceNumber}
                            type="QUOTE"
                            onDeleted={() => {
                              setMessage({ kind: 'success', text: `Quote ${q.invoiceNumber} deleted.` })
                              fetchQuotes()
                              fetchStats()
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
