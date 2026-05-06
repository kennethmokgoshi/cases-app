import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateSchema = z.object({
  bankName:      z.string().min(1).max(100).optional(),
  accountName:   z.string().min(1).max(100).optional(),
  accountNumber: z.string().min(1).max(50).optional(),
  branchCode:    z.string().max(20).optional(),
  accountType:   z.enum(['CHEQUE', 'SAVINGS', 'CURRENT']).optional(),
  isDefault:     z.boolean().optional(),
  isActive:      z.boolean().optional(),
  reference:     z.string().max(200).optional(),
}).strict()

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const account = await prisma.bankAccount.findUnique({ where: { id } })
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(account)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.isAdmin) return new NextResponse('Forbidden', { status: 403 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data
  const account = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.bankAccount.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } })
    }
    return tx.bankAccount.update({ where: { id }, data: input })
  })

  return NextResponse.json(account)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.isAdmin) return new NextResponse('Forbidden', { status: 403 })

  await prisma.bankAccount.update({ where: { id }, data: { isActive: false } })
  return new NextResponse(null, { status: 204 })
}
