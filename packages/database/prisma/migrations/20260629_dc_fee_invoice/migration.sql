-- Debt Counsellor Fee Invoice.
-- When another debt counsellor requests a DHS transfer of a consumer who still
-- owes Zenowethu fees, staff decline and raise a fee-recovery invoice addressed
-- TO that debt counsellor. This adds the new document type and the DC bill-to
-- fields on the Invoice. The consumer the fees relate to remains the linked
-- client/case (or is captured in `reference` for standalone invoices).

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'DC_FEE_INVOICE';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "dcName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "dcEmail" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "dcTradingName" TEXT;
