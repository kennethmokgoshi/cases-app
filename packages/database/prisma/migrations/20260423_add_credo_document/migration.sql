-- CreateTable
CREATE TABLE IF NOT EXISTS "CredoDocument" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredoDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CredoDocument_consumerId_idx" ON "CredoDocument"("consumerId");
CREATE INDEX IF NOT EXISTS "CredoDocument_category_idx" ON "CredoDocument"("category");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CredoDocument_consumerId_fkey') THEN
    ALTER TABLE "CredoDocument" ADD CONSTRAINT "CredoDocument_consumerId_fkey"
      FOREIGN KEY ("consumerId") REFERENCES "ConsumerAccount"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
