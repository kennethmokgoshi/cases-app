'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Letter = {
  id: string
  letterType: string
  sentAt: string | null
  status: string
  createdAt: string
}

type PrescriptionCheck = {
  id: string
  checkedAt: string
  isPrescribed: boolean
  notes: string | null
}

type LegalMatterDetail = {
  id: string
  creditorName: string
  matterType: string
  status: string
  priority: string
  outstandingBalance: number | null
  originalBalance: number | null
  judgmentAmount: number | null
  judgmentDate: string | null
  courtName: string | null
  caseNumber: string | null
  isPrescribed: boolean
  prescriptionDate: string | null
  letterSent: boolean
  responseReceived: boolean
  responseDate: string | null
  responseNotes: string | null
  outcome: string | null
  outcomeDate: string | null
  amountSaved: number | null
  createdAt: string
  Case: { id: string; fileNumber: string } | null
  Client: { firstName: string; lastName: string; idNumber: string } | null
  letters: Letter[]
  prescriptionChecks: PrescriptionCheck[]
}

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

export default function LegalMatterDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [matter, setMatter]     = useState<LegalMatterDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [patching, setPatching] = useState(false)
  const [patchMsg, setPatchMsg] = useState('')

  useEffect(() => {
    async function fetchMatter() {
      try {
        const res = await fetch(`/api/finance/legal-matters/${id}`)
        if (res.status === 404) { setNotFound(true); return }
        if (res.ok) setMatter(await res.json())
      } finally {
        setLoading(false)
      }
    }
    fetchMatter()
  }, [id])

  async function updateStatus(newStatus: string) {
    if (!matter) return
    setPatching(true)
    setPatchMsg('')
    try {
      const res = await fetch(`/api/finance/legal-matters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }) })
      if (res.ok) {
        const updated = await res.json()
        setMatter((prev) => prev ? { ...prev, status: updated.status } : prev)
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

  if (notFound || !matter) {
    return (
      <div className="p-6 text-center py-16">
        <p className="text-lg text-gray-400 mb-4">Legal matter not found.</p>
        <Link href="/legal-matters" className="text-cyan-400 hover:text-cyan-300 text-sm">← Back to Legal Matters</Link>
      </div>
    )
  }

  const VALID_NEXT: Record<string, string[]> = {
    OPEN:    ['CLOSED', 'SETTLED'],
    CLOSED:  [],
    SETTLED: [] }
  const nextStatuses = VALID_NEXT[matter.status] ?? []

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/legal-matters" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">
          ← Back to Legal Matters
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="text-3xl font-bold text-white">{matter.creditorName}</h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[matter.status] ?? 'bg-yellow-500/20 text-yellow-400'}`}>
            {matter.status}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[matter.priority] ?? 'bg-gray-500/20 text-gray-400'}`}>
            {matter.priority}
          </span>
          {matter.isPrescribed && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">Prescribed</span>
          )}
        </div>
        <p className="text-gray-400 text-sm mt-1">{matter.matterType} · Created {new Date(matter.createdAt).toLocaleDateString('en-ZA')}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Matter Details */}
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h2 className="text-white font-semibold mb-4">Matter Details</h2>
          <dl className="space-y-3 text-sm">
            {matter.outstandingBalance != null && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Outstanding Balance</dt>
                <dd className="text-white font-semibold">{formatZAR(Number(matter.outstandingBalance))}</dd>
              </div>
            )}
            {matter.originalBalance != null && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Original Balance</dt>
                <dd className="text-white">{formatZAR(Number(matter.originalBalance))}</dd>
              </div>
            )}
            {matter.judgmentAmount != null && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Judgment Amount</dt>
                <dd className="text-white">{formatZAR(Number(matter.judgmentAmount))}</dd>
              </div>
            )}
            {matter.judgmentDate && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Judgment Date</dt>
                <dd className="text-white">{new Date(matter.judgmentDate).toLocaleDateString('en-ZA')}</dd>
              </div>
            )}
            {matter.courtName && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Court</dt>
                <dd className="text-white">{matter.courtName}</dd>
              </div>
            )}
            {matter.caseNumber && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Court Case #</dt>
                <dd className="text-white font-mono">{matter.caseNumber}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-400">Letter Sent</dt>
              <dd className={matter.letterSent ? 'text-emerald-400' : 'text-gray-500'}>{matter.letterSent ? 'Yes' : 'No'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Response Received</dt>
              <dd className={matter.responseReceived ? 'text-emerald-400' : 'text-gray-500'}>{matter.responseReceived ? 'Yes' : 'No'}</dd>
            </div>
            {matter.responseDate && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Response Date</dt>
                <dd className="text-white">{new Date(matter.responseDate).toLocaleDateString('en-ZA')}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Prescription & Outcome */}
        <div className="space-y-6">
          {/* Prescription */}
          <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
            <h2 className="text-white font-semibold mb-4">Prescription</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Prescribed</dt>
                <dd className={matter.isPrescribed ? 'text-red-400 font-semibold' : 'text-gray-400'}>{matter.isPrescribed ? 'Yes' : 'No'}</dd>
              </div>
              {matter.prescriptionDate && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Prescription Date</dt>
                  <dd className="text-red-400">{new Date(matter.prescriptionDate).toLocaleDateString('en-ZA')}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Outcome */}
          {(matter.outcome || matter.amountSaved != null) && (
            <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
              <h2 className="text-white font-semibold mb-4">Outcome</h2>
              <dl className="space-y-3 text-sm">
                {matter.outcomeDate && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Outcome Date</dt>
                    <dd className="text-white">{new Date(matter.outcomeDate).toLocaleDateString('en-ZA')}</dd>
                  </div>
                )}
                {matter.amountSaved != null && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Amount Saved</dt>
                    <dd className="text-emerald-400 font-semibold">{formatZAR(Number(matter.amountSaved))}</dd>
                  </div>
                )}
                {matter.outcome && (
                  <div>
                    <dt className="text-gray-400 mb-1">Outcome Notes</dt>
                    <dd className="text-white text-sm bg-white/5 rounded-lg p-3">{matter.outcome}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Client & Case */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {matter.Client && (
          <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
            <h2 className="text-white font-semibold mb-3">Client</h2>
            <p className="text-white font-medium">{matter.Client.firstName} {matter.Client.lastName}</p>
            <p className="text-gray-400 text-sm">{matter.Client.idNumber}</p>
          </div>
        )}
        {matter.Case && (
          <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
            <h2 className="text-white font-semibold mb-3">Linked Case</h2>
            <Link href={`/cases/${matter.Case.id}`} className="text-cyan-400 hover:text-cyan-300 font-mono text-lg">
              {matter.Case.fileNumber}
            </Link>
          </div>
        )}
      </div>

      {/* Response Notes */}
      {matter.responseNotes && (
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h2 className="text-white font-semibold mb-3">Response Notes</h2>
          <p className="text-gray-300 text-sm whitespace-pre-wrap">{matter.responseNotes}</p>
        </div>
      )}

      {/* Correspondence Letters */}
      {matter.letters.length > 0 && (
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-white font-semibold">Correspondence Letters ({matter.letters.length})</h2>
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
                {matter.letters.map((ltr) => (
                  <tr key={ltr.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-white">{ltr.letterType}</td>
                    <td className="px-5 py-3 text-gray-400">{ltr.status}</td>
                    <td className="px-5 py-3 text-gray-400">
                      {ltr.sentAt ? new Date(ltr.sentAt).toLocaleDateString('en-ZA') : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-400">{new Date(ltr.createdAt).toLocaleDateString('en-ZA')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Prescription Checks */}
      {matter.prescriptionChecks.length > 0 && (
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-white font-semibold">Prescription History ({matter.prescriptionChecks.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Checked At</th>
                  <th className="px-5 py-3">Prescribed</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {matter.prescriptionChecks.map((chk) => (
                  <tr key={chk.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-gray-400">{new Date(chk.checkedAt).toLocaleDateString('en-ZA')}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${chk.isPrescribed ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {chk.isPrescribed ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400">{chk.notes ?? '—'}</td>
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
