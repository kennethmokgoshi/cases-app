-- CreateEnum: DocumentType
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'QUOTE');

-- AlterTable: Invoice — add type and publicToken
ALTER TABLE "Invoice"
    ADD COLUMN "type" "DocumentType" NOT NULL DEFAULT 'INVOICE',
    ADD COLUMN "publicToken" TEXT;

-- CreateUniqueIndex on publicToken
CREATE UNIQUE INDEX "Invoice_publicToken_key" ON "Invoice"("publicToken");
