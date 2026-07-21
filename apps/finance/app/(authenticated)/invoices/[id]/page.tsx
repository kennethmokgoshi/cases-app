import { auth } from '@zenowethu/shared-lib'
import { getCaseQuoteCapture } from '@zenowethu/shared-lib/src/finance/overpayments'
import { prisma } from '@zenowethu/database'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SendInvoiceModal from './SendInvoiceModal'
import RecordPaymentModal from './RecordPaymentModal'
import QuoteActions from './QuoteActions'
import EditQuoteModal from './EditQuoteModal'
import DeleteDocumentButton from '@/components/finance/DeleteDocumentButton'

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

type LineItem = { description: string; quantity: number; unitPrice: number }

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return null

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client:    { select: { id: true, firstName: true, lastName: true, email: true, phone: true, idNumber: true } },
      case:      { select: { fileNumber: true, acquisitionType: true } },
      project:   { select: { id: true, name: true } },
      bankAccount: true,
      createdBy: { select: { firstName: true, lastName: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
      convertedToInvoice: { select: { id: true, invoiceNumber: true } },
      convertedFromQuote: { select: { id: true, invoiceNumber: true } },
      payments: {
        where:   { status: { not: 'CANCELLED' } },
        orderBy: { date: 'desc' },
        include: { recordedBy: { select: { firstName: true, lastName: true } } } } } })

  if (!invoice) notFound()

  const lineItems = (invoice.lineItems ?? []) as LineItem[]
  const isQuote   = invoice.type === 'QUOTE'
  const recorded  = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)
  // Legacy invoices marked PAID before payment allocation existed
  const amountPaid = invoice.status === 'PAID' && recorded === 0 ? Number(invoice.total) : recorded
  const balanceDue = invoice.status === 'PAID' ? 0 : Math.max(0, Number(invoice.total) - amountPaid)

  // Accepted quotes measure all payments captured on the case against the
  // quoted amount — the same rule that settles the case (SETTLED_SUCCESS).
  const quoteCapture = isQuote && invoice.caseId && (invoice.acceptedAt || invoice.status === 'ACCEPTED')
    ? await getCaseQuoteCapture(invoice.caseId)
    : null

  const invoiceSettled = !isQuote && Number(invoice.total) > 0 && amountPaid >= Number(invoice.total)
  const settled    = isQuote ? (quoteCapture?.settled ?? false) : invoiceSettled
  const overpaidBy = isQuote
    ? (quoteCapture?.overpaidBy ?? 0)
    : Math.max(0, amountPaid - Number(invoice.total))

  const isAdmin = session.user.isAdmin === true
  const isExecutive = session.user.isExecutive === true
  const canEditQuote = isQuote && (isAdmin || isExecutive || invoice.status === 'DRAFT') && invoice.status !== 'CONVERTED' && invoice.status !== 'CANCELLED' && invoice.status !== 'PAID'

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb / back navigation */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg transition-colors font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Finance Dashboard
        </Link>
        <span className="text-gray-600">/</span>
        <Link
          href={isQuote ? '/quotes' : '/invoices'}
          className="text-gray-400 hover:text-white transition-colors px-2 py-1"
        >
          {isQuote ? 'Quotes' : 'Invoices'}
        </Link>
        <span className="text-gray-600">/</span>
        <span className="text-gray-500 font-mono text-xs">{invoice.invoiceNumber}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white font-mono">{invoice.invoiceNumber}</h1>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[invoice.status] ?? STATUS_COLORS.DRAFT}`}>
                {STATUS_LABELS[invoice.status] ?? invoice.status}
              </span>
              {settled && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Settled{overpaidBy > 0 ? ' · Overpaid' : ''}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Issued {formatDate(invoice.issuedAt)} · {isQuote ? 'Valid until' : 'Due'} {formatDate(invoice.dueAt)}
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
            />
          )}

          {isQuote ? (
            <QuoteActions quoteId={invoice.id} quoteNumber={invoice.invoiceNumber} status={invoice.status} />
          ) : (
            invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
              <RecordPaymentModal
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoiceNumber}
                balanceDue={balanceDue}
              />
            )
          )}

          {/* Delete — quotes (any staff) and invoices (admin/executive only).
              Hidden once a quote has been converted into an invoice. */}
          {!invoice.convertedToInvoice && (
            <DeleteDocumentButton
              documentId={invoice.id}
              documentNumber={invoice.invoiceNumber}
              type={isQuote ? 'QUOTE' : 'INVOICE'}
              redirectTo={isQuote ? '/quotes' : '/invoices'}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20 disabled:opacity-50"
            />
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
            <span>Accepted by the client on {formatDate(invoice.acceptedAt)}</span>
          )}
          {invoice.rejectedAt && (
            <span>Rejected by the client on {formatDate(invoice.rejectedAt)}</span>
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
      {!isQuote && invoice.convertedFromQuote && (
        <div className="rounded-lg px-4 py-3 text-sm border bg-cyan-500/10 border-cyan-500/20 text-cyan-400">
          Created from accepted quote{' '}
          <Link href={`/invoices/${invoice.convertedFromQuote.id}`} className="font-mono underline">
            {invoice.convertedFromQuote.invoiceNumber}
          </Link>
        </div>
      )}

      {/* Settled / overpaid banner */}
      {settled && (
        <div className="rounded-lg px-4 py-3 text-sm border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
          <span className="font-semibold">Settled</span> — captured payments of{' '}
          {formatZAR(isQuote ? quoteCapture!.captured : amountPaid)} cover this{' '}
          {isQuote ? 'quotation' : 'invoice'} in full.
          {overpaidBy > 0 && (
            <span className="block mt-1 text-amber-400">
              The client has overpaid by <span className="font-bold">{formatZAR(overpaidBy)}</span>.
            </span>
          )}
        </div>
      )}

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
              <Link href={`/clients/${invoice.client.id}`} className="text-white font-semibold text-base hover:text-emerald-400 hover:underline inline-block">
                {invoice.client.firstName} {invoice.client.lastName}
              </Link>
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

      {/* Banking Details (if any) */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Banking Details</h2>
        {invoice.bankAccount ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Bank</p>
              <p className="text-white font-medium">{invoice.bankAccount.bankName}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Account Name</p>
              <p className="text-white font-medium">{invoice.bankAccount.accountName}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Account Number</p>
              <p className="text-white font-medium font-mono">{invoice.bankAccount.accountNumber}</p>
            </div>
            {invoice.bankAccount.branchCode && (
              <div>
                <p className="text-gray-500 mb-1">Branch Code</p>
                <p className="text-white font-medium">{invoice.bankAccount.branchCode}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-600 text-sm italic">
            {invoice.type === 'QUOTE' ? 'Banking details omitted from this quotation.' : 'No banking details linked.'}
          </p>
        )}
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
            {!isQuote && (
              <>
                <div className="flex justify-between text-gray-400 pt-1">
                  <span>Collected</span>
                  <span className="text-emerald-400">{formatZAR(amountPaid)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-gray-400">Balance Due</span>
                  <span className={balanceDue > 0 ? 'text-amber-400' : 'text-gray-500'}>{formatZAR(balanceDue)}</span>
                </div>
                {overpaidBy > 0 && (
                  <div className="flex justify-between font-semibold">
                    <span className="text-gray-400">Overpaid By</span>
                    <span className="text-amber-400">{formatZAR(overpaidBy)}</span>
                  </div>
                )}
              </>
            )}
            {isQuote && quoteCapture && (
              <>
                <div className="flex justify-between text-gray-400 pt-1">
                  <span>Collected on Case</span>
                  <span className="text-emerald-400">{formatZAR(quoteCapture.captured)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-gray-400">Balance Remaining</span>
                  <span className={quoteCapture.settled ? 'text-gray-500' : 'text-amber-400'}>
                    {formatZAR(Math.max(0, quoteCapture.quoteTotal - quoteCapture.captured))}
                  </span>
                </div>
                {quoteCapture.overpaidBy > 0 && (
                  <div className="flex justify-between font-semibold">
                    <span className="text-gray-400">Overpaid By</span>
                    <span className="text-amber-400">{formatZAR(quoteCapture.overpaidBy)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Payments received */}
      {!isQuote && (
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payments Received</h2>
            <span className="text-xs text-gray-500">{invoice.payments.length} payment{invoice.payments.length !== 1 ? 's' : ''}</span>
          </div>
          {invoice.payments.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-600 italic">
              {invoice.status === 'PAID'
                ? 'Marked as paid before payment tracking was introduced — no individual payments recorded.'
                : 'No payments recorded against this invoice yet.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">Method</th>
                  <th className="px-5 py-3 text-left">Reference</th>
                  <th className="px-5 py-3 text-left">Recorded By</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoice.payments.map(p => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-gray-300">{formatDate(p.date)}</td>
                    <td className="px-5 py-3 text-gray-400">{p.method.replace('_', ' ')}</td>
                    <td className="px-5 py-3 text-gray-400 font-mono text-xs">{p.reference ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-400">
                      {p.recordedBy ? `${p.recordedBy.firstName} ${p.recordedBy.lastName}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-emerald-400 font-medium">{formatZAR(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

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

