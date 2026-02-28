import { logger } from '@zenowethu/shared-lib';
import { NextResponse } from 'next/server'
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const [total, requiresAction, reviewed, recentAudits, redFlags] = await Promise.all([
      prisma.forensicAudit.count(),
      prisma.forensicAudit.count({ where: { status: 'REQUIRES_ACTION' } }),
      prisma.forensicAudit.count({ where: { status: 'REVIEWED' } }),
      prisma.forensicAudit.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          Case: {
            include: {
              client: { select: { firstName: true, lastName: true } } } },
          User: { select: { firstName: true, lastName: true, email: true } } } }),
      prisma.forensicAudit.findMany({
        where: { status: 'REQUIRES_ACTION' },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        include: {
          Case: {
            include: {
              client: { select: { firstName: true, lastName: true } } } } } }),
    ])

    return NextResponse.json({
      stats: { total, requiresAction, reviewed },
      recentAudits,
      redFlags })
  } catch (error) {
    logger.error('Error fetching forensic stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
