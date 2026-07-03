import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { recordQuoteDecision } from '@zenowethu/shared-lib/src/finance/quote-case-sync'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const DecisionSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  note:     z.string().max(1000).optional(),
}).strict()

/**
 * Record the consumer's decision on a quotation from the Cases app. Uses the
 * same shared logic as Finance, so the quote status stays in sync across both
 * apps and accepting a case-linked quote advances the case to QUOTE_ACCEPTED
 * when that is a forward move on the workflow board.
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
    const result = await recordQuoteDecision({
      quoteId:  id,
      decision: parsed.data.decision,
      note:     parsed.data.note,
      userId:   session.user.id,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Failed to record decision' }, { status: result.status ?? 500 })
    }

    return NextResponse.json({ ...(result.quote as object), caseSync: result.caseSync })
  } catch (err) {
    logger.error('[POST /api/finance/quotes/[id]/decision]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
