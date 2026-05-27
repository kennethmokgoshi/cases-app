-- Migration: add_r350_tracking_and_commission_tiers
-- Adds R350 payment date/reference/waiver tracking to Case
-- Adds commission tier configuration to Referrer

-- AlterTable: Case — R350 tracking fields
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "r350PaidById"      TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "r350PaidDate"      TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "r350PaidRef"       TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "r350Waived"        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "r350WaivedAt"      TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "r350WaivedById"    TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "r350WaivedReason"  TEXT;

-- AlterTable: Referrer — commission tier configuration
ALTER TABLE "Referrer" ADD COLUMN IF NOT EXISTS "commissionType"         TEXT NOT NULL DEFAULT 'FIXED';
ALTER TABLE "Referrer" ADD COLUMN IF NOT EXISTS "fixedCommissionAmount"  DECIMAL(65,30);

-- AddForeignKey: Case → User (r350PaidBy)
DO $$ BEGIN
    ALTER TABLE "Case" ADD CONSTRAINT "Case_r350PaidById_fkey"
        FOREIGN KEY ("r350PaidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: Case → User (r350WaivedBy)
DO $$ BEGIN
    ALTER TABLE "Case" ADD CONSTRAINT "Case_r350WaivedById_fkey"
        FOREIGN KEY ("r350WaivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
