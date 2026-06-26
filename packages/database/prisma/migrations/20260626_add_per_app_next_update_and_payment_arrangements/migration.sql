-- CreateTable: per-app next-update date (isolated per app)
CREATE TABLE "CaseAppNextUpdate" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "nextUpdateDate" TIMESTAMP(3),
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseAppNextUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: payment arrangement (promise-to-pay)
CREATE TABLE "PaymentArrangement" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "clientId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "mandateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "reason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentArrangement_pkey" PRIMARY KEY ("id")
);

-- CreateTable: individual dated instalment lines
CREATE TABLE "PaymentArrangementInstalment" (
    "id" TEXT NOT NULL,
    "arrangementId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountDue" DECIMAL(65,30) NOT NULL,
    "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "honouredById" TEXT,
    "honouredAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentArrangementInstalment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseAppNextUpdate_caseId_app_key" ON "CaseAppNextUpdate"("caseId", "app");
CREATE INDEX "CaseAppNextUpdate_caseId_idx" ON "CaseAppNextUpdate"("caseId");
CREATE INDEX "CaseAppNextUpdate_app_nextUpdateDate_idx" ON "CaseAppNextUpdate"("app", "nextUpdateDate");
CREATE INDEX "CaseAppNextUpdate_app_isOverdue_idx" ON "CaseAppNextUpdate"("app", "isOverdue");

CREATE INDEX "PaymentArrangement_caseId_idx" ON "PaymentArrangement"("caseId");
CREATE INDEX "PaymentArrangement_clientId_idx" ON "PaymentArrangement"("clientId");
CREATE INDEX "PaymentArrangement_status_idx" ON "PaymentArrangement"("status");
CREATE INDEX "PaymentArrangement_mandateId_idx" ON "PaymentArrangement"("mandateId");

CREATE INDEX "PaymentArrangementInstalment_arrangementId_idx" ON "PaymentArrangementInstalment"("arrangementId");
CREATE INDEX "PaymentArrangementInstalment_dueDate_idx" ON "PaymentArrangementInstalment"("dueDate");
CREATE INDEX "PaymentArrangementInstalment_status_idx" ON "PaymentArrangementInstalment"("status");

-- AddForeignKey
ALTER TABLE "CaseAppNextUpdate" ADD CONSTRAINT "CaseAppNextUpdate_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseAppNextUpdate" ADD CONSTRAINT "CaseAppNextUpdate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentArrangement" ADD CONSTRAINT "PaymentArrangement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentArrangement" ADD CONSTRAINT "PaymentArrangement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentArrangement" ADD CONSTRAINT "PaymentArrangement_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "DebitOrderMandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentArrangement" ADD CONSTRAINT "PaymentArrangement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentArrangementInstalment" ADD CONSTRAINT "PaymentArrangementInstalment_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "PaymentArrangement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentArrangementInstalment" ADD CONSTRAINT "PaymentArrangementInstalment_honouredById_fkey" FOREIGN KEY ("honouredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
