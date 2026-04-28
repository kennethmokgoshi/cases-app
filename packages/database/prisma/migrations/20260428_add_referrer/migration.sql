-- CreateTable: Referrer — external persons who refer clients to Zenowethu
CREATE TABLE "Referrer" (
    "id"                TEXT NOT NULL,
    "firstName"         TEXT NOT NULL,
    "lastName"          TEXT NOT NULL,
    "idNumber"          TEXT NOT NULL,
    "email"             TEXT,
    "cellNumber"        TEXT,
    "employerName"      TEXT,
    "employmentType"    TEXT,
    "employerAddress"   TEXT,
    "employerPhone"     TEXT,
    "occupation"        TEXT,
    "monthlyIncome"     DECIMAL(65,30),
    "bankName"          TEXT,
    "accountNumber"     TEXT,
    "accountType"       TEXT,
    "branchCode"        TEXT,
    "accountHolderName" TEXT,
    "projectId"         TEXT,
    "isActive"          BOOLEAN NOT NULL DEFAULT true,
    "notes"             TEXT,
    "createdById"       TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referrer_pkey" PRIMARY KEY ("id")
);

-- Unique + index constraints
CREATE UNIQUE INDEX "Referrer_idNumber_key"  ON "Referrer"("idNumber");
CREATE UNIQUE INDEX "Referrer_projectId_key" ON "Referrer"("projectId");
CREATE INDEX "Referrer_lastName_idx"         ON "Referrer"("lastName");
CREATE INDEX "Referrer_isActive_idx"         ON "Referrer"("isActive");

-- Add referrerId to Case
ALTER TABLE "Case" ADD COLUMN "referrerId" TEXT;
CREATE INDEX "Case_referrerId_idx" ON "Case"("referrerId");

-- Foreign keys
ALTER TABLE "Referrer" ADD CONSTRAINT "Referrer_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Referrer" ADD CONSTRAINT "Referrer_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Case" ADD CONSTRAINT "Case_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
