-- AlterTable: add missing DC verification fields to Case
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "lastUsedMobile" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "dcTel" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "lastUsedTel" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "dcProvince" TEXT;
