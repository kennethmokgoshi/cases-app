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

  return `${prefix}-${year}-${String(seq.nextSeq).padStart(4, '0')}`
}
