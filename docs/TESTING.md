# ZenoCasesSystem — Testing Strategy

## 1. Current State

> ⚠️ **Zero automated tests exist in the codebase.** No test files, no test config, no CI pipeline.

## 2. Testing Pyramid

| Layer | Framework | Scope | Coverage Target |
|-------|-----------|-------|----------------|
| **Unit** | Vitest | Lib functions, utils, pure logic | 80%+ |
| **Integration** | Vitest | API routes with mocked DB | 70%+ |
| **E2E** | Playwright | Full user flows in browser | Critical paths 100% |

## 3. Framework Configuration

### Vitest Setup
```typescript
// vitest.config.ts (per app)
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node', // or 'jsdom' for component tests
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '.next/', 'prisma/'],
    },
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

### Playwright Setup
```typescript
// playwright.config.ts (root level)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## 4. What to Test

### High Priority (Test First)
| Module | What to Test | Type |
|--------|-------------|------|
| `lib/statuses.ts` | Status lookups, category filtering, status transitions | Unit |
| `lib/workingDays.ts` | SLA calculations, holiday handling, overdue detection | Unit |
| `lib/auth.ts` | Login validation, role checks, session structure | Unit |
| `api/cases/route.ts` | CRUD operations, pagination, filtering, auth | Integration |
| `api/auth/` | Login flow, session management | Integration |
| Login → Dashboard | Full auth flow | E2E |
| Create Client → Case | Core workflow | E2E |

### Medium Priority
| Module | What to Test | Type |
|--------|-------------|------|
| `lib/openai.ts` | Document parsing, error handling (mock API) | Unit |
| `lib/ghl-service.ts` | Message sending, webhook processing | Unit |
| `api/documents/` | Upload, analysis trigger, retrieval | Integration |
| `api/payments/` | Recording, matching, batch import | Integration |
| Document upload + AI | End-to-end document flow | E2E |
| Status workflow | Complete status transitions | E2E |

### Lower Priority
| Module | What to Test | Type |
|--------|-------------|------|
| `lib/dhs.ts` | Login, search, transfer (heavily mocked) | Unit |
| Components | Rendering, user interaction, accessibility | Unit |
| Insurance assessment | Premium calculations | E2E |
| Legal prescription check | Date calculations | E2E |

## 5. Test Data Strategy

### Fixtures
```typescript
// __tests__/fixtures/index.ts
export const mockUser = {
  id: 'test-user-1',
  email: 'test@zenowethu.co.za',
  firstName: 'Test',
  lastName: 'User',
  role: 'ADMIN' as const,
  isAdmin: true,
  isManager: true,
  userType: 'STAFF' as const,
  b2bPartnerId: null,
};

export const mockClient = {
  id: 'test-client-1',
  firstName: 'John',
  lastName: 'Doe',
  idNumber: '9001015800087',
  phone: '0821234567',
  email: 'john@example.com',
};

export const mockCase = {
  id: 'test-case-1',
  fileNumber: 'ZEN-00001',
  status: 'INTAKE_NEW',
  clientId: 'test-client-1',
  assignedToId: 'test-user-1',
};
```

### Database Seeding for E2E
```typescript
// e2e/setup/seed.ts
// Seed test database before E2E runs
// Use a separate test database: DATABASE_URL_TEST
```

## 6. Running Tests

```bash
# Unit & integration tests
npx vitest                        # Watch mode
npx vitest run                    # Single run
npx vitest run --coverage         # With coverage report

# E2E tests
npx playwright test               # Run all E2E tests
npx playwright test --ui          # Interactive test runner
npx playwright test --headed      # See browser during tests

# Specific test file
npx vitest run lib/statuses.test.ts
npx playwright test e2e/login.spec.ts
```

## 7. CI/CD Integration (Future)

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: zenowethu_test
          POSTGRES_PASSWORD: testpass
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18 }
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npx vitest run --coverage
      - run: npx playwright install --with-deps
      - run: npx playwright test
```

## 8. Manual QA Checklist

For major releases, manually verify:

- [ ] Login works on all 3 production apps
- [ ] SSO works (login to cases → insurance already authenticated)
- [ ] Create client + case end-to-end
- [ ] Upload document → AI analysis completes
- [ ] DHS check returns results
- [ ] Status transitions work through full workflow
- [ ] B2B portal shows only partner cases
- [ ] Payment recording and matching
- [ ] Email notifications send correctly
- [ ] Dark mode displays correctly
- [ ] Mobile responsiveness on key pages
