-- CreateTable "CreditTransfer" for tracking credit transfers between cases
CREATE TABLE "CreditTransfer" (
    "id" TEXT NOT NULL,
    "fromCaseId" TEXT NOT NULL,
    "toCaseId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "transferredById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditTransfer_fromCaseId_idx" ON "CreditTransfer"("fromCaseId");

-- CreateIndex
CREATE INDEX "CreditTransfer_toCaseId_idx" ON "CreditTransfer"("toCaseId");

-- CreateIndex
CREATE INDEX "CreditTransfer_referrerId_idx" ON "CreditTransfer"("referrerId");

-- CreateIndex
CREATE INDEX "CreditTransfer_status_idx" ON "CreditTransfer"("status");

-- CreateIndex
CREATE INDEX "CreditTransfer_createdAt_idx" ON "CreditTransfer"("createdAt");

-- AddForeignKey
ALTER TABLE "CreditTransfer" ADD CONSTRAINT "CreditTransfer_fromCaseId_fkey" FOREIGN KEY ("fromCaseId") REFERENCES "Case"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransfer" ADD CONSTRAINT "CreditTransfer_toCaseId_fkey" FOREIGN KEY ("toCaseId") REFERENCES "Case"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransfer" ADD CONSTRAINT "CreditTransfer_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransfer" ADD CONSTRAINT "CreditTransfer_transferredById_fkey" FOREIGN KEY ("transferredById") REFERENCES "User"("id") ON DELETE RESTRICT;

-- AddForeignKey
ALTER TABLE "CreditTransfer" ADD CONSTRAINT "CreditTransfer_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL;
