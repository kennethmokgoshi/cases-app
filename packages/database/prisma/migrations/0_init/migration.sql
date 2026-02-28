-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'FOLDER',
    "clientType" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "whatsappNumber" TEXT,
    "telegramNumber" TEXT,
    "address" TEXT,
    "employer" TEXT,
    "employeeNo" TEXT,
    "grossSalary" DECIMAL(65,30),
    "netSalary" DECIMAL(65,30),
    "salaryPayDate" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'Standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "fileNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "acquisitionType" TEXT NOT NULL DEFAULT 'B2C',
    "partnerName" TEXT,
    "partnerBranch" TEXT,
    "r350Status" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "serviceFeeCollectedBy" TEXT NOT NULL DEFAULT 'ZENOWETHU',
    "partnerSplitPercent" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "statusEntryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3),
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "daysInStatus" INTEGER NOT NULL DEFAULT 0,
    "serviceFee" DECIMAL(65,30),
    "instalments" INTEGER NOT NULL DEFAULT 1,
    "zenowethuShare" DECIMAL(65,30),
    "isInvoiced" BOOLEAN NOT NULL DEFAULT false,
    "closedAccounts" INTEGER NOT NULL DEFAULT 0,
    "openAccounts" INTEGER NOT NULL DEFAULT 0,
    "prescribedAccounts" INTEGER NOT NULL DEFAULT 0,
    "totalDebtAmount" DECIMAL(65,30) DEFAULT 0,
    "totalMonthlyInstallment" DECIMAL(65,30) DEFAULT 0,
    "cb_ncrdcNo" TEXT,
    "cb_debtCounsellor" TEXT,
    "cb_contactNo" TEXT,
    "cb_applicationDate" TIMESTAMP(3),
    "cb_status" TEXT,
    "cb_statusDate" TIMESTAMP(3),
    "ncrdcNo" TEXT,
    "dhsStatus" TEXT,
    "dhsDaysCounter" TEXT,
    "debtReviewDate" TIMESTAMP(3),
    "debtCounsellorName" TEXT,
    "dcTradingName" TEXT,
    "dcEmail" TEXT,
    "lastKnownEmail" TEXT,
    "dcOperatingStatus" TEXT,
    "dcMobile" TEXT,
    "consumerDhsStatus" TEXT,
    "requestedDhsStatus" TEXT,
    "dhsPreviousStatus" TEXT,
    "previousDebtCounsellor" TEXT,
    "dhsStatusDate" TIMESTAMP(3),
    "dhsApplicationDate" TIMESTAMP(3),
    "nctCaseNumber" TEXT,
    "nctStatus" TEXT,
    "nctFilingDate" TIMESTAMP(3),
    "nctLastUpdated" TIMESTAMP(3),
    "nctEPurseBalance" DECIMAL(65,30),
    "afterCareFees" DECIMAL(65,30),
    "legalFees" DECIMAL(65,30),
    "legalFeesStatus" TEXT,
    "legalFeesPayment" TEXT,
    "legalFeesInvDate" TIMESTAMP(3),
    "feesConsent" DECIMAL(65,30),
    "totalFees" DECIMAL(65,30),
    "affordabilityStatus" TEXT,
    "assessmentDate" TIMESTAMP(3),
    "nextUpdate" TIMESTAMP(3),
    "fileToBeCompleted" TIMESTAMP(3),
    "insuranceNotes" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Standard',
    "services" TEXT,
    "todos" TEXT,
    "declineReason" TEXT,
    "declineReasonAttended" BOOLEAN NOT NULL DEFAULT false,
    "aiAutonomyLevel" TEXT NOT NULL DEFAULT 'CO_PILOT',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" TIMESTAMP(3),
    "extractedData" TEXT,
    "uploadedById" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseProject" (
    "caseId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CaseProject_pkey" PRIMARY KEY ("caseId","projectId")
);

-- CreateTable
CREATE TABLE "WorkflowLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'STATUS_CHANGE',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "notes" TEXT,

    CONSTRAINT "WorkflowLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "organization" TEXT NOT NULL DEFAULT 'Zenowethu',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),
    "b2bPartnerId" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "userType" TEXT NOT NULL DEFAULT 'STAFF',
    "avatarUrl" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "resetPasswordToken" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseComment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "activityType" TEXT,
    "activityData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "type" TEXT NOT NULL DEFAULT 'NOTE',

    CONSTRAINT "CaseComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentMention" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InAppNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "caseId" TEXT,
    "commentId" TEXT,
    "linkUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "statusCode" TEXT,
    "message" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "error" TEXT,
    "provider" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "htmlBody" TEXT,
    "senderId" TEXT,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT 'read',
    "projectId" TEXT,
    "rateLimit" INTEGER NOT NULL DEFAULT 1000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentResource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "category" TEXT NOT NULL,
    "acquisitionType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "category" TEXT NOT NULL DEFAULT 'INSTALLMENT',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "clientId" TEXT,
    "caseId" TEXT,
    "batchId" TEXT,
    "unmatchedId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "PaymentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "clientId" TEXT,
    "caseId" TEXT,
    "projectId" TEXT,
    "lineItems" JSONB NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(65,30) NOT NULL DEFAULT 0.15,
    "vatAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "pdfPath" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentTo" TEXT,
    "notes" TEXT,
    "reference" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "accountType" TEXT NOT NULL,
    "originalAmount" DECIMAL(65,30),
    "outstandingBalance" DECIMAL(65,30) NOT NULL,
    "monthlyInstalment" DECIMAL(65,30),
    "interestRate" DECIMAL(65,30),
    "termMonths" INTEGER,
    "accountOpenDate" TIMESTAMP(3),
    "premiumSource" TEXT NOT NULL DEFAULT 'NOT_SET',
    "premiumAmount" DECIMAL(65,30),
    "premiumRate" DECIMAL(65,30),
    "premiumConfidence" TEXT NOT NULL DEFAULT 'LOW',
    "hasInsurance" BOOLEAN NOT NULL DEFAULT true,
    "insurerName" TEXT,
    "policyNumber" TEXT,
    "lastPaymentDate" TIMESTAMP(3),
    "isPrescribed" BOOLEAN NOT NULL DEFAULT false,
    "prescriptionDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isIncluded" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccountDocument" (
    "id" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "extractedData" TEXT,
    "extractedPremium" DECIMAL(65,30),
    "extractedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "CreditAccountDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLifeRateTable" (
    "id" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "minRate" DECIMAL(65,30) NOT NULL,
    "maxRate" DECIMAL(65,30) NOT NULL,
    "avgRate" DECIMAL(65,30) NOT NULL,
    "source" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditLifeRateTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceAssessment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "totalCurrentPremium" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAccounts" INTEGER NOT NULL DEFAULT 0,
    "replacementPremium" DECIMAL(65,30),
    "monthlySavings" DECIMAL(65,30),
    "annualSavings" DECIMAL(65,30),
    "savingsPercent" DECIMAL(65,30),
    "insurer" TEXT,
    "policyType" TEXT,
    "coverAmount" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "acceptedAt" TIMESTAMP(3),
    "policyIssuedAt" TIMESTAMP(3),
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentDate" TIMESTAMP(3),
    "consentMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "InsuranceAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceAssessmentAccount" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "currentPremium" DECIMAL(65,30),
    "premiumSource" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "isIncluded" BOOLEAN NOT NULL DEFAULT true,
    "exclusionReason" TEXT,

    CONSTRAINT "InsuranceAssessmentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "premiumAmount" DECIMAL(65,30) NOT NULL,
    "coverAmount" DECIMAL(65,30) NOT NULL,
    "coverDeath" BOOLEAN NOT NULL DEFAULT true,
    "coverDisability" BOOLEAN NOT NULL DEFAULT true,
    "coverRetrenchment" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationLetter" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "letterType" TEXT NOT NULL DEFAULT 'CREDIT_LIFE_CANCELLATION',
    "letterContent" TEXT,
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "sentVia" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalMatter" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "matterType" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "originalAmount" DECIMAL(65,30),
    "currentBalance" DECIMAL(65,30),
    "interestCharged" DECIMAL(65,30),
    "lastPaymentDate" TIMESTAMP(3),
    "prescriptionDate" TIMESTAMP(3),
    "isPrescribed" BOOLEAN NOT NULL DEFAULT false,
    "judgmentDate" TIMESTAMP(3),
    "judgmentAmount" DECIMAL(65,30),
    "judgmentCourt" TEXT,
    "judgmentCaseNumber" TEXT,
    "debtReviewDate" TIMESTAMP(3),
    "debtCounsellorName" TEXT,
    "courtOrderDate" TIMESTAMP(3),
    "letterSent" BOOLEAN NOT NULL DEFAULT false,
    "letterSentDate" TIMESTAMP(3),
    "responseReceived" BOOLEAN NOT NULL DEFAULT false,
    "responseDate" TIMESTAMP(3),
    "responseNotes" TEXT,
    "outcome" TEXT,
    "outcomeDate" TIMESTAMP(3),
    "outcomeNotes" TEXT,
    "amountSaved" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "assignedToId" TEXT,

    CONSTRAINT "LegalMatter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalLetter" (
    "id" TEXT NOT NULL,
    "legalMatterId" TEXT NOT NULL,
    "letterType" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientAddress" TEXT,
    "recipientEmail" TEXT,
    "subject" TEXT,
    "letterContent" TEXT,
    "fileUrl" TEXT,
    "sentVia" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "trackingNumber" TEXT,
    "responseReceived" BOOLEAN NOT NULL DEFAULT false,
    "responseDate" TIMESTAMP(3),
    "responseContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalPrescriptionCheck" (
    "id" TEXT NOT NULL,
    "legalMatterId" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "accountType" TEXT,
    "lastPaymentDate" TIMESTAMP(3),
    "debtAge" INTEGER,
    "isPrescribed" BOOLEAN NOT NULL DEFAULT false,
    "prescriptionDate" TIMESTAMP(3),
    "daysUntilPrescription" INTEGER,
    "legalBasis" TEXT,
    "notes" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedById" TEXT,

    CONSTRAINT "LegalPrescriptionCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvidence" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,
    "uploadedById" TEXT,

    CONSTRAINT "AuditEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForensicAudit" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "auditorId" TEXT,
    "findings" TEXT,
    "recommendations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForensicAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecklessLendingAssessment" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "agreementDate" TIMESTAMP(3) NOT NULL,
    "declaredIncome" DECIMAL(65,30) NOT NULL,
    "trueIncome" DECIMAL(65,30),
    "declaredExpenses" DECIMAL(65,30) NOT NULL,
    "trueExpenses" DECIMAL(65,30),
    "existingDebt" DECIMAL(65,30) NOT NULL,
    "availableSurplus" DECIMAL(65,30),
    "instalmentAmount" DECIMAL(65,30) NOT NULL,
    "isReckless" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "assessedBy" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecklessLendingAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DocumentResourceToProject" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_idNumber_key" ON "Client"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Case_fileNumber_key" ON "Case"("fileNumber");

-- CreateIndex
CREATE INDEX "Case_status_idx" ON "Case"("status");

-- CreateIndex
CREATE INDEX "Case_isOverdue_idx" ON "Case"("isOverdue");

-- CreateIndex
CREATE INDEX "Document_caseId_idx" ON "Document"("caseId");

-- CreateIndex
CREATE INDEX "Document_type_idx" ON "Document"("type");

-- CreateIndex
CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetPasswordToken_key" ON "User"("resetPasswordToken");

-- CreateIndex
CREATE INDEX "CaseComment_caseId_idx" ON "CaseComment"("caseId");

-- CreateIndex
CREATE INDEX "CaseComment_userId_idx" ON "CaseComment"("userId");

-- CreateIndex
CREATE INDEX "CaseComment_type_idx" ON "CaseComment"("type");

-- CreateIndex
CREATE INDEX "CaseComment_createdAt_idx" ON "CaseComment"("createdAt");

-- CreateIndex
CREATE INDEX "CommentMention_userId_idx" ON "CommentMention"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentMention_commentId_userId_key" ON "CommentMention"("commentId", "userId");

-- CreateIndex
CREATE INDEX "InAppNotification_userId_isRead_idx" ON "InAppNotification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "InAppNotification_createdAt_idx" ON "InAppNotification"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_caseId_idx" ON "NotificationLog"("caseId");

-- CreateIndex
CREATE INDEX "NotificationLog_senderId_idx" ON "NotificationLog"("senderId");

-- CreateIndex
CREATE INDEX "NotificationLog_sentAt_idx" ON "NotificationLog"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_key_idx" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_projectId_idx" ON "ApiKey"("projectId");

-- CreateIndex
CREATE INDEX "ApiKey_isActive_idx" ON "ApiKey"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSettings_key_key" ON "SystemSettings"("key");

-- CreateIndex
CREATE INDEX "SystemSettings_category_idx" ON "SystemSettings"("category");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroup_name_key" ON "UserGroup"("name");

-- CreateIndex
CREATE INDEX "UserGroupMember_groupId_idx" ON "UserGroupMember"("groupId");

-- CreateIndex
CREATE INDEX "UserGroupMember_userId_idx" ON "UserGroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroupMember_groupId_userId_key" ON "UserGroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "MessageTemplate_channel_idx" ON "MessageTemplate"("channel");

-- CreateIndex
CREATE INDEX "MessageTemplate_category_idx" ON "MessageTemplate"("category");

-- CreateIndex
CREATE INDEX "Payment_clientId_idx" ON "Payment"("clientId");

-- CreateIndex
CREATE INDEX "Payment_caseId_idx" ON "Payment"("caseId");

-- CreateIndex
CREATE INDEX "Payment_batchId_idx" ON "Payment"("batchId");

-- CreateIndex
CREATE INDEX "Payment_date_idx" ON "Payment"("date");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "PaymentBatch_uploadedAt_idx" ON "PaymentBatch"("uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_caseId_idx" ON "Invoice"("caseId");

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_dueAt_idx" ON "Invoice"("dueAt");

-- CreateIndex
CREATE INDEX "CreditAccount_caseId_idx" ON "CreditAccount"("caseId");

-- CreateIndex
CREATE INDEX "CreditAccount_clientId_idx" ON "CreditAccount"("clientId");

-- CreateIndex
CREATE INDEX "CreditAccount_accountType_idx" ON "CreditAccount"("accountType");

-- CreateIndex
CREATE INDEX "CreditAccount_status_idx" ON "CreditAccount"("status");

-- CreateIndex
CREATE INDEX "CreditAccountDocument_creditAccountId_idx" ON "CreditAccountDocument"("creditAccountId");

-- CreateIndex
CREATE INDEX "CreditAccountDocument_documentType_idx" ON "CreditAccountDocument"("documentType");

-- CreateIndex
CREATE INDEX "CreditLifeRateTable_accountType_idx" ON "CreditLifeRateTable"("accountType");

-- CreateIndex
CREATE INDEX "CreditLifeRateTable_isActive_idx" ON "CreditLifeRateTable"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLifeRateTable_creditorName_accountType_key" ON "CreditLifeRateTable"("creditorName", "accountType");

-- CreateIndex
CREATE INDEX "InsuranceAssessment_caseId_idx" ON "InsuranceAssessment"("caseId");

-- CreateIndex
CREATE INDEX "InsuranceAssessment_clientId_idx" ON "InsuranceAssessment"("clientId");

-- CreateIndex
CREATE INDEX "InsuranceAssessment_status_idx" ON "InsuranceAssessment"("status");

-- CreateIndex
CREATE INDEX "InsuranceAssessmentAccount_assessmentId_idx" ON "InsuranceAssessmentAccount"("assessmentId");

-- CreateIndex
CREATE INDEX "InsuranceAssessmentAccount_creditAccountId_idx" ON "InsuranceAssessmentAccount"("creditAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceAssessmentAccount_assessmentId_creditAccountId_key" ON "InsuranceAssessmentAccount"("assessmentId", "creditAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "InsurancePolicy_policyNumber_key" ON "InsurancePolicy"("policyNumber");

-- CreateIndex
CREATE INDEX "InsurancePolicy_assessmentId_idx" ON "InsurancePolicy"("assessmentId");

-- CreateIndex
CREATE INDEX "InsurancePolicy_status_idx" ON "InsurancePolicy"("status");

-- CreateIndex
CREATE INDEX "CancellationLetter_assessmentId_idx" ON "CancellationLetter"("assessmentId");

-- CreateIndex
CREATE INDEX "CancellationLetter_status_idx" ON "CancellationLetter"("status");

-- CreateIndex
CREATE INDEX "LegalMatter_caseId_idx" ON "LegalMatter"("caseId");

-- CreateIndex
CREATE INDEX "LegalMatter_clientId_idx" ON "LegalMatter"("clientId");

-- CreateIndex
CREATE INDEX "LegalMatter_matterType_idx" ON "LegalMatter"("matterType");

-- CreateIndex
CREATE INDEX "LegalMatter_status_idx" ON "LegalMatter"("status");

-- CreateIndex
CREATE INDEX "LegalMatter_isPrescribed_idx" ON "LegalMatter"("isPrescribed");

-- CreateIndex
CREATE INDEX "LegalLetter_legalMatterId_idx" ON "LegalLetter"("legalMatterId");

-- CreateIndex
CREATE INDEX "LegalLetter_letterType_idx" ON "LegalLetter"("letterType");

-- CreateIndex
CREATE INDEX "LegalLetter_status_idx" ON "LegalLetter"("status");

-- CreateIndex
CREATE INDEX "LegalPrescriptionCheck_legalMatterId_idx" ON "LegalPrescriptionCheck"("legalMatterId");

-- CreateIndex
CREATE INDEX "LegalPrescriptionCheck_isPrescribed_idx" ON "LegalPrescriptionCheck"("isPrescribed");

-- CreateIndex
CREATE INDEX "AuditEvidence_auditId_idx" ON "AuditEvidence"("auditId");

-- CreateIndex
CREATE INDEX "AuditEvidence_category_idx" ON "AuditEvidence"("category");

-- CreateIndex
CREATE INDEX "AuditEvidence_uploadedById_idx" ON "AuditEvidence"("uploadedById");

-- CreateIndex
CREATE INDEX "ForensicAudit_auditorId_idx" ON "ForensicAudit"("auditorId");

-- CreateIndex
CREATE INDEX "ForensicAudit_caseId_idx" ON "ForensicAudit"("caseId");

-- CreateIndex
CREATE INDEX "ForensicAudit_status_idx" ON "ForensicAudit"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RecklessLendingAssessment_auditId_key" ON "RecklessLendingAssessment"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "_DocumentResourceToProject_AB_unique" ON "_DocumentResourceToProject"("A", "B");

-- CreateIndex
CREATE INDEX "_DocumentResourceToProject_B_index" ON "_DocumentResourceToProject"("B");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseProject" ADD CONSTRAINT "CaseProject_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseProject" ADD CONSTRAINT "CaseProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowLog" ADD CONSTRAINT "WorkflowLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowLog" ADD CONSTRAINT "WorkflowLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_b2bPartnerId_fkey" FOREIGN KEY ("b2bPartnerId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseComment" ADD CONSTRAINT "CaseComment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseComment" ADD CONSTRAINT "CaseComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CaseComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PaymentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccountDocument" ADD CONSTRAINT "CreditAccountDocument_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "CreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceAssessment" ADD CONSTRAINT "InsuranceAssessment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceAssessmentAccount" ADD CONSTRAINT "InsuranceAssessmentAccount_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "InsuranceAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceAssessmentAccount" ADD CONSTRAINT "InsuranceAssessmentAccount_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "CreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "InsuranceAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationLetter" ADD CONSTRAINT "CancellationLetter_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "InsuranceAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalMatter" ADD CONSTRAINT "LegalMatter_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalMatter" ADD CONSTRAINT "LegalMatter_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalLetter" ADD CONSTRAINT "LegalLetter_legalMatterId_fkey" FOREIGN KEY ("legalMatterId") REFERENCES "LegalMatter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalPrescriptionCheck" ADD CONSTRAINT "LegalPrescriptionCheck_legalMatterId_fkey" FOREIGN KEY ("legalMatterId") REFERENCES "LegalMatter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvidence" ADD CONSTRAINT "AuditEvidence_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "ForensicAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvidence" ADD CONSTRAINT "AuditEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForensicAudit" ADD CONSTRAINT "ForensicAudit_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForensicAudit" ADD CONSTRAINT "ForensicAudit_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecklessLendingAssessment" ADD CONSTRAINT "RecklessLendingAssessment_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "ForensicAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DocumentResourceToProject" ADD CONSTRAINT "_DocumentResourceToProject_A_fkey" FOREIGN KEY ("A") REFERENCES "DocumentResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DocumentResourceToProject" ADD CONSTRAINT "_DocumentResourceToProject_B_fkey" FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

