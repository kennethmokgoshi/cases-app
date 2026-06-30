-- Manual staff override for "Accepted via DHS".
-- DHS sometimes transfers a file into our DC profile without ever showing a formal
-- Accepted / Auto Transferred status. Staff tick this to mark the file accepted so
-- the Manage Consumers (debt-review-removal consent) follow-on can proceed.

-- AlterTable
ALTER TABLE "Case" ADD COLUMN "manuallyAcceptedViaDhs" BOOLEAN NOT NULL DEFAULT false;
