-- Allow referrers to be created with just a name (ID number filled in later)
ALTER TABLE "Referrer" ALTER COLUMN "idNumber" DROP NOT NULL;
