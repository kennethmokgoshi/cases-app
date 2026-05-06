'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type Invoice = {
  id: string
  invoiceNumber: string
  type: 'INVOICE' | 'QUOTE'
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED'
  issuedAt: string
  dueAt: string
  total: number
  subtotal: number
  vatAmount: number
  reference?: string | null
  client: { firstName: string; lastName: string; email?: string | null } | null
  case: { fileNumber: string } | null
  createdBy: { firstName: string; lastName: string } | null
}

type Stats = {
  totalInvoiced: number
  totalCollected: number
  outstanding: number
  overdueCount: number
  thisMonth: number
  percentChange: number
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  SENT:      'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  PAID:      'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  OVERDUE:   'bg-red-500/20 text-red-400 border border-red-500/30',
  CANCELLED: 'bg-gray-500/10 text-gray-500 border border-gray-500/20' }

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sendingReminders, setSendingReminders] = useState(false)
  const [reminderMsg, setReminderMsg] = useState<string | null>(null)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [docType, setDocType] = useState('')
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')

  const fetchInvoices = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' })
      if (search)  params.set('search', search)
      if (status)  params.set('status', status)
      if (docType) params.set('type', docType)
      if (from)    params.set('from', from)
      if (to)      params.set('to', to)

      const res = await fetch(`/api/finance/invoices?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setInvoices(data.invoices)
      setTotal(data.total)
      setPages(data.pages)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [search, status, from, to, page])

  useEffect(() => {
    fetch('/api/finance/invoices/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
  }, [])

  useEffect(() => { fetchInvoices(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sendReminders = async () => {
    setSendingReminders(true)
    setReminderMsg(null)
    try {
      const res = await fetch('/api/finance/invoices/reminders', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setReminderMsg(`${data.processed} overdue invoice${data.processed !== 1 ? 's' : ''} processed, ${data.emailsSent ?? 0} reminder${(data.emailsSent ?? 0) !== 1 ? 's' : ''} sent.`)
        fetchInvoices(1)
      } else {
        setReminderMsg(`Error: ${data.error || 'Failed to send reminders'}`)
      }
    } finally {
      setSendingReminders(false)
    }
  }

  const thisMonthQuickFilter = () => {
    const now = new Date()
    const f = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const t = now.toISOString().split('T')[0]
    setFrom(f)
    setTo(t)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Invoices &amp; Quotes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} document{total !== 1 ? 's' : ''} total</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={sendReminders}
            disabled={sendingReminders}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {sendingReminders ? 'Sending…' : 'Send Reminders'}
          </button>
          <Link
            href="/invoices/new"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Invoice / Quote
          </Link>
        </div>
      </div>
      {reminderMsg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${reminderMsg.startsWith('Error') ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
          {reminderMsg}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Invoiced', value: formatZAR(stats.totalInvoiced), color: 'text-white' },
            { label: 'Collected', value: formatZAR(stats.totalCollected), color: 'text-emerald-400' },
            { label: 'Outstanding', value: formatZAR(stats.outstanding), color: 'text-blue-400' },
            { label: 'Overdue', value: String(stats.overdueCount), color: 'text-red-400', suffix: ' invoices' },
          ].map(card => (
            <div key={card.label} className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">{card.label}</p>
              <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}{card.suffix ?? ''}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-gray-500 mb-1 block">Search</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Invoice #, client name…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Type</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="">All Types</option>
              <option value="INVOICE">Invoice</option>
              <option value="QUOTE">Quotation</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="">All Statuses</option>
              {['DRAFT','SENT','PAID','OVERDUE','CANCELLED'].map(s => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <button
            onClick={thisMonthQuickFilter}
            className="px-3 py-2 text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors"
          >
            This Month
          </button>
          <button
            onClick={() => fetchInvoices(1)}
            className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm rounded-lg transition-colors border border-emerald-500/20"
          >
            Filter
          </button>
          <button
            onClick={() => { setSearch(''); setStatus(''); setDocType(''); setFrom(''); setTo('') }}
            className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-sm">No invoices found.</p>
            <Link href="/invoices/new" className="text-emerald-400 hover:underline text-sm mt-2 inline-block">Create your first invoice →</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Number</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left">Issued</th>
                  <th className="px-4 py-3 text-left">Due</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-white/3 transition-colors group">
                    <td className="px-4 py-3 font-mono text-gray-300 text-xs">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        inv.type === 'QUOTE'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {inv.type === 'QUOTE' ? 'Quote' : 'Invoice'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {inv.client ? (
                        <span className="text-white">{inv.client.firstName} {inv.client.lastName}</span>
                      ) : (
                        <span className="text-gray-600 italic">No client</span>
                      )}
                      {inv.case && <span className="ml-2 text-xs text-gray-600">#{inv.case.fileNumber}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{formatDate(inv.issuedAt)}</td>
                    <td className="px-4 py-3 text-gray-400">{formatDate(inv.dueAt)}</td>
                    <td className="px-4 py-3 text-right font-medium text-white">{formatZAR(Number(inv.total))}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? STATUS_COLORS.DRAFT}`}>
                        {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/invoices/${inv.id}`} className="text-xs text-emerald-400 hover:underline">View</Link>
                        <a
                          href={`/api/finance/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline"
                        >
                          PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => fetchInvoices(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => fetchInvoices(page + 1)}
              disabled={page >= pages}
              className="px-3 py-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
