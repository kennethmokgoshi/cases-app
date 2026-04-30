-- AlterTable: add isAdminOnly flag to Case
-- Admin-only cases are hidden from non-admin users in all searches.
-- Orphaned clients (case deleted) and clients whose only cases are admin-only
-- will allow new cases to be created by non-admin users without a unique constraint
-- error, by reusing (connecting to) the existing Client record.

ALTER TABLE "Case" ADD COLUMN "isAdminOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Case_isAdminOnly_idx" ON "Case"("isAdminOnly");
