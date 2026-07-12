-- Store reusable credit-provider consent-to-email-service documents.
-- These documents belong to a credit provider, not to a single consumer, so
-- they can support service by email across multiple cases/accounts.
CREATE TABLE "CreditProviderServiceConsentDocument" (
    "id" TEXT NOT NULL,
    "creditProviderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "consentScope" TEXT NOT NULL DEFAULT 'EMAIL_SERVICE',
    "receivedFrom" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditProviderServiceConsentDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreditProviderServiceConsentDocument_creditProviderId_idx"
    ON "CreditProviderServiceConsentDocument"("creditProviderId");

CREATE INDEX "CreditProviderServiceConsentDocument_isActive_idx"
    ON "CreditProviderServiceConsentDocument"("isActive");

CREATE INDEX "CreditProviderServiceConsentDocument_expiresAt_idx"
    ON "CreditProviderServiceConsentDocument"("expiresAt");

CREATE INDEX "CreditProviderServiceConsentDocument_uploadedById_idx"
    ON "CreditProviderServiceConsentDocument"("uploadedById");

ALTER TABLE "CreditProviderServiceConsentDocument"
    ADD CONSTRAINT "CreditProviderServiceConsentDocument_creditProviderId_fkey"
    FOREIGN KEY ("creditProviderId") REFERENCES "CreditProvider"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditProviderServiceConsentDocument"
    ADD CONSTRAINT "CreditProviderServiceConsentDocument_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
