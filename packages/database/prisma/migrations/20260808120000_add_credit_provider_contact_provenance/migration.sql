-- AlterTable
ALTER TABLE "CreditProvider" ADD COLUMN     "contactSource" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "contactSourceNotes" TEXT,
ADD COLUMN     "contactVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "CreditProvider_needsReview_idx" ON "CreditProvider"("needsReview");
