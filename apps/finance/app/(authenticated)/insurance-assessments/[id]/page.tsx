'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type LinkedAccount = {
  id: string
  creditAccount: {
    creditorName: string
    accountType: string
    premiumAmount: number | null
  } | null
}

type Policy = {
  id: string
  policyNumber: string | null
  insurer: string | null
  coverAmount: number | null
  startDate: string | null
  endDate: string | null
  status: string
}

type CancellationLetter = {
  id: string
  letterType: string
  sentAt: string | null
  status: string
  createdAt: string
}

type AssessmentDetail = {
  id: string
  status: string
  totalCurrentPremium: number
  totalAccounts: number
  replacementPremium: number | null
  monthlySavings: number | null
  annualSavings: number | null
  savingsPercent: number | null
  insurer: string | null
  policyType: string | null
  coverAmount: number | null
  consentGiven: boolean
  consentDate: string | null
  consentMethod: string | null
  createdAt: string
  Case: { id: string; fileNumber: string } | null
  accounts: LinkedAccount[]
  policies: Policy[]
  cancellationLetters: CancellationLetter[]
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-gray-500/20 text-gray-400',
  ACCEPTED:  'bg-emerald-500/20 text-emerald-400',
  ISSUED:    'bg-cyan-500/20 text-cyan-400',
  CANCELLED: 'bg-red-500/20 text-red-400' }

const POLICY_STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-emerald-500/20 text-emerald-400',
  LAPSED:    'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-red-500/20 text-red-400',
  PENDING:   'bg-yellow-500/20 text-yellow-400' }

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

export default function InsuranceAssessmentDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [patching, setPatching] = useState(false)
  const [patchMsg, setPatchMsg] = useState('')

  useEffect(() => {
    async function fetchAssessment() {
      try {
        const res = await fetch(`/api/finance/insurance-assessments/${id}`)
        if (res.status === 404) { setNotFound(true); return }
        if (res.ok) setAssessment(await res.json())
      } finally {
        setLoading(false)
      }
    }
    fetchAssessment()
  }, [id])

  async function updateStatus(newStatus: string) {
    if (!assessment) return
    setPatching(true)
    setPatchMsg('')
    try {
      const res = await fetch(`/api/finance/insurance-assessments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }) })
      if (res.ok) {
        const updated = await res.json()
        setAssessment((prev) => prev ? { ...prev, status: updated.status } : prev)
        setPatchMsg(`Status updated to ${newStatus}`)
      } else {
        const err = await res.json()
        setPatchMsg(err.error ?? 'Update failed')
      }
    } catch {
      setPatchMsg('Network error')
    } finally {
      setPatching(false)
    }
  }

  if (loading) {
    return <div className="p-6 flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>
  }

  if (notFound || !assessment) {
    return (
      <div className="p-6 text-center py-16">
        <p className="text-lg text-gray-400 mb-4">Insurance assessment not found.</p>
        <Link href="/insurance-assessments" className="text-cyan-400 hover:text-cyan-300 text-sm">← Back to Assessments</Link>
      </div>
    )
  }

  const VALID_NEXT: Record<string, string[]> = {
    DRAFT:     ['ACCEPTED', 'CANCELLED'],
    ACCEPTED:  ['ISSUED', 'CANCELLED'],
    ISSUED:    ['CANCELLED'],
    CANCELLED: [] }
  const nextStatuses = VALID_NEXT[assessment.status] ?? []

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/insurance-assessments" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">
          ← Back to Assessments
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="text-3xl font-bold text-white">
            Assessment — {assessment.Case?.fileNumber ?? 'No Case'}
          </h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[assessment.status] ?? 'bg-yellow-500/20 text-yellow-400'}`}>
            {assessment.status}
          </span>
        </div>
        <p className="text-gray-400 text-sm mt-1">Created {new Date(assessment.createdAt).toLocaleDateString('en-ZA')}</p>
        {patchMsg && (
          <p className={`text-sm mt-2 ${patchMsg.includes('updated') ? 'text-emerald-400' : 'text-red-400'}`}>{patchMsg}</p>
        )}
        {nextStatuses.length > 0 && (
          <div className="flex gap-2 mt-3">
            {nextStatuses.map((s) => (
              <button key={s} onClick={() => updateStatus(s)} disabled={patching}
                className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                → {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Current Premium</p>
          <p className="text-2xl font-bold text-white mt-2">{formatZAR(Number(assessment.totalCurrentPremium))}</p>
          <p className="text-gray-500 text-xs mt-1">{assessment.totalAccounts} accounts</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Replacement Premium</p>
          <p className="text-2xl font-bold text-white mt-2">
            {assessment.replacementPremium != null ? formatZAR(Number(assessment.replacementPremium)) : '—'}
          </p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Monthly Savings</p>
          <p className="text-2xl font-bold text-emerald-400 mt-2">
            {assessment.monthlySavings != null ? formatZAR(Number(assessment.monthlySavings)) : '—'}
          </p>
          {assessment.annualSavings != null && (
            <p className="text-gray-500 text-xs mt-1">{formatZAR(Number(assessment.annualSavings))} / year</p>
          )}
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Savings %</p>
          <p className="text-2xl font-bold text-emerald-400 mt-2">
            {assessment.savingsPercent != null ? `${Number(assessment.savingsPercent).toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assessment Details */}
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h2 className="text-white font-semibold mb-4">Assessment Details</h2>
          <dl className="space-y-3 text-sm">
            {assessment.insurer && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Replacement Insurer</dt>
                <dd className="text-white">{assessment.insurer}</dd>
              </div>
            )}
            {assessment.policyType && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Policy Type</dt>
                <dd className="text-white">{assessment.policyType}</dd>
              </div>
            )}
            {assessment.coverAmount != null && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Cover Amount</dt>
                <dd className="text-white">{formatZAR(Number(assessment.coverAmount))}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Consent & Case */}
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h2 className="text-white font-semibold mb-4">Consent & Case</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-400">Consent</dt>
              <dd>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${assessment.consentGiven ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {assessment.consentGiven ? 'Given' : 'Pending'}
                </span>
              </dd>
            </div>
            {assessment.consentDate && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Consent Date</dt>
                <dd className="text-white">{new Date(assessment.consentDate).toLocaleDateString('en-ZA')}</dd>
              </div>
            )}
            {assessment.consentMethod && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Consent Method</dt>
                <dd className="text-white">{assessment.consentMethod}</dd>
              </div>
            )}
            {assessment.Case && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Case</dt>
                <dd>
                  <Link href={`/cases/${assessment.Case.id}`} className="text-cyan-400 hover:text-cyan-300 font-mono">
                    {assessment.Case.fileNumber}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Linked Accounts */}
      {assessment.accounts.length > 0 && (
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-white font-semibold">Linked Accounts ({assessment.accounts.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Creditor</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Current Premium</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {assessment.accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-white">{acc.creditAccount?.creditorName ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-400">{acc.creditAccount?.accountType ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-300">
                      {acc.creditAccount?.premiumAmount != null
                        ? formatZAR(Number(acc.creditAccount.premiumAmount))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Issued Policies */}
      {assessment.policies.length > 0 && (
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-white font-semibold">Issued Policies ({assessment.policies.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Policy #</th>
                  <th className="px-5 py-3">Insurer</th>
                  <th className="px-5 py-3">Cover Amount</th>
                  <th className="px-5 py-3">Start Date</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {assessment.policies.map((pol) => (
                  <tr key={pol.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-white font-mono text-xs">{pol.policyNumber ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-300">{pol.insurer ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-300">
                      {pol.coverAmount != null ? formatZAR(Number(pol.coverAmount)) : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {pol.startDate ? new Date(pol.startDate).toLocaleDateString('en-ZA') : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${POLICY_STATUS_COLORS[pol.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                        {pol.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancellation Letters */}
      {assessment.cancellationLetters.length > 0 && (
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-white font-semibold">Cancellation Letters ({assessment.cancellationLetters.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Sent At</th>
                  <th className="px-5 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {assessment.cancellationLetters.map((ltr) => (
                  <tr key={ltr.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-white">{ltr.letterType}</td>
                    <td className="px-5 py-3 text-gray-400">{ltr.status}</td>
                    <td className="px-5 py-3 text-gray-400">
                      {ltr.sentAt ? new Date(ltr.sentAt).toLocaleDateString('en-ZA') : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {new Date(ltr.createdAt).toLocaleDateString('en-ZA')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
