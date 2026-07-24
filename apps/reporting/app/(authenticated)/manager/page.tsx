'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@zenowethu/ui';
import { format, subDays, startOfMonth, endOfMonth, parseISO, startOfToday, endOfToday } from 'date-fns';
import * as XLSX from 'xlsx';

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

export default function ManagerDashboard() {
  const { data: session } = useSession();
  
  // Staff list & log data
  const [staff, setStaff] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [categoryBreakdown, setCategoryBreakdown] = useState<Record<string, number>>({});
  
  // Filters
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Multi-select logs for bulk verification
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);

  // Detailed system signatures for compared logs
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [loadingSignature, setLoadingSignature] = useState(false);
  const [selectedLogSignature, setSelectedLogSignature] = useState<any>(null);

  // General Page state
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Fetch staff list
  useEffect(() => {
    async function loadStaff() {
      try {
        const res = await fetch('/api/staff');
        if (res.ok) {
          const data = await res.json();
          setStaff(data);
          if (data.length > 0) {
            setSelectedStaffId(data[0].id); // Default to the first staff member
          }
        }
      } catch (err) {
        console.error('Failed to load staff list:', err);
      } finally {
        setIsLoadingStaff(false);
      }
    }
    loadStaff();
  }, []);

  // Fetch logs based on filter settings
  const loadLogs = useCallback(async () => {
    if (!selectedStaffId) return;
    setIsLoadingLogs(true);
    setSelectedLogIds([]);
    setExpandedLogId(null);
    setSelectedLogSignature(null);
    try {
      const res = await fetch(
        `/api/logs?userId=${selectedStaffId}&startDate=${startDate}&endDate=${endDate}&category=${selectedCategory}`
      );
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalMinutes(data.totalMinutes);
        setCategoryBreakdown(data.categoryBreakdown);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [selectedStaffId, startDate, endDate, selectedCategory]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Load a specific day's system footprint signature
  const loadDaySignature = async (log: any) => {
    if (expandedLogId === log.id) {
      setExpandedLogId(null);
      setSelectedLogSignature(null);
      return;
    }

    setExpandedLogId(log.id);
    setLoadingSignature(true);
    setSelectedLogSignature(null);

    try {
      const dateStr = format(parseISO(log.date), 'yyyy-MM-dd');
      const res = await fetch(`/api/logs?userId=${log.userId}&startDate=${dateStr}&includeSignature=true`);
      if (res.ok) {
        const data = await res.json();
        setSelectedLogSignature(data.signature);
      }
    } catch (err) {
      console.error('Failed to load signature:', err);
    } finally {
      setLoadingSignature(false);
    }
  };

  // Perform bulk verification
  const handleBulkVerify = async (isVerified: boolean) => {
    if (selectedLogIds.length === 0) return;
    setIsVerifying(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await fetch('/api/logs/bulk-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logIds: selectedLogIds,
          isVerified
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({ 
          text: `Successfully ${isVerified ? 'verified' : 'unverified'} ${data.count} log entries!`, 
          type: 'success' 
        });
        setSelectedLogIds([]);
        loadLogs();
      } else {
        const data = await res.json();
        setMessage({ text: data.error || 'Failed to verify logs', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Error executing bulk action', type: 'error' });
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle select all checkbox
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const verifiable = logs.map(l => l.id);
      setSelectedLogIds(verifiable);
    } else {
      setSelectedLogIds([]);
    }
  };

  const handleSelectRow = (logId: string) => {
    setSelectedLogIds(prev => 
      prev.includes(logId) ? prev.filter(id => id !== logId) : [...prev, logId]
    );
  };

  // Export filtered logs to Excel
  const handleExportExcel = () => {
    if (logs.length === 0) return;

    const employeeName = staff.find(s => s.id === selectedStaffId);
    const employeeLabel = employeeName ? `${employeeName.firstName} ${employeeName.lastName}` : 'Employee';

    // Map logs to format clean rows
    const rows = logs.map(l => {
      const cat = WORK_CATEGORIES.find(c => c.id === l.category)?.label || l.category;
      return {
        'Date': format(parseISO(l.date), 'yyyy-MM-dd'),
        'Employee': employeeLabel,
        'Category': cat,
        'Duration (Minutes)': l.durationMinutes,
        'Duration (Hours)': (l.durationMinutes / 60).toFixed(2),
        'Case Reference': l.fileNumber || 'N/A',
        'Verification Status': l.isVerified ? 'Verified' : 'Pending',
        'Verified By': l.verifiedBy ? `${l.verifiedBy.firstName} ${l.verifiedBy.lastName}` : '',
        'Description': l.description
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Timesheet Log');
    
    // Fit columns width
    const maxLen = rows.reduce((acc, row) => {
      Object.keys(row).forEach((key, i) => {
        const val = String((row as any)[key] || '');
        acc[i] = Math.max(acc[i] || 10, val.length);
      });
      return acc;
    }, [] as number[]);
    worksheet['!cols'] = maxLen.map(len => ({ wch: len + 3 }));

    // Save File
    const fileName = `WorkLog_${employeeLabel.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Preset date filters
  const applyPresetDate = (daysAgo: number, type: 'today' | 'week' | 'month' | 'quarter') => {
    const today = new Date();
    if (type === 'today') {
      setStartDate(format(startOfToday(), 'yyyy-MM-dd'));
      setEndDate(format(endOfToday(), 'yyyy-MM-dd'));
    } else if (type === 'week') {
      setStartDate(format(subDays(today, 7), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (type === 'month') {
      setStartDate(format(subDays(today, 30), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (type === 'quarter') {
      setStartDate(format(subDays(today, 90), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    }
  };

  const formatMins = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-bold text-white">Management & Verification Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Review reported staff timesheets and verify details against live monorepo system activities.
          </p>
        </div>
      </div>

      {/* Filter Pane */}
      <div className="glass-card p-6 rounded-3xl border border-slate-800 bg-slate-950/20">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Filter Log Entries</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Employee */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Select Employee</label>
            {isLoadingStaff ? (
              <div className="h-10 bg-slate-900 animate-pulse rounded-xl" />
            ) : (
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-sm"
              >
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.email.split('@')[0]})</option>
                ))}
              </select>
            )}
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-sm"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-sm"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-sm"
            >
              <option value="ALL">All Categories</option>
              {WORK_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Date presets row */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-900">
          <button 
            onClick={() => applyPresetDate(0, 'today')}
            className="px-3 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            Today
          </button>
          <button 
            onClick={() => applyPresetDate(7, 'week')}
            className="px-3 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            Last 7 Days
          </button>
          <button 
            onClick={() => applyPresetDate(30, 'month')}
            className="px-3 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            Last 30 Days
          </button>
          <button 
            onClick={() => applyPresetDate(90, 'quarter')}
            className="px-3 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            Last 90 Days
          </button>
        </div>
      </div>

      {/* Main layout (Split screen: summary charts on top/left, grid on bottom/right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Category Breakdown (Left card) */}
        <div className="glass-card p-6 rounded-3xl border border-slate-800 bg-slate-950/10 flex flex-col justify-between">
          <div>
            <h2 className="text-md font-bold text-white mb-4">Total Time Logged</h2>
            <div className="leading-none mb-6">
              <span className="text-3xl font-extrabold text-cyan-400">{formatMins(totalMinutes)}</span>
              <span className="text-xs text-slate-500 block mt-1">aggregated for selected filters</span>
            </div>
            
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Breakdown by Task</h3>
            <div className="space-y-4">
              {WORK_CATEGORIES.map(cat => {
                const mins = categoryBreakdown[cat.id] || 0;
                const pct = totalMinutes > 0 ? (mins / totalMinutes) * 100 : 0;
                
                if (mins === 0) return null;

                return (
                  <div key={cat.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-300">{cat.label}</span>
                      <span className="text-slate-400">{formatMins(mins)} ({Math.round(pct)}%)</span>
                    </div>
                    <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900">
                      <div 
                        className="bg-cyan-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {totalMinutes === 0 && (
                <div className="text-center py-6 text-xs text-slate-600">No category breakdown available</div>
              )}
            </div>
          </div>
        </div>

        {/* Timesheet List (Right span 2 cards) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 rounded-3xl border border-slate-800 bg-slate-950/10">
            {/* Header controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-4 mb-6">
              <h2 className="text-lg font-bold text-white">Timesheet Log</h2>
              
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleExportExcel}
                  disabled={logs.length === 0}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                >
                  📥 Export Excel
                </button>

                {selectedLogIds.length > 0 && (
                  <>
                    <button
                      onClick={() => handleBulkVerify(true)}
                      disabled={isVerifying}
                      className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-bold text-emerald-400 rounded-xl transition-all cursor-pointer"
                    >
                      ✓ Bulk Verify ({selectedLogIds.length})
                    </button>
                    <button
                      onClick={() => handleBulkVerify(false)}
                      disabled={isVerifying}
                      className="px-4 py-2 bg-slate-900 border border-red-500/20 text-xs font-bold text-red-400 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                    >
                      Unverify
                    </button>
                  </>
                )}
              </div>
            </div>

            {message.text && (
              <div className={`mb-6 p-4 rounded-xl text-sm font-semibold border ${
                message.type === 'success' 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                {message.text}
              </div>
            )}

            {/* List */}
            {isLoadingLogs ? (
              <div className="space-y-4 py-8">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-900/50 animate-pulse rounded-xl border border-slate-800/50" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <svg className="w-12 h-12 text-slate-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="font-semibold text-slate-400">No logs found matching filters</p>
                <p className="text-xs text-slate-600 mt-1">Adjust your date range or category filters above.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Select All Row */}
                <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-950/40 border border-slate-900 rounded-xl">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={selectedLogIds.length === logs.length}
                    className="w-4 h-4 text-cyan-500 focus:ring-cyan-500 focus:ring-opacity-25 rounded border-slate-800"
                  />
                  <span className="text-xs font-bold text-slate-400">Select All Logs</span>
                </div>

                {/* Rows */}
                {logs.map(log => {
                  const catDetails = WORK_CATEGORIES.find(c => c.id === log.category) || WORK_CATEGORIES[WORK_CATEGORIES.length - 1];
                  const formattedDate = format(parseISO(log.date), 'd MMM yyyy');
                  const isChecked = selectedLogIds.includes(log.id);
                  const isExpanded = expandedLogId === log.id;

                  return (
                    <div 
                      key={log.id} 
                      className={`bg-slate-950/65 border rounded-2xl transition-all overflow-hidden ${
                        isExpanded ? 'border-cyan-500/30 ring-1 ring-cyan-500/20 shadow-lg' : 'border-slate-900'
                      }`}
                    >
                      {/* Grid Header Card */}
                      <div className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleSelectRow(log.id)}
                            className="w-4 h-4 text-cyan-500 focus:ring-cyan-500 rounded border-slate-800"
                          />
                          <div className="text-left leading-none">
                            <span className="text-[10px] text-slate-500 font-bold block mb-1">
                              {formattedDate}
                            </span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border leading-none ${catDetails.color}`}>
                              {catDetails.label}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs font-extrabold text-white bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-800">
                            {formatMins(log.durationMinutes)}
                          </span>

                          {log.isVerified ? (
                            <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
                              ✓ Verified
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">
                              Pending
                            </span>
                          )}

                          <button
                            onClick={() => loadDaySignature(log)}
                            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                            title="Verify Activity"
                          >
                            <svg className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Footprint & Description */}
                      {isExpanded && (
                        <div className="bg-slate-950/90 border-t border-slate-900 p-5 space-y-4">
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Description of Work</span>
                            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-medium">
                              {log.description}
                            </p>
                          </div>

                          {log.fileNumber && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                              <span>📁 Linked Case fileNumber:</span>
                              <span className="bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-md text-white font-bold">
                                {log.fileNumber}
                              </span>
                            </div>
                          )}

                          {/* Verification Audit information */}
                          {log.isVerified && log.verifiedBy && (
                            <div className="text-[10px] font-bold text-slate-500 bg-slate-900/40 p-2 rounded-xl border border-slate-900 inline-block">
                              ✓ Verified by {log.verifiedBy.firstName} {log.verifiedBy.lastName} on {format(parseISO(log.verifiedAt), 'd MMM yyyy, HH:mm')}
                            </div>
                          )}

                          {/* Footprint / Verification Area */}
                          <div className="border-t border-slate-900 pt-4 mt-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-3">
                              Monorepo System Footprint (Corroboration)
                            </span>

                            {loadingSignature ? (
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <svg className="animate-spin h-4 w-4 text-cyan-400" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Loading system footprints...
                              </div>
                            ) : selectedLogSignature ? (
                              <div className="space-y-4">
                                {/* Aggregates row */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                                    <span className="text-[10px] text-slate-500 font-bold block">Comments written</span>
                                    <span className="text-md font-extrabold text-white mt-1 block">{selectedLogSignature.commentCount}</span>
                                  </div>
                                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                                    <span className="text-[10px] text-slate-500 font-bold block">Status transitions</span>
                                    <span className="text-md font-extrabold text-white mt-1 block">{selectedLogSignature.workflowLogCount}</span>
                                  </div>
                                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                                    <span className="text-[10px] text-slate-500 font-bold block">Files uploaded</span>
                                    <span className="text-md font-extrabold text-white mt-1 block">{selectedLogSignature.documentCount}</span>
                                  </div>
                                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                                    <span className="text-[10px] text-slate-500 font-bold block">Emails/SMS dispatched</span>
                                    <span className="text-md font-extrabold text-white mt-1 block">{selectedLogSignature.notificationCount}</span>
                                  </div>
                                </div>

                                {/* Touched Cases */}
                                <div>
                                  <span className="text-[10px] text-slate-500 font-bold block mb-1">Cases touched on this day</span>
                                  {selectedLogSignature.casesTouched.length > 0 ? (
                                    <div className="flex flex-col gap-1.5">
                                      {selectedLogSignature.casesTouched.map((c) => (
                                        <div key={c.fileNumber} className="text-xs bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg">
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            <span className="text-slate-200 font-bold">{c.fileNumber}</span>
                                            {c.clientName && (
                                              <span className="text-slate-400 font-semibold">· {c.clientName}</span>
                                            )}
                                          </div>
                                          {c.commentTimes && c.commentTimes.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                              <span className="text-[10px] text-slate-500 font-bold uppercase">
                                                {c.commentTimes.length} comment{c.commentTimes.length > 1 ? 's' : ''}
                                              </span>
                                              {c.commentTimes.map((t: string, i: number) => (
                                                <span
                                                  key={i}
                                                  className={`px-1.5 py-0.5 rounded-md font-semibold ${i === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}
                                                >
                                                  {i === 0 && 'started '}
                                                  {new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-600 font-semibold italic">No direct monorepo files touched. This might be manual/offline work.</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-red-400 font-semibold">Failed to fetch footprints.</span>
                            )}
                          </div>
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
