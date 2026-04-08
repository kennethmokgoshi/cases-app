-- DC Credit Protect (DCCP) Integration
-- Migration: 20260408_dccp_integration
-- Products: Credit Life Insurance (CLI), Assistance Income Protector (AIP), Funeral Cover

CREATE TYPE "DCCPPolicyType" AS ENUM ('CLI', 'AIP', 'FUNERAL');
CREATE TYPE "DCCPPolicyStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACTIVE', 'LAPSED', 'CANCELLED');
CREATE TYPE "DCCPFuneralCoverType" AS ENUM ('INDIVIDUAL', 'FAMILY');

-- Main policy table (covers all 3 product types)
CREATE TABLE "DCCPPolicy" (
    "id"                      TEXT NOT NULL,
    "caseId"                  TEXT,
    "clientId"                TEXT,
    "policyType"              "DCCPPolicyType" NOT NULL,
    "status"                  "DCCPPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "policyNumber"            TEXT,
    "clientFirstName"         TEXT NOT NULL,
    "clientLastName"          TEXT NOT NULL,
    "clientIdNumber"          TEXT NOT NULL,
    "clientDob"               TIMESTAMP(3) NOT NULL,
    "clientEmail"             TEXT,
    "clientPhone"             TEXT NOT NULL,
    "clientAddress"           TEXT NOT NULL,
    "employerName"            TEXT,
    "employmentType"          TEXT,
    "employedSince"           TIMESTAMP(3),
    "bankName"                TEXT,
    "accountNumber"           TEXT,
    "accountType"             TEXT,
    "debitOrderDate"          INTEGER,
    "aipCoverAmount"          INTEGER,
    "funeralCoverType"        "DCCPFuneralCoverType",
    "funeralCoverAmount"      INTEGER,
    "retailPremium"           DECIMAL(10,2) NOT NULL,
    "referralFee"             DECIMAL(10,2) NOT NULL,
    "previousInsurerName"     TEXT,
    "previousPolicyNumber"    TEXT,
    "previousPolicySchedule"  BOOLEAN NOT NULL DEFAULT false,
    "inceptionDate"           TIMESTAMP(3),
    "submittedAt"             TIMESTAMP(3),
    "confirmedAt"             TIMESTAMP(3),
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DCCPPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DCCPPolicy_policyType_idx" ON "DCCPPolicy"("policyType");
CREATE INDEX "DCCPPolicy_status_idx" ON "DCCPPolicy"("status");
CREATE INDEX "DCCPPolicy_clientIdNumber_idx" ON "DCCPPolicy"("clientIdNumber");
CREATE INDEX "DCCPPolicy_caseId_idx" ON "DCCPPolicy"("caseId");

-- Credit accounts linked to a CLI policy
CREATE TABLE "DCCPCreditAccount" (
    "id"                TEXT NOT NULL,
    "policyId"          TEXT NOT NULL,
    "creditProvider"    TEXT NOT NULL,
    "accountNumber"     TEXT,
    "accountType"       TEXT NOT NULL,
    "outstandingBalance" DECIMAL(10,2) NOT NULL,
    "currentPremium"    DECIMAL(10,2) NOT NULL,
    "newPremium"        DECIMAL(10,2) NOT NULL,
    "saving"            DECIMAL(10,2) NOT NULL,
    CONSTRAINT "DCCPCreditAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DCCPCreditAccount_policyId_idx" ON "DCCPCreditAccount"("policyId");

ALTER TABLE "DCCPCreditAccount"
    ADD CONSTRAINT "DCCPCreditAccount_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "DCCPPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Funeral dependants linked to a FUNERAL policy
CREATE TABLE "DCCPFuneralDependant" (
    "id"           TEXT NOT NULL,
    "policyId"     TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "firstName"    TEXT NOT NULL,
    "lastName"     TEXT NOT NULL,
    "idNumber"     TEXT,
    "dob"          TIMESTAMP(3),
    "coverAmount"  INTEGER NOT NULL,
    CONSTRAINT "DCCPFuneralDependant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DCCPFuneralDependant_policyId_idx" ON "DCCPFuneralDependant"("policyId");

ALTER TABLE "DCCPFuneralDependant"
    ADD CONSTRAINT "DCCPFuneralDependant_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "DCCPPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Encrypted portal credentials
CREATE TABLE "DCCPCredential" (
    "id"        TEXT NOT NULL,
    "username"  TEXT NOT NULL,
    "password"  TEXT NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DCCPCredential_pkey" PRIMARY KEY ("id")
);

-- Per-policy commission ledger
CREATE TABLE "DCCPCommissionRecord" (
    "id"            TEXT NOT NULL,
    "month"         TEXT NOT NULL,
    "policyId"      TEXT NOT NULL,
    "policyType"    "DCCPPolicyType" NOT NULL,
    "clientName"    TEXT NOT NULL,
    "policyNumber"  TEXT,
    "retailPremium" DECIMAL(10,2) NOT NULL,
    "referralFee"   DECIMAL(10,2) NOT NULL,
    "isPaid"        BOOLEAN NOT NULL DEFAULT false,
    "paidAt"        TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DCCPCommissionRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DCCPCommissionRecord_month_idx" ON "DCCPCommissionRecord"("month");
CREATE INDEX "DCCPCommissionRecord_policyId_idx" ON "DCCPCommissionRecord"("policyId");
CREATE INDEX "DCCPCommissionRecord_isPaid_idx" ON "DCCPCommissionRecord"("isPaid");

-- Monthly aggregated commission summary
CREATE TABLE "DCCPMonthlyCommissionSummary" (
    "id"                  TEXT NOT NULL,
    "month"               TEXT NOT NULL,
    "totalPolicies"       INTEGER NOT NULL DEFAULT 0,
    "cliPolicies"         INTEGER NOT NULL DEFAULT 0,
    "aipPolicies"         INTEGER NOT NULL DEFAULT 0,
    "funeralPolicies"     INTEGER NOT NULL DEFAULT 0,
    "totalPremium"        DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalFee"            DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isPaid"              BOOLEAN NOT NULL DEFAULT false,
    "paidAt"              TIMESTAMP(3),
    "reportConfirmedAt"   TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DCCPMonthlyCommissionSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DCCPMonthlyCommissionSummary_month_key" ON "DCCPMonthlyCommissionSummary"("month");
CREATE INDEX "DCCPMonthlyCommissionSummary_month_idx" ON "DCCPMonthlyCommissionSummary"("month");
CREATE INDEX "DCCPMonthlyCommissionSummary_isPaid_idx" ON "DCCPMonthlyCommissionSummary"("isPaid");
