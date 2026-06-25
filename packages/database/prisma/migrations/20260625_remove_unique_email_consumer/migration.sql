-- RemoveIndex
DROP INDEX "ConsumerAccount_email_key";

-- Verify the email index still exists for queries (it should via @@index)
-- No changes needed since @@index is maintained separately
