'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { getDateRange, DateRangeType } from '@/lib/date-utils'
import { getPresenceMetadata, isDndStatus, normalizePresenceStatus } from '@/lib/presence-status'


interface TeamMember {
  id: string
  firstName: string
  lastName: string
  email: string
  status: string
  totalHours: string
  verifiedHours: string
  logCount: number
  verifiedCount: number
  role?: string
}

export default function ExecutiveDashboard() {
  const { data: session } = useSession()
  const [team, setTeam] = useState<TeamMember[]>([])
  const filteredTeam = team.filter((member) => member.id !== session?.user?.id)
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRangeType>('week')

  useEffect(() => {
    loadTeamData()
  }, [dateRange])

  async function loadTeamData() {
    setIsLoading(true)
    try {
      const { start, end } = getDateRange(dateRange)

      // Fetch all staff members activity
      const res = await fetch(
        `/api/reporting/team?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setTeam(data.team || [])
      }
    } catch (error) {
      console.error('Executive load error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate Rollup Metrics
  const totalHoursLogged = filteredTeam.reduce((sum, m) => sum + parseFloat(m.totalHours), 0)
  const totalHoursVerified = filteredTeam.reduce((sum, m) => sum + parseFloat(m.verifiedHours), 0)
  const onlineStaffCount = filteredTeam.filter((m) => normalizePresenceStatus(m.status) !== 'OFFLINE').length
  const dndStaffCount = filteredTeam.filter((m) => isDndStatus(normalizePresenceStatus(m.status))).length
  const totalTasksCount = filteredTeam.reduce((sum, m) => sum + m.logCount, 0)
  
  const verificationRatio = totalHoursLogged > 0 
    ? ((totalHoursVerified / totalHoursLogged) * 100).toFixed(0) 
    : '0'

  // Partition users into Managers vs regular Staff (simulate role split based on email or stats or mocks)
  // For Zenowethu domain context, user role matches senior or manager.
  // In the team returned list, we can check email/names (like moshet) or classify.
  const managers = filteredTeam.filter(m => 
    m.email.includes('manager') || 
    m.email.includes('moshet') || 
    m.firstName.toLowerCase().includes('manager')
  )

  const staff = filteredTeam.filter(m => !managers.some(mgr => mgr.id === m.id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-slate-600 mt-1">High-level team productivity overview and metrics</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['today', 'week', 'month', 'quarter', 'biannual', 'annual'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                dateRange === range
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {range === 'today' && 'Today'}
              {range === 'week' && 'This Week'}
              {range === 'month' && 'This Month'}
              {range === 'quarter' && 'Quarter (90d)'}
              {range === 'biannual' && 'Bi-Annual (180d)'}
              {range === 'annual' && 'Annual (365d)'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-500 font-medium">Loading executive rollup...</div>
      ) : (
        <div className="space-y-6">
          {/* Key KPI Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Hours Logged</span>
              <span className="text-3xl font-extrabold text-slate-900 mt-2 block">{totalHoursLogged.toFixed(1)}h</span>
              <span className="text-xs text-slate-500 mt-1 block">Across {totalTasksCount} tasks</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Hours Verified</span>
              <span className="text-3xl font-extrabold text-emerald-600 mt-2 block">{totalHoursVerified.toFixed(1)}h</span>
              <span className="text-xs text-slate-500 mt-1 block">Approved by managers</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Verification Ratio</span>
              <span className="text-3xl font-extrabold text-slate-900 mt-2 block">{verificationRatio}%</span>
              <span className="text-xs text-slate-500 mt-1 block">Target: 100% verified</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Staff Online</span>
              <span className="text-3xl font-extrabold text-cyan-600 mt-2 block">{onlineStaffCount}</span>
              <span className="text-xs text-slate-500 mt-1 block">{dndStaffCount} focused/away</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Manager Monitoring Section */}
            <div className="lg:col-span-2 space-y-6">
              {/* Managers list */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-slate-900 text-white p-5">
                  <h2 className="font-bold text-lg">Managers Performance & Actions</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Tracking manager verifications and submissions</p>
                </div>
                
                <div className="p-6 space-y-4">
                  {managers.length === 0 ? (
                    <div className="text-center py-6 text-sm text-slate-500">
                      No managers registered in team roster.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {managers.map((mgr) => {
                        const verifiedPercentage = mgr.logCount > 0 
                          ? ((mgr.verifiedCount / mgr.logCount) * 100).toFixed(0) 
                          : '0'
                        return (
                          <div key={mgr.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-slate-800">{mgr.firstName} {mgr.lastName}</p>
                              <p className="text-xs text-slate-500">{mgr.email}</p>
                              <span className="text-[10px] mt-1.5 inline-block px-2 py-0.5 rounded font-bold uppercase bg-amber-50 text-amber-800">
                                Manager Role
                              </span>
                            </div>
                            
                            <div className="text-right space-y-1">
                              <p className="text-sm font-bold text-slate-800">{mgr.totalHours}h logged</p>
                              <p className="text-xs text-slate-500">{mgr.verifiedCount} / {mgr.logCount} tasks verified ({verifiedPercentage}%)</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Staff rollup metrics */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 p-5">
                  <h2 className="font-bold text-lg text-slate-800">Staff Tasks Breakdown</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Summaries of general staff output</p>
                </div>

                <div className="p-6">
                  {staff.length === 0 ? (
                    <div className="text-center py-6 text-sm text-slate-500">
                      No staff registered in team roster.
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                      {staff.map((s) => (
                        <div key={s.id} className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{s.firstName} {s.lastName}</p>
                            <p className="text-xs text-slate-500">{s.email}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-extrabold text-slate-850">{s.totalHours}h</span>
                            <span className="text-xs text-slate-400 block mt-0.5">{s.logCount} tasks</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Global presence list */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Availability Roster</h2>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-sm font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100/50 shadow-sm">
                        {onlineStaffCount}
                      </span>
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                        available to assist
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {filteredTeam.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">No team members online</p>
                  ) : (
                    filteredTeam.map((member) => {
                      const meta = getPresenceMetadata(member.status)
                      return (
                        <div key={member.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dotColorClass}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">
                              {member.firstName} {member.lastName}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{meta.label}</p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}