-- Add decline date tracking to Case table
ALTER TABLE "Case" ADD COLUMN "declineFirstDetectedAt" TIMESTAMP(3),
ADD COLUMN "declineLastDetectedAt" TIMESTAMP(3);

-- Create index on declineLastDetectedAt for filtering cases by recent declines
CREATE INDEX "Case_declineLastDetectedAt_idx" ON "Case"("declineLastDetectedAt");
