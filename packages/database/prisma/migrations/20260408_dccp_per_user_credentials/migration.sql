-- Per-user DCCP credentials
-- Each user can store their own DCCP portal login credentials.
-- Replaces the previous single global DCCPCredential row.

ALTER TABLE "DCCPCredential"
  ADD COLUMN IF NOT EXISTS "userId"    TEXT,
  ADD COLUMN IF NOT EXISTS "portalUrl" TEXT NOT NULL DEFAULT 'https://portal.colms.co.za/arsys/shared/login.jsp?/arsys/';

-- Foreign key to User
ALTER TABLE "DCCPCredential"
  ADD CONSTRAINT "DCCPCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- Unique: one credential row per user
CREATE UNIQUE INDEX IF NOT EXISTS "DCCPCredential_userId_key" ON "DCCPCredential"("userId");
