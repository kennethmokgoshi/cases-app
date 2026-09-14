-- Link the cases whose partnerName is a longer form of the partner project's
-- name — e.g. a case captured against "Letsatsi Finance" or "Shosholoza
-- Finance" when the project is named "Letsatsi" / "Shosholoza". Without this
-- they have no branch link and therefore no fallback contact.
--
-- The match is anchored: the project name must be a leading whole word of the
-- case's partnerName, so "Letsatsi" matches "Letsatsi Finance" but never some
-- unrelated partner that merely contains the same letters.
UPDATE "Case" c
SET "partnerBranchId" = pb."id"
FROM "PartnerBranch" pb
JOIN "Project" partner ON partner."id" = pb."partnerProjectId"
WHERE c."partnerBranchId" IS NULL
  AND c."partnerBranch" IS NOT NULL
  AND lower(btrim(c."partnerBranch")) = lower(pb."name")
  AND lower(btrim(c."partnerName")) LIKE lower(btrim(partner."name")) || ' %';
