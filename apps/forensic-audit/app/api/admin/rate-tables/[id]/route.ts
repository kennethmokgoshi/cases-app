import { logger } from '@zenowethu/shared-lib';
import { NextResponse } from 'next/server'
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { z } from 'zod'

const RateTablePatchSchema = z.object({
  creditorName: z.string().min(1).optional(),
  accountType:  z.string().min(1).optional(),
  minRate:      z.number().min(0).max(100).optional(),
  maxRate:      z.number().min(0).max(100).optional(),
  avgRate:      z.number().min(0).max(100).optional(),
  source:       z.string().optional().nullable(),
  isActive:     z.boolean().optional(),
  effectiveTo:  z.string().datetime().optional().nullable() })

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const rate = await prisma.creditLifeRateTable.findUnique({ where: { id: params.id } })
    if (!rate) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(rate)
  } catch (error) {
    logger.error('Error fetching rate:', error)
    return NextResponse.json({ error: 'Failed to fetch rate' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await request.json()
    const parsed = RateTablePatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const existing = await prisma.creditLifeRateTable.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data: Record<string, unknown> = { ...parsed.data }
    if (parsed.data.effectiveTo !== undefined) {
      data.effectiveTo = parsed.data.effectiveTo ? new Date(parsed.data.effectiveTo) : null
    }

    const updated = await prisma.creditLifeRateTable.update({
      where: { id: params.id },
      data })

    return NextResponse.json(updated)
  } catch (error) {
    logger.error('Error updating rate:', error)
    return NextResponse.json({ error: 'Failed to update rate' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const existing = await prisma.creditLifeRateTable.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.creditLifeRateTable.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error deleting rate:', error)
    return NextResponse.json({ error: 'Failed to delete rate' }, { status: 500 })
  }
}
