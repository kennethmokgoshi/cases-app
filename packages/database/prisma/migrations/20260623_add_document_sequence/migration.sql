-- CreateTable DocumentSequence
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextSeq" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for uniqueness on prefix and year
CREATE UNIQUE INDEX "DocumentSequence_prefix_year_key" ON "DocumentSequence"("prefix", "year");

-- CreateIndex for querying by prefix and year
CREATE INDEX "DocumentSequence_prefix_year_idx" ON "DocumentSequence"("prefix", "year");
