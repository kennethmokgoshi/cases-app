---
name: coding-standards
description: TypeScript coding standards, naming conventions, error handling, logging, type safety, and code organization rules for ZenoCasesSystem
---

# Coding Standards Skill — ZenoCasesSystem

## TypeScript Strictness

The project must use strict TypeScript. These settings are **non-negotiable**:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Files (components) | PascalCase | `CaseCard.tsx` |
| Files (lib/utils) | camelCase or kebab-case | `workingDays.ts`, `ghl-service.ts` |
| Files (API routes) | `route.ts` (Next.js convention) | `app/api/cases/route.ts` |
| Interfaces/Types | PascalCase | `CaseDetails`, `UserSession` |
| Functions | camelCase | `calculateSLA()`, `getStatusByCode()` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`, `STATUS_CATEGORIES` |
| React components | PascalCase | `export function CaseCard()` |
| CSS classes | kebab-case (Tailwind handles this) | — |
| Database models | PascalCase (Prisma convention) | `Case`, `CreditAccount` |
| Environment vars | UPPER_SNAKE_CASE | `DATABASE_URL`, `OPENAI_API_KEY` |

## File Organization

### Top-Level App Structure
```
apps/cases/
├── app/                      # Next.js App Router
│   ├── (authenticated)/      # Layout group with auth check
│   │   ├── page.tsx          # Dashboard
│   │   ├── cases/
│   │   │   ├── page.tsx      # Cases list
│   │   │   └── [id]/
│   │   │       └── page.tsx  # Case detail
│   │   └── layout.tsx        # Auth-protected layout
│   ├── api/                  # API routes
│   │   ├── cases/
│   │   │   ├── route.ts      # GET (list), POST (create)
│   │   │   └── [id]/
│   │   │       └── route.ts  # GET (detail), PUT (update), DELETE
│   │   └── auth/
│   │       └── [...nextauth]/
│   ├── login/
│   │   └── page.tsx          # Public login page
│   ├── layout.tsx            # Root layout
│   └── globals.css           # Global styles
├── components/               # React components
│   ├── ui/                   # Generic UI components (Button, Modal, etc.)
│   ├── cases/                # Case-specific components
│   ├── layout/               # Layout components (Sidebar, Header)
│   └── providers/            # React context providers
├── lib/                      # Business logic, utilities, services
│   ├── auth.ts               # NextAuth configuration
│   ├── prisma.ts             # Prisma client singleton
│   ├── openai.ts             # OpenAI service
│   ├── statuses.ts           # Workflow statuses
│   └── utils.ts              # Generic utilities
├── types/                    # TypeScript type definitions
│   └── index.ts
└── prisma/
    └── schema.prisma
```

## Type Safety Rules

### Rule 1: No `any`
```typescript
// ❌ FORBIDDEN
function processData(data: any) { ... }
const result: any = await fetch(...);

// ✅ REQUIRED
interface CaseData {
  id: string;
  fileNumber: string;
  status: string;
}
function processData(data: CaseData) { ... }
```

### Rule 2: Explicit Return Types for Public Functions
```typescript
// ✅ GOOD: Explicit return type
export function getStatusByCode(code: string): StatusDefinition | undefined {
  return STATUS_MAP.get(code);
}

// ✅ OK: Private/internal functions can use inference
const formatDate = (date: Date) => date.toISOString().split('T')[0];
```

### Rule 3: Use Discriminated Unions for Variants
```typescript
// ✅ GOOD: Type-safe result handling
type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: number };

export async function createCase(data: CreateCaseInput): Promise<ApiResult<Case>> {
  try {
    const newCase = await prisma.case.create({ data });
    return { success: true, data: newCase };
  } catch (err) {
    return { success: false, error: 'Failed to create case', code: 500 };
  }
}
```

## Error Handling

### API Route Error Handling
```typescript
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const validated = CreateCaseSchema.safeParse(body);
    
    if (!validated.success) {
      return Response.json(
        { error: 'Validation failed', details: validated.error.flatten() },
        { status: 400 }
      );
    }
    
    const result = await prisma.case.create({ data: validated.data });
    return Response.json(result, { status: 201 });
    
  } catch (error) {
    // Log with structured data
    logger.error('POST /api/cases failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Return safe error (never expose internal details)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Never Swallow Errors
```typescript
// ❌ WRONG: Silent failure
try {
  await sendEmail(to, subject, body);
} catch (e) {
  // silently ignored
}

// ✅ CORRECT: Log and handle gracefully
try {
  await sendEmail(to, subject, body);
} catch (error) {
  logger.error('Email send failed', { to, subject, error });
  // Decide: retry, queue, or surface to user
}
```

## Logging Standards

### Use Structured Logging
```typescript
// ✅ CORRECT: Structured JSON logging
import { logger } from '@/lib/logger';

logger.info('Case created', { caseId: newCase.id, fileNumber: newCase.fileNumber, userId: session.user.id });
logger.error('DHS login failed', { error: error.message, attempt: retryCount });
logger.warn('SLA breach approaching', { caseId, daysRemaining: 2 });

// ❌ WRONG: Console.log with string concatenation
console.log('Case created: ' + caseId);
console.log('[DHS] Error: ', error);
```

### Log Levels
| Level | When to Use |
|-------|------------|
| `error` | Failures that need attention (API errors, DB failures, external service failures) |
| `warn` | Concerning situations that don't prevent operation (SLA approaching, retries) |
| `info` | Significant business events (case created, status changed, payment received) |
| `debug` | Detailed diagnostic info (query results, intermediate calculations) — disabled in production |

## Import Organization

Organize imports in this order, separated by blank lines:

```typescript
// 1. External packages
import { NextResponse } from 'next/server';
import { z } from 'zod';

// 2. Internal packages (when using workspace packages)
import { prisma } from '@zenowethu/database';
import { requireAuth } from '@zenowethu/shared-lib';

// 3. Local imports (relative paths)
import { CaseCard } from '@/components/cases/CaseCard';
import { formatDate } from '@/lib/utils';
import type { CaseWithClient } from '@/types';
```

## Function Size Limits

- **Maximum function length**: ~50 lines (extract sub-functions if longer)
- **Maximum file length**: ~300 lines (split into modules if larger)
- **Maximum component JSX**: ~80 lines of JSX (extract sub-components)

**Current violations** (known tech debt):
- `dhs.ts` — 2,357 lines (needs decomposition into multiple files)
- `openai.ts` — 832 lines (needs splitting by document type)
- `statuses.ts` — 654 lines (acceptable as data definition, but helper functions should be extracted)

## Code Comments

```typescript
// ✅ GOOD: Explain WHY, not WHAT
// SA prescription law requires 3 years of inactivity — we check from lastPaymentDate
if (daysSinceLastPayment > 365 * 3) { ... }

// ✅ GOOD: Document non-obvious behavior
// DHS portal sometimes returns empty string instead of null for declined reason
const reason = rawReason?.trim() || 'No reason provided';

// ❌ BAD: Obvious comment
// Loop through cases
for (const c of cases) { ... }
```
