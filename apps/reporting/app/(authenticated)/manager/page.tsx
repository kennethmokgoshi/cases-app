'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { getDateRange, DateRangeType } from '@/lib/date-utils'
import ProjectList from '@/components/ProjectList'
import { getPresenceMetadata } from '@/lib/presence-status'


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
}

interface WorkLog {
  id: string
  date: string
  category: string
  description: string
  durationMinutes: number
  fileNumber?: string
  isVerified: boolean
}

export default function ManagerDashboard() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.reportingRole || 'staff'

  const [team, setTeam] = useState<TeamMember[]>([])
  const filteredTeam = team.filter((member) => member.id !== session?.user?.id)
  const [selectedUser, setSelectedUser] = useState<TeamMember | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRangeType>('week')
  
  // Member log states
  const [memberLogs, setMemberLogs] = useState<WorkLog[]>([])
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([])
  const [isVerifying, setIsVerifying] = useState(false)

  // Report Modal states
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportText, setReportText] = useState('')
  const [isSendingReport, setIsSendingReport] = useState(false)
  const [reportSuccess, setReportSuccess] = useState(false)

  // Session states
  const [sessions, setSessions] = useState<any[]>([])
  const [sessionStats, setSessionStats] = useState<any>(null)
  const [sessionPredictions, setSessionPredictions] = useState<any>(null)
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)

  useEffect(() => {
    loadTeam()
  }, [dateRange])

  useEffect(() => {
    if (selectedUser) {
      loadMemberLogs(selectedUser.id)
      loadMemberSessions(selectedUser.id)
    } else {
      setMemberLogs([])
      setSessions([])
      setSessionStats(null)
      setSessionPredictions(null)
    }
  }, [selectedUser])

  async function loadMemberSessions(userId: string) {
    setIsLoadingSessions(true)
    try {
      const res = await fetch(`/api/reporting/presence/sessions?userId=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || [])
        setSessionStats(data.stats || null)
        setSessionPredictions(data.predictions || null)
      }
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setIsLoadingSessions(false)
    }
  }

  async function loadTeam() {
    setIsLoading(true)
    try {
      const { start, end } = getDateRange(dateRange)

      const res = await fetch(
        `/api/reporting/team?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setTeam(data.team || [])
        
        // Keep selected user reference updated
        if (selectedUser) {
          const updated = (data.team || []).find((t: TeamMember) => t.id === selectedUser.id)
          if (updated) setSelectedUser(updated)
        }
      }
    } catch (error) {
      console.error('Team load error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function loadMemberLogs(userId: string) {
    setIsLoadingLogs(true)
    setSelectedLogIds([])
    try {
      const { start, end } = getDateRange(dateRange)

      const res = await fetch(
        `/api/reporting/logs?userId=${userId}&startDate=${start.toISOString()}&endDate=${end.toISOString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setMemberLogs(data.logs || [])
      }
    } catch (error) {
      console.error('Failed to load member logs:', error)
    } finally {
      setIsLoadingLogs(false)
    }
  }

  const handleToggleLog = (logId: string) => {
    setSelectedLogIds((prev) =>
      prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]
    )
  }

  const handleSelectAllLogs = () => {
    if (selectedLogIds.length === memberLogs.length) {
      setSelectedLogIds([])
    } else {
      setSelectedLogIds(memberLogs.map((log) => log.id))
    }
  }

  const handleBulkVerify = async (verify: boolean) => {
    if (selectedLogIds.length === 0) return
    setIsVerifying(true)
    try {
      const res = await fetch('/api/reporting/logs/bulk-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logIds: selectedLogIds,
          isVerified: verify,
        }),
      })
      if (res.ok) {
        // Refresh logs and team statistics
        if (selectedUser) {
          await loadMemberLogs(selectedUser.id)
        }
        await loadTeam()
      }
    } catch (error) {
      console.error('Bulk verify failed:', error)
    } finally {
      setIsVerifying(false)
    }
  }

  const handleCompileReport = () => {
    // Group all team logs and compile a text summary
    const totalHrs = team.reduce((sum, m) => sum + parseFloat(m.totalHours), 0).toFixed(1)
    const verifiedHrs = team.reduce((sum, m) => sum + parseFloat(m.verifiedHours), 0).toFixed(1)
    const activeMembers = team.filter((m) => parseFloat(m.totalHours) > 0).length

    let text = `Zenowethu Team Work Report\n`
    text += `Period: This ${dateRange.toUpperCase()}\n`
    text += `Date Generated: ${new Date().toLocaleDateString()}\n`
    text += `========================================\n`
    text += `Summary KPIs:\n`
    text += `- Active Staff: ${activeMembers} / ${team.length}\n`
    text += `- Total Hours Logged: ${totalHrs}h\n`
    text += `- Total Hours Verified: ${verifiedHrs}h\n\n`
    text += `Breakdown per Employee:\n`
    
    team.forEach((m) => {
      text += `- ${m.firstName} ${m.lastName} (${m.email}):\n`
      text += `  * Hours Logged: ${m.totalHours}h (${m.logCount} tasks)\n`
      text += `  * Hours Verified: ${m.verifiedHours}h (${m.verifiedCount} tasks)\n`
    })

    setReportText(text)
    setReportSuccess(false)
    setShowReportModal(true)
  }

  const handleSendReport = async () => {
    setIsSendingReport(true)
    // Simulate API call to send report to executives
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsSendingReport(false)
    setReportSuccess(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Manager Dashboard</h1>
          <p className="text-slate-600 mt-1">Monitor, verify, and report team activities</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCompileReport}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition text-sm"
          >
            Compile & Send Report
          </button>
        </div>
      </div>

      {/* Date Filters Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600">Active Lookback:</span>
        <div className="flex flex-wrap gap-2">
          {(['today', 'week', 'month', 'quarter', 'biannual', 'annual'] as const).map((range) => (
            <button
              key={range}
              onClick={() => {
                setDateRange(range)
                setSelectedUser(null)
              }}
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

      {/* Project Management Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <ProjectList />
      </div>


      {isLoading ? (
        <div className="text-center py-12 text-slate-500 font-medium">Loading team data...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Team List Column */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-slate-900 text-white p-4">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-base">Team Roster ({filteredTeam.length})</h2>
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    <span className="text-xs font-extrabold text-emerald-400">
                      {filteredTeam.filter((m) => getPresenceMetadata(m.status).status !== 'OFFLINE').length}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Online</span>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-slate-150 max-h-[500px] overflow-y-auto">
                {filteredTeam.map((member) => {
                  const isSelected = selectedUser?.id === member.id
                  return (
                    <button
                      key={member.id}
                      onClick={() => setSelectedUser(member)}
                      className={`w-full text-left p-4 hover:bg-slate-50 transition flex items-center justify-between ${
                        isSelected ? 'bg-cyan-50/50 border-l-4 border-cyan-500' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 truncate">
                          {member.firstName} {member.lastName}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          {member.totalHours}h logged · {member.verifiedHours}h verified
                        </p>
                      </div>
                      
                      {/* Availability status */}
                      <span
                        className={`w-3 h-3 rounded-full shrink-0 ml-3 ${getPresenceMetadata(member.status).dotColorClass}`}
                        title={getPresenceMetadata(member.status).label}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Details & Logs Verification Column */}
          <div className="lg:col-span-2 space-y-6">
            {selectedUser ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                {/* Header Profile */}
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">
                      {selectedUser.firstName} {selectedUser.lastName}
                    </h2>
                    <p className="text-sm text-slate-500">{selectedUser.email}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                      selectedUser.status === 'ONLINE'
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedUser.status === 'IDLE'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {selectedUser.status}
                  </span>
                </div>

                {/* Progress Indicators */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Logged</span>
                    <span className="text-xl font-bold text-slate-800 mt-1 block">{selectedUser.totalHours}h</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100/50 p-4 rounded-xl">
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">Verified</span>
                    <span className="text-xl font-bold text-emerald-900 mt-1 block">{selectedUser.verifiedHours}h</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Tasks Count</span>
                    <span className="text-xl font-bold text-slate-800 mt-1 block">{selectedUser.logCount}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Verified Tasks</span>
                    <span className="text-xl font-bold text-slate-800 mt-1 block">{selectedUser.verifiedCount}</span>
                  </div>
                </div>

                {/* Task Logs List & Selection */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-slate-700 uppercase tracking-wider">Submitted Logs</h3>
                    {memberLogs.length > 0 && (
                      <button
                        onClick={handleSelectAllLogs}
                        className="text-xs text-cyan-600 font-bold hover:text-cyan-700"
                      >
                        {selectedLogIds.length === memberLogs.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>

                  {isLoadingLogs ? (
                    <p className="text-sm text-slate-400 py-4">Fetching logs...</p>
                  ) : memberLogs.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl p-8 border border-slate-100 text-center text-sm text-slate-500">
                      No logs logged by this member in this period.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {memberLogs.map((log) => {
                        const isChecked = selectedLogIds.includes(log.id)
                        return (
                          <div
                            key={log.id}
                            className={`flex items-start gap-4 p-3.5 bg-white border rounded-xl hover:shadow-sm transition ${
                              isChecked ? 'border-cyan-500 bg-cyan-50/10' : 'border-slate-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleLog(log.id)}
                              className="mt-1 w-4 h-4 text-cyan-500 border-slate-300 rounded focus:ring-cyan-500"
                            />
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                  {log.category.replace('_', ' ')}
                                </span>
                                {log.fileNumber && (
                                  <span className="text-[10px] font-semibold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded">
                                    {log.fileNumber}
                                  </span>
                                )}
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                    log.isVerified
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {log.isVerified ? 'Verified' : 'Pending'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {new Date(log.date).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-slate-800 leading-snug">{log.description}</p>
                            </div>
                            <span className="text-sm font-bold text-slate-900 shrink-0">{log.durationMinutes} min</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Verification Actions */}
                {selectedLogIds.length > 0 && (
                  <div className="flex gap-3 bg-slate-50 border border-slate-100 p-4 rounded-xl justify-end">
                    <span className="text-xs font-bold text-slate-500 flex items-center mr-auto">
                      {selectedLogIds.length} selected
                    </span>
                    <button
                      onClick={() => handleBulkVerify(false)}
                      disabled={isVerifying}
                      className="px-4 py-2 border border-slate-350 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs transition disabled:opacity-50"
                    >
                      Unverify
                    </button>
                    <button
                      onClick={() => handleBulkVerify(true)}
                      disabled={isVerifying}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs transition shadow-md shadow-emerald-500/20 disabled:opacity-50"
                    >
                      Verify Logs
                    </button>
                  </div>
                )}

                {/* Availability Session Analytics */}
                <div className="border-t border-slate-100 pt-6 space-y-4">
                  <h3 className="font-bold text-sm text-slate-700 uppercase tracking-wider">Availability Sessions</h3>
                  
                  {isLoadingSessions ? (
                    <p className="text-sm text-slate-400 py-2">Loading session stats...</p>
                  ) : !sessionStats || sessionStats.totalSessions === 0 ? (
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center text-sm text-slate-500">
                      No availability logs found for this period.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Session duration stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Sessions Count</span>
                          <span className="text-base font-bold text-slate-800 mt-1 block">{sessionStats.totalSessions} times</span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Average Session</span>
                          <span className="text-base font-bold text-slate-800 mt-1 block">
                            {sessionStats.averageMinutes >= 60 
                              ? `${Math.floor(sessionStats.averageMinutes / 60)}h ${sessionStats.averageMinutes % 60}m`
                              : `${sessionStats.averageMinutes}m`}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Longest Session</span>
                          <span className="text-base font-bold text-slate-850 mt-1 block">
                            {sessionStats.longestMinutes >= 60 
                              ? `${Math.floor(sessionStats.longestMinutes / 60)}h ${sessionStats.longestMinutes % 60}m`
                              : `${sessionStats.longestMinutes}m`}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Shortest Session</span>
                          <span className="text-base font-bold text-slate-850 mt-1 block">
                            {sessionStats.shortestMinutes >= 60 
                              ? `${Math.floor(sessionStats.shortestMinutes / 60)}h ${sessionStats.shortestMinutes % 60}m`
                              : `${sessionStats.shortestMinutes}m`}
                          </span>
                        </div>
                      </div>

                      {/* Productivity Predictions */}
                      {sessionPredictions && (role === 'executive' || role === 'admin') && (
                        <div className="bg-cyan-50 border border-cyan-105 rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-2 text-cyan-800">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <h4 className="text-xs font-bold uppercase tracking-wider">Productivity Predictions (AI Engine)</h4>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-slate-700">
                            <div>
                              <span className="text-[10px] font-semibold text-slate-500 block">Tomorrow</span>
                              <span className="text-sm font-bold">{sessionPredictions.dayHours} hours</span>
                            </div>
                            <div>
                              <span className="text-[10px] font-semibold text-slate-500 block">Next Week</span>
                              <span className="text-sm font-bold">{sessionPredictions.weekHours} hours</span>
                            </div>
                            <div>
                              <span className="text-[10px] font-semibold text-slate-500 block">Next Month</span>
                              <span className="text-sm font-bold">{sessionPredictions.monthHours} hours</span>
                            </div>
                            <div>
                              <span className="text-[10px] font-semibold text-slate-500 block">Next 3 Months</span>
                              <span className="text-sm font-bold">{sessionPredictions.threeMonthHours} hours</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sessions History List */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recent Sessions History</span>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {sessions.map((sess: any) => {
                            const login = new Date(sess.loginAt)
                            const logout = sess.logoutAt ? new Date(sess.logoutAt) : null
                            return (
                              <div key={sess.id} className="flex justify-between items-center p-2 bg-slate-55 border border-slate-100 rounded-lg text-xs">
                                <div className="text-slate-650">
                                  <span>{login.toLocaleDateString()} · </span>
                                  <span>{login.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  {logout ? (
                                    <span> to {logout.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  ) : (
                                    <span className="text-emerald-600 font-semibold"> (Active)</span>
                                  )}
                                </div>
                                <span className="font-bold text-slate-700">
                                  {sess.durationMinutes >= 60 
                                    ? `${Math.floor(sess.durationMinutes / 60)}h ${sess.durationMinutes % 60}m`
                                    : `${sess.durationMinutes}m`}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 shadow-sm">
                <div className="text-5xl mb-4">👥</div>
                <h3 className="font-bold text-lg text-slate-800 mb-1">Select a Team Member</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Click on any staff member from the roster list on the left to inspect their daily logs and verify tasks.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compile Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-150 pb-3">
              <h3 className="font-bold text-lg text-slate-900">Compile Report Details</h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            {reportSuccess ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-3">
                <span className="text-3xl block">📧</span>
                <h4 className="font-bold text-emerald-800">Report Sent Successfully!</h4>
                <p className="text-xs text-emerald-600">
                  The compiled summary report has been transmitted to Zenowethu Executives.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Below is the generated overview of team activities for the active period. Review the details and click send.
                </p>
                <textarea
                  readOnly
                  rows={10}
                  value={reportText}
                  className="w-full p-3 bg-slate-50 border border-slate-250 rounded-xl text-xs font-mono text-slate-700 focus:outline-none"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-150">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 text-xs font-bold hover:bg-slate-50"
              >
                Close
              </button>
              {!reportSuccess && (
                <button
                  onClick={handleSendReport}
                  disabled={isSendingReport}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold rounded-lg text-xs shadow transition disabled:opacity-50"
                >
                  {isSendingReport ? 'Sending...' : 'Send to Executives'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}