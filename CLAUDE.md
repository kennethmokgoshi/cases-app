# ZenoCasesSystem — Project Context

## What Is This?
Zenowethu Cases System is a **South African debt counselling case management platform**. It manages the full lifecycle of consumer debt review: client intake → document analysis (AI) → DHS automation → insurance assessment → legal matters → forensic auditing → finance.

## Domain Context
- **Debt Review** = South African process (National Credit Act) where consumers in over-indebtedness get a debt counsellor to restructure their repayments
- **DHS** = NCR Debt Help System (ncrdebthelp.co.za) — Government portal for managing consumer transfer requests between debt counsellors
- **NCRDC** = National Credit Regulator registration number for debt counsellors
- **Prescription** = SA law: debt older than 3 years with no acknowledgment/payment may be "prescribed" (unenforceable)
- **Credit Life Insurance** = Insurance tied to credit accounts; Zenowethu helps consumers find cheaper alternatives

## Monorepo Structure
```
cases-app-main/
├── apps/
│   ├── cases/          # Core case management (port 3000) — THE PRIMARY APP
│   ├── insurance/      # Insurance assessment (port 3001)
│   ├── legal/          # Legal matters (port 3002)
│   ├── forensic-audit/ # Forensic auditing (port 3003)
│   └── finance/        # Financial management (port 3004)
├── packages/           # Shared packages (consumed by all apps via workspace:*)
│   ├── auth/           # @zenowethu/auth — NextAuth SSO config
│   ├── config/         # @zenowethu/config — shared constants
│   ├── database/       # @zenowethu/database — shared Prisma client
│   ├── eslint-config/  # Shared ESLint rules
│   ├── integrations/   # @zenowethu/integrations — DHS + GHL service code
│   ├── statuses/       # @zenowethu/statuses — 80+ workflow statuses
│   ├── tsconfig/       # Shared TypeScript config
│   └── ui/             # @zenowethu/ui — shared React component library
├── docs/               # PRD + technical documentation
├── mcp-server/         # Local MCP documentation server
└── .agent/
    ├── skills/         # Claude skills (architecture, security, testing, etc.)
    └── workflows/      # Operational workflows
```

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL + Prisma 5 ORM |
| Auth | NextAuth v5 (JWT SSO across subdomains) |
| AI | OpenAI (document analysis, PDF processing) |
| PDF | pdf-lib + pdfjs-dist + Puppeteer |
| CRM | GoHighLevel (SMS/Email/WhatsApp) |
| Email | Nodemailer |
| Build | Turborepo 2 + pnpm 10 workspaces |
| Deploy | Docker + Traefik on Contabo VPS |

## Critical Rules for All Agents

> **📍 "What's next?"** — Read `/STATUS.md` for current progress, prioritized next steps, and module completion status.

### ⚡ MANDATORY BEHAVIORS (Non-Negotiable)

These two behaviors are **automatic** — do them every time without being asked:

#### 1. Auto-Document: Update `/STATUS.md` After Every Task
After completing ANY work (feature, fix, refactor, config change), you MUST:
- Move completed items from "What's Next" to "Completed" in `/STATUS.md`
- Add a dated entry describing what was done
- Update module completion percentages if relevant
- Add any new next steps discovered during the work
- If you created/modified docs, update the Key References table

**Do this as your final step before reporting to the user. No exceptions.**

#### 2. Auto-Test: Write Tests for Every New Feature
Whenever you introduce new code (function, API route, component, utility), you MUST:
- Write **Vitest unit tests** for any new `lib/` or `packages/*/src/` function or utility
- Write **Vitest unit tests** for any new API route handler
- Write **component tests** for any new React component with logic
- Place tests next to the source file: `foo.ts` → `foo.test.ts`
- Run the tests and confirm they pass before reporting completion
- Minimum: test the happy path + one error/edge case

**If you cannot run tests (no test framework set up yet), set it up first. See `/.agent/skills/testing/SKILL.md`.**

---

### DO:
1. **Read the relevant skill** before making changes (`/.agent/skills/<area>/SKILL.md`)
2. **Validate all API inputs** with Zod schemas — no unvalidated request bodies
3. **Write tests** for new functionality (Vitest for unit, Playwright for E2E)
4. **Use typed interfaces** — every function parameter and return type must be typed
5. **Handle errors** with structured try/catch and proper HTTP status codes
6. **Use `prisma migrate`** for schema changes — never `db push` in production
7. **Check all 5 apps** when modifying shared code in `packages/` (schema, auth, statuses, etc.)
8. **Import shared code from `packages/`** — use `@zenowethu/*` workspace packages, not local copies

### DO NOT:
1. ❌ **Duplicate code across apps** — Shared code belongs in `packages/` (migration is underway — extend it, don't copy)
2. ❌ **Use `any` type** — Always define proper TypeScript types/interfaces
3. ❌ **Use `console.log` for production logging** — Use structured logging
4. ❌ **Commit secrets** — Use .env files, never hardcode credentials
5. ❌ **Skip input validation** — Every API route must validate its inputs
6. ❌ **Ignore error boundaries** — All page layouts should have React error boundaries
7. ❌ **Skip documentation** — Never finish a task without updating `/STATUS.md`
8. ❌ **Ship without tests** — Never introduce new code without accompanying tests
9. ❌ **Use `npm`** — This project uses **pnpm**. Always use `pnpm` commands.

### CURRENT DEBT AWARENESS:
- ⚠️ Code duplication migration is **in progress** — `packages/` exists with auth, database, statuses, integrations, ui — but apps may still have local copies; prefer the packages
- ⚠️ Zero automated tests exist — all new code should include tests
- ⚠️ NextAuth is on v5 beta — be cautious with auth changes
- ⚠️ `dhs.ts` in `packages/integrations` is ~2,300 lines — needs decomposition when modifying

## Key Files
| File | Purpose |
|------|---------|
| `/STATUS.md` | Current project status, next steps, completion percentages |
| `/IMPROVEMENT_BACKLOG.md` | Known improvements and refactors queued up |
| `/DEPLOYMENT.md` | Docker + Traefik deployment guide |
| `/turbo.json` | Turborepo task pipeline (build, dev, lint, test) |
| `packages/database/prisma/schema.prisma` | Canonical database schema (single source of truth) |
| `packages/auth/src/auth.ts` | Shared NextAuth SSO config |
| `packages/integrations/src/dhs-config.ts` | NCR DHS portal automation config |
| `packages/integrations/src/ghl-service.ts` | GoHighLevel CRM integration |
| `packages/statuses/src/statuses.ts` | 80+ workflow statuses across 9 categories |
| `packages/ui/src/` | Shared React component library |
| `apps/cases/lib/openai.ts` | AI document analysis pipeline |
| `docs/PRD.md` | Product Requirements Document |
| `docs/ARCHITECTURE.md` | Technical architecture reference |
| `docs/SECURITY.md` | Security specifications |
| `docs/TESTING.md` | Testing strategy |
| `docs/CODEBASE_ANALYSIS.md` | Known problems and improvement roadmap |

## Common Commands

```bash
# Run a single app (from repo root)
pnpm --filter cases dev          # Cases on :3000
pnpm --filter insurance dev      # Insurance on :3001
pnpm --filter legal dev          # Legal on :3002
pnpm --filter forensic-audit dev # Forensic Audit on :3003
pnpm --filter finance dev        # Finance on :3004

# Run all apps simultaneously (Turborepo)
pnpm dev                         # Starts all 5 apps via turbo

# Build
pnpm build                       # Build all apps via turbo
pnpm --filter cases build        # Build single app

# Lint / Test
pnpm lint                        # Lint all packages
pnpm test                        # Run all tests via turbo

# Database (run from an app or packages/database)
cd packages/database && npx prisma generate    # Generate Prisma client
cd packages/database && npx prisma studio      # Open Prisma Studio GUI
cd packages/database && npx prisma migrate dev # Create migration

# Working with shared packages
pnpm --filter @zenowethu/ui dev  # Watch-build the UI package
```

## Working with `packages/`

All shared code lives in `packages/` and is consumed by apps as workspace dependencies:

```ts
// In any app — import from the shared package
import { auth } from '@zenowethu/auth'
import { prisma } from '@zenowethu/database'
import { STATUSES } from '@zenowethu/statuses'
import { GHLService } from '@zenowethu/integrations'
import { CaseCard } from '@zenowethu/ui'
```

**When adding shared code:**
1. Add it to the relevant `packages/*/src/` file and export from `index.ts`
2. Do NOT copy the code into individual apps
3. If no suitable package exists, create a new one following the existing pattern
4. Run `pnpm install` after adding new package dependencies

## Documentation & Skills

### Domain & Technical Skills
- Architecture: `/.agent/skills/architecture/SKILL.md`
- Security: `/.agent/skills/security/SKILL.md`
- Testing: `/.agent/skills/testing/SKILL.md`
- Design System: `/.agent/skills/design/SKILL.md`
- Caching: `/.agent/skills/caching/SKILL.md`
- Coding Standards: `/.agent/skills/coding-standards/SKILL.md`
- API Development: `/.agent/skills/api-development/SKILL.md`
- Database: `/.agent/skills/database/SKILL.md`

### Process & Quality Skills
- Constraint-Driven Development: `/.agent/skills/constraint-driven-development/SKILL.md` — **Read before writing any code** (4-persona quality gates)
- Frontend Design: `/.agent/skills/frontend-design/SKILL.md` — Creative UI methodology
- Project Workflow: `/.agent/skills/project-workflow-management/SKILL.md` — Git, CI/CD, releases
- Claude Reflect: `/.agent/skills/claude-reflect/SKILL.md` — Self-learning system
- MCP Builder: `/.agent/skills/mcp-builder/SKILL.md` — Extending the docs MCP server

### Reference Docs
- PRD: `/docs/PRD.md`
- Full Architecture: `/docs/ARCHITECTURE.md`
- Security Spec: `/docs/SECURITY.md`
- Testing Strategy: `/docs/TESTING.md`
- Design System: `/docs/DESIGN_SYSTEM.md`
- **Codebase Analysis & Tech Debt**: `/docs/CODEBASE_ANALYSIS.md` — Known problems and improvement roadmap

### Workflows
- Run Apps: `/.agent/workflows/run-apps.md`
