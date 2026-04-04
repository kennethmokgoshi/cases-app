import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { prisma, Prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const ForensicAuditCreateSchema = z.object({
  caseId:          z.string().cuid(),
  auditorId:       z.string().cuid().optional(),
  findings:        z.string().max(10000).optional(),
  recommendations: z.string().max(10000).optional() })

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  const page   = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))

  const where: any = {}

  if (status && ['PENDING','IN_PROGRESS','COMPLETED'].includes(status)) where.status = status
  if (search) {
    where.Case = { fileNumber: { contains: search, mode: 'insensitive' } }
  }

  try {
    const [audits, total, inProgress, completed] = await Promise.all([
      prisma.forensicAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          Case: { select: { fileNumber: true } },
          User: { select: { firstName: true, lastName: true } } } }),
      prisma.forensicAudit.count({ where }),
      prisma.forensicAudit.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.forensicAudit.count({ where: { status: 'COMPLETED' } }),
    ])

    const totalAll = await prisma.forensicAudit.count()

    return NextResponse.json({
      audits,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: {
        total:      totalAll,
        inProgress,
        completed,
        pending:    totalAll - inProgress - completed } })
  } catch (err) {
    logger.error('[GET /api/finance/forensic-audits]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ForensicAuditCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data

  try {
    const audit = await prisma.forensicAudit.create({
      data: {
        caseId:          input.caseId,
        auditorId:       input.auditorId ?? null,
        findings:        input.findings ?? null,
        recommendations: input.recommendations ?? null,
        status:          'PENDING' } as any })

    await prisma.workflowLog.create({
      data: {
        caseId: input.caseId,
        notes:  `[FORENSIC_AUDIT_CREATED] Created forensic audit`,
        userId: session.user.id } as any })

    return NextResponse.json(audit, { status: 201 })
  } catch (err) {
    logger.error('[POST /api/finance/forensic-audits]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
