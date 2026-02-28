import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'

// Previously returned pending-R350 cases as invoice-like objects.
// Now returns real Invoice records in the same JSON shape for backward compatibility.
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to   = searchParams.get('to')

    const where: Parameters<typeof prisma.invoice.findMany>[0]['where'] = {
      status: { not: 'CANCELLED' } }

    if (from || to) {
      where.issuedAt = {}
      if (from) where.issuedAt.gte = new Date(from)
      if (to) {
        const d = new Date(to)
        d.setHours(23, 59, 59, 999)
        where.issuedAt.lte = d
      }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        client: { select: { firstName: true, lastName: true } },
        case:   { select: { fileNumber: true } } },
      orderBy: { issuedAt: 'desc' },
      take: 500 })

    const result = invoices.map(inv => ({
      id:         inv.id,
      fileNumber: inv.case?.fileNumber ?? inv.invoiceNumber,
      clientName: inv.client ? `${inv.client.firstName} ${inv.client.lastName}` : 'No client',
      amount:     Number(inv.total),
      status:     inv.status.charAt(0) + inv.status.slice(1).toLowerCase(),
      date:       inv.issuedAt.toISOString().split('T')[0],
      invoiceNumber: inv.invoiceNumber }))

    return NextResponse.json(result)
  } catch (error) {
    logger.error('[GET /api/reports/invoices]', error)
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}
