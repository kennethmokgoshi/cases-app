-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'production';

-- CreateIndex
CREATE INDEX "AiUsage_environment_app_createdAt_idx" ON "AiUsage"("environment", "app", "createdAt");
