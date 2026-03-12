'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'

const logger = {
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type Assessment = {
  id: string
  status: string
  consentGiven: boolean
  totalCurrentPremium: number
  replacementPremium: number | null
  monthlySavings: number | null
  createdAt: string
  Case: { fileNumber: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-gray-500/20 text-gray-400',
  ACCEPTED:  'bg-emerald-500/20 text-emerald-400',
  ISSUED:    'bg-cyan-500/20 text-cyan-400',
  CANCELLED: 'bg-red-500/20 text-red-400' }

function ComplianceContent() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/insurance/assessments?take=200&skip=0')
        if (res.ok) {
          const data = await res.json()
          setAssessments(data.assessments ?? [])
          setTotal(data.total ?? 0)
        }
      } catch (err) {
        logger.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const accepted      = assessments.filter(a => a.status === 'ACCEPTED').length
  const consentGiven  = assessments.filter(a => a.consentGiven).length
  const acceptedRate  = total > 0 ? Math.round((accepted / total) * 100) : 0
  const consentRate   = total > 0 ? Math.round((consentGiven / total) * 100) : 0

  // Assessments needing attention = non-accepted, non-cancelled
  const needsAttention = assessments.filter(a => a.status !== 'ACCEPTED' && a.status !== 'CANCELLED')

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Dashboard</Link>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Insurance Compliance
        </h1>
        <p className="text-gray-400 text-sm mt-1">Assessment compliance overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Total Assessments</h3>
          <p className="text-3xl font-bold text-white mt-2">{total.toLocaleString()}</p>
          <p className="text-xs text-gray-600 mt-1">All time</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Accepted Rate</h3>
          <p className="text-3xl font-bold text-emerald-400 mt-2">{acceptedRate}%</p>
          <p className="text-xs text-gray-600 mt-1">{accepted} of {total} accepted</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Consent Rate</h3>
          <p className="text-3xl font-bold text-cyan-400 mt-2">{consentRate}%</p>
          <p className="text-xs text-gray-600 mt-1">{consentGiven} of {total} consented</p>
        </div>
      </div>

      {/* Assessments Needing Attention */}
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Assessments Needing Attention</h2>
          <span className="text-xs text-gray-500">{needsAttention.length} records</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
          </div>
        ) : needsAttention.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">All assessments are in compliance</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Case File #</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Consent</th>
                  <th className="px-5 py-3">Current Premium</th>
                  <th className="px-5 py-3">Monthly Savings</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {needsAttention.slice(0, 50).map((a) => (
                  <tr key={a.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-cyan-400 font-mono text-xs">{a.Case?.fileNumber ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[a.status] ?? 'bg-yellow-500/20 text-yellow-400'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.consentGiven ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {a.consentGiven ? 'Given' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white font-semibold">
                      {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(a.totalCurrentPremium))}
                    </td>
                    <td className="px-5 py-3">
                      {a.monthlySavings != null
                        ? <span className="text-emerald-400 font-semibold">
                            {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(a.monthlySavings))}
                          </span>
                        : <span className="text-gray-500">—</span>}
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
        )}
      </div>
    </div>
  )
}

export default function CompliancePage() {
  return (
    <div className="p-6">
      <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>}>
        <ComplianceContent />
      </Suspense>
    </div>
  )
}
