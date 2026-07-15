-- Add ReferrerMissingClientReport table
-- Stores claims by referrers of clients they believe were referred by them
-- but are not yet linked in the system (for display as "Unclaimed" in the portal).

CREATE TABLE IF NOT EXISTS "ReferrerMissingClientReport" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "idNumber" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "linkedCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferrerMissingClientReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReferrerMissingClientReport_referrerId_idx" ON "ReferrerMissingClientReport"("referrerId");
CREATE INDEX IF NOT EXISTS "ReferrerMissingClientReport_status_idx" ON "ReferrerMissingClientReport"("status");
CREATE INDEX IF NOT EXISTS "ReferrerMissingClientReport_createdAt_idx" ON "ReferrerMissingClientReport"("createdAt");

ALTER TABLE "ReferrerMissingClientReport" ADD CONSTRAINT "ReferrerMissingClientReport_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
