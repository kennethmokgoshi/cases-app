-- Create tables that exist in schema.prisma but were never migrated (schema drifted via db push).
-- All statements idempotent with IF NOT EXISTS / DO $$ guards.

-- Enum: ReferrerCommissionStage
DO $$ BEGIN
  CREATE TYPE "ReferrerCommissionStage" AS ENUM (
    'NEW_LEAD','ADMIN_FEE_PAID','QUOTE_SUBMITTED','QUOTE_ACCEPTED',
    'DEPOSIT_PAID','PAYING_INSTALMENTS','UP_TO_DATE',
    'ARREARS_1M','ARREARS_2M','ARREARS_3M','ARREARS_4M_PLUS',
    'HANDED_OVER','SETTLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: AuditLog
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT,
    "action"     TEXT NOT NULL,
    "resource"   TEXT NOT NULL,
    "resourceId" TEXT,
    "details"    JSONB,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx"              ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx"              ON "AuditLog"("action");

-- CreateTable: AutomationRun
CREATE TABLE IF NOT EXISTS "AutomationRun" (
    "id"            TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'QUEUED',
    "caseId"        TEXT,
    "clientId"      TEXT,
    "userId"        TEXT,
    "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"   TIMESTAMP(3),
    "durationMs"    INTEGER,
    "errorMessage"  TEXT,
    "retryCount"    INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt"   TIMESTAMP(3),
    "logs"          JSONB,
    "screenshotPath" TEXT,
    "triggeredById" TEXT,
    "environment"   TEXT NOT NULL DEFAULT 'PRODUCTION',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationRun_type_idx"       ON "AutomationRun"("type");
CREATE INDEX IF NOT EXISTS "AutomationRun_status_idx"     ON "AutomationRun"("status");
CREATE INDEX IF NOT EXISTS "AutomationRun_caseId_idx"     ON "AutomationRun"("caseId");
CREATE INDEX IF NOT EXISTS "AutomationRun_startedAt_idx"  ON "AutomationRun"("startedAt");

-- CreateTable: CaseAssignment
CREATE TABLE IF NOT EXISTS "CaseAssignment" (
    "caseId"     TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAssignment_pkey" PRIMARY KEY ("caseId", "userId")
);

CREATE INDEX IF NOT EXISTS "CaseAssignment_caseId_idx" ON "CaseAssignment"("caseId");
CREATE INDEX IF NOT EXISTS "CaseAssignment_userId_idx" ON "CaseAssignment"("userId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseAssignment_caseId_fkey') THEN
    ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseAssignment_userId_fkey') THEN
    ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: CaseFollower
CREATE TABLE IF NOT EXISTS "CaseFollower" (
    "id"                 TEXT NOT NULL,
    "caseId"             TEXT NOT NULL,
    "userId"             TEXT NOT NULL,
    "followedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inAppNotifications" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CaseFollower_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CaseFollower_caseId_userId_key" ON "CaseFollower"("caseId", "userId");
CREATE INDEX IF NOT EXISTS "CaseFollower_caseId_idx" ON "CaseFollower"("caseId");
CREATE INDEX IF NOT EXISTS "CaseFollower_userId_idx"  ON "CaseFollower"("userId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseFollower_caseId_fkey') THEN
    ALTER TABLE "CaseFollower" ADD CONSTRAINT "CaseFollower_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseFollower_userId_fkey') THEN
    ALTER TABLE "CaseFollower" ADD CONSTRAINT "CaseFollower_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: DebtCounsellor
CREATE TABLE IF NOT EXISTS "DebtCounsellor" (
    "id"             TEXT NOT NULL,
    "ncrdcNo"        TEXT NOT NULL,
    "fullName"       TEXT,
    "tradingName"    TEXT,
    "operatingStatus" TEXT,
    "province"       TEXT,
    "tel"            TEXT,
    "mobile"         TEXT,
    "fax"            TEXT,
    "email"          TEXT,
    "preferredEmail" TEXT,
    "lastKnownEmail" TEXT,
    "notes"          TEXT,
    "staffNotes"     TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById"    TEXT,

    CONSTRAINT "DebtCounsellor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DebtCounsellor_ncrdcNo_key" ON "DebtCounsellor"("ncrdcNo");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DebtCounsellor_updatedById_fkey') THEN
    ALTER TABLE "DebtCounsellor" ADD CONSTRAINT "DebtCounsellor_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: DebtCounsellorEmailHistory
CREATE TABLE IF NOT EXISTS "DebtCounsellorEmailHistory" (
    "id"               TEXT NOT NULL,
    "debtCounsellordId" TEXT NOT NULL,
    "email"            TEXT NOT NULL,
    "source"           TEXT NOT NULL,
    "recordedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes"            TEXT,

    CONSTRAINT "DebtCounsellorEmailHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DebtCounsellorEmailHistory_debtCounsellordId_idx" ON "DebtCounsellorEmailHistory"("debtCounsellordId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DebtCounsellorEmailHistory_debtCounsellordId_fkey') THEN
    ALTER TABLE "DebtCounsellorEmailHistory" ADD CONSTRAINT "DebtCounsellorEmailHistory_debtCounsellordId_fkey"
      FOREIGN KEY ("debtCounsellordId") REFERENCES "DebtCounsellor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: NotificationQueue
CREATE TABLE IF NOT EXISTS "NotificationQueue" (
    "id"          TEXT NOT NULL,
    "caseId"      TEXT NOT NULL,
    "channel"     TEXT NOT NULL,
    "recipient"   TEXT NOT NULL,
    "subject"     TEXT,
    "body"        TEXT NOT NULL,
    "htmlBody"    TEXT,
    "optionsJson" TEXT,
    "status"      TEXT NOT NULL DEFAULT 'PENDING_RETRY',
    "retryCount"  INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationQueue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationQueue_caseId_idx"      ON "NotificationQueue"("caseId");
CREATE INDEX IF NOT EXISTS "NotificationQueue_status_idx"      ON "NotificationQueue"("status");
CREATE INDEX IF NOT EXISTS "NotificationQueue_nextRetryAt_idx" ON "NotificationQueue"("nextRetryAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationQueue_caseId_fkey') THEN
    ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: ReferrerCommission
CREATE TABLE IF NOT EXISTS "ReferrerCommission" (
    "id"               TEXT NOT NULL,
    "referrerId"       TEXT NOT NULL,
    "caseId"           TEXT NOT NULL,
    "stage"            "ReferrerCommissionStage" NOT NULL DEFAULT 'NEW_LEAD',
    "isEligible"       BOOLEAN NOT NULL DEFAULT false,
    "commissionAmount" DECIMAL(65,30),
    "isPaid"           BOOLEAN NOT NULL DEFAULT false,
    "paidAt"           TIMESTAMP(3),
    "paidById"         TEXT,
    "paymentRef"       TEXT,
    "notes"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferrerCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferrerCommission_caseId_key" ON "ReferrerCommission"("caseId");
CREATE INDEX IF NOT EXISTS "ReferrerCommission_referrerId_idx" ON "ReferrerCommission"("referrerId");
CREATE INDEX IF NOT EXISTS "ReferrerCommission_stage_idx"      ON "ReferrerCommission"("stage");
CREATE INDEX IF NOT EXISTS "ReferrerCommission_isPaid_idx"     ON "ReferrerCommission"("isPaid");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferrerCommission_caseId_fkey') THEN
    ALTER TABLE "ReferrerCommission" ADD CONSTRAINT "ReferrerCommission_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferrerCommission_referrerId_fkey') THEN
    -- Referrer table exists from 20260428 migration
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Referrer') THEN
      ALTER TABLE "ReferrerCommission" ADD CONSTRAINT "ReferrerCommission_referrerId_fkey"
        FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferrerCommission_paidById_fkey') THEN
    ALTER TABLE "ReferrerCommission" ADD CONSTRAINT "ReferrerCommission_paidById_fkey"
      FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- FK: Case.debtCounsellordId → DebtCounsellor (now that DebtCounsellor table exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_debtCounsellordId_fkey') THEN
    ALTER TABLE "Case" ADD CONSTRAINT "Case_debtCounsellordId_fkey"
      FOREIGN KEY ("debtCounsellordId") REFERENCES "DebtCounsellor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
