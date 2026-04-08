-- AlterTable (idempotent — columns may already exist in production)
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "alternativePhone" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "alternativePhone2" TEXT;
