-- Debt Counsellor Fee Quotation.
-- Lets the DC fee tool issue a QUOTATION (numbered QUO-…) as well as an invoice,
-- still addressed to the requesting debt counsellor. Additive enum value only.

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'DC_FEE_QUOTE';
