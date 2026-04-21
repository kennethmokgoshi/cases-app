import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    select: {
      id:            true,
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

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(invoice)
}
