import Link from 'next/link'
import { prisma } from '@zenowethu/database'

export const metadata = { title: 'Accounts Dashboard | Zenowethu' }

async function getStats() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [pendingBatches, unallocatedCount, collectedThisMonth] = await Promise.all([
    prisma.paymentBatch.count({ where: { status: 'PROCESSING' } }),
    prisma.payment.count({ where: { clientId: null } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { date: { gte: startOfMonth }, clientId: { not: null } } }),
  ])

  return {
    totalCollected: Number(collectedThisMonth._sum.amount ?? 0),
    pendingBatches,
    unallocatedCount }
}

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

export default async function AccountsDashboard() {
  const stats = await getStats()

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Accounts Dashboard
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage payments, reconciliations, and financial reporting
          </p>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">
            Collected (This Month)
          </h3>
          <p className="text-3xl font-bold text-white mt-2">{formatZAR(stats.totalCollected)}</p>
          <p className="text-xs text-gray-500 mt-2">All matched payments</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">
            Pending Batches
          </h3>
          <p className="text-3xl font-bold text-white mt-2">{stats.pendingBatches}</p>
          <p className="text-xs text-gray-500 mt-2">Files awaiting reconciliation</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">
            Unallocated Payments
          </h3>
          <p className="text-3xl font-bold text-white mt-2">{stats.unallocatedCount}</p>
          <p className="text-xs text-gray-500 mt-2">
            {stats.unallocatedCount > 0 ? 'Require client matching' : 'All payments matched'}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/accounts/import"
          className="group block p-6 bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 hover:border-indigo-500/30 transition-all"
        >
          <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
            Import Payment Batch
          </h3>
          <p className="text-sm text-gray-500 mt-1">Upload Excel/PDF files from partners</p>
        </Link>
        <Link
          href="/payments/record"
          className="group block p-6 bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all"
        >
          <h3 className="font-semibold text-white group-hover:text-emerald-300 transition-colors">
            Record Manual Payment
          </h3>
          <p className="text-sm text-gray-500 mt-1">Log a single EFT or cash payment</p>
        </Link>
        <Link
          href="/payments"
          className="group block p-6 bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 hover:border-cyan-500/30 transition-all"
        >
          <h3 className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
            View All Payments
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {stats.unallocatedCount > 0
              ? `${stats.unallocatedCount} payments need allocation`
              : 'All payments allocated'}
          </p>
        </Link>
        <Link
          href="/reconciliation"
          className="group block p-6 bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 hover:border-yellow-500/30 transition-all"
        >
          <h3 className="font-semibold text-white group-hover:text-yellow-300 transition-colors">
            Reconciliation
          </h3>
          <p className="text-sm text-gray-500 mt-1">Review exceptions and unmatched items</p>
        </Link>
        <Link
          href="/invoices"
          className="group block p-6 bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 hover:border-purple-500/30 transition-all"
        >
          <h3 className="font-semibold text-white group-hover:text-purple-300 transition-colors">
            Invoices
          </h3>
          <p className="text-sm text-gray-500 mt-1">Create and manage client invoices</p>
        </Link>
        <Link
          href="/audit-trail"
          className="group block p-6 bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 hover:border-gray-400/30 transition-all"
        >
          <h3 className="font-semibold text-white group-hover:text-gray-300 transition-colors">
            Audit Trail
          </h3>
          <p className="text-sm text-gray-500 mt-1">View all system activity logs</p>
        </Link>
      </div>
    </div>
  )
}
