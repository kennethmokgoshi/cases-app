'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type LegalMatter = {
  id: string
  creditorName: string
  matterType: string
  status: string
  priority: string
  isPrescribed: boolean
  prescriptionDate: string | null
  outstandingBalance: number | null
  letterSent: boolean
  responseReceived: boolean
  amountSaved: number | null
  createdAt: string
  Case: { fileNumber: string } | null
  Client: { firstName: string; lastName: string } | null
}

type LegalStats = { open: number; prescribed: number; highPriority: number }

const STATUS_COLORS: Record<string, string> = {
  OPEN:    'bg-cyan-500/20 text-cyan-400',
  CLOSED:  'bg-gray-500/20 text-gray-400',
  SETTLED: 'bg-emerald-500/20 text-emerald-400' }

const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   'bg-red-500/20 text-red-400',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400',
  LOW:    'bg-gray-500/20 text-gray-400' }

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

function LegalMattersContent() {
  const [matters, setMatters]     = useState<LegalMatter[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [loading, setLoading]     = useState(true)
  const [stats, setStats]         = useState<LegalStats>({ open: 0, prescribed: 0, highPriority: 0 })

  const [search, setSearch]         = useState('')
  const [status, setStatus]         = useState('')
  const [matterType, setMatterType] = useState('')
  const [priority, setPriority]     = useState('')
  const [prescribed, setPrescribed] = useState('')

  const fetchMatters = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pg))
      if (search)     params.set('search', search)
      if (status)     params.set('status', status)
      if (matterType) params.set('matterType', matterType)
      if (priority)   params.set('priority', priority)
      if (prescribed) params.set('isPrescribed', prescribed)

      const res = await fetch(`/api/finance/legal-matters?${params}`)
      if (res.ok) {
        const data = await res.json()
        setMatters(data.matters)
        setTotal(data.total)
        setPages(data.pages)
        setPage(pg)
        if (data.stats) setStats(data.stats)
      }
    } catch (err) {
      logger.error(err)
    } finally {
      setLoading(false)
    }
  }, [search, status, matterType, priority, prescribed])

  useEffect(() => { fetchMatters(1) }, [fetchMatters])

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Dashboard</Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Legal Matters
          </h1>
          <p className="text-gray-400 text-sm mt-1">{total.toLocaleString()} total records</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Open Matters</h3>
          <p className="text-3xl font-bold text-cyan-400 mt-2">{stats.open.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Prescribed</h3>
          <p className="text-3xl font-bold text-red-400 mt-2">{stats.prescribed.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">High Priority</h3>
          <p className="text-3xl font-bold text-yellow-400 mt-2">{stats.highPriority.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 mb-6 border border-white/5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-gray-500 mb-1 block">Search</label>
          <input type="text" placeholder="Creditor or case..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchMatters(1)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="SETTLED">Settled</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Matter Type</label>
          <select value={matterType} onChange={(e) => setMatterType(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
            <option value="">All Types</option>
            <option value="SUMMONS">Summons</option>
            <option value="JUDGMENT">Judgment</option>
            <option value="GARNISHEE">Garnishee</option>
            <option value="PRESCRIPTION">Prescription</option>
            <option value="RECKLESS_LENDING">Reckless Lending</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
            <option value="">All Priorities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Prescribed</label>
          <select value={prescribed} onChange={(e) => setPrescribed(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
            <option value="">All</option>
            <option value="true">Prescribed</option>
            <option value="false">Not Prescribed</option>
          </select>
        </div>
        <button onClick={() => fetchMatters(1)}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors">
          Filter
        </button>
        <button onClick={() => { setSearch(''); setStatus(''); setMatterType(''); setPriority(''); setPrescribed('') }}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors">
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
          </div>
        ) : matters.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">No legal matters found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Case File #</th>
                    <th className="px-5 py-3">Creditor</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Priority</th>
                    <th className="px-5 py-3">Balance</th>
                    <th className="px-5 py-3">Prescribed</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {matters.map((m) => (
                    <tr key={m.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3 text-cyan-400 font-mono text-xs">{m.Case?.fileNumber ?? '—'}</td>
                      <td className="px-5 py-3 text-white font-medium">{m.creditorName}</td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{m.matterType}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[m.priority] ?? 'bg-gray-500/20 text-gray-400'}`}>
                          {m.priority}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-300">
                        {m.outstandingBalance != null ? formatZAR(Number(m.outstandingBalance)) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        {m.isPrescribed
                          ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">Yes</span>
                          : <span className="text-gray-500 text-xs">No</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[m.status] ?? 'bg-yellow-500/20 text-yellow-400'}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/legal-matters/${m.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs">View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-white/5">
                <p className="text-xs text-gray-500">Page {page} of {pages}</p>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => fetchMatters(page - 1)}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs transition-colors">← Prev</button>
                  <button disabled={page >= pages} onClick={() => fetchMatters(page + 1)}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs transition-colors">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function LegalMattersPage() {
  return (
    <div className="p-6">
      <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>}>
        <LegalMattersContent />
      </Suspense>
    </div>
  )
}
