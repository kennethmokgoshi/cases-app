import { auth } from '../../../../../lib/auth'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const bulkVerifySchema = z.object({
  logIds: z.array(z.string()),
  isVerified: z.boolean(),
})

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Check permissions
    if (!session.user.isAdmin && session.user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()
    const { logIds, isVerified } = bulkVerifySchema.parse(body)

    if (logIds.length === 0) {
      return NextResponse.json({ error: 'No logs to verify' }, { status: 400 })
    }

    const result = await prisma.workLog.updateMany({
      where: { id: { in: logIds } },
      data: {
        isVerified,
        verifiedById: isVerified ? session.user.id : null,
        verifiedAt: isVerified ? new Date() : null,
      },
    })

    return NextResponse.json({
      success: true,
      updated: result.count,
      total: logIds.length,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error('Bulk verify error:', error)
    return NextResponse.json({ error: 'Failed to verify logs' }, { status: 500 })
  }
}