import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'

export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SendInvoiceModal from './SendInvoiceModal'
import MarkPaidButton from './MarkPaidButton'
import QuoteActions from './QuoteActions'
import EditQuoteModal from './EditQuoteModal'

const STATUS_COLORS: Record<string, string> = {
  DRAFT:          'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  SENT:           'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  PAID:           'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  PARTIALLY_PAID: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  OVERDUE:        'bg-red-500/20 text-red-400 border border-red-500/30',
  CANCELLED:      'bg-gray-500/10 text-gray-500 border border-gray-500/20',
  ACCEPTED:       'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  REJECTED:       'bg-red-500/20 text-red-400 border border-red-500/30',
  CONVERTED:      'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
}

function formatZAR(n: number | string) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(Number(n))
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d))
}

type LineItem = {
  description?: string
  creditor?: string
  serviceKey?: string
  serviceLabel?: string
  balance?: number
  quantity: number
  unitPrice: number
  discount?: number
}

function lineItemLabel(item: LineItem): string {
  // Prefer the description saved from the modal — it already contains the formatted text
  if (item.description) return item.description
  // Fallback: auto-format using balance when available
  if (item.creditor && item.balance != null) {
    const bal = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(item.balance)
    return `Remove ${item.creditor} that has a balance of '${bal}' from all Major Credit bureaus`
  }
  if (item.creditor && item.serviceLabel) return `${item.creditor} — ${item.serviceLabel}`
  if (item.creditor) return item.creditor
  return ''
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return null

  const isAdmin = session.user.isAdmin === true
  const isExecutive = session.user.isExecutive === true

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client:      { select: { firstName: true, lastName: true, email: true, phone: true, idNumber: true } },
      case:        { select: { fileNumber: true, acquisitionType: true } },
      project:     { select: { id: true, name: true } },
      createdBy:   { select: { firstName: true, lastName: true } },
      bankAccount: { select: { id: true, bankName: true, accountName: true, accountNumber: true, branchCode: true, accountType: true } },
      decidedBy:   { select: { firstName: true, lastName: true } },
      convertedToInvoice: { select: { id: true, invoiceNumber: true } },
    },
  })

  if (!invoice) notFound()

  const lineItems = (invoice.lineItems ?? []) as LineItem[]
  const hasBankingDetails = !!invoice.bankAccountId
  const isQuote = invoice.type === 'QUOTE'
  const docLabel = isQuote ? 'Quotation' : 'Invoice'
  const canEditQuote = isQuote && (isAdmin || isExecutive || invoice.status === 'DRAFT') && invoice.status !== 'CONVERTED' && invoice.status !== 'CANCELLED' && invoice.status !== 'PAID'

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
                {invoice.status.charAt(0) + invoice.status.slice(1).toLowerCase().replace(/_/g, ' ')}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                {docLabel}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Issued {formatDate(invoice.issuedAt)} · {isQuote ? 'Valid until' : 'Due'} {formatDate(invoice.dueAt)}
            </p>
          </div>
        </div>

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

          {canEditQuote && (
            <EditQuoteModal
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              initialLineItems={lineItems}
              initialBankAccountId={invoice.bankAccountId}
              vatRate={Number(invoice.vatRate)}
            />
          )}

          {invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' && invoice.status !== 'CONVERTED' && invoice.status !== 'REJECTED' && (
            <SendInvoiceModal
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              defaultEmail={invoice.client?.email ?? ''}
              hasBankingDetails={hasBankingDetails}
              isAdmin={isAdmin}
            />
          )}

          {isQuote ? (
            <QuoteActions quoteId={invoice.id} quoteNumber={invoice.invoiceNumber} status={invoice.status} />
          ) : (
            invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
              <MarkPaidButton invoiceId={invoice.id} />
            )
          )}
        </div>
      </div>

      {/* Quote decision / conversion banner */}
      {isQuote && (invoice.acceptedAt || invoice.rejectedAt || invoice.convertedToInvoice) && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${
          invoice.rejectedAt
            ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>
          {invoice.acceptedAt && (
            <span>Accepted by the consumer on {formatDate(invoice.acceptedAt)}</span>
          )}
          {invoice.rejectedAt && (
            <span>Rejected by the consumer on {formatDate(invoice.rejectedAt)}</span>
          )}
          {invoice.decidedBy && (
            <span className="text-gray-400"> — recorded by {invoice.decidedBy.firstName} {invoice.decidedBy.lastName}</span>
          )}
          {invoice.decisionNote && <span className="block text-gray-400 mt-1">{invoice.decisionNote}</span>}
          {invoice.convertedToInvoice && (
            <span className="block mt-1">
              Converted to invoice{' '}
              <Link href={`/invoices/${invoice.convertedToInvoice.id}`} className="font-mono underline">
                {invoice.convertedToInvoice.invoiceNumber}
              </Link>
            </span>
          )}
        </div>
      )}

      {/* Non-admin warning when no banking details */}
      {!hasBankingDetails && !isAdmin && invoice.status === 'DRAFT' && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg px-4 py-3 text-sm">
          No banking details on this {docLabel.toLowerCase()}. An admin must send it, or edit to add a bank account.
        </div>
      )}

      {/* Two-column detail layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Invoice meta */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{docLabel} Details</h2>
          {[
            [isQuote ? 'Quote Number' : 'Invoice Number', invoice.invoiceNumber],
            ['Issue Date',     formatDate(invoice.issuedAt)],
            [isQuote ? 'Valid Until' : 'Due Date', formatDate(invoice.dueAt)],
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

        {/* Client */}
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

      {/* Banking details */}
      {invoice.bankAccount ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Banking Details</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-1">Bank</p>
              <p className="text-white font-medium">{invoice.bankAccount.bankName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Account Name</p>
              <p className="text-white font-medium">{invoice.bankAccount.accountName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Account Number</p>
              <p className="text-white font-mono">{invoice.bankAccount.accountNumber}</p>
            </div>
            {invoice.bankAccount.branchCode && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Branch Code</p>
                <p className="text-white font-mono">{invoice.bankAccount.branchCode}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-amber-500/20 p-4 text-sm text-amber-400/70">
          No banking details — PDF will use company default banking information.
        </div>
      )}

      {/* Line items */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Service / Description</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Unit Price</th>
                <th className="px-5 py-3 text-right">Discount</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {lineItems.map((item, i) => (
                <tr key={i}>
                  <td className="px-5 py-3 text-gray-300">{lineItemLabel(item)}</td>
                  <td className="px-5 py-3 text-right text-gray-400">{item.quantity}</td>
                  <td className="px-5 py-3 text-right text-gray-400">{formatZAR(item.unitPrice)}</td>
                  <td className="px-5 py-3 text-right text-emerald-400">{item.discount ? `- ${formatZAR(item.discount)}` : '—'}</td>
                  <td className="px-5 py-3 text-right text-white font-medium">{formatZAR((item.quantity * item.unitPrice) - (item.discount || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-white/5 px-5 py-4">
          <div className="max-w-xs ml-auto space-y-2 text-sm">
            {lineItems.some(l => l.discount) && (
              <div className="flex justify-between text-emerald-400 font-medium">
                <span>Total Savings</span>
                <span>- {formatZAR(lineItems.reduce((s, l) => s + (l.discount || 0), 0))}</span>
              </div>
            )}
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
