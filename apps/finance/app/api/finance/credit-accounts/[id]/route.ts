import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreditAccountPatchSchema = z.object({
  outstandingBalance: z.number().nonnegative().optional(),
  monthlyInstalment:  z.number().nonnegative().optional(),
  status:             z.string().optional(),
  hasInsurance:       z.boolean().optional(),
  insurerName:        z.string().max(200).optional().nullable(),
  policyNumber:       z.string().max(100).optional().nullable(),
  isPrescribed:       z.boolean().optional(),
  prescriptionDate:   z.string().datetime().optional().nullable(),
  isIncluded:         z.boolean().optional(),
  notes:              z.string().max(2000).optional() })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  try {
    const account = await prisma.creditAccount.findUnique({
      where: { id },
      include: {
        case:      { select: { id: true, fileNumber: true } },
        client:    { select: { firstName: true, lastName: true, idNumber: true, email: true } },
        documents: { orderBy: { uploadedAt: 'desc' } } } })

    if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(account)
  } catch (err) {
    logger.error('[GET /api/finance/credit-accounts/[id]]', err)
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

  const parsed = CreditAccountPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data

  try {
    const existing = await prisma.creditAccount.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updated = await prisma.creditAccount.update({
      where: { id },
      data: {
        ...(input.outstandingBalance !== undefined && { outstandingBalance: input.outstandingBalance }),
        ...(input.monthlyInstalment  !== undefined && { monthlyInstalment:  input.monthlyInstalment }),
        ...(input.status             !== undefined && { status:             input.status }),
        ...(input.hasInsurance       !== undefined && { hasInsurance:       input.hasInsurance }),
        ...(input.insurerName        !== undefined && { insurerName:        input.insurerName }),
        ...(input.policyNumber       !== undefined && { policyNumber:       input.policyNumber }),
        ...(input.isPrescribed       !== undefined && { isPrescribed:       input.isPrescribed }),
        ...(input.prescriptionDate   !== undefined && { prescriptionDate:   input.prescriptionDate ? new Date(input.prescriptionDate) : null }),
        ...(input.isIncluded         !== undefined && { isIncluded:         input.isIncluded }) } })

    await prisma.workflowLog.create({
      data: {
        caseId: existing.caseId,
        notes:  `[CREDIT_ACCOUNT_UPDATED] Updated credit account: ${existing.creditorName}`,
        userId: session.user.id } })

    return NextResponse.json(updated)
  } catch (err) {
    logger.error('[PATCH /api/finance/credit-accounts/[id]]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  try {
    const existing = await prisma.creditAccount.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.creditAccount.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    logger.error('[DELETE /api/finance/credit-accounts/[id]]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
