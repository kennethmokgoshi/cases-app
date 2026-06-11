-- Quote lifecycle statuses
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CONVERTED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';

-- Quote decision audit + quote→invoice conversion link
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "convertedToInvoiceId" TEXT,
ADD COLUMN IF NOT EXISTS "decidedById" TEXT,
ADD COLUMN IF NOT EXISTS "decisionNote" TEXT,
ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);

-- Payment allocation against an invoice
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_convertedToInvoiceId_key" ON "Invoice"("convertedToInvoiceId");
CREATE INDEX IF NOT EXISTS "Invoice_type_idx" ON "Invoice"("type");
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- Foreign keys
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_convertedToInvoiceId_fkey" FOREIGN KEY ("convertedToInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
