-- Additive only: optional proof-of-payment file URL on Payment
ALTER TABLE "Payment" ADD COLUMN "proofOfPaymentUrl" TEXT;
