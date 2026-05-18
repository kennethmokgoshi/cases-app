-- Add soft-delete fields to Case model
ALTER TABLE "Case" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN "deletedById" TEXT;

-- Foreign key from Case.deletedById to User.id
ALTER TABLE "Case" ADD CONSTRAINT "Case_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for efficient trash queries
CREATE INDEX "Case_deletedAt_idx" ON "Case"("deletedAt");
