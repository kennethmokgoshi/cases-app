-- Add idNumber column to User table (was in schema but missing from migration history)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "idNumber" TEXT;
