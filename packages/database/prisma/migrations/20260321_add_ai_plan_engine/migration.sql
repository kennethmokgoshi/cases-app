-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "planReadyToStart" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CasePlan" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "missingInfo" JSONB NOT NULL DEFAULT '[]',
    "readyToStart" BOOLEAN NOT NULL DEFAULT false,
    "caseType" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CasePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasePlanStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerApp" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionParams" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "breakpointBefore" BOOLEAN NOT NULL DEFAULT false,
    "breakpointAfter" BOOLEAN NOT NULL DEFAULT false,
    "waitingForEvent" TEXT,
    "timeoutHours" INTEGER,
    "timeoutAction" TEXT,
    "executedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CasePlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasePlanUpdate" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "newInfoDescription" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "affectedStepNumbers" JSONB NOT NULL DEFAULT '[]',
    "previousStepsSnapshot" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CasePlanUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasePlanEvent" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stepId" TEXT,
    "eventSource" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB NOT NULL DEFAULT '{}',
    "notifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CasePlanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CasePlan_caseId_key" ON "CasePlan"("caseId");

-- CreateIndex
CREATE INDEX "CasePlan_caseId_idx" ON "CasePlan"("caseId");

-- CreateIndex
CREATE INDEX "CasePlan_status_idx" ON "CasePlan"("status");

-- CreateIndex
CREATE INDEX "CasePlanStep_planId_idx" ON "CasePlanStep"("planId");

-- CreateIndex
CREATE INDEX "CasePlanStep_status_idx" ON "CasePlanStep"("status");

-- CreateIndex
CREATE INDEX "CasePlanStep_ownerApp_idx" ON "CasePlanStep"("ownerApp");

-- CreateIndex
CREATE INDEX "CasePlanUpdate_planId_idx" ON "CasePlanUpdate"("planId");

-- CreateIndex
CREATE INDEX "CasePlanEvent_planId_idx" ON "CasePlanEvent"("planId");

-- CreateIndex
CREATE INDEX "CasePlanEvent_eventType_idx" ON "CasePlanEvent"("eventType");

-- AddForeignKey
ALTER TABLE "CasePlan" ADD CONSTRAINT "CasePlan_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasePlan" ADD CONSTRAINT "CasePlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasePlanStep" ADD CONSTRAINT "CasePlanStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CasePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasePlanUpdate" ADD CONSTRAINT "CasePlanUpdate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CasePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasePlanEvent" ADD CONSTRAINT "CasePlanEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CasePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
