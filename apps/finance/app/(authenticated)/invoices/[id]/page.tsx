import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SendInvoiceModal from './SendInvoiceModal'
import MarkPaidButton from './MarkPaidButton'

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  SENT:      'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  PAID:      'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  OVERDUE:   'bg-red-500/20 text-red-400 border border-red-500/30',
  CANCELLED: 'bg-gray-500/10 text-gray-500 border border-gray-500/20' }

function formatZAR(n: number | string) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(Number(n))
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d))
}

type LineItem = { description: string; quantity: number; unitPrice: number }

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return null

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      client:    { select: { firstName: true, lastName: true, email: true, phone: true, idNumber: true } },
      case:      { select: { fileNumber: true, acquisitionType: true } },
      project:   { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } } } })

  if (!invoice) notFound()

  const lineItems = (invoice.lineItems ?? []) as LineItem[]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/invoices" className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white font-mono">{invoice.invoiceNumber}</h1>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[invoice.status] ?? STATUS_COLORS.DRAFT}`}>
                {invoice.status.charAt(0) + invoice.status.slice(1).toLowerCase()}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Issued {formatDate(invoice.issuedAt)} · Due {formatDate(invoice.dueAt)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/finance/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors border border-white/10"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download PDF
          </a>

          {invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' && (
            <SendInvoiceModal
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              defaultEmail={invoice.client?.email ?? ''}
            />
          )}

          {invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
            <MarkPaidButton invoiceId={invoice.id} />
          )}
        </div>
      </div>

      {/* Two-column detail layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Invoice meta */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice Details</h2>
          {[
            ['Invoice Number', invoice.invoiceNumber],
            ['Issue Date',     formatDate(invoice.issuedAt)],
            ['Due Date',       formatDate(invoice.dueAt)],
            ['Reference',      invoice.reference ?? '—'],
            ['Created By',     invoice.createdBy ? `${invoice.createdBy.firstName} ${invoice.createdBy.lastName}` : '—'],
            ...(invoice.sentTo ? [['Sent To', invoice.sentTo], ['Sent At', invoice.sentAt ? formatDate(invoice.sentAt) : '—']] : []),
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="text-white font-medium text-right">{value}</span>
            </div>
          ))}
        </div>

        {/* Right: Client */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bill To</h2>
          {invoice.client ? (
            <div className="space-y-2 text-sm">
              <p className="text-white font-semibold text-base">{invoice.client.firstName} {invoice.client.lastName}</p>
              {invoice.client.idNumber && <p className="text-gray-500">ID: {invoice.client.idNumber}</p>}
              {invoice.client.email    && <p className="text-gray-400">{invoice.client.email}</p>}
              {invoice.client.phone    && <p className="text-gray-400">{invoice.client.phone}</p>}
            </div>
          ) : (
            <p className="text-gray-600 text-sm italic">No client linked</p>
          )}

          {invoice.case && (
            <div className="pt-3 border-t border-white/5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Linked Case</p>
              <p className="text-sm text-emerald-400 font-mono">#{invoice.case.fileNumber}</p>
            </div>
          )}

          {invoice.project && (
            <div className="pt-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Project</p>
              <p className="text-sm text-gray-300">{invoice.project.name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Line items */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Description</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Unit Price</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {lineItems.map((item, i) => (
                <tr key={i}>
                  <td className="px-5 py-3 text-gray-300">{item.description}</td>
                  <td className="px-5 py-3 text-right text-gray-400">{item.quantity}</td>
                  <td className="px-5 py-3 text-right text-gray-400">{formatZAR(item.unitPrice)}</td>
                  <td className="px-5 py-3 text-right text-white font-medium">{formatZAR(item.quantity * item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-white/5 px-5 py-4">
          <div className="max-w-xs ml-auto space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Subtotal</span>
              <span>{formatZAR(invoice.subtotal.toNumber())}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>VAT ({Math.round(Number(invoice.vatRate) * 100)}%)</span>
              <span>{formatZAR(invoice.vatAmount.toNumber())}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-white border-t border-white/10 pt-2">
              <span>Total</span>
              <span className="text-emerald-400">{formatZAR(invoice.total.toNumber())}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</h2>
          <p className="text-sm text-gray-400 whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}
    </div>
  )
}

