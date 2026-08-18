-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "verificationStatus" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
ADD COLUMN     "extractedIdNumber" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "sourceMailboxId" TEXT,
ADD COLUMN     "sourceMessageId" TEXT;

-- CreateIndex
CREATE INDEX "Document_verificationStatus_idx" ON "Document"("verificationStatus");

-- CreateIndex
CREATE INDEX "Document_sourceMessageId_idx" ON "Document"("sourceMessageId");

-- CreateTable
CREATE TABLE "QuarantinedDocument" (
    "id" TEXT NOT NULL,
    "intendedCaseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "detectedType" TEXT NOT NULL,
    "attachmentHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'MISMATCH',
    "extractedIdNumber" TEXT,
    "expectedIdNumber" TEXT,
    "allExtractedIds" TEXT,
    "sourceMailboxId" TEXT,
    "sourceMessageId" TEXT,
    "sourceFrom" TEXT,
    "sourceSubject" TEXT,
    "sourceDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "reassignedToCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuarantinedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuarantinedDocument_status_idx" ON "QuarantinedDocument"("status");

-- CreateIndex
CREATE INDEX "QuarantinedDocument_intendedCaseId_idx" ON "QuarantinedDocument"("intendedCaseId");

-- CreateIndex
CREATE INDEX "QuarantinedDocument_reassignedToCaseId_idx" ON "QuarantinedDocument"("reassignedToCaseId");

-- CreateIndex
CREATE INDEX "QuarantinedDocument_sourceMailboxId_idx" ON "QuarantinedDocument"("sourceMailboxId");

-- CreateIndex
CREATE INDEX "QuarantinedDocument_attachmentHash_idx" ON "QuarantinedDocument"("attachmentHash");

-- AddForeignKey
ALTER TABLE "QuarantinedDocument" ADD CONSTRAINT "QuarantinedDocument_intendedCaseId_fkey" FOREIGN KEY ("intendedCaseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarantinedDocument" ADD CONSTRAINT "QuarantinedDocument_reassignedToCaseId_fkey" FOREIGN KEY ("reassignedToCaseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarantinedDocument" ADD CONSTRAINT "QuarantinedDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarantinedDocument" ADD CONSTRAINT "QuarantinedDocument_sourceMailboxId_fkey" FOREIGN KEY ("sourceMailboxId") REFERENCES "MailboxAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
