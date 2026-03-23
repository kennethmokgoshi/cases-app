-- Add index on Case.updatedAt to speed up ORDER BY updatedAt DESC
CREATE INDEX IF NOT EXISTS "Case_updatedAt_idx" ON "Case"("updatedAt");

-- Add index on Case.createdAt for timeline queries
CREATE INDEX IF NOT EXISTS "Case_createdAt_idx" ON "Case"("createdAt");

-- Add index on CaseProject.projectId for WHERE projectId IN (...) queries
CREATE INDEX IF NOT EXISTS "CaseProject_projectId_idx" ON "CaseProject"("projectId");
