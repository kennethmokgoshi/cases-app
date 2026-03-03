import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT:     ['ACCEPTED', 'CANCELLED'],
  ACCEPTED:  ['ISSUED', 'CANCELLED'],
  ISSUED:    ['CANCELLED'],
  CANCELLED: [] }

const InsuranceAssessmentPatchSchema = z.object({
  status:             z.enum(['DRAFT','ACCEPTED','ISSUED','CANCELLED']).optional(),
  insurer:            z.string().max(200).optional().nullable(),
  policyType:         z.string().max(100).optional().nullable(),
  coverAmount:        z.number().nonnegative().optional().nullable(),
  replacementPremium: z.number().nonnegative().optional().nullable(),
  monthlySavings:     z.number().optional().nullable(),
  annualSavings:      z.number().optional().nullable(),
  savingsPercent:     z.number().optional().nullable(),
  consentGiven:       z.boolean().optional(),
  consentDate:        z.string().datetime().optional().nullable(),
  consentMethod:      z.string().max(100).optional().nullable() })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  try {
    const assessment = await prisma.insuranceAssessment.findUnique({
      where: { id },
      include: {
        Case:               { select: { id: true, fileNumber: true } },
        accounts:           { include: { creditAccount: { select: { creditorName: true, accountType: true } } } },
        policies:           { orderBy: { startDate: 'desc' } },
        cancellationLetters: { orderBy: { createdAt: 'desc' } } } })

    if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(assessment)
  } catch (err) {
    logger.error('[GET /api/finance/insurance-assessments/[id]]', err)
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

  const parsed = InsuranceAssessmentPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data

  try {
    const existing = await prisma.insuranceAssessment.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (input.status && input.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] ?? []
      if (!allowed.includes(input.status)) {
        return NextResponse.json(
          { error: `Invalid status transition: ${existing.status} → ${input.status}` },
          { status: 409 },
        )
      }
    }

    const updated = await prisma.insuranceAssessment.update({
      where: { id },
      data: {
        ...(input.status             !== undefined && { status:             input.status }),
        ...(input.insurer            !== undefined && { insurer:            input.insurer }),
        ...(input.policyType         !== undefined && { policyType:         input.policyType }),
        ...(input.coverAmount        !== undefined && { coverAmount:        input.coverAmount }),
        ...(input.replacementPremium !== undefined && { replacementPremium: input.replacementPremium }),
        ...(input.monthlySavings     !== undefined && { monthlySavings:     input.monthlySavings }),
        ...(input.annualSavings      !== undefined && { annualSavings:      input.annualSavings }),
        ...(input.savingsPercent     !== undefined && { savingsPercent:     input.savingsPercent }),
        ...(input.consentGiven       !== undefined && { consentGiven:       input.consentGiven }),
        ...(input.consentDate        !== undefined && { consentDate:        input.consentDate ? new Date(input.consentDate) : null }),
        ...(input.consentMethod      !== undefined && { consentMethod:      input.consentMethod }) } })

    await prisma.workflowLog.create({
      data: {
        caseId: existing.caseId,
        notes:  `[INSURANCE_ASSESSMENT_UPDATED] Updated insurance assessment status to ${input.status ?? existing.status}`,
        userId: session.user.id } as any })

    return NextResponse.json(updated)
  } catch (err) {
    logger.error('[PATCH /api/finance/insurance-assessments/[id]]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
