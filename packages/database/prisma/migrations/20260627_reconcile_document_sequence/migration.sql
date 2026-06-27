-- Reconcile DocumentSequence with invoice/quotation numbers that were already
-- issued via the legacy `invoice.count() + 1` allocation (cases, legal,
-- insurance, forensic-audit and the finance quote->invoice convert route).
--
-- All apps now allocate numbers atomically from DocumentSequence. Before that
-- switch, two numbering schemes coexisted (Finance used DocumentSequence; the
-- other apps counted rows), so the stored `nextSeq` for a given (prefix, year)
-- may sit BELOW the highest number already present in the Invoice table. If we
-- did nothing, the first atomic allocation after deploy would re-issue an
-- existing number and trip the unique constraint ("Invoice number conflict").
--
-- This data migration raises `nextSeq` to at least the highest existing number
-- per (prefix, year). Because allocation returns the post-increment value, the
-- next number issued is (max + 1) — guaranteed not to collide. It is idempotent:
-- GREATEST() never lowers an already-correct sequence, so re-running is safe.

INSERT INTO "DocumentSequence" ("id", "prefix", "year", "nextSeq", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || m.prefix || m.year::text),
  m.prefix,
  m.year,
  m.maxseq,
  now(),
  now()
FROM (
  SELECT
    split_part("invoiceNumber", '-', 1)            AS prefix,
    split_part("invoiceNumber", '-', 2)::int       AS year,
    MAX(split_part("invoiceNumber", '-', 3)::int)  AS maxseq
  FROM "Invoice"
  WHERE "invoiceNumber" ~ '^(QUO|INV)-[0-9]{4}-[0-9]+$'
  GROUP BY 1, 2
) m
ON CONFLICT ("prefix", "year") DO UPDATE
  SET "nextSeq"   = GREATEST("DocumentSequence"."nextSeq", EXCLUDED."nextSeq"),
      "updatedAt" = now();
