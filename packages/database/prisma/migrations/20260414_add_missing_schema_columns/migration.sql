-- Comprehensive migration: add scalar columns that exist in schema.prisma
-- but were never added to any migration (schema drifted via db push).
-- All statements use IF NOT EXISTS for idempotency on production.

-- Project: branding / B2B partner config columns
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "accentColor"   TEXT DEFAULT '#C4953A';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "primaryColor"  TEXT DEFAULT '#0B1D35';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "logoUrl"       TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "companySlogan" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "termsUrl"      TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "billingEmail"  TEXT;

-- Case: misc fields added over time via db push
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "jointClientId"      TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "preferredDcEmail"   TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "ncrSysRef"          TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "ghlOpportunityId"   TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "leadSource"         TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "marketingData"      JSONB;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "updatedById"        TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "debtCounsellordId"  TEXT;

-- Case.referrerCommission: this is a relation, no column needed (skip)

-- CaseComment: attachments JSON field
ALTER TABLE "CaseComment" ADD COLUMN IF NOT EXISTS "attachments" JSONB;

-- ForensicAudit: RecklessLendingAssessment is a relation (no column needed)
-- Only add the FK column if ForensicAudit has a direct FK column for it
-- (checking schema: RecklessLendingAssessment is a relation on the other model)

-- Add FK for Case.jointClientId (safe)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_jointClientId_fkey') THEN
    ALTER TABLE "Case" ADD CONSTRAINT "Case_jointClientId_fkey"
      FOREIGN KEY ("jointClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_updatedById_fkey') THEN
    ALTER TABLE "Case" ADD CONSTRAINT "Case_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Case' AND column_name='debtCounsellordId') OR
     NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_debtCounsellordId_fkey') THEN
    -- FK to DebtCounsellor table (only add if DebtCounsellor table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'DebtCounsellor') THEN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_debtCounsellordId_fkey') THEN
        ALTER TABLE "Case" ADD CONSTRAINT "Case_debtCounsellordId_fkey"
          FOREIGN KEY ("debtCounsellordId") REFERENCES "DebtCounsellor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

-- Index for jointClientId
CREATE INDEX IF NOT EXISTS "Case_jointClientId_idx" ON "Case"("jointClientId");
CREATE INDEX IF NOT EXISTS "Case_debtCounsellordId_idx" ON "Case"("debtCounsellordId");
