import { prisma } from '@zenowethu/database'
import { notFound } from 'next/navigation'

interface LineItem {
  creditor?:     string
  serviceKey?:   string
  serviceLabel?: string
  description?:  string
  quantity:      number
  unitPrice:     number
}

function lineLabel(item: LineItem): string {
  if (item.creditor && item.serviceLabel) return `${item.creditor} — ${item.serviceLabel}`
  if (item.creditor) return item.creditor
  return item.description ?? ''
}

function formatZAR(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(n)
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    select: {
      invoiceNumber: true,
      type:          true,
      status:        true,
      lineItems:     true,
      subtotal:      true,
      vatRate:       true,
      vatAmount:     true,
      total:         true,
      issuedAt:      true,
      dueAt:         true,
      notes:         true,
      reference:     true,
      publicToken:   true,
      client: { select: { firstName: true, lastName: true, email: true } },
      case:   { select: { fileNumber: true } },
    },
  })

  if (!invoice) notFound()

  const isQuote   = invoice.type === 'QUOTE'
  const docLabel  = isQuote ? 'Quotation' : 'Invoice'
  const lineItems = invoice.lineItems as unknown as LineItem[]
  const financeUrl = process.env.FINANCE_APP_URL || 'http://localhost:3004'
  const pdfUrl     = `${financeUrl}/api/public/quotes/${token}/pdf`

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#0B1D35', padding: '20px 0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ color: '#C4953A', fontWeight: 800, fontSize: '1.125rem', margin: 0, letterSpacing: '-0.01em' }}>
              ZENOWETHU
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: '2px 0 0' }}>
              Debt Management
            </p>
          </div>
          <span style={{
            background: isQuote ? '#7C3AED' : '#0AB882',
            color: 'white', fontSize: '0.75rem', fontWeight: 700,
            padding: '4px 12px', borderRadius: 999,
          }}>
            {docLabel.toUpperCase()}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '32px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Document title card */}
        <div style={{ background: 'white', borderRadius: 12, padding: '28px 32px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {docLabel} Number
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {invoice.invoiceNumber}
              </p>
              {invoice.client && (
                <p style={{ fontSize: '0.875rem', color: '#64748B', margin: '6px 0 0' }}>
                  Prepared for: <strong style={{ color: '#0F172A' }}>
                    {invoice.client.firstName} {invoice.client.lastName}
                  </strong>
                </p>
              )}
              {invoice.case && (
                <p style={{ fontSize: '0.8125rem', color: '#94A3B8', margin: '2px 0 0' }}>
                  Case #{invoice.case.fileNumber}
                </p>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '0 0 2px' }}>Issue Date</p>
              <p style={{ fontSize: '0.875rem', color: '#0F172A', fontWeight: 600, margin: '0 0 10px' }}>
                {formatDate(invoice.issuedAt)}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '0 0 2px' }}>
                {isQuote ? 'Valid Until' : 'Due Date'}
              </p>
              <p style={{ fontSize: '0.875rem', color: '#0F172A', fontWeight: 600, margin: 0 }}>
                {formatDate(invoice.dueAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Accounts & Services table */}
        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid #F1F5F9' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
              Accounts &amp; Services
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ padding: '10px 24px', textAlign: 'left', fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Account / Creditor — Service
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '14px 24px' }}>
                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0F172A', margin: 0 }}>
                      {lineLabel(item)}
                    </p>
                    {item.creditor && item.serviceLabel && (
                      <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '2px 0 0' }}>
                        {item.serviceLabel}
                      </p>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                    {formatZAR(item.quantity * item.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <div style={{ maxWidth: 260, marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#64748B' }}>
                <span>Subtotal</span>
                <span>{formatZAR(Number(invoice.subtotal))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#64748B' }}>
                <span>VAT ({Math.round(Number(invoice.vatRate) * 100)}%)</span>
                <span>{formatZAR(Number(invoice.vatAmount))}</span>
              </div>
              <div style={{ height: 1, background: '#E2E8F0', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.0625rem', fontWeight: 800, color: '#0F172A' }}>
                <span>Total</span>
                <span style={{ color: '#0AB882' }}>{formatZAR(Number(invoice.total))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div style={{ background: 'white', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
              Notes
            </p>
            <p style={{ fontSize: '0.875rem', color: '#374151', margin: 0, lineHeight: 1.6 }}>{invoice.notes}</p>
          </div>
        )}

        {/* Download button */}
        <div style={{ textAlign: 'center', padding: '8px 0 40px' }}>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: '#0B1D35', color: 'white', textDecoration: 'none',
              padding: '14px 32px', borderRadius: 10,
              fontSize: '0.9375rem', fontWeight: 700,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2v9M9 11l-3-3M9 11l3-3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 14h12" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Download {docLabel} PDF
          </a>
          <p style={{ fontSize: '0.8125rem', color: '#94A3B8', margin: '12px 0 0' }}>
            Powered by Zenowethu Debt Management · 081 747 7616
          </p>
        </div>
      </div>
    </div>
  )
}
