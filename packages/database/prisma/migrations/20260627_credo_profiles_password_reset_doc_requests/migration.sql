-- Credo profile auto-provisioning, password reset, and document requests.

-- 1. ConsumerAccount: password becomes nullable (auto-provisioned profiles have no
--    password until the consumer activates), plus activation + source tracking.
ALTER TABLE "ConsumerAccount" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "ConsumerAccount" ADD COLUMN "activatedAt" TIMESTAMP(3);
ALTER TABLE "ConsumerAccount" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SELF_REGISTERED';

-- Backfill: existing accounts that already have a password are activated self-registrations.
UPDATE "ConsumerAccount" SET "activatedAt" = "createdAt" WHERE "password" IS NOT NULL;

-- 2. PasswordResetToken
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_consumerId_idx" ON "PasswordResetToken"("consumerId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "ConsumerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. DocumentRequest
CREATE TABLE "DocumentRequest" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "caseId" TEXT,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "fulfilledDocId" TEXT,
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentRequest_fulfilledDocId_key" ON "DocumentRequest"("fulfilledDocId");
CREATE INDEX "DocumentRequest_consumerId_idx" ON "DocumentRequest"("consumerId");
CREATE INDEX "DocumentRequest_caseId_idx" ON "DocumentRequest"("caseId");
CREATE INDEX "DocumentRequest_status_idx" ON "DocumentRequest"("status");
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "ConsumerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_fulfilledDocId_fkey" FOREIGN KEY ("fulfilledDocId") REFERENCES "CredoDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
