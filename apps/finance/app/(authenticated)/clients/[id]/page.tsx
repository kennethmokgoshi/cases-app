import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { summariseClientFinancials } from '../../../../lib/case-financials'

const STATUS_COLORS: Record<string, string> = {
  DRAFT:          'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  SENT:           'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  ACCEPTED:       'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  REJECTED:       'bg-red-500/20 text-red-400 border border-red-500/30',
  CONVERTED:      'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  PARTIALLY_PAID: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  PAID:           'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  OVERDUE:        'bg-red-500/20 text-red-400 border border-red-500/30',
  CANCELLED:      'bg-gray-500/10 text-gray-500 border border-gray-500/20' }

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', SENT: 'Sent', ACCEPTED: 'Accepted', REJECTED: 'Rejected',
  CONVERTED: 'Invoiced', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid',
  OVERDUE: 'Overdue', CANCELLED: 'Cancelled' }

function formatZAR(n: number | string) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(Number(n))
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d))
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.DRAFT}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export default async function ClientFinancialFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return null

  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, idNumber: true,
      email: true, phone: true,
      cases: { select: { id: true, fileNumber: true, status: true } },
    },
  })
  if (!client) notFound()

  // The full document history for this client — every quote ever sent
  // (including rejected ones) and every invoice, with payment allocations.
  const [documents, clientPayments] = await Promise.all([
    prisma.invoice.findMany({
      where:   { clientId: id },
      orderBy: { issuedAt: 'desc' },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        decidedBy: { select: { firstName: true, lastName: true } },
        convertedToInvoice: { select: { id: true, invoiceNumber: true } },
        payments:  {
          where:  { status: { not: 'CANCELLED' } },
          select: { amount: true } },
      },
    }),
    prisma.payment.findMany({
      where: { clientId: id, status: { not: 'CANCELLED' } },
      select: { amount: true, status: true },
    }),
  ])

  const quotes   = documents.filter(d => d.type === 'QUOTE')
  const invoices = documents.filter(d => d.type === 'INVOICE')

  const invoiceRows = invoices.map(inv => {
    const recorded = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
    const amountPaid = inv.status === 'PAID' && recorded === 0 ? Number(inv.total) : recorded
    const balanceDue = inv.status === 'PAID' ? 0 : Math.max(0, Number(inv.total) - amountPaid)
    return { ...inv, amountPaid, balanceDue }
  })

  const clientSummary = summariseClientFinancials({
    payments: clientPayments.map(p => ({ amount: Number(p.amount), status: p.status })),
    invoices: documents.map(d => ({
      total: Number(d.total),
      status: d.status,
      type: d.type,
      acceptedAt: d.acceptedAt,
      convertedToInvoiceId: d.convertedToInvoice?.id ?? null,
    })),
  })

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{client.firstName} {client.lastName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            ID {client.idNumber}
            {client.email && <> · {client.email}</>}
            {client.phone && <> · {client.phone}</>}
          </p>
          {client.cases.length > 0 && (
            <p className="text-xs text-gray-600 mt-1">
              Cases: {client.cases.map(c => `#${c.fileNumber}`).join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/clients/${client.id}/payments`}
            className="px-3 py-2 text-sm bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors border border-white/10"
          >
            Payment History
          </Link>
          <Link
            href="/invoices/new"
            className="px-3 py-2 text-sm bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg transition-colors"
          >
            + New Quote / Invoice
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Expected', value: formatZAR(clientSummary.totalExpected), color: 'text-white' },
          { label: 'Collected', value: formatZAR(clientSummary.totalCollected), color: 'text-emerald-400' },
          { label: 'Balance Due', value: formatZAR(clientSummary.balanceDue), color: clientSummary.balanceDue > 0 ? 'text-amber-400' : 'text-gray-400' },
          { label: 'Quotes Sent', value: String(quotes.length), color: 'text-white' },
        ].map(card => (
          <div key={card.label} className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{card.label}</p>
            <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Quotation history — all quotes ever sent, including rejected */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quotation History</h2>
          <p className="text-xs text-gray-600 mt-0.5">Every quote sent to this client, including rejected quotes</p>
        </div>
        {quotes.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-600 italic">No quotes have been sent to this client yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Quote #</th>
                  <th className="px-5 py-3 text-left">Created By</th>
                  <th className="px-5 py-3 text-left">Created</th>
                  <th className="px-5 py-3 text-left">Decision</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {quotes.map(q => (
                  <tr key={q.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3 font-mono text-gray-300 text-xs">{q.invoiceNumber}</td>
                    <td className="px-5 py-3 text-gray-400">
                      {q.createdBy ? `${q.createdBy.firstName} ${q.createdBy.lastName}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-400">{formatDate(q.issuedAt)}</td>
                    <td className="px-5 py-3 text-xs">
                      {q.acceptedAt && <span className="text-emerald-400">Accepted {formatDate(q.acceptedAt)}</span>}
                      {q.rejectedAt && <span className="text-red-400">Rejected {formatDate(q.rejectedAt)}</span>}
                      {!q.acceptedAt && !q.rejectedAt && <span className="text-gray-600">Awaiting decision</span>}
                      {q.decidedBy && (
                        <span className="block text-gray-500">by {q.decidedBy.firstName} {q.decidedBy.lastName}</span>
                      )}
                      {q.convertedToInvoice && (
                        <Link href={`/invoices/${q.convertedToInvoice.id}`} className="block text-cyan-400 hover:underline font-mono">
                          → {q.convertedToInvoice.invoiceNumber}
                        </Link>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-white">{formatZAR(Number(q.total))}</td>
                    <td className="px-5 py-3 text-center"><StatusBadge status={q.status} /></td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/invoices/${q.id}`} className="text-xs text-emerald-400 hover:underline">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoices */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoices</h2>
          <p className="text-xs text-gray-600 mt-0.5">What has been collected and what is still due</p>
        </div>
        {invoiceRows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-600 italic">No invoices for this client yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Invoice #</th>
                  <th className="px-5 py-3 text-left">Issued</th>
                  <th className="px-5 py-3 text-left">Due</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-right">Collected</th>
                  <th className="px-5 py-3 text-right">Balance Due</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoiceRows.map(inv => (
                  <tr key={inv.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3 font-mono text-gray-300 text-xs">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3 text-gray-400">{formatDate(inv.issuedAt)}</td>
                    <td className="px-5 py-3 text-gray-400">{formatDate(inv.dueAt)}</td>
                    <td className="px-5 py-3 text-right font-medium text-white">{formatZAR(Number(inv.total))}</td>
                    <td className="px-5 py-3 text-right text-emerald-400">{formatZAR(inv.amountPaid)}</td>
                    <td className={`px-5 py-3 text-right font-medium ${inv.balanceDue > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                      {formatZAR(inv.balanceDue)}
                    </td>
                    <td className="px-5 py-3 text-center"><StatusBadge status={inv.status} /></td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/invoices/${inv.id}`} className="text-xs text-emerald-400 hover:underline">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
