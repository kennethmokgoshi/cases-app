-- CreateTable
CREATE TABLE "CredoDocument" (
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

-- CreateIndex
CREATE INDEX "CredoDocument_consumerId_idx" ON "CredoDocument"("consumerId");

-- CreateIndex
CREATE INDEX "CredoDocument_category_idx" ON "CredoDocument"("category");

-- AddForeignKey
ALTER TABLE "CredoDocument" ADD CONSTRAINT "CredoDocument_consumerId_fkey"
    FOREIGN KEY ("consumerId") REFERENCES "ConsumerAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
