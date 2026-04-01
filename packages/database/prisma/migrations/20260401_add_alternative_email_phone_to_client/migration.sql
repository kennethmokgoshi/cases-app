-- AlterTable: add alternativeEmail and alternativePhone to Client
ALTER TABLE "Client" ADD COLUMN "alternativeEmail" TEXT;
ALTER TABLE "Client" ADD COLUMN "alternativePhone" TEXT;
