'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@zenowethu/ui';
import { format, subDays, startOfWeek, endOfWeek, parseISO } from 'date-fns';

const WORK_CATEGORIES = [
  { id: 'CLIENT_CALLS', label: 'Client Calls', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' },
  { id: 'CLIENT_EMAILS', label: 'Client Emails', color: 'text-sky-400 border-sky-500/20 bg-sky-500/10' },
  { id: 'B2B_QUERIES', label: 'B2B Queries', color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10' },
  { id: 'SOCIAL_MEDIA', label: 'Social Media', color: 'text-fuchsia-400 border-fuchsia-500/20 bg-fuchsia-500/10' },
  { id: 'DHS_PORTAL', label: 'DHS Portal Actions', color: 'text-amber-400 border-amber-500/20 bg-amber-500/10' },
  { id: 'LEGAL_DRAFTING', label: 'Legal Drafting & Admin', color: 'text-teal-400 border-teal-500/20 bg-teal-500/10' },
  { id: 'FORENSIC_AUDITING', label: 'Forensic Audit Work', color: 'text-rose-400 border-rose-500/20 bg-rose-500/10' },
  { id: 'FINANCE_ADMIN', label: 'Finance & Invoicing', color: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10' },
  { id: 'GENERAL_ADMIN', label: 'Meetings & General Admin', color: 'text-slate-400 border-slate-500/20 bg-slate-500/10' },
  { id: 'OTHER', label: 'Other Tasks', color: 'text-purple-400 border-purple-500/20 bg-purple-500/10' }
];

export default function EmployeePortal() {
  const { data: session } = useSession();
  
  // Form State
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [category, setCategory] = useState('CLIENT_CALLS');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [fileNumber, setFileNumber] = useState('');
  const [description, setDescription] = useState('');
  
  // Case validation state
  const [isValidatingCase, setIsValidatingCase] = useState(false);
  const [validatedClientName, setValidatedClientName] = useState('');
  const [caseError, setCaseError] = useState('');

  // UI / Fetch states
  const [logs, setLogs] = useState<any[]>([]);
  const [totalMinutesToday, setTotalMinutesToday] = useState(0);
  const [totalMinutesWeek, setTotalMinutesWeek] = useState(0);
  const [systemSignature, setSystemSignature] = useState<any>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Load timesheet logs and activity signature
  const loadDashboardData = useCallback(async () => {
    if (!session?.user?.id) return;
    setIsLoadingLogs(true);
    try {
      const today = new Date();
      const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 });
      const endOfCurrentWeek = endOfWeek(today, { weekStartsOn: 1 });

      // Fetch logs for this week
      const logsRes = await fetch(
        `/api/logs?userId=${session.user.id}&startDate=${format(startOfCurrentWeek, 'yyyy-MM-dd')}&endDate=${format(endOfCurrentWeek, 'yyyy-MM-dd')}`
      );
      const logsData = await logsRes.json();
      
      if (logsData.logs) {
        setLogs(logsData.logs);
        setTotalMinutesWeek(logsData.totalMinutes);
        
        // Calculate today's logged hours
        const todayStr = format(today, 'yyyy-MM-dd');
        const minsToday = logsData.logs
          .filter((l: any) => format(parseISO(l.date), 'yyyy-MM-dd') === todayStr)
          .reduce((sum: number, l: any) => sum + l.durationMinutes, 0);
        setTotalMinutesToday(minsToday);
      }

      // Fetch today's monorepo activity footprint
      const sigRes = await fetch(
        `/api/logs?userId=${session.user.id}&startDate=${format(today, 'yyyy-MM-dd')}&includeSignature=true`
      );
      const sigData = await sigRes.json();
      if (sigData.signature) {
        setSystemSignature(sigData.signature);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Debounced live case validation
  useEffect(() => {
    if (!fileNumber.trim()) {
      setValidatedClientName('');
      setCaseError('');
      return;
    }

    const timer = setTimeout(async () => {
      setIsValidatingCase(true);
      setCaseError('');
      setValidatedClientName('');
      try {
        const res = await fetch(`/api/cases/validate?fileNumber=${encodeURIComponent(fileNumber.trim())}`);
        const data = await res.json();
        if (data.found) {
          setValidatedClientName(data.clientName);
        } else {
          setCaseError('Case file number not found');
        }
      } catch (err) {
        setCaseError('Error validating case');
      } finally {
        setIsValidatingCase(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [fileNumber]);

  // Submit log
  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hours === 0 && minutes === 0) {
      setMessage({ text: 'Duration must be greater than 0 minutes', type: 'error' });
      return;
    }
    if (caseError) {
      setMessage({ text: 'Please resolve the case file error before logging', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    setMessage({ text: '', type: '' });

    const totalMinutes = (hours * 60) + minutes;

    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          category,
          description,
          durationMinutes: totalMinutes,
          fileNumber: fileNumber.trim() || null
        })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ text: 'Work logged successfully!', type: 'success' });
        // Reset form
        setHours(0);
        setMinutes(30);
        setFileNumber('');
        setDescription('');
        loadDashboardData();
      } else {
        setMessage({ text: data.error || 'Failed to log work', type: 'error' });
      }
    } catch {
      setMessage({ text: 'An unexpected error occurred.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Log
  const handleDeleteLog = async (id: string) => {
    if (!confirm('Are you sure you want to delete this log?')) return;

    try {
      const res = await fetch(`/api/logs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage({ text: 'Log deleted successfully', type: 'success' });
        loadDashboardData();
      } else {
        const data = await res.json();
        setMessage({ text: data.error || 'Failed to delete log', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Error deleting log', type: 'error' });
    }
  };

  const formatMins = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const todayTargetMinutes = 8 * 60; // 8 hours
  const weekTargetMinutes = 40 * 60; // 40 hours

  const todayProgress = Math.min(100, (totalMinutesToday / todayTargetMinutes) * 100);
  const weekProgress = Math.min(100, (totalMinutesWeek / weekTargetMinutes) * 100);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-bold text-white">Welcome back, {session?.user?.firstName}!</h1>
          <p className="text-slate-400 text-sm mt-1">Keep track of your client calls, emails, and daily targets below.</p>
        </div>
        <div className="text-sm bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-4 py-2 rounded-xl font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          Shift Status: Logged In
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Today's Logged Time */}
        <div className="glass-card p-6 rounded-2xl flex flex-col justify-between min-h-[140px]">
          <div>
            <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">Today's Total</span>
            <h3 className="text-3xl font-extrabold text-white mt-1">{formatMins(totalMinutesToday)}</h3>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Daily Target: 8 hrs</span>
              <span>{Math.round(todayProgress)}%</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900">
              <div 
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${todayProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Weekly Progress */}
        <div className="glass-card p-6 rounded-2xl flex flex-col justify-between min-h-[140px]">
          <div>
            <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">This Week's Log</span>
            <h3 className="text-3xl font-extrabold text-white mt-1">{formatMins(totalMinutesWeek)}</h3>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Weekly Target: 40 hrs</span>
              <span>{Math.round(weekProgress)}%</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${weekProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Monorepo System Footprint */}
        <div className="glass-card p-6 rounded-2xl min-h-[140px]">
          <span className="text-xs font-bold text-slate-500 tracking-wider uppercase block">Today's System Footprint</span>
          {systemSignature ? (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="flex items-center gap-2 bg-slate-950/40 p-2 rounded-xl border border-slate-900">
                <span className="text-lg">💬</span>
                <div className="text-left leading-none">
                  <span className="text-xs text-slate-500 block">Comments</span>
                  <span className="text-sm font-bold text-white">{systemSignature.commentCount}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-slate-950/40 p-2 rounded-xl border border-slate-900">
                <span className="text-lg">✉️</span>
                <div className="text-left leading-none">
                  <span className="text-xs text-slate-500 block">Sent Items</span>
                  <span className="text-sm font-bold text-white">{systemSignature.notificationCount}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-slate-950/40 p-2 rounded-xl border border-slate-900">
                <span className="text-lg">📄</span>
                <div className="text-left leading-none">
                  <span className="text-xs text-slate-500 block">Uploads</span>
                  <span className="text-sm font-bold text-white">{systemSignature.documentCount}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-slate-950/40 p-2 rounded-xl border border-slate-900">
                <span className="text-lg">🔄</span>
                <div className="text-left leading-none">
                  <span className="text-xs text-slate-500 block">Statuses</span>
                  <span className="text-sm font-bold text-white">{systemSignature.workflowLogCount}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-16 text-slate-500 text-sm">
              No signature tracked yet
            </div>
          )}
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left Side: Logging Form */}
        <div className="lg:col-span-2">
          <div className="glass-card p-6 rounded-3xl border border-slate-800/80 sticky top-28 bg-slate-950/30">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Log New Work Entry
            </h2>

            {message.text && (
              <div className={`mb-6 p-4 rounded-xl text-sm font-semibold border ${
                message.type === 'success' 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleLogSubmit} className="space-y-5">
              {/* Date */}
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-2">Work Date</label>
                <input 
                  type="date" 
                  value={date} 
                  max={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  required
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-2">Task Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-sm"
                >
                  {WORK_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* Time Spent */}
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-2">Time Invested</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-1">
                    <select
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                      className="bg-transparent text-white focus:outline-none w-full py-2"
                    >
                      {Array.from({ length: 13 }).map((_, i) => (
                        <option key={i} value={i}>{i} hrs</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-1">
                    <select
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                      className="bg-transparent text-white focus:outline-none w-full py-2"
                    >
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                        <option key={m} value={m}>{m} mins</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Case reference (validated) */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-bold text-slate-400">Case Reference Number</label>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Optional</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={fileNumber}
                    onChange={(e) => setFileNumber(e.target.value)}
                    placeholder="e.g. ZDM-2026-1044-6E4"
                    className={`w-full px-4 py-3 pr-10 bg-slate-950/80 border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-sm ${
                      caseError ? 'border-red-500/50' : validatedClientName ? 'border-emerald-500/50' : 'border-slate-800'
                    }`}
                  />
                  {isValidatingCase && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <svg className="animate-spin h-4 w-4 text-cyan-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  )}
                  {!isValidatingCase && validatedClientName && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">
                      ✓
                    </div>
                  )}
                </div>
                {validatedClientName && (
                  <p className="text-xs font-semibold text-emerald-400 mt-2 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                    Linked to Client: {validatedClientName}
                  </p>
                )}
                {caseError && (
                  <p className="text-xs font-semibold text-red-400 mt-2 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                    {caseError}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-2">Description of Work Done</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain exactly what you achieved during this time block..."
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-sm"
                  required
                />
                <div className="flex justify-between mt-1 text-[10px] text-slate-500 font-bold">
                  <span>Min: 5 characters</span>
                  <span>{description.length} chars</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {isSubmitting ? 'Logging...' : 'Submit Entry'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Activity Log Feed */}
        <div className="lg:col-span-3 space-y-6">
          <div className="glass-card p-6 rounded-3xl border border-slate-800/80 bg-slate-950/10">
            <div className="flex items-center justify-between border-b border-slate-900 pb-4 mb-6">
              <h2 className="text-lg font-bold text-white">Recent Work Submissions</h2>
              <span className="text-xs bg-slate-900 px-3 py-1 rounded-xl text-slate-400 border border-slate-800">
                This Week
              </span>
            </div>

            {isLoadingLogs ? (
              <div className="space-y-4 py-8">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 bg-slate-900/50 animate-pulse rounded-xl border border-slate-800/50" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <svg className="w-12 h-12 text-slate-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-semibold text-slate-400">No logs submitted for this period yet</p>
                <p className="text-xs text-slate-600 mt-1">Submit your first log using the form on the left.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => {
                  const catDetails = WORK_CATEGORIES.find(c => c.id === log.category) || WORK_CATEGORIES[WORK_CATEGORIES.length - 1];
                  const formattedDate = format(parseISO(log.date), 'EEEE, d MMM yyyy');

                  return (
                    <div 
                      key={log.id} 
                      className="bg-slate-950/65 border border-slate-900 hover:border-slate-800 p-5 rounded-2xl transition-all relative group"
                    >
                      {/* Top row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-3 py-1 rounded-full border ${catDetails.color}`}>
                            {catDetails.label}
                          </span>
                          <span className="text-xs text-slate-500 font-semibold">{formattedDate}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-white bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl">
                            {formatMins(log.durationMinutes)}
                          </span>

                          {/* Verification State */}
                          {log.isVerified ? (
                            <span 
                              className="text-[10px] font-bold px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg flex items-center gap-1"
                              title={`Approved by ${log.verifiedBy?.firstName} ${log.verifiedBy?.lastName}`}
                            >
                              ✓ Verified
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                              Pending
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                        {log.description}
                      </p>

                      {/* File Number */}
                      {log.fileNumber && (
                        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-cyan-400/90">
                          <span>📁 Linked Case:</span>
                          <span className="bg-cyan-500/5 border border-cyan-500/20 px-2 py-0.5 rounded-md">
                            {log.fileNumber}
                          </span>
                        </div>
                      )}

                      {/* Action buttons (Disabled if verified) */}
                      {!log.isVerified && (
                        <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteLog(log.id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 rounded-lg transition-all cursor-pointer"
                            title="Delete Entry"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
