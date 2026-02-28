---
name: architecture
description: Monorepo architecture patterns, shared packages, data flow, and structural guidelines for ZenoCasesSystem
---

# Architecture Skill — ZenoCasesSystem

## Current Architecture (As-Is)

The system is a **monorepo with 5 independent Next.js 16 apps** sharing a single PostgreSQL database. Each app is a full copy with its own `node_modules`, Prisma schema, and lib files.

```
cases-app-main/
├── apps/
│   ├── cases/          # Port 3000 — Primary hub
│   ├── insurance/      # Port 3001
│   ├── legal/          # Port 3002
│   ├── forensic-audit/ # Port 3003
│   └── finance/        # Port 3004
│
├── (NO packages/ directory yet — this is the main debt)
```

### Critical Problem
All 5 apps contain **identical copies** of:
- `prisma/schema.prisma` (752 lines × 5 = 3,760 duplicated lines)
- `lib/auth.ts`, `lib/dhs.ts`, `lib/statuses.ts`, `lib/openai.ts`, `lib/ghl-service.ts`
- `lib/notifications/`, `components/`, `app/api/` routes
- `globals.css`, `public/` directory

## Target Architecture (To-Be)

```
cases-app-main/
├── packages/
│   ├── database/           # Single Prisma schema + migrations
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   └── client.ts   # Prisma client singleton
│   │   └── package.json
│   │
│   ├── shared-lib/         # Shared business logic
│   │   ├── src/
│   │   │   ├── auth.ts
│   │   │   ├── dhs.ts
│   │   │   ├── openai.ts
│   │   │   ├── statuses.ts
│   │   │   ├── ghl-service.ts
│   │   │   ├── ghl-config.ts
│   │   │   ├── dhs-config.ts
│   │   │   ├── notifications/
│   │   │   ├── workflow.ts
│   │   │   └── workingDays.ts
│   │   └── package.json
│   │
│   ├── shared-ui/          # Shared React components
│   │   ├── src/
│   │   │   ├── layout/
│   │   │   ├── ui/
│   │   │   ├── providers/
│   │   │   └── theme/
│   │   └── package.json
│   │
│   └── shared-config/      # Shared configs
│       ├── tailwind/
│       ├── eslint/
│       └── tsconfig/
│
├── apps/
│   ├── cases/              # ONLY cases-specific code
│   │   ├── app/
│   │   │   ├── (authenticated)/
│   │   │   │   ├── page.tsx        # Cases dashboard
│   │   │   │   └── cases/          # Cases-specific pages
│   │   │   └── api/
│   │   │       └── cases/          # Cases-specific API routes
│   │   └── package.json            # Depends on @zenowethu/database, @zenowethu/shared-lib, etc.
│   │
│   ├── insurance/          # ONLY insurance-specific code
│   ├── legal/              # ONLY legal-specific code
│   ├── forensic-audit/     # ONLY forensic-specific code
│   └── finance/            # ONLY finance-specific code
│
├── turbo.json
└── package.json            # Root workspace config
```

## Architectural Rules

### Rule 1: No Cross-App Code Duplication
If code is needed in more than one app, it MUST go into a `packages/` directory.

```typescript
// ❌ BAD: Copying auth.ts to each app
// apps/cases/lib/auth.ts
// apps/insurance/lib/auth.ts  (identical copy)

// ✅ GOOD: Shared package
// packages/shared-lib/src/auth.ts
// apps/cases/package.json -> "@zenowethu/shared-lib": "workspace:*"
```

### Rule 2: Single Source of Truth for Database
Only ONE `schema.prisma` file should exist, in `packages/database/`.
All apps import the Prisma client from this package.

```typescript
// ✅ GOOD
import { prisma } from '@zenowethu/database';

// ❌ BAD
import { prisma } from '../lib/prisma';
```

### Rule 3: App-Specific Code Stays in Apps
Domain-specific logic belongs in the app:

| App | App-Specific Files |
|-----|-------------------|
| cases | Dashboard, DHS tab views, case CRUD pages |
| insurance | `insurance-engine.ts`, `substitution-notice.ts`, insurance-specific pages |
| legal | `legal-engine.ts`, `court-docs.ts`, `reckless-lending.ts`, `rescission-engine.ts`, `ocr-parser.ts`, `document-generator.ts` |
| forensic-audit | `forensic-engine.ts`, `affordability-engine.ts` |
| finance | Financial dashboards, invoicing (to be built) |

### Rule 4: API Route Patterns
Each app should only have API routes for its own domain. Shared routes (auth, users, notifications) belong in a shared API package or in the cases app (primary hub).

### Rule 5: Deployment Independence
Each app must be independently deployable via Docker. Shared packages are bundled at build time, not served separately.

## Data Flow

```
Client Browser
    ↓
Traefik (SSL + subdomain routing)
    ↓
Next.js App (SSR + API Routes)
    ↓
Prisma Client
    ↓
PostgreSQL (shared database)
    ↓
External Services: DHS Portal (Puppeteer), OpenAI, GoHighLevel, SMTP
```

## Adding a New Feature Checklist

1. **Determine scope**: Does this feature belong to one app or multiple?
2. **If shared**: Create/update the relevant `packages/` module
3. **If app-specific**: Add to the specific app's `app/` directory
4. **Database changes**: Update `packages/database/prisma/schema.prisma`, create migration
5. **API routes**: Add to the appropriate app's `app/api/` directory
6. **Components**: Shared → `packages/shared-ui/`, app-specific → `apps/<app>/components/`
7. **Tests**: Write unit tests (Vitest) and E2E tests (Playwright) as appropriate
