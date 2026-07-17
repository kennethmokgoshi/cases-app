-- True insertion timestamp for a Case.
--
-- Case.createdAt is intentionally back-dated to the case's month-folder (project) so the
-- timeline sidebar counts and month/year filters bucket the file into the correct
-- reporting month. That back-dating made "latest referrals" ordering wrong: a file
-- loaded today into an older month sorted below genuinely older records.
--
-- recordedAt captures the real time the row was inserted (never back-dated) and is what
-- the list/referral views now sort by. Existing rows are backfilled from createdAt — the
-- best available proxy for their original ordering.

-- AlterTable
ALTER TABLE "Case" ADD COLUMN "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing rows so their historical order is preserved.
UPDATE "Case" SET "recordedAt" = "createdAt";
