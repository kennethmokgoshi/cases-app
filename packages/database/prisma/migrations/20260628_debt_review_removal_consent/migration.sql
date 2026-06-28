-- CreateTable
CREATE TABLE "DebtReviewRemovalConsent" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "caseId" TEXT NOT NULL,
    "clientId" TEXT,
    "consumerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consentedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "consentText" TEXT,
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtReviewRemovalConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DebtReviewRemovalConsent_token_key" ON "DebtReviewRemovalConsent"("token");

-- CreateIndex
CREATE INDEX "DebtReviewRemovalConsent_token_idx" ON "DebtReviewRemovalConsent"("token");

-- CreateIndex
CREATE INDEX "DebtReviewRemovalConsent_caseId_idx" ON "DebtReviewRemovalConsent"("caseId");

-- CreateIndex
CREATE INDEX "DebtReviewRemovalConsent_clientId_idx" ON "DebtReviewRemovalConsent"("clientId");

-- CreateIndex
CREATE INDEX "DebtReviewRemovalConsent_consumerId_idx" ON "DebtReviewRemovalConsent"("consumerId");

-- CreateIndex
CREATE INDEX "DebtReviewRemovalConsent_status_idx" ON "DebtReviewRemovalConsent"("status");

-- AddForeignKey
ALTER TABLE "DebtReviewRemovalConsent" ADD CONSTRAINT "DebtReviewRemovalConsent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtReviewRemovalConsent" ADD CONSTRAINT "DebtReviewRemovalConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtReviewRemovalConsent" ADD CONSTRAINT "DebtReviewRemovalConsent_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "ConsumerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
