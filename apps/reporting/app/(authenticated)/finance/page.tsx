'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { formatZAR, formatNumber } from '@/lib/formatters';

interface FinanceMetrics {
  totalCollected: number;
  lastMonthCollected: number;
  percentChange: number;
  pendingBatches: number;
  unallocatedCount: number;
  unallocatedTotalAmount: number;
  totalInvoicedAmount: number;
  totalCollectedInvoices: number;
  totalOutstandingFees: number;
  quotesCount: number;
  acceptedQuotesCount: number;
  invoicesCount: number;
}

interface RecentBatch {
  id: string;
  fileName: string;
  uploadedAt: string;
  totalAmount: number;
  matchCount: number;
  unmatchCount: number;
  status: string;
  uploadedBy: string;
}

interface OverpaymentItem {
  invoiceId: string;
  number: string;
  clientName?: string;
  caseFileNumber?: string;
  expected: number;
  captured: number;
  overpaidBy: number;
}

interface OverpaymentSummary {
  count: number;
  totalOverpaid: number;
  items: OverpaymentItem[];
}

interface FinanceReportingData {
  metrics: FinanceMetrics;
  recentBatches: RecentBatch[];
  overpayments: OverpaymentSummary | null;
  operations: {
    activeCases: number;
    creditAccounts: number;
  };
  userPermissions: {
    canViewOverpayments: boolean;
    role: string;
  };
}

export default function FinanceReportingDashboard() {
  const { data: session } = useSession();
  const [data, setData] = useState<FinanceReportingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'invoicing' | 'revenue' | 'operations'>('overview');

  useEffect(() => {
    loadFinanceData();
  }, []);

  async function loadFinanceData() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reporting/finance');
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access denied: You do not have permission to view Finance reporting.');
        }
        throw new Error('Failed to load financial reporting data');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error('Finance reporting load error:', err);
      setError(err.message || 'An error occurred while loading financial data');
    } finally {
      setIsLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status?.toUpperCase()) {
      case 'PROCESSING':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">Processing</span>;
      case 'MATCHED':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">Matched</span>;
      case 'RECONCILED':
      case 'COMPLETED':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Reconciled</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-600 border border-slate-500/20">{status}</span>;
    }
  }

  const userFirstName = session?.user?.firstName || session?.user?.name?.split(' ')[0] || 'User';

  return (
    <div className="space-y-8">
      {/* Top Header Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <svg className="w-48 h-48 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Finance Module
              </span>
              <span className="text-xs text-slate-400 font-mono">South African Rand (ZAR)</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight mt-2 bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              Finance Reporting Dashboard
            </h1>
            <p className="text-slate-400 mt-1 text-sm max-w-2xl">
              Welcome back, {userFirstName}. Here is your financial performance summary, payment batch tracking, and revenue overview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadFinanceData}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-all flex items-center gap-2"
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <a
              href="http://localhost:3004/payments/record"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              + Record Payment
            </a>
            <a
              href="http://localhost:3004/batches"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import Batch
            </a>
          </div>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center">
          <p className="font-semibold">{error}</p>
          <button
            onClick={loadFinanceData}
            className="mt-3 px-4 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-cyan-500 border-t-transparent"></div>
          <p className="mt-3 text-slate-600 font-medium text-sm">Loading live financial metrics...</p>
        </div>
      ) : data ? (
        <>
          {/* Key Financial Metrics Cards in ZAR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Collected (This Month) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Collected (This Month)</span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 mt-3 font-mono">
                {formatZAR(data.metrics.totalCollected)}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded font-bold ${data.metrics.percentChange >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  {data.metrics.percentChange >= 0 ? '↑' : '↓'} {Math.abs(data.metrics.percentChange)}%
                </span>
                <span className="text-slate-500">vs last month ({formatZAR(data.metrics.lastMonthCollected)})</span>
              </div>
            </div>

            {/* Pending Batches */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Pending Batches</span>
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
              <div className="text-3xl font-extrabold text-amber-600 mt-3 font-mono">
                {data.metrics.pendingBatches}
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Payment batches awaiting reconciliation
              </p>
            </div>

            {/* Unallocated Payments */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Unallocated Payments</span>
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <div className="text-3xl font-extrabold text-rose-600 mt-3 font-mono">
                {data.metrics.unallocatedCount}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-mono">{formatZAR(data.metrics.unallocatedTotalAmount)}</span>
                <span className={`font-semibold ${data.metrics.unallocatedCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {data.metrics.unallocatedCount > 0 ? 'Needs allocation' : 'All clear ✓'}
                </span>
              </div>
            </div>

            {/* Outstanding Fees */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Outstanding Fees</span>
                <div className="p-2 bg-cyan-50 text-cyan-600 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 mt-3 font-mono">
                {formatZAR(data.metrics.totalOutstandingFees)}
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Invoiced balance pending collection
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-slate-200 flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-4 text-sm font-medium transition-all ${
                activeTab === 'overview'
                  ? 'border-b-2 border-cyan-500 text-cyan-600 font-bold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Overview & Batches
            </button>
            <button
              onClick={() => setActiveTab('invoicing')}
              className={`pb-4 text-sm font-medium transition-all ${
                activeTab === 'invoicing'
                  ? 'border-b-2 border-cyan-500 text-cyan-600 font-bold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Quotes & Invoices
            </button>
            <button
              onClick={() => setActiveTab('revenue')}
              className={`pb-4 text-sm font-medium transition-all ${
                activeTab === 'revenue'
                  ? 'border-b-2 border-cyan-500 text-cyan-600 font-bold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Revenue Analysis
            </button>
            <button
              onClick={() => setActiveTab('operations')}
              className={`pb-4 text-sm font-medium transition-all ${
                activeTab === 'operations'
                  ? 'border-b-2 border-cyan-500 text-cyan-600 font-bold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Cross-Module Operations
            </button>
          </div>

          {/* Tab 1: Overview & Batches */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Client Overpayments (Admin / Finance view) */}
              {data.userPermissions.canViewOverpayments && data.overpayments && (
                <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
                  <div className="px-6 py-4 bg-amber-50/50 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <h2 className="text-base font-bold text-amber-950 flex items-center gap-2">
                        <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Client Overpayments Summary
                      </h2>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-200 text-amber-900">
                        Admin Access
                      </span>
                    </div>
                    {data.overpayments.count > 0 && (
                      <p className="text-xs text-amber-900">
                        {data.overpayments.count} client{data.overpayments.count !== 1 ? 's have' : ' has'} overpaid —{' '}
                        <span className="font-bold font-mono text-amber-700">{formatZAR(data.overpayments.totalOverpaid)}</span> in total
                      </p>
                    )}
                  </div>

                  {data.overpayments.count === 0 ? (
                    <div className="p-6 text-sm text-slate-500 text-center">
                      No overpayments detected — every settled quote and invoice matches what was collected. ✓
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                          <tr>
                            <th className="px-6 py-3">Document</th>
                            <th className="px-6 py-3">Client Name</th>
                            <th className="px-6 py-3">Case File #</th>
                            <th className="px-6 py-3 text-right">Expected (ZAR)</th>
                            <th className="px-6 py-3 text-right">Collected (ZAR)</th>
                            <th className="px-6 py-3 text-right">Overpaid By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.overpayments.items.map((item) => (
                            <tr key={item.invoiceId} className="hover:bg-amber-50/30 transition-colors">
                              <td className="px-6 py-3 font-mono font-medium text-slate-900">{item.number}</td>
                              <td className="px-6 py-3 text-slate-700">{item.clientName || '—'}</td>
                              <td className="px-6 py-3 text-emerald-700 font-mono">{item.caseFileNumber ? `#${item.caseFileNumber}` : '—'}</td>
                              <td className="px-6 py-3 text-right text-slate-600 font-mono">{formatZAR(item.expected)}</td>
                              <td className="px-6 py-3 text-right text-slate-900 font-mono">{formatZAR(item.captured)}</td>
                              <td className="px-6 py-3 text-right text-amber-700 font-bold font-mono">{formatZAR(item.overpaidBy)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Recent Payment Batches */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">Recent Payment Batches</h2>
                  <a
                    href="http://localhost:3004/batches"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-cyan-600 hover:text-cyan-700 font-semibold flex items-center gap-1"
                  >
                    View All in Finance App →
                  </a>
                </div>

                {data.recentBatches.length === 0 ? (
                  <div className="p-10 text-center text-slate-500 text-sm">
                    No payment batches uploaded yet.{' '}
                    <a href="http://localhost:3004/batches/upload" target="_blank" rel="noreferrer" className="text-emerald-600 underline">
                      Import your first batch
                    </a>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3">File Name</th>
                          <th className="px-6 py-3">Uploaded</th>
                          <th className="px-6 py-3">Uploaded By</th>
                          <th className="px-6 py-3 text-right">Total Amount (ZAR)</th>
                          <th className="px-6 py-3">Match Rate</th>
                          <th className="px-6 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.recentBatches.map((batch) => {
                          const totalItems = batch.matchCount + batch.unmatchCount;
                          const matchRate = totalItems > 0 ? Math.round((batch.matchCount / totalItems) * 100) : 0;
                          return (
                            <tr key={batch.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-900 truncate max-w-xs">{batch.fileName}</td>
                              <td className="px-6 py-4 text-slate-500 font-mono">
                                {new Date(batch.uploadedAt).toLocaleDateString('en-ZA')}
                              </td>
                              <td className="px-6 py-4 text-slate-600">{batch.uploadedBy}</td>
                              <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                                {formatZAR(batch.totalAmount)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                    <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${matchRate}%` }} />
                                  </div>
                                  <span className="font-mono text-slate-600">{matchRate}%</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">{getStatusBadge(batch.status)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Finance Quick Action & Operation Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <a
                  href="http://localhost:3004/batches/upload"
                  target="_blank"
                  rel="noreferrer"
                  className="group p-6 bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl border border-indigo-800 shadow-md hover:shadow-xl transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/20 rounded-xl group-hover:scale-105 transition-transform">
                      <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base font-bold group-hover:text-indigo-300 transition-colors">Import Payment Batch</h3>
                      <p className="text-xs text-slate-300 mt-1">Upload partner Excel files for automated ID-number matching</p>
                    </div>
                  </div>
                </a>

                <a
                  href="http://localhost:3004/payments/record"
                  target="_blank"
                  rel="noreferrer"
                  className="group p-6 bg-gradient-to-br from-emerald-900 to-slate-900 text-white rounded-2xl border border-emerald-800 shadow-md hover:shadow-xl transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:scale-105 transition-transform">
                      <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base font-bold group-hover:text-emerald-300 transition-colors">Record Manual Payment</h3>
                      <p className="text-xs text-slate-300 mt-1">Log single EFT, cash, or debit order payments for clients</p>
                    </div>
                  </div>
                </a>
              </div>
            </div>
          )}

          {/* Tab 2: Quotes & Invoices */}
          {activeTab === 'invoicing' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Total Quotes Issued</div>
                  <div className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{formatNumber(data.metrics.quotesCount)}</div>
                  <p className="text-xs text-slate-500 mt-2">
                    Accepted: <span className="font-bold text-emerald-600">{formatNumber(data.metrics.acceptedQuotesCount)}</span>
                  </p>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Total Invoiced Amount</div>
                  <div className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{formatZAR(data.metrics.totalInvoicedAmount)}</div>
                  <p className="text-xs text-slate-500 mt-2">
                    Total Invoices: <span className="font-bold">{formatNumber(data.metrics.invoicesCount)}</span>
                  </p>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Total Collected on Invoices</div>
                  <div className="text-3xl font-extrabold text-emerald-600 mt-2 font-mono">{formatZAR(data.metrics.totalCollectedInvoices)}</div>
                  <p className="text-xs text-slate-500 mt-2">
                    Outstanding: <span className="font-bold text-rose-600">{formatZAR(data.metrics.totalOutstandingFees)}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Revenue Analysis */}
          {activeTab === 'revenue' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Revenue & Fee Analysis</h3>
              <p className="text-sm text-slate-600">
                Zenowethu financial collections summary and fee category breakdown:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Monthly Collections</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">{formatZAR(data.metrics.totalCollected)}</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Unallocated Collections</div>
                  <div className="text-2xl font-bold text-rose-600 mt-1 font-mono">{formatZAR(data.metrics.unallocatedTotalAmount)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Cross-Module Operations */}
          {activeTab === 'operations' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase">Active Cases</div>
                <div className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{formatNumber(data.operations.activeCases)}</div>
                <p className="text-xs text-slate-500 mt-2">Consumer debt review cases</p>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase">Credit Accounts</div>
                <div className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{formatNumber(data.operations.creditAccounts)}</div>
                <p className="text-xs text-slate-500 mt-2">Tracked creditor accounts</p>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
