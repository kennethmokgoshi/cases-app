import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateSchema = z.object({
  bankName:      z.string().min(1).max(100),
  accountName:   z.string().min(1).max(100),
  accountNumber: z.string().min(1).max(50),
  branchCode:    z.string().max(20).optional(),
  accountType:   z.enum(['CHEQUE', 'SAVINGS', 'CURRENT']).default('CHEQUE'),
  isDefault:     z.boolean().default(false),
  reference:     z.string().max(200).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const accounts = await prisma.bankAccount.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { bankName: 'asc' }],
  })

  return NextResponse.json({ accounts })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data

  const account = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.bankAccount.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
    }
    return tx.bankAccount.create({ data: input })
  })

  return NextResponse.json(account, { status: 201 })
}
