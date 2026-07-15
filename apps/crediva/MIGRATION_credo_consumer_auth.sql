-- ============================================================
-- Credo Consumer Auth Migration
-- Run this on the production VPS PostgreSQL database
-- ============================================================

-- CreateTable
CREATE TABLE "CredoTenant" (
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

-- CreateTable
CREATE TABLE "ConsumerAccount" (
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

    CONSTRAINT "ConsumerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponCode" (
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

-- CreateTable
CREATE TABLE "ServiceRequest" (
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

-- CreateIndex
CREATE UNIQUE INDEX "CredoTenant_slug_key" ON "CredoTenant"("slug");
CREATE INDEX "CredoTenant_slug_idx" ON "CredoTenant"("slug");
CREATE UNIQUE INDEX "ConsumerAccount_email_key" ON "ConsumerAccount"("email");
CREATE UNIQUE INDEX "ConsumerAccount_idNumber_key" ON "ConsumerAccount"("idNumber");
CREATE UNIQUE INDEX "ConsumerAccount_linkedClientId_key" ON "ConsumerAccount"("linkedClientId");
CREATE INDEX "ConsumerAccount_email_idx" ON "ConsumerAccount"("email");
CREATE INDEX "ConsumerAccount_tenantId_idx" ON "ConsumerAccount"("tenantId");
CREATE UNIQUE INDEX "CouponCode_code_key" ON "CouponCode"("code");
CREATE INDEX "CouponCode_code_idx" ON "CouponCode"("code");
CREATE INDEX "ServiceRequest_consumerId_idx" ON "ServiceRequest"("consumerId");
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- AddForeignKey
ALTER TABLE "ConsumerAccount" ADD CONSTRAINT "ConsumerAccount_linkedClientId_fkey"
  FOREIGN KEY ("linkedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConsumerAccount" ADD CONSTRAINT "ConsumerAccount_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "CredoTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CouponCode" ADD CONSTRAINT "CouponCode_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "CredoTenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_consumerId_fkey"
  FOREIGN KEY ("consumerId") REFERENCES "ConsumerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "CouponCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
