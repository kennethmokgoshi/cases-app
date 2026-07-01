import type { Prisma } from '@zenowethu/database'

/**
 * Atomically allocates the next sequential document number for a given
 * `prefix` ("QUO" | "INV") and `year`, formatted as `${prefix}-${year}-NNNN`.
 *
 * This is the single source of truth for invoice/quotation numbering across
 * ALL apps (cases, finance, legal, insurance, forensic-audit). It replaces the
 * legacy `invoice.count() + 1` approach, which was:
 *   1. Racy — two concurrent requests saw the same count and generated the same
 *      number, causing a P2002 unique-constraint violation ("Invoice number
 *      conflict — please retry").
 *   2. Divergent — Finance allocated from the DocumentSequence table while the
 *      other apps counted rows, so the two schemes drifted apart and collided
 *      even for a single, non-concurrent request (e.g. after a cancellation).
 *
 * The atomic `upsert` + `increment` against the `(prefix, year)` unique key
 * eliminates both problems: the database serialises the increment, so every
 * caller — in any app, under any concurrency — receives a distinct number.
 *
 * MUST be called inside a Prisma interactive transaction (`prisma.$transaction`)
 * so the number allocation and the document `create` commit together.
 *
 * NOTE on the "0001 gap": the very first number issued for a brand-new
 * prefix/year is `0002` (the create branch seeds `nextSeq: 2`). This matches
 * the numbers Finance has already issued in production; do not "fix" it to start
 * at 0001 without re-seeding DocumentSequence, or you will reissue live numbers.
 */
export async function allocateDocumentNumber(
  tx: Prisma.TransactionClient,
  prefix: string,
  year: number,
): Promise<string> {
  const seq = await tx.documentSequence.upsert({
    where:  { prefix_year: { prefix, year } },
    update: { nextSeq: { increment: 1 } },
    create: { prefix, year, nextSeq: 2 },
  })

  const prefixStr = `${prefix}-${year}-`
  let next = seq.nextSeq

  // Self-heal counter drift. If the DocumentSequence fell behind the numbers
  // actually issued for this prefix/year — e.g. legacy or imported invoices that
  // were created outside this allocator — the candidate can collide with an
  // existing `invoiceNumber` (a P2002 unique violation). The common (no-drift)
  // path is a single indexed lookup on the unique `invoiceNumber`; only when a
  // clash is detected do we scan the issued numbers and jump the counter past
  // the real maximum. Because the `upsert` above holds a row lock on the
  // sequence row for the life of the transaction, concurrent allocations
  // serialise here, so each caller still receives a distinct number.
  const clash = await tx.invoice.findFirst({
    where:  { invoiceNumber: `${prefixStr}${String(next).padStart(4, '0')}` },
    select: { id: true },
  })
  if (clash) {
    const issued = await tx.invoice.findMany({
      where:  { invoiceNumber: { startsWith: prefixStr } },
      select: { invoiceNumber: true },
    })
    let maxIssued = next
    for (const { invoiceNumber } of issued) {
      const n = parseInt(invoiceNumber.slice(prefixStr.length), 10)
      if (Number.isFinite(n) && n > maxIssued) maxIssued = n
    }
    next = maxIssued + 1
    await tx.documentSequence.update({
      where: { prefix_year: { prefix, year } },
      data:  { nextSeq: next },
    })
  }

  return `${prefixStr}${String(next).padStart(4, '0')}`
}
