-- CreateTable: CreditProvider
CREATE TABLE "CreditProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "attorney" TEXT,
    "attorneyEmail" TEXT,
    "attorneyPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DebtReviewDocument
CREATE TABLE "DebtReviewDocument" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fileUrl" TEXT,
    "signedFileUrl" TEXT,
    "consumerSignedAt" TIMESTAMP(3),
    "sentToConsumerAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentToCreditors" BOOLEAN NOT NULL DEFAULT false,
    "sentToCreditorAt" TIMESTAMP(3),
    "emailsSentTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtReviewDocument_pkey" PRIMARY KEY ("id")
);

-- AlterTable: CreditAccount — add creditProviderId
ALTER TABLE "CreditAccount" ADD COLUMN "creditProviderId" TEXT;

-- CreateIndex: CreditProvider
CREATE UNIQUE INDEX "CreditProvider_name_key" ON "CreditProvider"("name");
CREATE INDEX "CreditProvider_name_idx" ON "CreditProvider"("name");
CREATE INDEX "CreditProvider_isActive_idx" ON "CreditProvider"("isActive");

-- CreateIndex: DebtReviewDocument
CREATE INDEX "DebtReviewDocument_caseId_idx" ON "DebtReviewDocument"("caseId");
CREATE INDEX "DebtReviewDocument_documentType_idx" ON "DebtReviewDocument"("documentType");
CREATE INDEX "DebtReviewDocument_status_idx" ON "DebtReviewDocument"("status");

-- CreateIndex: CreditAccount
CREATE INDEX "CreditAccount_creditProviderId_idx" ON "CreditAccount"("creditProviderId");

-- AddForeignKey: DebtReviewDocument -> Case
ALTER TABLE "DebtReviewDocument" ADD CONSTRAINT "DebtReviewDocument_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: DebtReviewDocument -> User (approvedBy)
ALTER TABLE "DebtReviewDocument" ADD CONSTRAINT "DebtReviewDocument_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CreditAccount -> CreditProvider
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_creditProviderId_fkey"
    FOREIGN KEY ("creditProviderId") REFERENCES "CreditProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
