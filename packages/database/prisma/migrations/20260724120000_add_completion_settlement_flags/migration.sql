-- Add completion and settlement tracking to Case
ALTER TABLE "Case" ADD COLUMN "isCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Case" ADD COLUMN "isSettled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill based on existing status values
UPDATE "Case" SET "isCompleted" = true WHERE status LIKE '%COMPLETED%' OR status LIKE '%SETTLED%';
UPDATE "Case" SET "isSettled" = true WHERE status LIKE '%SETTLED%';

-- Add indexes for efficient querying of completion/settlement states
CREATE INDEX "Case_isCompleted_idx" ON "Case"("isCompleted");
CREATE INDEX "Case_isSettled_idx" ON "Case"("isSettled");
CREATE INDEX "Case_isCompleted_isSettled_idx" ON "Case"("isCompleted", "isSettled");
