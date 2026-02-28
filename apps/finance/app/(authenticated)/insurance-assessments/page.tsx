import { logger } from '@zenowethu/shared-lib';
'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'

type Assessment = {
  id: string
  totalCurrentPremium: number
  totalAccounts: number
  replacementPremium: number | null
  monthlySavings: number | null
  annualSavings: number | null
  savingsPercent: number | null
  insurer: string | null
  status: string
  consentGiven: boolean
  createdAt: string
  Case: { fileNumber: string } | null
  accounts: Array<{ id: string }>
}

type AssessmentStats = { total: number; accepted: number; totalMonthlySavings: number }

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-gray-500/20 text-gray-400',
  ACCEPTED:  'bg-emerald-500/20 text-emerald-400',
  ISSUED:    'bg-cyan-500/20 text-cyan-400',
  CANCELLED: 'bg-red-500/20 text-red-400' }

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

function InsuranceAssessmentsContent() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [pages, setPages]   = useState(1)
  const [loading, setLoading] = useState(true)
  const [stats, setStats]   = useState<AssessmentStats>({ total: 0, accepted: 0, totalMonthlySavings: 0 })

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const fetchAssessments = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pg))
      if (search) params.set('search', search)
      if (status) params.set('status', status)

      const res = await fetch(`/api/finance/insurance-assessments?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAssessments(data.assessments)
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
  }, [search, status])

  useEffect(() => { fetchAssessments(1) }, [fetchAssessments])

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Dashboard</Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Insurance Assessments
          </h1>
          <p className="text-gray-400 text-sm mt-1">{total.toLocaleString()} total records</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Total Assessments</h3>
          <p className="text-3xl font-bold text-white mt-2">{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Accepted</h3>
          <p className="text-3xl font-bold text-emerald-400 mt-2">{stats.accepted.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Total Monthly Savings</h3>
          <p className="text-2xl font-bold text-white mt-2">{formatZAR(stats.totalMonthlySavings)}</p>
        </div>
      </div>

      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 mb-6 border border-white/5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-gray-500 mb-1 block">Search by Case File #</label>
          <input type="text" placeholder="File number..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchAssessments(1)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="ISSUED">Issued</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <button onClick={() => fetchAssessments(1)}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors">
          Filter
        </button>
        <button onClick={() => { setSearch(''); setStatus('') }}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors">
          Clear
        </button>
      </div>

      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
          </div>
        ) : assessments.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">No insurance assessments found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Case File #</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Current Premium</th>
                    <th className="px-5 py-3">Replacement</th>
                    <th className="px-5 py-3">Monthly Savings</th>
                    <th className="px-5 py-3">Savings %</th>
                    <th className="px-5 py-3">Consent</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {assessments.map((a) => (
                    <tr key={a.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3 text-cyan-400 font-mono text-xs">{a.Case?.fileNumber ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[a.status] ?? 'bg-yellow-500/20 text-yellow-400'}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-white font-semibold">{formatZAR(Number(a.totalCurrentPremium))}</td>
                      <td className="px-5 py-3 text-gray-300">
                        {a.replacementPremium != null ? formatZAR(Number(a.replacementPremium)) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        {a.monthlySavings != null
                          ? <span className="text-emerald-400 font-semibold">{formatZAR(Number(a.monthlySavings))}</span>
                          : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-300">
                        {a.savingsPercent != null ? `${Number(a.savingsPercent).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.consentGiven ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                          {a.consentGiven ? 'Given' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-400 whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleDateString('en-ZA')}
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/insurance-assessments/${a.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs">View</Link>
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
                  <button disabled={page <= 1} onClick={() => fetchAssessments(page - 1)}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs transition-colors">← Prev</button>
                  <button disabled={page >= pages} onClick={() => fetchAssessments(page + 1)}
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

export default function InsuranceAssessmentsPage() {
  return (
    <div className="p-6">
      <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>}>
        <InsuranceAssessmentsContent />
      </Suspense>
    </div>
  )
}
