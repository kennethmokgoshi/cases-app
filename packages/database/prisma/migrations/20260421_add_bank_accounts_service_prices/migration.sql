-- CreateTable: BankAccount
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branchCode" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'CHEQUE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ServicePrice
CREATE TABLE "ServicePrice" (
    "id" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePrice_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Invoice — add bankAccountId
ALTER TABLE "Invoice" ADD COLUMN "bankAccountId" TEXT;

-- CreateIndex
CREATE INDEX "BankAccount_isActive_idx" ON "BankAccount"("isActive");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "ServicePrice_serviceKey_key" ON "ServicePrice"("serviceKey");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
