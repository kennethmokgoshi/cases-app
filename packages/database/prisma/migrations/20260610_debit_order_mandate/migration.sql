-- Banking details on Client (for debit order collection)
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "accountHolderName" TEXT,
  ADD COLUMN IF NOT EXISTS "accountNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "accountType" TEXT,
  ADD COLUMN IF NOT EXISTS "branchCode" TEXT,
  ADD COLUMN IF NOT EXISTS "debitOrderDay" INTEGER;

-- Debit order mandate lifecycle table
CREATE TABLE IF NOT EXISTS "DebitOrderMandate" (
  "id"                  TEXT NOT NULL,
  "caseId"              TEXT,
  "clientId"            TEXT NOT NULL,
  "requested"           BOOLEAN NOT NULL DEFAULT false,
  "bankName"            TEXT,
  "accountHolderName"   TEXT,
  "accountNumber"       TEXT,
  "accountType"         TEXT,
  "branchCode"          TEXT,
  "amount"              DECIMAL(65,30),
  "frequency"           TEXT NOT NULL DEFAULT 'MONTHLY',
  "numInstalments"      INTEGER,
  "debitOrderDay"       INTEGER,
  "firstCollectionDate" TIMESTAMP(3),
  "lastCollectionDate"  TIMESTAMP(3),
  "status"              TEXT NOT NULL DEFAULT 'DRAFT',
  "sentAt"              TIMESTAMP(3),
  "sentTo"              TEXT,
  "signedReturnedAt"    TIMESTAMP(3),
  "signedDocumentId"    TEXT,
  "nupayDocumentId"     TEXT,
  "nupayReference"      TEXT,
  "nupayRegisteredAt"   TIMESTAMP(3),
  "notes"               TEXT,
  "recordedById"        TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DebitOrderMandate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DebitOrderMandate_caseId_idx" ON "DebitOrderMandate"("caseId");
CREATE INDEX IF NOT EXISTS "DebitOrderMandate_clientId_idx" ON "DebitOrderMandate"("clientId");
CREATE INDEX IF NOT EXISTS "DebitOrderMandate_status_idx" ON "DebitOrderMandate"("status");

-- Foreign keys (guarded so re-runs don't fail)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DebitOrderMandate_caseId_fkey') THEN
    ALTER TABLE "DebitOrderMandate"
      ADD CONSTRAINT "DebitOrderMandate_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DebitOrderMandate_clientId_fkey') THEN
    ALTER TABLE "DebitOrderMandate"
      ADD CONSTRAINT "DebitOrderMandate_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DebitOrderMandate_recordedById_fkey') THEN
    ALTER TABLE "DebitOrderMandate"
      ADD CONSTRAINT "DebitOrderMandate_recordedById_fkey"
      FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
