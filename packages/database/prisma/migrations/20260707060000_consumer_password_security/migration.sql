-- AlterTable
ALTER TABLE "ConsumerAccount" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConsumerPasswordHistory" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumerPasswordHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsumerPasswordHistory_consumerId_createdAt_idx" ON "ConsumerPasswordHistory"("consumerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConsumerPasswordHistory" ADD CONSTRAINT "ConsumerPasswordHistory_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "ConsumerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
