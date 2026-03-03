import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const LegalMatterPatchSchema = z.object({
  status:          z.enum(['OPEN','CLOSED','SETTLED']).optional(),
  outcome:         z.string().max(2000).optional().nullable(),
  outcomeDate:     z.string().datetime().optional().nullable(),
  amountSaved:     z.number().nonnegative().optional().nullable(),
  priority:        z.enum(['LOW','MEDIUM','HIGH']).optional(),
  responseReceived: z.boolean().optional(),
  responseDate:    z.string().datetime().optional().nullable(),
  responseNotes:   z.string().max(2000).optional().nullable(),
  letterSent:      z.boolean().optional(),
  isPrescribed:    z.boolean().optional(),
  prescriptionDate: z.string().datetime().optional().nullable() })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  try {
    const matter = await prisma.legalMatter.findUnique({
      where: { id },
      include: {
        Case:               { select: { id: true, fileNumber: true } },
        Client:             { select: { firstName: true, lastName: true, idNumber: true } },
        letters:            { orderBy: { createdAt: 'desc' } },
        prescriptionChecks: { orderBy: { checkedAt: 'desc' } } } })

    if (!matter) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(matter)
  } catch (err) {
    logger.error('[GET /api/finance/legal-matters/[id]]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = LegalMatterPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data

  try {
    const existing = await prisma.legalMatter.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updated = await prisma.legalMatter.update({
      where: { id },
      data: {
        ...(input.status           !== undefined && { status:          input.status }),
        ...(input.outcome          !== undefined && { outcome:         input.outcome }),
        ...(input.outcomeDate      !== undefined && { outcomeDate:     input.outcomeDate ? new Date(input.outcomeDate) : null }),
        ...(input.amountSaved      !== undefined && { amountSaved:     input.amountSaved }),
        ...(input.priority         !== undefined && { priority:        input.priority }),
        ...(input.responseReceived !== undefined && { responseReceived: input.responseReceived }),
        ...(input.responseDate     !== undefined && { responseDate:    input.responseDate ? new Date(input.responseDate) : null }),
        ...(input.responseNotes    !== undefined && { responseNotes:   input.responseNotes }),
        ...(input.letterSent       !== undefined && { letterSent:      input.letterSent }),
        ...(input.isPrescribed     !== undefined && { isPrescribed:    input.isPrescribed }),
        ...(input.prescriptionDate !== undefined && { prescriptionDate: input.prescriptionDate ? new Date(input.prescriptionDate) : null }) } })

    await prisma.workflowLog.create({
      data: {
        caseId: existing.caseId,
        notes:  `[LEGAL_MATTER_UPDATED] Updated legal matter: ${existing.creditorName} → ${input.status ?? existing.status}`,
        userId: session.user.id } as any })

    return NextResponse.json(updated)
  } catch (err) {
    logger.error('[PATCH /api/finance/legal-matters/[id]]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
