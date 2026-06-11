import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const DecisionSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  note:     z.string().max(1000).optional(),
}).strict()

/**
 * Record the client's decision on a quotation. Accepted quotes appear in the
 * "Quotes Issued" register; rejected quotes remain visible on the client file.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = DecisionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const quote = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, type: true, status: true },
    })
    if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (quote.type !== 'QUOTE') {
      return NextResponse.json({ error: 'Only quotations can be accepted or rejected' }, { status: 409 })
    }
    if (quote.status === 'CONVERTED') {
      return NextResponse.json({ error: 'This quote has already been converted to an invoice' }, { status: 409 })
    }
    if (quote.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot record a decision on a cancelled quote' }, { status: 409 })
    }

    const { decision, note } = parsed.data
    const now = new Date()

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status:       decision,
        acceptedAt:   decision === 'ACCEPTED' ? now : null,
        rejectedAt:   decision === 'REJECTED' ? now : null,
        decisionNote: note ?? null,
        decidedById:  session.user.id,
      },
      include: {
        decidedBy: { select: { firstName: true, lastName: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    logger.error('[POST /api/finance/quotes/[id]/decision]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
