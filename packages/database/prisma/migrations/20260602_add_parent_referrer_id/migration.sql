-- AddColumn: parentReferrerId on Referrer for self-referential hierarchy
ALTER TABLE "Referrer" ADD COLUMN "parentReferrerId" TEXT;

-- AddForeignKey
ALTER TABLE "Referrer" ADD CONSTRAINT "Referrer_parentReferrerId_fkey"
  FOREIGN KEY ("parentReferrerId") REFERENCES "Referrer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Referrer_parentReferrerId_idx" ON "Referrer"("parentReferrerId");
