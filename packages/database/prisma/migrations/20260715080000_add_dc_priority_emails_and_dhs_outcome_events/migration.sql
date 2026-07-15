-- CreateTable
CREATE TABLE "DebtCounsellorEmail" (
    "id" TEXT NOT NULL,
    "debtCounsellordId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "lastBouncedAt" TIMESTAMP(3),
    "bounceReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCounsellorEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DhsOutcomeEvent" (
    "id" TEXT NOT NULL,
    "debtCounsellordId" TEXT NOT NULL,
    "caseId" TEXT,
    "outcome" TEXT NOT NULL,
    "message" TEXT,
    "category" TEXT,
    "extractedEmail" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DHS_SYNC',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DhsOutcomeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebtCounsellorEmail_debtCounsellordId_priority_idx" ON "DebtCounsellorEmail"("debtCounsellordId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "DebtCounsellorEmail_debtCounsellordId_email_key" ON "DebtCounsellorEmail"("debtCounsellordId", "email");

-- CreateIndex
CREATE INDEX "DhsOutcomeEvent_debtCounsellordId_outcome_idx" ON "DhsOutcomeEvent"("debtCounsellordId", "outcome");

-- CreateIndex
CREATE INDEX "DhsOutcomeEvent_debtCounsellordId_occurredAt_idx" ON "DhsOutcomeEvent"("debtCounsellordId", "occurredAt");

-- CreateIndex
CREATE INDEX "DhsOutcomeEvent_caseId_idx" ON "DhsOutcomeEvent"("caseId");

-- AddForeignKey
ALTER TABLE "DebtCounsellorEmail" ADD CONSTRAINT "DebtCounsellorEmail_debtCounsellordId_fkey" FOREIGN KEY ("debtCounsellordId") REFERENCES "DebtCounsellor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DhsOutcomeEvent" ADD CONSTRAINT "DhsOutcomeEvent_debtCounsellordId_fkey" FOREIGN KEY ("debtCounsellordId") REFERENCES "DebtCounsellor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DhsOutcomeEvent" ADD CONSTRAINT "DhsOutcomeEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
