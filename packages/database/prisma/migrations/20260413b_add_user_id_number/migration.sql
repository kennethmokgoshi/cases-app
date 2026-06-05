-- Add columns to User table that exist in schema but were missing from migration history
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "idNumber" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "address" TEXT;
