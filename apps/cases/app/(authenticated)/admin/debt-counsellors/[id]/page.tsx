'use client'

import { useState, useEffect } from 'react'
import { useSession } from '@zenowethu/ui'
import { useRouter, useParams } from 'next/navigation'

type DCInfo = {
  id: string
  ncrdcNo: string
  fullName: string | null
  tradingName: string | null
  operatingStatus: string | null
  province: string | null
  tel: string | null
  mobile: string | null
  fax: string | null
  email: string | null
  preferredEmail: string | null
  lastKnownEmail: string | null
  staffNotes: string | null
  updatedAt: string
  updatedBy: string | null
}

type Stats = {
  total: number
  thisYear: number
  thisMonth: number
  lastMonth: number
  accepted: number
  declined: number
  pending: number
  declineBreakdown: Array<{ category: string; count: number }>
}

type EmailEntry = {
  id: string
  email: string
  source: string
  recordedAt: string
  notes: string | null
}

type TimelineEntry = {
  id: string
  fileNumber: string
  clientName: string
  idNumber: string | null
  dhsStatus: string | null
  dhsDaysCounter: string | null
  caseStatus: string
  declineReason: string | null
  declineReasonAttended: boolean
  declineCategory: string | null
  assignedTo: string | null
  createdAt: string
  updatedAt: string
  dhsStatusDate: string | null
}

const DHS_STATUS_COLORS: Record<string, string> = {
  ACCEPTED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  DECLINED: 'bg-red-500/20 text-red-300 border-red-500/30',
  PENDING: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  AUTO_TRANSFERRED: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  NOT_REQUESTED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  NOT_LINKED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const DECLINE_LABELS: Record<string, string> = {
  SEND_DOCS: 'Docs Needed',
  SEND_DOCS_WITH_NCR: 'Docs + NCR Cert',
  CLIENT_CONSENT_NEEDED: 'Client Consent',
  OUTSTANDING_FEES: 'Outstanding Fees',
  CONTACT_ATTORNEY: 'Contact Attorney',
  RESUBMIT_LATER: 'Resubmit Later',
  UNKNOWN: 'Unknown',
}

const SOURCE_LABELS: Record<string, string> = {
  DHS: 'DHS Scrape',
  STAFF: 'Staff Edit',
  NCR_LOOKUP: 'NCR Register',
  DECLINE_REASON: 'Decline Text',
}

function dhsColor(s: string | null) {
  if (!s) return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  return DHS_STATUS_COLORS[s] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

function StatCard({ label, value, accent, sub }: { label: string; value: number | string; accent?: string; sub?: string }) {
  return (
    <div className="bg-white/3 border border-gray-800 rounded-xl p-4 flex flex-col">
      <span className={`text-2xl font-bold ${accent ?? 'text-white'}`}>{value}</span>
      <span className="text-xs text-gray-400 mt-1">{label}</span>
      {sub && <span className="text-[10px] text-gray-600 mt-0.5">{sub}</span>}
    </div>
  )
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DebtCounsellorDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [dc, setDc] = useState<DCInfo | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [emailHistory, setEmailHistory] = useState<EmailEntry[]>([])
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedCase, setExpandedCase] = useState<string | null>(null)
  const [dhsFilter, setDhsFilter] = useState<string>('ALL')

  useEffect(() => {
    if (status === 'authenticated' && !session?.user?.isAdmin) router.push('/')
  }, [session, status, router])

  useEffect(() => {
    if (status !== 'authenticated' || !id) return
    setLoading(true)
    setError('')
    fetch(`/api/admin/debt-counsellors/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return }
        setDc(data.dc)
        setStats(data.stats)
        setEmailHistory(data.emailHistory)
        setTimeline(data.timeline)
      })
      .catch(() => setError('Failed to load debt counsellor.'))
      .finally(() => setLoading(false))
  }, [status, id])

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-amber-500" />
      </div>
    )
  }
  if (!session?.user?.isAdmin) return null
  if (error) return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
    </div>
  )
  if (!dc || !stats) return null

  const acceptRate = stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0
  const filteredTimeline = dhsFilter === 'ALL' ? timeline : timeline.filter((t) => t.dhsStatus === dhsFilter)

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => router.push('/admin/debt-counsellors')} className="hover:text-amber-400 transition-colors">
          Debt Counsellors
        </button>
        <span>/</span>
        <span className="text-white font-mono">{dc.ncrdcNo}</span>
      </div>

      {/* Header */}
      <div className="bg-white/3 border border-gray-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white">{dc.fullName ?? dc.ncrdcNo}</h1>
              <span className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5">
                {dc.ncrdcNo}
              </span>
              {dc.operatingStatus && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                  dc.operatingStatus === 'Operating' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  dc.operatingStatus === 'Suspended' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                  'bg-red-500/20 text-red-300 border-red-500/30'
                }`}>{dc.operatingStatus}</span>
              )}
            </div>
            {dc.tradingName && <p className="text-sm text-gray-400 mt-1">{dc.tradingName}</p>}
          </div>
          <button
            onClick={() => router.push(`/admin/debt-counsellors?edit=${dc.id}`)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg hover:border-gray-600 hover:text-white transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.172-8.172z" />
            </svg>
            Edit on List
          </button>
        </div>

        {/* Contact row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-800">
          <div>
            <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">Email (Preferred)</p>
            <p className="text-xs text-white mt-0.5">{dc.preferredEmail ?? dc.email ?? '—'}</p>
            {dc.preferredEmail && dc.email && dc.preferredEmail !== dc.email && (
              <p className="text-[10px] text-gray-500">dhs: {dc.email}</p>
            )}
          </div>
          <div>
            <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">Tel</p>
            <p className="text-xs text-white mt-0.5">{dc.tel ?? '—'}</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">Mobile</p>
            <p className="text-xs text-white mt-0.5">{dc.mobile ?? '—'}</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">Province</p>
            <p className="text-xs text-white mt-0.5">{dc.province ?? '—'}</p>
          </div>
        </div>

        {dc.staffNotes && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider mb-1">Staff Notes</p>
            <p className="text-xs text-gray-300">{dc.staffNotes}</p>
          </div>
        )}
        {dc.updatedBy && (
          <p className="text-[10px] text-gray-600 mt-3">Last updated by {dc.updatedBy} on {fmt(dc.updatedAt)}</p>
        )}
      </div>

      {/* Stats grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Transfer Request Stats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard label="Total Requests" value={stats.total} />
          <StatCard label="This Year" value={stats.thisYear} />
          <StatCard label="This Month" value={stats.thisMonth} />
          <StatCard label="Last Month" value={stats.lastMonth} />
          <StatCard label="Accepted" value={stats.accepted} accent="text-emerald-400" />
          <StatCard label="Declined" value={stats.declined} accent="text-red-400" />
          <StatCard label="Pending" value={stats.pending} accent="text-amber-400" />
          <StatCard label="Accept Rate" value={`${acceptRate}%`} accent={acceptRate >= 50 ? 'text-emerald-400' : 'text-red-400'} />
        </div>
      </div>

      {/* Decline breakdown */}
      {stats.declineBreakdown.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Decline Reason Breakdown</h2>
          <div className="bg-white/3 border border-gray-800 rounded-xl p-4 space-y-2">
            {stats.declineBreakdown.map(({ category, count }) => {
              const pct = stats.declined > 0 ? Math.round((count / stats.declined) * 100) : 0
              return (
                <div key={category} className="flex items-center gap-3">
                  <span className="text-xs text-gray-300 w-40 flex-shrink-0">
                    {DECLINE_LABELS[category] ?? category}
                  </span>
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-16 text-right">{count} ({pct}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Email history */}
      {emailHistory.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Email History</h2>
          <div className="bg-white/3 border border-gray-800 rounded-xl divide-y divide-gray-800">
            {emailHistory.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-white font-mono truncate">{e.email}</p>
                  {e.notes && <p className="text-[10px] text-gray-500 mt-0.5">{e.notes}</p>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[10px] text-gray-500 bg-gray-800 rounded px-2 py-0.5">
                    {SOURCE_LABELS[e.source] ?? e.source}
                  </span>
                  <span className="text-[10px] text-gray-600">{fmt(e.recordedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Case timeline */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Case Timeline — {filteredTimeline.length} case{filteredTimeline.length !== 1 ? 's' : ''}
          </h2>
          <div className="flex gap-1">
            {['ALL', 'ACCEPTED', 'DECLINED', 'PENDING', 'NOT_REQUESTED'].map((s) => (
              <button
                key={s}
                onClick={() => setDhsFilter(s)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-all ${
                  dhsFilter === s
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-gray-500 border border-gray-800 hover:text-gray-300'
                }`}
              >
                {s === 'ALL' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-sm">No cases for this filter.</div>
        ) : (
          <div className="space-y-2">
            {filteredTimeline.map((entry) => (
              <div key={entry.id} className="bg-white/3 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedCase(expandedCase === entry.id ? null : entry.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-wrap">
                    <span className="text-xs font-mono text-amber-400 flex-shrink-0">{entry.fileNumber}</span>
                    <span className="text-sm text-white truncate">{entry.clientName}</span>
                    {entry.idNumber && <span className="text-[10px] text-gray-500 font-mono">{entry.idNumber}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {entry.dhsStatus && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${dhsColor(entry.dhsStatus)}`}>
                        {entry.dhsStatus.replace('_', ' ')}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-500">{fmt(entry.createdAt)}</span>
                    <svg
                      className={`w-4 h-4 text-gray-600 transition-transform ${expandedCase === entry.id ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expandedCase === entry.id && (
                  <div className="border-t border-gray-800 px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-[9px] text-gray-600 uppercase tracking-wider">Case Status</p>
                        <p className="text-gray-300 mt-0.5">{entry.caseStatus}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-600 uppercase tracking-wider">DHS Status Date</p>
                        <p className="text-gray-300 mt-0.5">{fmt(entry.dhsStatusDate)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-600 uppercase tracking-wider">Days Counter</p>
                        <p className="text-gray-300 mt-0.5">{entry.dhsDaysCounter ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-600 uppercase tracking-wider">Assigned To</p>
                        <p className="text-gray-300 mt-0.5">{entry.assignedTo ?? '—'}</p>
                      </div>
                    </div>

                    {entry.declineReason && (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[9px] text-gray-600 uppercase tracking-wider">Decline Reason</p>
                          {entry.declineCategory && (
                            <span className="text-[9px] font-semibold text-red-300 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5">
                              {DECLINE_LABELS[entry.declineCategory] ?? entry.declineCategory}
                            </span>
                          )}
                          {entry.declineReasonAttended && (
                            <span className="text-[9px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
                              Attended
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-300 bg-black/20 rounded px-3 py-2">{entry.declineReason}</p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <a
                        href={`/cases/${entry.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        Open Case →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
