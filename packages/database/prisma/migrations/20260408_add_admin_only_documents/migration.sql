-- AlterTable: Add isAdminOnly flag to Document
ALTER TABLE "Document" ADD COLUMN "isAdminOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex for isAdminOnly
CREATE INDEX "Document_isAdminOnly_idx" ON "Document"("isAdminOnly");

-- CreateTable: DocumentAccessGrant
CREATE TABLE "DocumentAccessGrant" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT NOT NULL,

    CONSTRAINT "DocumentAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAccessGrant_documentId_userId_key" ON "DocumentAccessGrant"("documentId", "userId");
CREATE INDEX "DocumentAccessGrant_documentId_idx" ON "DocumentAccessGrant"("documentId");
CREATE INDEX "DocumentAccessGrant_userId_idx" ON "DocumentAccessGrant"("userId");

-- AddForeignKey
ALTER TABLE "DocumentAccessGrant" ADD CONSTRAINT "DocumentAccessGrant_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentAccessGrant" ADD CONSTRAINT "DocumentAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentAccessGrant" ADD CONSTRAINT "DocumentAccessGrant_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
