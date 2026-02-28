import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING:     ['IN_PROGRESS', 'COMPLETED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED:   [] }

const ForensicAuditPatchSchema = z.object({
  status:          z.enum(['PENDING','IN_PROGRESS','COMPLETED']).optional(),
  findings:        z.string().max(10000).optional().nullable(),
  recommendations: z.string().max(10000).optional().nullable(),
  auditorId:       z.string().cuid().optional().nullable() })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  try {
    const audit = await prisma.forensicAudit.findUnique({
      where: { id },
      include: {
        Case:                      { select: { id: true, fileNumber: true } },
        User:                      { select: { firstName: true, lastName: true } },
        AuditEvidence:             { orderBy: { uploadedAt: 'desc' } },
        RecklessLendingAssessment: true } })

    if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(audit)
  } catch (err) {
    logger.error('[GET /api/finance/forensic-audits/[id]]', err)
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

  const parsed = ForensicAuditPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data

  try {
    const existing = await prisma.forensicAudit.findUnique({ where: { id } })
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

    const updated = await prisma.forensicAudit.update({
      where: { id },
      data: {
        ...(input.status          !== undefined && { status:          input.status }),
        ...(input.findings        !== undefined && { findings:        input.findings }),
        ...(input.recommendations !== undefined && { recommendations: input.recommendations }),
        ...(input.auditorId       !== undefined && { auditorId:       input.auditorId }) } })

    await prisma.workflowLog.create({
      data: {
        caseId: existing.caseId,
        notes:  `[FORENSIC_AUDIT_UPDATED] Updated forensic audit status to ${input.status ?? existing.status}`,
        userId: session.user.id } })

    return NextResponse.json(updated)
  } catch (err) {
    logger.error('[PATCH /api/finance/forensic-audits/[id]]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
