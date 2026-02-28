# ZenoCasesSystem — Technical Architecture

## 1. System Overview

```
┌─────────────────────────────────────────────────────┐
│                 INTERNET / USERS                      │
└──────────────────────┬──────────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │     Traefik         │   Reverse Proxy
            │  (SSL + Routing)    │   Let's Encrypt ACME
            └──────────┬──────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│  Cases App  │ │ Insurance   │ │  Legal App  │ ...
│   :3000     │ │   :3001     │ │   :3002     │
│  Next.js 16 │ │  Next.js 16 │ │  Next.js 16 │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       │               │               │
       └───────────────┼───────────────┘
                       │
            ┌──────────▼──────────┐
            │   PostgreSQL        │   Single shared DB
            │   Port 5432         │   25+ models
            └─────────────────────┘
```

## 2. App Architecture

### Each App's Internal Structure

```
app/
├── (authenticated)/        # Protected routes (layout checks session)
│   ├── layout.tsx          # Auth guard + sidebar + header
│   ├── page.tsx            # Dashboard
│   ├── cases/              # Case management pages
│   ├── clients/            # Client pages
│   ├── settings/           # App settings
│   └── reports/            # Reporting
├── api/                    # API routes (server-side)
│   ├── auth/[...nextauth]/ # NextAuth handlers
│   ├── cases/              # Case CRUD
│   ├── clients/            # Client CRUD
│   ├── documents/          # Document management
│   ├── dhs/                # DHS automation endpoints
│   ├── upload/             # File upload
│   └── notifications/      # Notification API
├── login/                  # Public login page
├── forgot-password/        # Password reset flow
├── layout.tsx              # Root layout (ThemeProvider, fonts)
└── globals.css             # Global styles (Tailwind)
```

### Component Architecture

```
components/
├── layout/
│   ├── Sidebar.tsx         # Main navigation sidebar
│   ├── Header.tsx          # Top header with user menu + app switcher
│   └── AppSwitcher.tsx     # Cross-app navigation
├── ui/
│   ├── Button.tsx
│   ├── Modal.tsx
│   ├── StatusBadge.tsx
│   └── DataTable.tsx
├── cases/
│   ├── CaseCard.tsx
│   ├── CaseDetail.tsx
│   └── StatusTimeline.tsx
├── documents/
│   ├── DocumentUpload.tsx
│   └── DocumentViewer.tsx
└── providers/
    ├── ThemeProvider.tsx
    └── SessionProvider.tsx
```

## 3. Authentication Flow

```
User visits any subdomain (e.g., insurance.zenowethu.co.za)
    │
    ▼
NextAuth middleware checks JWT cookie
    │
    ├─ Cookie exists & valid → Session restored → Access granted
    │
    └─ No cookie / expired → Redirect to /login on same app
        │
        ▼
    User enters email + password
        │
        ▼
    NextAuth CredentialsProvider:
        1. prisma.user.findFirst({ email })
        2. bcryptjs.compare(password, user.password)
        3. Check user.isActive and !user.isLocked
        │
        ▼
    JWT callback embeds: id, role, isAdmin, userType, b2bPartnerId
        │
        ▼
    Cookie set on .zenowethu.co.za domain → SSO across all apps
```

### Cookie Configuration
```typescript
cookies: {
  sessionToken: {
    name: process.env.NODE_ENV === 'production'
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token',
    options: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      domain: process.env.NODE_ENV === 'production'
        ? '.zenowethu.co.za'
        : undefined,
    },
  },
}
```

## 4. Database Architecture

### Entity Relationship Summary

**Core Entities:**
- `User` — Staff accounts and B2B partners
- `Client` — Consumer whose debt is being managed
- `Case` — Main unit of work, linking Client to workflow
- `Project` — B2B partner grouping for cases

**Document Management:**
- `Document` — Files uploaded to cases
- `CreditAccount` — Parsed credit accounts from credit reports
- `CreditAccountDocument` — Documents linked to specific credit accounts

**Domain Entities:**
- `InsuranceAssessment` → `InsurancePolicy`, `CancellationLetter`
- `LegalMatter` → `LegalLetter`, `LegalPrescriptionCheck`
- `ForensicAudit` → `AuditEvidence`, `RecklessLendingAssessment`
- `Payment` — Financial tracking

**System Entities:**
- `Notification`, `CaseComment`, `WorkflowLog`
- `SystemSettings` — Key-value config (GHL, DHS credentials)
- `ApiKey` — B2B partner API access

### Schema Location
Currently: `apps/*/prisma/schema.prisma` (duplicated 5x)
Target: `packages/database/prisma/schema.prisma` (single source)

## 5. Deployment Architecture

### Production (Contabo VPS)
```yaml
# docker-compose.yml (simplified)
services:
  traefik:
    image: traefik:v3.0
    ports: ["80:80", "443:443"]
    # Routes based on subdomain labels
    
  postgres:
    image: postgres:15
    volumes: [postgres_data:/var/lib/postgresql/data]
    
  cases:
    build: ./apps/cases
    labels:
      - "traefik.http.routers.cases.rule=Host(`cases.zenowethu.co.za`)"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      
  insurance:
    build: ./apps/insurance
    labels:
      - "traefik.http.routers.insurance.rule=Host(`insurance.zenowethu.co.za`)"
      
  legal:
    build: ./apps/legal
    labels:
      - "traefik.http.routers.legal.rule=Host(`legal.zenowethu.co.za`)"
```

### DNS Configuration
```
A     cases.zenowethu.co.za       → 213.199.57.111
A     insurance.zenowethu.co.za   → 213.199.57.111
A     legal.zenowethu.co.za       → 213.199.57.111
```

## 6. Data Flow Diagrams

### Case Creation Flow
```
User → POST /api/cases → Validate (Zod) → Auth check
  → prisma.case.create() → prisma.notification.create()
  → Return 201
```

### Document Analysis Flow
```
User uploads PDF → POST /api/upload → Save to disk
  → POST /api/documents/analyze → OpenAI Vision API
  → Parse structured response → prisma.document.update()
  → If credit report: prisma.creditAccount.createMany()
  → Return extracted data
```

### DHS Check Flow
```
User clicks "DHS Check" → POST /api/dhs/check
  → Launch Puppeteer → Login to DHS portal
  → Search consumer by ID → Extract status
  → Extract debt counsellor info
  → prisma.case.update({ dhsStatus, dcName, dcEmail })
  → Return results
```

## 7. Target vs Current Architecture

| Aspect | Current State | Target State |
|--------|--------------|-------------|
| Shared code | Copied 5x across apps | `packages/` workspaces |
| Prisma schema | 5 identical files | Single `packages/database` |
| Auth config | 5 identical files | Single `packages/shared-lib` |
| Components | 5 identical sets | `packages/shared-ui` + app-specific |
| Tests | Zero | Vitest + Playwright |
| Migrations | `db push` | `prisma migrate` |
| Logging | `console.log` | Structured JSON logging |
| Validation | None | Zod on all API routes |
| CI/CD | Manual deploy | Automated (GitHub Actions) |
