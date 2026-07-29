-- CreateTable EmployeePresence
CREATE TABLE "EmployeePresence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastActivityAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePresence_userId_key" ON "EmployeePresence"("userId");

-- CreateIndex
CREATE INDEX "EmployeePresence_userId_idx" ON "EmployeePresence"("userId");

-- CreateIndex
CREATE INDEX "EmployeePresence_status_idx" ON "EmployeePresence"("status");

-- CreateIndex
CREATE INDEX "EmployeePresence_lastActivityAt_idx" ON "EmployeePresence"("lastActivityAt");

-- AddForeignKey
ALTER TABLE "EmployeePresence" ADD CONSTRAINT "EmployeePresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;