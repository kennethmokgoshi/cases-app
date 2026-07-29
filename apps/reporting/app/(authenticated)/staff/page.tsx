'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'

type ActivityCategory = 'CASE_WORK' | 'CLIENT_CALLS' | 'CLIENT_EMAILS' | 'OTHER'

interface WorkLog {
  id: string
  date: string
  category: string
  description: string
  durationMinutes: number
  fileNumber?: string
  isVerified: boolean
}

interface PresenceStaff {
  userId: string
  status: string
  lastActivityAt: string | null
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
}

export default function StaffDashboard() {
  const { data: session } = useSession()
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  
  const [logs, setLogs] = useState<WorkLog[]>([])
  const [onlineStaff, setOnlineStaff] = useState<PresenceStaff[]>([])
  const [isOnline, setIsOnline] = useState(false)
  const [checkingInOut, setCheckingInOut] = useState(false)
  const [isLoadingLogs, setIsLoadingLogs] = useState(true)
  
  // Quick log states
  const [manualActivity, setManualActivity] = useState('')
  const [activityCategory, setActivityCategory] = useState<ActivityCategory>('CASE_WORK')
  const [durationMinutes, setDurationMinutes] = useState<number>(30)
  const [caseFileNumber, setCaseFileNumber] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Auto-detected metrics for the selected date
  const [autoMetrics, setAutoMetrics] = useState({
    commentCount: 0,
    documentCount: 0,
    workflowLogCount: 0,
    casesTouched: [] as any[],
    estimatedMinutes: 0
  })
  const [isLoadingAuto, setIsLoadingAuto] = useState(true)

  useEffect(() => {
    loadData()
    loadPresence()
  }, [])

  useEffect(() => {
    loadDailyAutoMetrics()
  }, [selectedDateStr])

  async function loadPresence() {
    try {
      const response = await fetch('/api/reporting/presence')
      if (response.ok) {
        const data = await response.json()
        const onlineList = data.online as PresenceStaff[]
        setOnlineStaff(onlineList)
        
        // Find if current user is online
        if (session?.user?.id) {
          const isUserOnline = onlineList.some(
            (p) => p.userId === session.user.id && p.status === 'ONLINE'
          )
          setIsOnline(isUserOnline)
        }
      }
    } catch (error) {
      console.error('Failed to load presence:', error)
    }
  }

  async function loadData() {
    setIsLoadingLogs(true)
    try {
      // Load 180 days of logs for periodic rollups
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 180)
      const res = await fetch(`/api/reporting/logs?startDate=${startDate.toISOString()}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
      }
    } catch (error) {
      console.error('Failed to load logs:', error)
    } finally {
      setIsLoadingLogs(false)
    }
  }

  async function loadDailyAutoMetrics() {
    setIsLoadingAuto(true)
    try {
      const targetDate = new Date(selectedDateStr)
      targetDate.setHours(12, 0, 0, 0)
      const res = await fetch(`/api/reporting/activity?date=${targetDate.toISOString()}`)
      if (res.ok) {
        const data = await res.json()
        setAutoMetrics(data.autoDetected || {
          commentCount: 0,
          documentCount: 0,
          workflowLogCount: 0,
          casesTouched: [],
          estimatedMinutes: 0
        })
      }
    } catch (error) {
      console.error('Failed to load auto metrics:', error)
    } finally {
      setIsLoadingAuto(false)
    }
  }

  const handleCheckIn = async () => {
    setCheckingInOut(true)
    try {
      const response = await fetch('/api/reporting/check-in', { method: 'POST' })
      if (response.ok) {
        setIsOnline(true)
        loadPresence()
      }
    } catch (error) {
      console.error('Check-in failed:', error)
    } finally {
      setCheckingInOut(false)
    }
  }

  const handleCheckOut = async () => {
    setCheckingInOut(true)
    try {
      const response = await fetch('/api/reporting/check-out', { method: 'POST' })
      if (response.ok) {
        setIsOnline(false)
        loadPresence()
      }
    } catch (error) {
      console.error('Check-out failed:', error)
    } finally {
      setCheckingInOut(false)
    }
  }

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualActivity.trim()) {
      setFormError('Please enter what you are busy with.')
      return
    }
    setFormError('')
    setIsSubmitting(true)

    try {
      const logDate = new Date(selectedDateStr)
      // Set to current time if logging for today, otherwise noon
      const todayStr = new Date().toISOString().split('T')[0]
      if (selectedDateStr === todayStr) {
        const now = new Date()
        logDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds())
      } else {
        logDate.setHours(12, 0, 0, 0)
      }

      const payload: any = {
        date: logDate.toISOString(),
        category: activityCategory,
        description: manualActivity,
        durationMinutes: Number(durationMinutes),
      }

      if (caseFileNumber.trim()) {
        payload.fileNumber = caseFileNumber.trim().toUpperCase()
      }

      const response = await fetch('/api/reporting/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        setManualActivity('')
        setCaseFileNumber('')
        loadData() // Reload logs to rebuild metrics
      } else {
        const data = await response.json()
        setFormError(data.error || 'Failed to log activity.')
      }
    } catch (error) {
      console.error('Log activity failed:', error)
      setFormError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter logs helper
  const getLogsInDateRange = (start: Date, end: Date) => {
    return logs.filter((log) => {
      const logDate = new Date(log.date)
      return logDate >= start && logDate <= end
    })
  }

  // Define period boundaries
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  const thisWeekStart = new Date(now.setDate(now.getDate() - now.getDay()))
  thisWeekStart.setHours(0, 0, 0, 0)
  const thisWeekEnd = new Date()

  // Reset now for month calculations
  const monthNow = new Date()
  const thisMonthStart = new Date(monthNow.getFullYear(), monthNow.getMonth(), 1, 0, 0, 0)
  const thisMonthEnd = new Date()

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const oneEightyDaysAgo = new Date()
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180)

  // Calculate metrics for rollups
  const selectedDateStart = new Date(selectedDateStr)
  selectedDateStart.setHours(0, 0, 0, 0)
  const selectedDateEnd = new Date(selectedDateStr)
  selectedDateEnd.setHours(23, 59, 59, 999)

  const selectedLogs = getLogsInDateRange(selectedDateStart, selectedDateEnd)
  const selectedManualMinutes = selectedLogs.reduce((sum, log) => sum + log.durationMinutes, 0)
  const selectedAutoMinutes = autoMetrics.estimatedMinutes || 0
  const selectedTotalMinutes = selectedManualMinutes + selectedAutoMinutes

  const weeklyLogs = getLogsInDateRange(thisWeekStart, thisWeekEnd)
  const weeklyMinutes = weeklyLogs.reduce((sum, log) => sum + log.durationMinutes, 0)

  const monthlyLogs = getLogsInDateRange(thisMonthStart, thisMonthEnd)
  const monthlyMinutes = monthlyLogs.reduce((sum, log) => sum + log.durationMinutes, 0)

  const quarterlyLogs = getLogsInDateRange(ninetyDaysAgo, new Date())
  const quarterlyMinutes = quarterlyLogs.reduce((sum, log) => sum + log.durationMinutes, 0)

  const biannualLogs = getLogsInDateRange(oneEightyDaysAgo, new Date())
  const biannualMinutes = biannualLogs.reduce((sum, log) => sum + log.durationMinutes, 0)

  const otherOnlineStaff = onlineStaff.filter((s) => s.userId !== session?.user?.id)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left Column: Presence & Log Activity */}
      <div className="lg:col-span-1 space-y-6">
        {/* Check In / Out Widget */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Availability Control</h2>
          <p className="text-sm text-slate-500 mb-6">
            Check-in to mark yourself as **ONLINE** and available to assist. Check-out when offline.
          </p>

          <div className="flex items-center justify-between mb-6">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <button
            onClick={isOnline ? handleCheckOut : handleCheckIn}
            disabled={checkingInOut}
            className={`w-full py-3 rounded-xl font-bold transition-all duration-200 shadow-md ${
              isOnline
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
            } disabled:opacity-50`}
          >
            {checkingInOut ? 'Processing...' : isOnline ? 'Check Out / Go Offline' : 'Check In / Go Online'}
          </button>
        </div>

        {/* Quick Log Form */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Log Activity</h2>
          <form onSubmit={handleLogActivity} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Category</label>
              <select
                value={activityCategory}
                onChange={(e) => setActivityCategory(e.target.value as ActivityCategory)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              >
                <option value="CASE_WORK">Case Work</option>
                <option value="CLIENT_CALLS">Calls</option>
                <option value="CLIENT_EMAILS">Email</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Case File Number (Optional)</label>
              <input
                type="text"
                placeholder="e.g. ZDM-1234"
                value={caseFileNumber}
                onChange={(e) => setCaseFileNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Duration</label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>1 Hour</option>
                <option value={120}>2 Hours</option>
                <option value={240}>4 Hours</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</label>
              <textarea
                rows={3}
                placeholder="Briefly describe what you've done..."
                value={manualActivity}
                onChange={(e) => setManualActivity(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 resize-none"
              />
            </div>

            {formError && <p className="text-xs text-rose-500 font-medium">{formError}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Logging...' : 'Submit Log Entry'}
            </button>
          </form>
        </div>

        {/* Who's Online Widget */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Who's Online</h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-sm font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100/50 shadow-sm">
                  {otherOnlineStaff.length}
                </span>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  member{otherOnlineStaff.length === 1 ? '' : 's'} available to assist
                </span>
              </div>
            </div>
            <button onClick={loadPresence} className="text-xs text-cyan-600 font-bold hover:text-cyan-700">Refresh</button>
          </div>
          
          <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
            {otherOnlineStaff.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No other team members online right now</p>
            ) : (
              otherOnlineStaff.map((staff) => (
                <div key={staff.userId} className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {staff.user.firstName} {staff.user.lastName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{staff.user.email}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Middle & Right Column: Rollup periods & Logs list */}
      <div className="lg:col-span-2 space-y-6">
        {/* Date Selector & Daily Stats Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Task Rollup Metrics</h2>
              <p className="text-slate-500 text-sm mt-1">Review activity build-up across target periods</p>
            </div>
            <input
              type="date"
              value={selectedDateStr}
              onChange={(e) => setSelectedDateStr(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Dynamic Period Rollups Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-xl shadow-sm">
              <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider block">Today</span>
              <span className="text-2xl font-extrabold block mt-2">{(selectedTotalMinutes / 60).toFixed(1)}h</span>
              <span className="text-xs text-slate-400 mt-1 block">{selectedLogs.length} tasks</span>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">This Week</span>
              <span className="text-2xl font-bold text-slate-900 block mt-2">{(weeklyMinutes / 60).toFixed(1)}h</span>
              <span className="text-xs text-slate-500 mt-1 block">{weeklyLogs.length} tasks</span>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">This Month</span>
              <span className="text-2xl font-bold text-slate-900 block mt-2">{(monthlyMinutes / 60).toFixed(1)}h</span>
              <span className="text-xs text-slate-500 mt-1 block">{monthlyLogs.length} tasks</span>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Quarter (90d)</span>
              <span className="text-2xl font-bold text-slate-900 block mt-2">{(quarterlyMinutes / 60).toFixed(1)}h</span>
              <span className="text-xs text-slate-500 mt-1 block">{quarterlyLogs.length} tasks</span>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Bi-Annual (180d)</span>
              <span className="text-2xl font-bold text-slate-900 block mt-2">{(biannualMinutes / 60).toFixed(1)}h</span>
              <span className="text-xs text-slate-500 mt-1 block">{biannualLogs.length} tasks</span>
            </div>
          </div>
        </div>

        {/* Selected Day's Task Details */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg">Activity Details: {selectedDateStr}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Logged work & auto-detected activities</p>
            </div>
            <span className="text-sm font-semibold px-2.5 py-1 bg-cyan-500 text-slate-950 rounded-full">
              {(selectedTotalMinutes / 60).toFixed(1)}h Total
            </span>
          </div>

          <div className="p-6 space-y-6">
            {/* Auto Detected Segment */}
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Auto-Detected Actions</h4>
              {isLoadingAuto ? (
                <div className="text-slate-500 text-sm py-4">Checking system logs...</div>
              ) : autoMetrics.casesTouched.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-500 border border-slate-100">
                  No background database activities found on this date.
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                  <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider">Cases Touched & Comments:</p>
                  <div className="divide-y divide-slate-200">
                    {autoMetrics.casesTouched.map((caseItem: any, idx: number) => (
                      <div key={idx} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-800">{caseItem.fileNumber}</span>
                          <span className="text-xs text-slate-500">{caseItem.clientName}</span>
                        </div>
                        {caseItem.commentTimes?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {caseItem.commentTimes.map((timeStr: string, tIdx: number) => (
                              <span
                                key={tIdx}
                                className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                                  tIdx === 0 && caseItem.firstCommentAt
                                    ? 'bg-emerald-100 text-emerald-800 font-semibold'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {tIdx === 0 && caseItem.firstCommentAt ? 'started: ' : ''}
                                {new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Manual Logs Segment */}
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Manual Entries</h4>
              {isLoadingLogs ? (
                <div className="text-slate-500 text-sm py-4">Loading logs...</div>
              ) : selectedLogs.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-6 text-center text-sm text-slate-500 border border-slate-100">
                  No manual tasks logged for this day. Use the form on the left to add one!
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between p-4 bg-white border border-slate-200 rounded-xl hover:shadow-sm transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {log.category.replace('_', ' ')}
                          </span>
                          {log.fileNumber && (
                            <span className="text-xs font-semibold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded">
                              {log.fileNumber}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                              log.isVerified
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {log.isVerified ? 'VERIFIED' : 'PENDING'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">{log.description}</p>
                      </div>
                      <span className="text-sm font-bold text-slate-900">{log.durationMinutes} min</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
