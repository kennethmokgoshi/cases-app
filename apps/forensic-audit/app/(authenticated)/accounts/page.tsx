import Link from 'next/link'
import { prisma } from '@zenowethu/database'

export const metadata = {
  title: 'Accounts Dashboard | Zenowethu' }

export const dynamic = 'force-dynamic'

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

const BATCH_STATUS_COLORS: Record<string, string> = {
  PROCESSING: 'bg-yellow-500/20 text-yellow-400',
  POSTED:     'bg-emerald-500/20 text-emerald-400',
  FAILED:     'bg-red-500/20 text-red-400' }

async function getStats() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [collected, pendingBatches, unallocated, recentBatches] = await Promise.all([
    prisma.payment.aggregate({
      where: { date: { gte: startOfMonth } },
      _sum: { amount: true } }),
    prisma.paymentBatch.count({ where: { status: 'PROCESSING' } }),
    prisma.payment.count({ where: { clientId: null } }),
    prisma.paymentBatch.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: 10,
      include: {
        uploadedBy: { select: { firstName: true, lastName: true } } } }),
  ])

  return {
    totalCollected: Number(collected._sum.amount ?? 0),
    pendingBatches,
    unallocatedCount: unallocated,
    recentBatches }
}

export default async function AccountsDashboard() {
  const stats = await getStats()

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Accounts Dashboard
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage partner payments, reconciliations, and financial reporting
          </p>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-24 h-24 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Collected (This Month)</h3>
          <p className="text-4xl font-bold text-white mt-2">{formatZAR(stats.totalCollected)}</p>
          <div className="mt-4 text-xs text-emerald-400 flex items-center gap-1">
            <span className="bg-emerald-400/10 px-1.5 py-0.5 rounded">Live</span>
            <span className="text-gray-500">from payment records</span>
          </div>
        </div>

        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-24 h-24 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Pending Batches</h3>
          <p className="text-4xl font-bold text-white mt-2">{stats.pendingBatches}</p>
          <p className="text-xs text-gray-500 mt-4">Files waiting for reconciliation</p>
        </div>

        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-24 h-24 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Unallocated Payments</h3>
          <p className="text-4xl font-bold text-white mt-2">{stats.unallocatedCount}</p>
          <p className="text-xs text-gray-500 mt-4">Payments with unknown client ID</p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/accounts/import"
          className="group block p-8 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 rounded-2xl border border-indigo-500/20 hover:border-indigo-400/50 hover:from-indigo-900/60 transition-all shadow-lg hover:shadow-indigo-900/20">
          <div className="flex items-center gap-6">
            <div className="bg-indigo-500/20 p-4 rounded-xl group-hover:bg-indigo-500/30 transition-colors shadow-inner shadow-indigo-500/10">
              <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white group-hover:text-indigo-200 transition-colors">Import Payment Batch</h3>
              <p className="text-sm text-gray-400 mt-2 font-light">Upload Excel/PDF files from partners (e.g. Zeno Invoice.xlsx)</p>
            </div>
            <div className="ml-auto opacity-0 group-hover:opacity-100 transform translate-x-3 group-hover:translate-x-0 transition-all duration-300">
              <svg className="w-6 h-6 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        </Link>

        <button className="group block w-full text-left p-8 bg-gradient-to-br from-teal-900/40 to-emerald-900/40 rounded-2xl border border-emerald-500/20 hover:border-emerald-400/50 hover:from-teal-900/60 transition-all shadow-lg hover:shadow-emerald-900/20">
          <div className="flex items-center gap-6">
            <div className="bg-emerald-500/20 p-4 rounded-xl group-hover:bg-emerald-500/30 transition-colors shadow-inner shadow-emerald-500/10">
              <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white group-hover:text-emerald-200 transition-colors">Record Manual Payment</h3>
              <p className="text-sm text-gray-400 mt-2 font-light">Log a single cash or manual EFT payment for a client</p>
            </div>
            <div className="ml-auto opacity-0 group-hover:opacity-100 transform translate-x-3 group-hover:translate-x-0 transition-all duration-300">
              <svg className="w-6 h-6 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        </button>
      </div>

      {/* Recent Batches Table */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Payment Batches</h2>
        </div>
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
          {stats.recentBatches.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">
              No payment batches found.{' '}
              <Link href="/accounts/import" className="text-emerald-400 hover:underline">Import your first batch</Link>
            </div>
          ) : (
            <table className="w-full text-left text-sm text-gray-400">
              <thead className="bg-white/5 uppercase tracking-wider text-xs font-semibold text-gray-300">
                <tr>
                  <th className="px-6 py-4">Batch Name</th>
                  <th className="px-6 py-4">Uploaded By</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Total Amount</th>
                  <th className="px-6 py-4">Match / Unmatch</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stats.recentBatches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-white font-medium">{batch.fileName}</td>
                    <td className="px-6 py-4 text-gray-400">
                      {batch.uploadedBy
                        ? `${batch.uploadedBy.firstName ?? ''} ${batch.uploadedBy.lastName ?? ''}`.trim()
                        : '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-400">
                      {new Date(batch.uploadedAt).toLocaleDateString('en-ZA')}
                    </td>
                    <td className="px-6 py-4 text-white">{formatZAR(Number(batch.totalAmount))}</td>
                    <td className="px-6 py-4">
                      <span className="text-emerald-400">{batch.matchCount}</span>
                      <span className="text-gray-600 mx-1">/</span>
                      <span className="text-red-400">{batch.unmatchCount}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${BATCH_STATUS_COLORS[batch.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/accounts/batches/${batch.id}`} className="text-emerald-400 hover:text-emerald-300 text-xs">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
