-- CreateTable
CREATE TABLE "Lead" (
    "id"              TEXT NOT NULL,
    "firstName"       TEXT NOT NULL,
    "lastName"        TEXT NOT NULL,
    "idNumber"        TEXT,
    "phone"           TEXT NOT NULL,
    "email"           TEXT,
    "service"         TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'NEW',
    "source"          TEXT NOT NULL DEFAULT 'WEBSITE_ASSESSMENT',
    "popiaConsent"    BOOLEAN NOT NULL DEFAULT false,
    "notes"           TEXT,
    "convertedCaseId" TEXT,
    "assignedToId"    TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
