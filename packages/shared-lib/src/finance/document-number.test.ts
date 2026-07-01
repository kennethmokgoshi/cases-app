import { describe, it, expect } from 'vitest'
import { allocateDocumentNumber } from './document-number'

/**
 * The real atomicity is enforced by Postgres (the `upsert` + `increment` against
 * the `(prefix, year)` unique key). These unit tests use a fake transaction
 * client that faithfully models that serialised behaviour so we can assert the
 * formatting and the no-duplicates guarantee without a live database.
 */
function makeFakeTx(existingInvoiceNumbers: string[] = []) {
  const rows = new Map<string, { prefix: string; year: number; nextSeq: number }>()
  const invoices = new Set(existingInvoiceNumbers)
  return {
    documentSequence: {
      // Mirrors Prisma upsert semantics on the (prefix, year) unique key:
      // create when absent (returns the created row), otherwise apply the
      // increment and return the updated row.
      upsert: async ({ where, create, update }: any) => {
        const { prefix, year } = where.prefix_year
        const key = `${prefix}-${year}`
        const existing = rows.get(key)
        if (!existing) {
          const created = { prefix, year, nextSeq: create.nextSeq }
          rows.set(key, created)
          return { ...created }
        }
        existing.nextSeq += update.nextSeq.increment
        return { ...existing }
      },
      // Absolute set used by the drift self-heal path.
      update: async ({ where, data }: any) => {
        const { prefix, year } = where.prefix_year
        const row = rows.get(`${prefix}-${year}`)!
        row.nextSeq = data.nextSeq
        return { ...row }
      },
    },
    invoice: {
      findFirst: async ({ where }: any) =>
        invoices.has(where.invoiceNumber) ? { id: 'existing' } : null,
      findMany: async ({ where }: any) => {
        const sw: string = where.invoiceNumber.startsWith
        return [...invoices].filter((n) => n.startsWith(sw)).map((invoiceNumber) => ({ invoiceNumber }))
      },
    },
  } as any
}

describe('allocateDocumentNumber', () => {
  it('formats the number as PREFIX-YEAR-NNNN and issues 0002 first for a new combo', async () => {
    const tx = makeFakeTx()
    const first = await allocateDocumentNumber(tx, 'QUO', 2026)
    expect(first).toBe('QUO-2026-0002')
  })

  it('increments sequentially on subsequent calls', async () => {
    const tx = makeFakeTx()
    const a = await allocateDocumentNumber(tx, 'INV', 2026)
    const b = await allocateDocumentNumber(tx, 'INV', 2026)
    const c = await allocateDocumentNumber(tx, 'INV', 2026)
    expect([a, b, c]).toEqual(['INV-2026-0002', 'INV-2026-0003', 'INV-2026-0004'])
  })

  it('keeps QUO and INV (and different years) on independent counters', async () => {
    const tx = makeFakeTx()
    const quo = await allocateDocumentNumber(tx, 'QUO', 2026)
    const inv = await allocateDocumentNumber(tx, 'INV', 2026)
    const nextYear = await allocateDocumentNumber(tx, 'QUO', 2027)
    expect(quo).toBe('QUO-2026-0002')
    expect(inv).toBe('INV-2026-0002')
    expect(nextYear).toBe('QUO-2027-0002')
  })

  it('never issues a duplicate, even under concurrent allocation', async () => {
    const tx = makeFakeTx()
    const results = await Promise.all(
      Array.from({ length: 50 }, () => allocateDocumentNumber(tx, 'QUO', 2026)),
    )
    expect(new Set(results).size).toBe(50)
  })

  it('self-heals when the counter has drifted behind existing invoice numbers', async () => {
    // Sequence is brand new (would issue 0002), but INV-2026-0001..0010 already
    // exist (created outside the sequence). The allocator must jump past 0010.
    const existing = Array.from({ length: 10 }, (_, i) => `INV-2026-${String(i + 1).padStart(4, '0')}`)
    const tx = makeFakeTx(existing)
    const first = await allocateDocumentNumber(tx, 'INV', 2026)
    expect(first).toBe('INV-2026-0011')
    // Counter is now caught up: the next call increments normally, no clash.
    const second = await allocateDocumentNumber(tx, 'INV', 2026)
    expect(second).toBe('INV-2026-0012')
  })

  it('pads numbers beyond four digits without truncating', async () => {
    const tx = makeFakeTx()
    // Pre-seed the counter high to exercise the >9999 case.
    await tx.documentSequence.upsert({
      where: { prefix_year: { prefix: 'INV', year: 2026 } },
      create: { prefix: 'INV', year: 2026, nextSeq: 12345 },
      update: { nextSeq: { increment: 0 } },
    })
    const num = await allocateDocumentNumber(tx, 'INV', 2026)
    expect(num).toBe('INV-2026-12346')
  })
})
