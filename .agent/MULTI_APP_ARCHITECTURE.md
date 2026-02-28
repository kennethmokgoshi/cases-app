# Multi-Application Architecture Plan
## Insurance & Legal Applications Connected to Cases App

---

## 🎯 Executive Summary

This document outlines the architecture for creating **separate Insurance and Legal applications** that integrate with the existing **Cases application** (Zenowethu). This approach keeps the codebase manageable while enabling data sharing and unified user experience.

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SHARED INFRASTRUCTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│   │   CASES APP      │  │  INSURANCE APP   │  │   LEGAL APP      │     │
│   │   (Main Hub)     │  │   (Satellite)    │  │   (Satellite)    │     │
│   │                  │  │                  │  │                  │     │
│   │  - Cases         │  │  - Policies      │  │  - Legal Matters │     │
│   │  - Clients       │  │  - Claims        │  │  - Court Cases   │     │
│   │  - Documents     │  │  - Premiums      │  │  - Settlements   │     │
│   │  - Payments      │  │  - Beneficiaries │  │  - Attorneys     │     │
│   │  - Users Auth    │  │                  │  │                  │     │
│   └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘     │
│            │                     │                      │               │
│            └─────────────────────┼──────────────────────┘               │
│                                  │                                       │
│                    ┌─────────────▼─────────────┐                        │
│                    │   SHARED POSTGRESQL DB    │                        │
│                    │   (Single Source of Truth)│                        │
│                    └───────────────────────────┘                        │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    SHARED SERVICES LAYER                         │   │
│   │  ┌─────────┐  ┌─────────────┐  ┌────────────┐  ┌─────────────┐  │   │
│   │  │   Auth  │  │  File       │  │ Notific.   │  │  Reporting  │  │   │
│   │  │   SSO   │  │  Storage    │  │ Service    │  │  Analytics  │  │   │
│   │  └─────────┘  └─────────────┘  └────────────┘  └─────────────┘  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Recommended Approach: Shared Database + API Integration

### Option A: Shared Database (Recommended)
All three applications connect to the **same PostgreSQL database**, with domain-specific tables for each app.

**Pros:**
- ✅ Real-time data consistency
- ✅ No API latency for data access
- ✅ Simpler implementation
- ✅ Single backup strategy

**Cons:**
- ⚠️ Schema changes require coordination
- ⚠️ Tight coupling at database level

### Option B: API-First Microservices
Insurance and Legal apps call the Cases API for shared data.

**Pros:**
- ✅ Complete separation of concerns
- ✅ Independent deployments

**Cons:**
- ⚠️ More complex implementation
- ⚠️ API versioning overhead
- ⚠️ Eventual consistency challenges

---

## 📁 Recommended Project Structure

```
/zenowethu-ecosystem/
│
├── apps/
│   ├── cases/                    # Current application (renamed)
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── package.json
│   │
│   ├── insurance/                # New Insurance App
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── package.json
│   │
│   └── legal/                    # New Legal App
│       ├── app/
│       ├── components/
│       ├── lib/
│       └── package.json
│
├── packages/
│   ├── shared-db/                # Shared Prisma schema
│   │   ├── prisma/
│   │   │   └── schema.prisma     # Complete schema for all apps
│   │   └── package.json
│   │
│   ├── shared-ui/                # Shared UI components
│   │   ├── components/
│   │   └── package.json
│   │
│   ├── shared-auth/              # Shared authentication
│   │   ├── lib/
│   │   └── package.json
│   │
│   └── shared-utils/             # Common utilities
│       ├── lib/
│       └── package.json
│
├── docker-compose.yml            # All apps + shared services
├── turbo.json                    # Turborepo configuration
└── package.json                  # Root workspace
```

---

## 🗄️ Database Schema Extension

### New Tables for Insurance App

```prisma
// ===== INSURANCE DOMAIN =====

model InsurancePolicy {
  id               String              @id @default(cuid())
  policyNumber     String              @unique
  clientId         String
  caseId           String?             // Link to existing case
  
  // Policy Details
  type             String              // LIFE, FUNERAL, CREDIT_LIFE, SHORT_TERM
  provider         String              // Insurance company name
  status           String              @default("ACTIVE") // ACTIVE, LAPSED, CANCELLED, CLAIMED
  
  // Coverage
  coverAmount      Decimal
  premium          Decimal
  frequency        String              @default("MONTHLY") // MONTHLY, ANNUAL
  startDate        DateTime
  endDate          DateTime?
  
  // Tracking
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt
  createdById      String?
  assignedToId     String?
  
  // Relations
  client           Client              @relation(fields: [clientId], references: [id])
  case             Case?               @relation(fields: [caseId], references: [id])
  createdBy        User?               @relation("PolicyCreator", fields: [createdById], references: [id])
  assignedTo       User?               @relation("PolicyAssignee", fields: [assignedToId], references: [id])
  claims           InsuranceClaim[]
  beneficiaries    PolicyBeneficiary[]
  premiumPayments  PremiumPayment[]
  documents        InsuranceDocument[]
  
  @@index([clientId])
  @@index([caseId])
  @@index([status])
}

model InsuranceClaim {
  id              String           @id @default(cuid())
  claimNumber     String           @unique
  policyId        String
  
  // Claim Details
  type            String           // DEATH, DISABILITY, RETRENCHMENT, HOSPITAL
  status          String           @default("SUBMITTED") // SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, PAID
  amount          Decimal?
  approvedAmount  Decimal?
  
  // Incident Details
  incidentDate    DateTime
  reportedDate    DateTime         @default(now())
  description     String?
  
  // Processing
  processedAt     DateTime?
  processedById   String?
  rejectionReason String?
  
  // Tracking
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  
  // Relations
  policy          InsurancePolicy  @relation(fields: [policyId], references: [id])
  processedBy     User?            @relation("ClaimProcessor", fields: [processedById], references: [id])
  documents       ClaimDocument[]
  
  @@index([policyId])
  @@index([status])
}

model PolicyBeneficiary {
  id              String           @id @default(cuid())
  policyId        String
  
  // Beneficiary Details
  firstName       String
  lastName        String
  idNumber        String
  relationship    String           // SPOUSE, CHILD, PARENT, SIBLING, OTHER
  percentage      Int              // Percentage of benefit
  phone           String?
  email           String?
  
  // Relations
  policy          InsurancePolicy  @relation(fields: [policyId], references: [id], onDelete: Cascade)
  
  @@index([policyId])
}

model PremiumPayment {
  id              String           @id @default(cuid())
  policyId        String
  
  // Payment Details
  amount          Decimal
  dueDate         DateTime
  paidDate        DateTime?
  status          String           @default("PENDING") // PENDING, PAID, OVERDUE, WAIVED
  reference       String?
  method          String?
  
  // Relations
  policy          InsurancePolicy  @relation(fields: [policyId], references: [id])
  
  @@index([policyId])
  @@index([status])
}

model InsuranceDocument {
  id              String           @id @default(cuid())
  policyId        String
  type            String           // POLICY_DOCUMENT, ID_COPY, BENEFICIARY_ID, etc.
  fileName        String
  fileUrl         String
  fileSize        Int
  mimeType        String
  uploadedAt      DateTime         @default(now())
  
  // Relations
  policy          InsurancePolicy  @relation(fields: [policyId], references: [id], onDelete: Cascade)
  
  @@index([policyId])
}

model ClaimDocument {
  id              String           @id @default(cuid())
  claimId         String
  type            String           // DEATH_CERTIFICATE, MEDICAL_REPORT, POLICE_REPORT, etc.
  fileName        String
  fileUrl         String
  fileSize        Int
  mimeType        String
  uploadedAt      DateTime         @default(now())
  
  // Relations
  claim           InsuranceClaim   @relation(fields: [claimId], references: [id], onDelete: Cascade)
  
  @@index([claimId])
}
```

### New Tables for Legal App

```prisma
// ===== LEGAL DOMAIN =====

model LegalMatter {
  id                  String           @id @default(cuid())
  matterNumber        String           @unique
  clientId            String
  caseId              String?          // Link to existing case
  
  // Matter Details
  type                String           // DEBT_COLLECTION, PRESCRIPTION, EMOLUMENT, LITIGATION
  status              String           @default("OPEN") // OPEN, IN_PROGRESS, PENDING_COURT, SETTLED, CLOSED
  priority            String           @default("NORMAL") // LOW, NORMAL, HIGH, URGENT
  
  // Financial
  claimAmount         Decimal?
  settledAmount       Decimal?
  legalFees           Decimal?
  courtCosts          Decimal?
  
  // Dates
  instructionDate     DateTime         @default(now())
  prescriptionDate    DateTime?
  nextCourtDate       DateTime?
  closedDate          DateTime?
  
  // Assignment
  assignedAttorneyId  String?
  primaryContactId    String?
  
  // Tracking
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  createdById         String?
  
  // Relations
  client              Client           @relation(fields: [clientId], references: [id])
  case                Case?            @relation(fields: [caseId], references: [id])
  assignedAttorney    Attorney?        @relation(fields: [assignedAttorneyId], references: [id])
  createdBy           User?            @relation("MatterCreator", fields: [createdById], references: [id])
  courtCases          CourtCase[]
  documents           LegalDocument[]
  notes               LegalNote[]
  creditors           MatterCreditor[]
  timeEntries         TimeEntry[]
  
  @@index([clientId])
  @@index([caseId])
  @@index([status])
  @@index([assignedAttorneyId])
}

model Attorney {
  id                  String           @id @default(cuid())
  
  // Attorney Details
  firstName           String
  lastName            String
  practitionerNumber  String?          @unique
  email               String           @unique
  phone               String?
  firm                String?
  specialization      String?
  
  // Status
  isActive            Boolean          @default(true)
  userId              String?          // Link to system user if applicable
  
  // Tracking
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  
  // Relations
  user                User?            @relation(fields: [userId], references: [id])
  matters             LegalMatter[]
  courtAppearances    CourtAppearance[]
  
  @@index([userId])
}

model CourtCase {
  id                  String           @id @default(cuid())
  matterId            String
  
  // Court Details
  caseNumber          String
  court               String           // Court name
  courtType           String           // MAGISTRATES, HIGH, SMALL_CLAIMS
  division            String?          // Civil, Criminal, etc.
  
  // Status
  status              String           @default("PENDING") // PENDING, ACTIVE, JUDGEMENT, CLOSED
  outcome             String?          // FAVOUR_CLIENT, AGAINST, SETTLED, DISMISSED
  judgementAmount     Decimal?
  
  // Dates
  filedDate           DateTime?
  firstAppearance     DateTime?
  judgementDate       DateTime?
  
  // Tracking
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  
  // Relations
  matter              LegalMatter      @relation(fields: [matterId], references: [id])
  appearances         CourtAppearance[]
  
  @@index([matterId])
  @@index([status])
}

model CourtAppearance {
  id                  String           @id @default(cuid())
  courtCaseId         String
  
  // Appearance Details
  date                DateTime
  time                String?
  purpose             String           // FIRST_APPEARANCE, TRIAL, SENTENCING, etc.
  outcome             String?
  notes               String?
  
  // Attendance
  attorneyId          String?
  clientAttended      Boolean          @default(false)
  
  // Relations
  courtCase           CourtCase        @relation(fields: [courtCaseId], references: [id])
  attorney            Attorney?        @relation(fields: [attorneyId], references: [id])
  
  @@index([courtCaseId])
  @@index([date])
}

model MatterCreditor {
  id                  String           @id @default(cuid())
  matterId            String
  
  // Creditor Details
  name                String
  accountNumber       String?
  originalAmount      Decimal
  currentBalance      Decimal
  status              String           @default("ACTIVE") // ACTIVE, PRESCRIBED, SETTLED, DISPUTED
  
  // Contact
  contactPerson       String?
  phone               String?
  email               String?
  address             String?
  
  // Relations
  matter              LegalMatter      @relation(fields: [matterId], references: [id], onDelete: Cascade)
  
  @@index([matterId])
}

model LegalDocument {
  id                  String           @id @default(cuid())
  matterId            String
  
  // Document Details
  type                String           // CONTRACT, COURT_ORDER, SETTLEMENT, LETTER, etc.
  fileName            String
  fileUrl             String
  fileSize            Int
  mimeType            String
  description         String?
  
  // Tracking
  uploadedAt          DateTime         @default(now())
  uploadedById        String?
  
  // Relations
  matter              LegalMatter      @relation(fields: [matterId], references: [id], onDelete: Cascade)
  uploadedBy          User?            @relation("LegalDocUploader", fields: [uploadedById], references: [id])
  
  @@index([matterId])
  @@index([type])
}

model LegalNote {
  id                  String           @id @default(cuid())
  matterId            String
  
  // Note Details
  content             String
  type                String           @default("NOTE") // NOTE, PHONE_CALL, MEETING, EMAIL
  isPrivate           Boolean          @default(false)
  
  // Tracking
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  createdById         String
  
  // Relations
  matter              LegalMatter      @relation(fields: [matterId], references: [id], onDelete: Cascade)
  createdBy           User             @relation("LegalNoteCreator", fields: [createdById], references: [id])
  
  @@index([matterId])
  @@index([createdAt])
}

model TimeEntry {
  id                  String           @id @default(cuid())
  matterId            String
  
  // Time Details
  date                DateTime
  hours               Decimal
  description         String
  rate                Decimal
  total               Decimal
  
  // Billing
  isBilled            Boolean          @default(false)
  billedDate          DateTime?
  
  // Tracking
  createdById         String
  createdAt           DateTime         @default(now())
  
  // Relations
  matter              LegalMatter      @relation(fields: [matterId], references: [id])
  createdBy           User             @relation("TimeEntryCreator", fields: [createdById], references: [id])
  
  @@index([matterId])
  @@index([date])
}
```

---

## 🔐 Authentication Strategy: Single Sign-On (SSO)

All three applications will share the same authentication system from the Cases app.

### Implementation Options:

#### Option 1: NextAuth Shared Session (Recommended for Same Domain)
```typescript
// All apps use the same AUTH_SECRET and session configuration
// Sessions are shared via cookies on *.zenowethu.co.za

// In each app's lib/auth.ts:
export const authConfig = {
  secret: process.env.AUTH_SECRET, // Same secret across all apps
  session: {
    strategy: "jwt",
  },
  cookies: {
    sessionToken: {
      name: "zenowethu.session",
      options: {
        domain: ".zenowethu.co.za", // Shared across subdomains
        path: "/",
        httpOnly: true,
        secure: true,
      },
    },
  },
};
```

#### Option 2: Token-Based Authentication
```typescript
// Cases app becomes the auth provider
// Insurance/Legal apps validate tokens with Cases API

// Insurance/Legal app middleware:
async function validateSession() {
  const token = cookies().get("zenowethu.session");
  const response = await fetch(`${CASES_API_URL}/api/auth/validate`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
}
```

---

## 🌐 Deployment Strategy

### Subdomain Structure:
```
cases.zenowethu.co.za      → Main Cases Application
insurance.zenowethu.co.za  → Insurance Application
legal.zenowethu.co.za      → Legal Application
api.zenowethu.co.za        → Shared API Gateway (optional)
```

### Docker Compose Example:
```yaml
version: '3.8'

services:
  # Database (shared)
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: zenowethu
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # Cases App (Main)
  cases:
    build: ./apps/cases
    environment:
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/zenowethu
      - AUTH_SECRET=${AUTH_SECRET}
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  # Insurance App
  insurance:
    build: ./apps/insurance
    environment:
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/zenowethu
      - AUTH_SECRET=${AUTH_SECRET}
      - CASES_API_URL=http://cases:3000
    ports:
      - "3001:3000"
    depends_on:
      - postgres
      - cases

  # Legal App
  legal:
    build: ./apps/legal
    environment:
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/zenowethu
      - AUTH_SECRET=${AUTH_SECRET}
      - CASES_API_URL=http://cases:3000
    ports:
      - "3002:3000"
    depends_on:
      - postgres
      - cases

volumes:
  postgres_data:
```

---

## 🔗 Cross-App Navigation

### Unified Navigation Header:
```tsx
// packages/shared-ui/components/AppSwitcher.tsx
export function AppSwitcher() {
  return (
    <div className="app-switcher">
      <a href="https://cases.zenowethu.co.za" className={isActive('/cases')}>
        📁 Cases
      </a>
      <a href="https://insurance.zenowethu.co.za" className={isActive('/insurance')}>
        🛡️ Insurance
      </a>
      <a href="https://legal.zenowethu.co.za" className={isActive('/legal')}>
        ⚖️ Legal
      </a>
    </div>
  );
}
```

### Deep Linking:
```tsx
// From Insurance app, link to related case:
<Link href={`https://cases.zenowethu.co.za/cases/${policy.caseId}`}>
  View Related Case
</Link>

// From Cases app, link to insurance policies:
<Link href={`https://insurance.zenowethu.co.za/policies?clientId=${client.id}`}>
  View Insurance Policies
</Link>
```

---

## 📋 Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up monorepo structure with Turborepo
- [ ] Extract shared packages from current Cases app
- [ ] Create shared-db package with extended Prisma schema
- [ ] Set up shared authentication

### Phase 2: Insurance App (Week 3-5)
- [ ] Scaffold Insurance app structure
- [ ] Implement policy management CRUD
- [ ] Implement claims processing
- [ ] Implement beneficiary management
- [ ] Implement premium tracking
- [ ] Build Insurance dashboard

### Phase 3: Legal App (Week 6-8)
- [ ] Scaffold Legal app structure
- [ ] Implement matter management
- [ ] Implement court case tracking
- [ ] Implement attorney management
- [ ] Implement document management
- [ ] Build Legal dashboard

### Phase 4: Integration & Polish (Week 9-10)
- [ ] Implement cross-app navigation
- [ ] Set up shared notifications
- [ ] Create unified reporting
- [ ] Deploy all apps
- [ ] Testing and QA

---

## ✅ Benefits of This Architecture

| Benefit | Description |
|---------|-------------|
| **Manageable Codebases** | Each app stays focused and maintainable |
| **Team Scalability** | Different teams can work on different apps |
| **Independent Deployments** | Deploy apps independently without affecting others |
| **Shared Data** | All apps access the same client/case data |
| **Unified Experience** | SSO and consistent UI across apps |
| **Gradual Migration** | Build new apps while current app continues operating |

---

## 🚀 Quick Start Commands

```bash
# Create monorepo structure
mkdir zenowethu-ecosystem
cd zenowethu-ecosystem

# Initialize Turborepo
npx create-turbo@latest .

# Move current app
mv ../Custom\ Credit\ Repair\ -\ Copy ./apps/cases

# Create new apps
npx create-next-app@latest ./apps/insurance --typescript --tailwind --app
npx create-next-app@latest ./apps/legal --typescript --tailwind --app

# Create shared packages
mkdir -p packages/shared-db packages/shared-ui packages/shared-auth packages/shared-utils
```

---

## 📞 Need Help?

Let me know when you're ready to start implementing any phase, and I can provide detailed code and step-by-step guidance for each component!
