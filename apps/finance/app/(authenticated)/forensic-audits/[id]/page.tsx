'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type AuditEvidence = {
  id: string
  evidenceType: string
  description: string | null
  fileUrl: string | null
  uploadedAt: string
}

type RecklessLendingAssessment = {
  id: string
  isReckless: boolean
  monthlyIncome: number | null
  monthlyExpenses: number | null
  disposableIncome: number | null
  affordabilityRatio: number | null
  notes: string | null
  createdAt: string
}

type ForensicAuditDetail = {
  id: string
  status: string
  findings: string | null
  recommendations: string | null
  createdAt: string
  completedAt: string | null
  Case: { id: string; fileNumber: string } | null
  User: { name: string | null; email: string | null } | null
  AuditEvidence: AuditEvidence[]
  RecklessLendingAssessment: RecklessLendingAssessment | null
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:     'bg-yellow-500/20 text-yellow-400',
  IN_PROGRESS: 'bg-cyan-500/20 text-cyan-400',
  COMPLETED:   'bg-emerald-500/20 text-emerald-400' }

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

export default function ForensicAuditDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [audit, setAudit]       = useState<ForensicAuditDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [patching, setPatching] = useState(false)
  const [patchMsg, setPatchMsg] = useState('')

  useEffect(() => {
    async function fetchAudit() {
      try {
        const res = await fetch(`/api/finance/forensic-audits/${id}`)
        if (res.status === 404) { setNotFound(true); return }
        if (res.ok) setAudit(await res.json())
      } finally {
        setLoading(false)
      }
    }
    fetchAudit()
  }, [id])

  async function updateStatus(newStatus: string) {
    if (!audit) return
    setPatching(true)
    setPatchMsg('')
    try {
      const res = await fetch(`/api/finance/forensic-audits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }) })
      if (res.ok) {
        const updated = await res.json()
        setAudit((prev) => prev ? { ...prev, status: updated.status, completedAt: updated.completedAt } : prev)
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

  if (notFound || !audit) {
    return (
      <div className="p-6 text-center py-16">
        <p className="text-lg text-gray-400 mb-4">Forensic audit not found.</p>
        <Link href="/forensic-audits" className="text-cyan-400 hover:text-cyan-300 text-sm">← Back to Forensic Audits</Link>
      </div>
    )
  }

  const VALID_NEXT: Record<string, string[]> = {
    PENDING:     ['IN_PROGRESS'],
    IN_PROGRESS: ['COMPLETED'],
    COMPLETED:   [] }
  const nextStatuses = VALID_NEXT[audit.status] ?? []
  const rla = audit.RecklessLendingAssessment

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/forensic-audits" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">
          ← Back to Forensic Audits
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="text-3xl font-bold text-white">
            Forensic Audit — {audit.Case?.fileNumber ?? 'No Case'}
          </h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[audit.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
            {audit.status.replace('_', ' ')}
          </span>
        </div>
        <p className="text-gray-400 text-sm mt-1">
          Auditor: {audit.User?.name ?? audit.User?.email ?? 'Unassigned'} ·
          Created {new Date(audit.createdAt).toLocaleDateString('en-ZA')}
          {audit.completedAt && ` · Completed ${new Date(audit.completedAt).toLocaleDateString('en-ZA')}`}
        </p>
        {patchMsg && (
          <p className={`text-sm mt-2 ${patchMsg.includes('updated') ? 'text-emerald-400' : 'text-red-400'}`}>{patchMsg}</p>
        )}
        {nextStatuses.length > 0 && (
          <div className="flex gap-2 mt-3">
            {nextStatuses.map((s) => (
              <button key={s} onClick={() => updateStatus(s)} disabled={patching}
                className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                → {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Findings & Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h2 className="text-white font-semibold mb-3">Findings</h2>
          {audit.findings
            ? <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{audit.findings}</p>
            : <p className="text-gray-500 text-sm italic">No findings recorded yet.</p>}
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h2 className="text-white font-semibold mb-3">Recommendations</h2>
          {audit.recommendations
            ? <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{audit.recommendations}</p>
            : <p className="text-gray-500 text-sm italic">No recommendations recorded yet.</p>}
        </div>
      </div>

      {/* Reckless Lending Assessment */}
      {rla && (
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-white font-semibold">Reckless Lending Assessment</h2>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${rla.isReckless ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
              {rla.isReckless ? 'RECKLESS' : 'NOT RECKLESS'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider">Monthly Income</p>
              <p className="text-white font-semibold mt-1">{rla.monthlyIncome != null ? formatZAR(Number(rla.monthlyIncome)) : '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider">Monthly Expenses</p>
              <p className="text-white font-semibold mt-1">{rla.monthlyExpenses != null ? formatZAR(Number(rla.monthlyExpenses)) : '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider">Disposable Income</p>
              <p className={`font-semibold mt-1 ${rla.disposableIncome != null && Number(rla.disposableIncome) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {rla.disposableIncome != null ? formatZAR(Number(rla.disposableIncome)) : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider">Affordability Ratio</p>
              <p className="text-white font-semibold mt-1">
                {rla.affordabilityRatio != null ? `${Number(rla.affordabilityRatio).toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
          {rla.notes && (
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-gray-300 text-sm whitespace-pre-wrap">{rla.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Linked Case */}
      {audit.Case && (
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h2 className="text-white font-semibold mb-3">Linked Case</h2>
          <Link href={`/cases/${audit.Case.id}`} className="text-cyan-400 hover:text-cyan-300 font-mono text-lg">
            {audit.Case.fileNumber}
          </Link>
        </div>
      )}

      {/* Audit Evidence */}
      {audit.AuditEvidence && audit.AuditEvidence.length > 0 && (
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-white font-semibold">Audit Evidence ({audit.AuditEvidence.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">File</th>
                  <th className="px-5 py-3">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {audit.AuditEvidence.map((ev) => (
                  <tr key={ev.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-white">{ev.evidenceType}</td>
                    <td className="px-5 py-3 text-gray-400">{ev.description ?? '—'}</td>
                    <td className="px-5 py-3">
                      {ev.fileUrl
                        ? <a href={ev.fileUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 text-xs">View File</a>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-400">{new Date(ev.uploadedAt).toLocaleDateString('en-ZA')}</td>
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
