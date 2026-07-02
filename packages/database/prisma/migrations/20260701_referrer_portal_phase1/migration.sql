-- Referrer Portal Phase 1
-- Adds a scoped portal user link for referrers and a staff-visible follow-up queue
-- for missing commission/payment-credit claims.

ALTER TABLE "Referrer" ADD COLUMN IF NOT EXISTS "portalUserId" TEXT;

CREATE TABLE IF NOT EXISTS "ReferrerPaymentQuery" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "commissionId" TEXT,
  "submittedByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "claimedPaidAt" TIMESTAMP(3),
  "claimedAmount" DECIMAL(65,30),
  "notes" TEXT,
  "adminNotes" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferrerPaymentQuery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Referrer_portalUserId_key" ON "Referrer"("portalUserId");
CREATE INDEX IF NOT EXISTS "Referrer_portalUserId_idx" ON "Referrer"("portalUserId");
CREATE INDEX IF NOT EXISTS "ReferrerPaymentQuery_referrerId_idx" ON "ReferrerPaymentQuery"("referrerId");
CREATE INDEX IF NOT EXISTS "ReferrerPaymentQuery_caseId_idx" ON "ReferrerPaymentQuery"("caseId");
CREATE INDEX IF NOT EXISTS "ReferrerPaymentQuery_commissionId_idx" ON "ReferrerPaymentQuery"("commissionId");
CREATE INDEX IF NOT EXISTS "ReferrerPaymentQuery_status_idx" ON "ReferrerPaymentQuery"("status");
CREATE INDEX IF NOT EXISTS "ReferrerPaymentQuery_createdAt_idx" ON "ReferrerPaymentQuery"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Referrer_portalUserId_fkey') THEN
    ALTER TABLE "Referrer"
      ADD CONSTRAINT "Referrer_portalUserId_fkey"
      FOREIGN KEY ("portalUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferrerPaymentQuery_referrerId_fkey') THEN
    ALTER TABLE "ReferrerPaymentQuery"
      ADD CONSTRAINT "ReferrerPaymentQuery_referrerId_fkey"
      FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferrerPaymentQuery_caseId_fkey') THEN
    ALTER TABLE "ReferrerPaymentQuery"
      ADD CONSTRAINT "ReferrerPaymentQuery_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferrerPaymentQuery_commissionId_fkey') THEN
    ALTER TABLE "ReferrerPaymentQuery"
      ADD CONSTRAINT "ReferrerPaymentQuery_commissionId_fkey"
      FOREIGN KEY ("commissionId") REFERENCES "ReferrerCommission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferrerPaymentQuery_submittedByUserId_fkey') THEN
    ALTER TABLE "ReferrerPaymentQuery"
      ADD CONSTRAINT "ReferrerPaymentQuery_submittedByUserId_fkey"
      FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferrerPaymentQuery_resolvedById_fkey') THEN
    ALTER TABLE "ReferrerPaymentQuery"
      ADD CONSTRAINT "ReferrerPaymentQuery_resolvedById_fkey"
      FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
