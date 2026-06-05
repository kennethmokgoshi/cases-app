-- CreateTable: CredoTenant (IF NOT EXISTS for idempotency on production)
CREATE TABLE IF NOT EXISTS "CredoTenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#0B1D35',
    "accentColor" TEXT NOT NULL DEFAULT '#C4953A',
    "logoUrl" TEXT,
    "ncrdc" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredoTenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CredoTenant_slug_key" ON "CredoTenant"("slug");
CREATE INDEX IF NOT EXISTS "CredoTenant_slug_idx" ON "CredoTenant"("slug");

-- CreateTable: ConsumerAccount
CREATE TABLE IF NOT EXISTS "ConsumerAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "idNumber" TEXT,
    "phone" TEXT,
    "province" TEXT,
    "language" TEXT NOT NULL DEFAULT 'English',
    "tenantId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "linkedClientId" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CONSUMER',
    "activeSubscriptionId" TEXT,

    CONSTRAINT "ConsumerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConsumerAccount_email_key" ON "ConsumerAccount"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "ConsumerAccount_idNumber_key" ON "ConsumerAccount"("idNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "ConsumerAccount_linkedClientId_key" ON "ConsumerAccount"("linkedClientId");
CREATE UNIQUE INDEX IF NOT EXISTS "ConsumerAccount_activeSubscriptionId_key" ON "ConsumerAccount"("activeSubscriptionId");
CREATE INDEX IF NOT EXISTS "ConsumerAccount_email_idx" ON "ConsumerAccount"("email");
CREATE INDEX IF NOT EXISTS "ConsumerAccount_tenantId_idx" ON "ConsumerAccount"("tenantId");

-- AddForeignKey (safe on production — IF NOT EXISTS via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsumerAccount_tenantId_fkey') THEN
    ALTER TABLE "ConsumerAccount" ADD CONSTRAINT "ConsumerAccount_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "CredoTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsumerAccount_linkedClientId_fkey') THEN
    ALTER TABLE "ConsumerAccount" ADD CONSTRAINT "ConsumerAccount_linkedClientId_fkey"
      FOREIGN KEY ("linkedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsumerAccount_projectId_fkey') THEN
    ALTER TABLE "ConsumerAccount" ADD CONSTRAINT "ConsumerAccount_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: CredoSubscription
CREATE TABLE IF NOT EXISTS "CredoSubscription" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIALING',
    "providerRef" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredoSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CredoSubscription_consumerId_idx" ON "CredoSubscription"("consumerId");
CREATE INDEX IF NOT EXISTS "CredoSubscription_status_idx" ON "CredoSubscription"("status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CredoSubscription_consumerId_fkey') THEN
    ALTER TABLE "CredoSubscription" ADD CONSTRAINT "CredoSubscription_consumerId_fkey"
      FOREIGN KEY ("consumerId") REFERENCES "ConsumerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- activeSubscription FK (after CredoSubscription exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsumerAccount_activeSubscriptionId_fkey') THEN
    ALTER TABLE "ConsumerAccount" ADD CONSTRAINT "ConsumerAccount_activeSubscriptionId_fkey"
      FOREIGN KEY ("activeSubscriptionId") REFERENCES "CredoSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: CouponCode
CREATE TABLE IF NOT EXISTS "CouponCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CouponCode_code_key" ON "CouponCode"("code");
CREATE INDEX IF NOT EXISTS "CouponCode_code_idx" ON "CouponCode"("code");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CouponCode_tenantId_fkey') THEN
    ALTER TABLE "CouponCode" ADD CONSTRAINT "CouponCode_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "CredoTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: ServiceRequest
CREATE TABLE IF NOT EXISTS "ServiceRequest" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "services" TEXT NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "vatAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL,
    "couponId" TEXT,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "linkedCaseId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ServiceRequest_consumerId_idx" ON "ServiceRequest"("consumerId");
CREATE INDEX IF NOT EXISTS "ServiceRequest_status_idx" ON "ServiceRequest"("status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceRequest_consumerId_fkey') THEN
    ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_consumerId_fkey"
      FOREIGN KEY ("consumerId") REFERENCES "ConsumerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceRequest_couponId_fkey') THEN
    ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_couponId_fkey"
      FOREIGN KEY ("couponId") REFERENCES "CouponCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: PoaSigningRequest
CREATE TABLE IF NOT EXISTS "PoaSigningRequest" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "poaType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "caseId" TEXT,
    "clientId" TEXT,
    "consumerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedPdfPath" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoaSigningRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PoaSigningRequest_token_key" ON "PoaSigningRequest"("token");
CREATE INDEX IF NOT EXISTS "PoaSigningRequest_token_idx" ON "PoaSigningRequest"("token");
CREATE INDEX IF NOT EXISTS "PoaSigningRequest_caseId_idx" ON "PoaSigningRequest"("caseId");
CREATE INDEX IF NOT EXISTS "PoaSigningRequest_clientId_idx" ON "PoaSigningRequest"("clientId");
CREATE INDEX IF NOT EXISTS "PoaSigningRequest_consumerId_idx" ON "PoaSigningRequest"("consumerId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PoaSigningRequest_caseId_fkey') THEN
    ALTER TABLE "PoaSigningRequest" ADD CONSTRAINT "PoaSigningRequest_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PoaSigningRequest_clientId_fkey') THEN
    ALTER TABLE "PoaSigningRequest" ADD CONSTRAINT "PoaSigningRequest_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PoaSigningRequest_consumerId_fkey') THEN
    ALTER TABLE "PoaSigningRequest" ADD CONSTRAINT "PoaSigningRequest_consumerId_fkey"
      FOREIGN KEY ("consumerId") REFERENCES "ConsumerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
