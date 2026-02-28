import Link from 'next/link';
import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

export const metadata = { title: 'Finance Dashboard | Zenowethu' };

async function getStats() {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [thisMonthAgg, lastMonthAgg, pendingBatches, unallocated, recentBatches] = await Promise.all([
      prisma.payment.aggregate({
        where: { date: { gte: startOfMonth }, status: 'COMPLETED' },
        _sum: { amount: true } }),
      prisma.payment.aggregate({
        where: { date: { gte: startOfLastMonth, lte: endOfLastMonth }, status: 'COMPLETED' },
        _sum: { amount: true } }),
      prisma.paymentBatch.count({ where: { status: { in: ['PROCESSING', 'MATCHED'] } } }),
      prisma.payment.count({ where: { clientId: null, caseId: null } }),
      prisma.paymentBatch.findMany({
        orderBy: { uploadedAt: 'desc' },
        take: 5,
        include: { uploadedBy: { select: { firstName: true, lastName: true } } } }),
    ]);

    const thisMonth = Number(thisMonthAgg._sum.amount ?? 0);
    const lastMonth = Number(lastMonthAgg._sum.amount ?? 0);
    const percentChange = lastMonth === 0
      ? (thisMonth > 0 ? 100 : 0)
      : Math.round(((thisMonth - lastMonth) / lastMonth) * 100);

    return { totalCollected: thisMonth, percentChange, pendingBatches, unallocated, recentBatches };
  } catch {
    return { totalCollected: 0, percentChange: 0, pendingBatches: 0, unallocated: 0, recentBatches: [] };
  }
}

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PROCESSING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    MATCHED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    RECONCILED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
      {status}
    </span>
  );
}

export default async function FinanceDashboard() {
  const session = await auth();
  const { totalCollected, percentChange, pendingBatches, unallocated, recentBatches } = await getStats();

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Finance Dashboard
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Welcome back, {session?.user?.name?.split(' ')[0]}. Here's your financial overview.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/payments/record"
            className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors"
          >
            + Record Payment
          </Link>
          <Link
            href="/batches"
            className="px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-400 rounded-lg text-sm font-medium transition-colors"
          >
            Import Batch
          </Link>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Collected this month */}
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-24 h-24 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Collected (This Month)</p>
          <p className="text-3xl font-bold text-white mt-2">{formatZAR(totalCollected)}</p>
          <div className="mt-3 text-xs flex items-center gap-1.5">
            <span className={`px-1.5 py-0.5 rounded font-semibold ${percentChange >= 0 ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'}`}>
              {percentChange >= 0 ? '↑' : '↓'} {Math.abs(percentChange)}%
            </span>
            <span className="text-gray-500">vs last month</span>
          </div>
        </div>

        {/* Pending Batches */}
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-24 h-24 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Pending Batches</p>
          <p className="text-3xl font-bold text-white mt-2">{pendingBatches}</p>
          <Link href="/batches" className="mt-3 text-xs text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1">
            View all batches →
          </Link>
        </div>

        {/* Unallocated Payments */}
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-24 h-24 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Unallocated Payments</p>
          <p className="text-3xl font-bold text-white mt-2">{unallocated}</p>
          <Link href="/payments?status=unallocated" className="mt-3 text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1">
            {unallocated > 0 ? 'Needs attention →' : 'All clear ✓'}
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Link href="/batches/upload" className="group block p-7 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 rounded-2xl border border-indigo-500/20 hover:border-indigo-400/50 hover:from-indigo-900/60 transition-all shadow-lg">
          <div className="flex items-center gap-5">
            <div className="bg-indigo-500/20 p-4 rounded-xl group-hover:bg-indigo-500/30 transition-colors">
              <svg className="w-9 h-9 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white group-hover:text-indigo-200 transition-colors">Import Payment Batch</h3>
              <p className="text-sm text-gray-400 mt-1">Upload Excel files from partners — auto-matched by ID number</p>
            </div>
            <div className="ml-auto opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all">
              <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        </Link>

        <Link href="/payments/record" className="group block p-7 bg-gradient-to-br from-teal-900/40 to-emerald-900/40 rounded-2xl border border-emerald-500/20 hover:border-emerald-400/50 hover:from-teal-900/60 transition-all shadow-lg">
          <div className="flex items-center gap-5">
            <div className="bg-emerald-500/20 p-4 rounded-xl group-hover:bg-emerald-500/30 transition-colors">
              <svg className="w-9 h-9 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white group-hover:text-emerald-200 transition-colors">Record Manual Payment</h3>
              <p className="text-sm text-gray-400 mt-1">Log a single EFT, cash, or debit order payment for a client</p>
            </div>
            <div className="ml-auto opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Batches */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Payment Batches</h2>
          <Link href="/batches" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">View all →</Link>
        </div>
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
          {recentBatches.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-500 text-sm">
              No payment batches yet.{' '}
              <Link href="/batches/upload" className="text-emerald-400 hover:underline">Import your first batch</Link>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">File Name</th>
                  <th className="px-6 py-3">Uploaded</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3">Match Rate</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentBatches.map((batch: any) => {
                  const matchRate = (batch.matchCount + batch.unmatchCount) > 0
                    ? Math.round((batch.matchCount / (batch.matchCount + batch.unmatchCount)) * 100)
                    : 0;
                  return (
                    <tr key={batch.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-white font-medium truncate max-w-[200px]">{batch.fileName}</td>
                      <td className="px-6 py-4 text-gray-400">
                        {new Date(batch.uploadedAt).toLocaleDateString('en-ZA')}
                      </td>
                      <td className="px-6 py-4 text-white">{formatZAR(Number(batch.totalAmount))}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-white/10 rounded-full h-1.5">
                            <div
                              className="bg-emerald-400 h-1.5 rounded-full"
                              style={{ width: `${matchRate}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{matchRate}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4"><StatusBadge status={batch.status} /></td>
                      <td className="px-6 py-4">
                        <Link href={`/batches/${batch.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs transition-colors">
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
