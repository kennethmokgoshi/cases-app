---
name: testing
description: Testing strategy, frameworks, patterns, and coverage targets for ZenoCasesSystem
---

# Testing Skill — ZenoCasesSystem

## Current State

> ⚠️ **The codebase currently has ZERO automated tests.** All new code should include tests.

## Testing Pyramid

```
         ╱╲
        ╱ E2E ╲         Playwright (critical user flows)
       ╱────────╲
      ╱Integration╲     API route tests with test DB
     ╱──────────────╲
    ╱   Unit Tests    ╲  Vitest (lib functions, utils, components)
   ╱────────────────────╲
```

## Frameworks

| Type | Framework | Config File |
|------|-----------|------------|
| Unit & Integration | **Vitest** | `vitest.config.ts` |
| E2E | **Playwright** | `playwright.config.ts` |
| Mocking | Vitest built-in (`vi.mock`) | — |
| Coverage | `@vitest/coverage-v8` | — |

## File Naming & Placement

```
apps/cases/
├── lib/
│   ├── statuses.ts
│   ├── statuses.test.ts          # ← Unit test next to source
│   ├── workingDays.ts
│   └── workingDays.test.ts
├── app/
│   └── api/
│       └── cases/
│           ├── route.ts
│           └── route.test.ts     # ← API route test
├── components/
│   ├── cases/
│   │   ├── CaseCard.tsx
│   │   └── CaseCard.test.tsx     # ← Component test
├── __tests__/                    # ← Integration tests
│   └── case-workflow.test.ts
└── e2e/                          # ← E2E tests
    ├── login.spec.ts
    ├── case-creation.spec.ts
    └── dhs-check.spec.ts
```

## Unit Test Patterns

### Testing Lib Functions

```typescript
// lib/statuses.test.ts
import { describe, it, expect } from 'vitest';
import { getStatusByCode, getStatusesByCategory } from './statuses';

describe('statuses', () => {
  describe('getStatusByCode', () => {
    it('returns the correct status for a valid code', () => {
      const status = getStatusByCode('INTAKE_NEW');
      expect(status).toBeDefined();
      expect(status?.category).toBe('INTAKE');
    });

    it('returns undefined for invalid code', () => {
      expect(getStatusByCode('INVALID_CODE')).toBeUndefined();
    });
  });

  describe('getStatusesByCategory', () => {
    it('returns all statuses in a category', () => {
      const statuses = getStatusesByCategory('INTAKE');
      expect(statuses.length).toBeGreaterThan(0);
      statuses.forEach(s => expect(s.category).toBe('INTAKE'));
    });
  });
});
```

### Testing with Prisma Mocks

```typescript
// lib/__mocks__/prisma.ts
import { vi } from 'vitest';

export const prisma = {
  case: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  client: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  // Add more models as needed
};

// In test files:
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
```

### Testing API Routes

```typescript
// app/api/cases/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { prisma } from '@/lib/__mocks__/prisma';

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'test-user', role: 'ADMIN', isAdmin: true }
  })
}));

vi.mock('@/lib/prisma', () => ({ prisma }));

describe('GET /api/cases', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns cases for authenticated user', async () => {
    prisma.case.findMany.mockResolvedValue([
      { id: '1', fileNumber: 'ZEN-001', status: 'INTAKE_NEW' }
    ]);

    const req = new Request('http://localhost:3000/api/cases');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
  });

  it('returns 401 for unauthenticated user', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as any).mockResolvedValueOnce(null);

    const req = new Request('http://localhost:3000/api/cases');
    const response = await GET(req);

    expect(response.status).toBe(401);
  });
});
```

## E2E Test Patterns (Playwright)

```typescript
// e2e/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@zenowethu.co.za');
    await page.fill('input[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'wrong@email.com');
    await page.fill('input[name="password"]', 'wrongpass');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.error')).toBeVisible();
  });
});
```

## Mocking External Services

### OpenAI Mock
```typescript
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({ /* mock data */ }) }}]
        })
      }
    }
  }))
}));
```

### Puppeteer Mock (for DHS tests)
```typescript
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn(),
        waitForSelector: vi.fn(),
        evaluate: vi.fn(),
        close: vi.fn(),
      }),
      close: vi.fn(),
    })
  }
}));
```

## Coverage Targets

| Module | Target | Priority |
|--------|--------|----------|
| `lib/statuses.ts` | 90%+ | High — Critical business logic |
| `lib/workingDays.ts` | 95%+ | High — SLA calculations |
| `lib/auth.ts` | 80%+ | High — Security |
| API routes (CRUD) | 80%+ | High — Data integrity |
| `lib/openai.ts` | 60%+ | Medium — External service |
| `lib/dhs.ts` | 50%+ | Medium — Scraper, hard to test |
| Components | 70%+ | Medium — UI correctness |
| E2E critical paths | 100% of defined paths | High |

## Critical E2E Paths to Cover

1. **Login → Dashboard** — Auth flow works
2. **Create Client → Create Case** — Core workflow
3. **Upload Document → AI Analysis** — Document pipeline
4. **DHS Status Check** — External integration
5. **Case Status Change** — Workflow transitions
6. **Payment Recording** — Financial accuracy
7. **Insurance Assessment** — Premium calculation
8. **B2B Portal Access** — Partner isolation

## Running Tests

```bash
# Unit tests
npx vitest                          # Watch mode
npx vitest run                      # Single run
npx vitest run --coverage           # With coverage

# E2E tests
npx playwright test                 # Run all
npx playwright test --ui            # Interactive UI
npx playwright test login.spec.ts   # Single file
```
