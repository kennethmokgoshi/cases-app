/**
 * POST /api/dc-fee-invoices  (Finance)
 *
 * Create a Debt Counsellor fee invoice/quotation from the Finance app's
 * Outstanding Fees page. Mirrors the Cases-app route; uses the shared
 * `createDcFeeInvoice` service so numbering/persistence are identical.
 */

import { auth, logger, dcFeeInvoiceInputSchema } from '@zenowethu/shared-lib'
import { createDcFeeInvoice } from '@zenowethu/shared-lib/src/finance/dc-fee-invoice-service'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = dcFeeInvoiceInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const clientId =
    body && typeof body === 'object' && typeof (body as { clientId?: unknown }).clientId === 'string'
      ? (body as { clientId: string }).clientId
      : null

  try {
    const invoice = await createDcFeeInvoice({
      input: parsed.data,
      clientId,
      createdById: session.user.id,
    })

    logger.info(
      `[dc-fee-invoice] ${invoice.invoiceNumber} raised (finance) → DC "${parsed.data.dcName}" by ${session.user.id}`,
    )

    return NextResponse.json(
      { id: invoice.id, invoiceNumber: invoice.invoiceNumber, total: Number(invoice.total) },
      { status: 201 },
    )
  } catch (err) {
    logger.error('[POST /api/dc-fee-invoices] (finance)', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
