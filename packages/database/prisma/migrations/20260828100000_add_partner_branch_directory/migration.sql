-- CreateTable
CREATE TABLE "PartnerBranch" (
    "id" TEXT NOT NULL,
    "partnerProjectId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "alternatePhone" TEXT,
    "whatsappNumber" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerBranch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerBranch_projectId_key" ON "PartnerBranch"("projectId");

-- CreateIndex
CREATE INDEX "PartnerBranch_partnerProjectId_idx" ON "PartnerBranch"("partnerProjectId");

-- CreateIndex
CREATE INDEX "PartnerBranch_isActive_idx" ON "PartnerBranch"("isActive");

-- CreateIndex
CREATE INDEX "PartnerBranch_name_idx" ON "PartnerBranch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerBranch_partnerProjectId_name_key" ON "PartnerBranch"("partnerProjectId", "name");

-- AddForeignKey
ALTER TABLE "PartnerBranch" ADD CONSTRAINT "PartnerBranch_partnerProjectId_fkey" FOREIGN KEY ("partnerProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerBranch" ADD CONSTRAINT "PartnerBranch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "partnerBranchId" TEXT;

-- CreateIndex
CREATE INDEX "Case_partnerBranchId_idx" ON "Case"("partnerBranchId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_partnerBranchId_fkey" FOREIGN KEY ("partnerBranchId") REFERENCES "PartnerBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Data seed ────────────────────────────────────────────────────────────────
-- Every branch that already exists in the Project tree gets a contact record.
-- A B2B partner is an ACQUISITION_SOURCE project with clientType = 'B2B'; its
-- branches are the REFERRER/BRANCH children (YEAR and MONTH folders are the
-- filing hierarchy, not branches).
--
-- Contact columns are deliberately left NULL — they are filled in through
-- /admin/partner-branches or its CSV import. Nothing is invented here.
INSERT INTO "PartnerBranch" ("id", "partnerProjectId", "projectId", "name", "isActive", "createdAt", "updatedAt")
SELECT
    'pbr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 21),
    partner."id",
    branch."id",
    btrim(branch."name"),
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Project" branch
JOIN "Project" partner ON partner."id" = branch."parentId"
WHERE partner."type" = 'ACQUISITION_SOURCE'
  AND partner."clientType" = 'B2B'
  AND branch."type" IN ('REFERRER', 'BRANCH')
  AND btrim(branch."name") <> ''
ON CONFLICT ("partnerProjectId", "name") DO NOTHING;

-- Branch names that only ever appeared as free text on cases (no Project folder
-- of their own) also become contactable records, so no case is left without a
-- fallback contact to configure.
INSERT INTO "PartnerBranch" ("id", "partnerProjectId", "projectId", "name", "isActive", "createdAt", "updatedAt")
SELECT DISTINCT ON (partner."id", btrim(c."partnerBranch"))
    'pbr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 21),
    partner."id",
    NULL,
    btrim(c."partnerBranch"),
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Case" c
JOIN "Project" partner
  ON partner."type" = 'ACQUISITION_SOURCE'
 AND partner."clientType" = 'B2B'
 AND lower(btrim(partner."name")) = lower(btrim(c."partnerName"))
WHERE c."partnerBranch" IS NOT NULL
  AND btrim(c."partnerBranch") <> ''
ON CONFLICT ("partnerProjectId", "name") DO NOTHING;

-- Link existing cases to their branch record by name, so the fallback chain
-- works for historical cases and not just new ones.
UPDATE "Case" c
SET "partnerBranchId" = pb."id"
FROM "PartnerBranch" pb
JOIN "Project" partner ON partner."id" = pb."partnerProjectId"
WHERE c."partnerBranchId" IS NULL
  AND c."partnerBranch" IS NOT NULL
  AND lower(btrim(c."partnerBranch")) = lower(pb."name")
  AND lower(btrim(c."partnerName")) = lower(btrim(partner."name"));
