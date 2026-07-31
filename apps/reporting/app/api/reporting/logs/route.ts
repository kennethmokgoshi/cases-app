import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyStaffApiAccess } from '@/lib/api-guard'

const createLogSchema = z.object({
  date: z.string().datetime(),
  category: z.string(),
  description: z.string(),
  durationMinutes: z.number().min(1),
  fileNumber: z.string().optional(),
})

export async function GET(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const url = new URL(request.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    const isVerified = url.searchParams.get('isVerified')

    const targetUserId = url.searchParams.get('userId')
    let queryUserId = session!.user.id

    if (targetUserId && targetUserId !== session!.user.id) {
      const { canViewUser } = await import('@/lib/role-check')
      const { detectUserRole } = await import('@/lib/role-detector')
      const viewerRole = (session!.user as any)?.reportingRole || 'staff'
      const targetRole = await detectUserRole(targetUserId)

      if (canViewUser(viewerRole, targetRole)) {
        queryUserId = targetUserId
      } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const where: any = { userId: queryUserId }

    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate)
      if (endDate) where.date.lte = new Date(endDate)
    }

    if (isVerified !== null) {
      where.isVerified = isVerified === 'true'
    }

    const logs = await prisma.workLog.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        verifiedBy: { select: { firstName: true, lastName: true } },
      },
    })

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Logs fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const body = await request.json()
    const validated = createLogSchema.parse(body)

    // Validate case if fileNumber provided
    if (validated.fileNumber) {
      const caseExists = await prisma.case.findUnique({
        where: { fileNumber: validated.fileNumber },
      })
      if (!caseExists) {
        return NextResponse.json({ error: 'Case not found' }, { status: 400 })
      }
    }

    const log = await prisma.workLog.create({
      data: {
        userId: session!.user.id,
        date: new Date(validated.date),
        category: validated.category,
        description: validated.description,
        durationMinutes: validated.durationMinutes,
        fileNumber: validated.fileNumber,
      },
    })

    return NextResponse.json({ success: true, log }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error('Log creation error:', error)
    return NextResponse.json({ error: 'Failed to create log' }, { status: 500 })
  }
}