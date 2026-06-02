-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "ghlContactId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_ghlContactId_idx" ON "Lead"("ghlContactId");
