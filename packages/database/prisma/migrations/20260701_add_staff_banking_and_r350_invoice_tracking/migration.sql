-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "r350InvoiceId" TEXT,
ADD COLUMN     "r350InvoiceSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "personalBankingUserId" TEXT;

-- CreateTable
CREATE TABLE "StaffBankingDetail" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branchCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StaffBankingDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffBankingDetail_userId_key" ON "StaffBankingDetail"("userId");

-- CreateIndex
CREATE INDEX "Invoice_personalBankingUserId_idx" ON "Invoice"("personalBankingUserId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_personalBankingUserId_fkey" FOREIGN KEY ("personalBankingUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBankingDetail" ADD CONSTRAINT "StaffBankingDetail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
