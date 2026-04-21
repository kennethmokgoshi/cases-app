import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { SERVICES_MAP } from '@zenowethu/config'

const UpsertSchema = z.object({
  prices: z.array(z.object({
    serviceKey: z.string().min(1),
    label:      z.string().min(1).max(200),
    price:      z.number().nonnegative(),
    isActive:   z.boolean().default(true),
  })).min(1),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const stored = await prisma.servicePrice.findMany()
  const storedMap = Object.fromEntries(stored.map(s => [s.serviceKey, s]))

  // Merge stored prices with SERVICES_MAP so all services are always returned
  const prices = Object.entries(SERVICES_MAP).map(([key, label]) => ({
    serviceKey: key,
    label:      storedMap[key]?.label ?? label,
    price:      Number(storedMap[key]?.price ?? 0),
    isActive:   storedMap[key]?.isActive ?? true,
    id:         storedMap[key]?.id ?? null,
  }))

  return NextResponse.json({ prices })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const ops = parsed.data.prices.map(p =>
    prisma.servicePrice.upsert({
      where:  { serviceKey: p.serviceKey },
      update: { label: p.label, price: p.price, isActive: p.isActive },
      create: { serviceKey: p.serviceKey, label: p.label, price: p.price, isActive: p.isActive },
    })
  )

  const results = await prisma.$transaction(ops)
  return NextResponse.json({ prices: results })
}
