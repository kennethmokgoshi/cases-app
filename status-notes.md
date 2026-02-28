# Zenowethu Cases System — Status Notes

> This file tracks ongoing progress across all sessions.
> Full status tracker with "what's next" → see `STATUS.md`
> Last updated: 2026-02-26

---

## ⚠️ System Alerts

- **DHS (NCR Debt Help System) is currently OFFLINE** — do not assign DHS-related tasks

---

## Overall Progress (2026-02-21)

| App / Module | % Done | Status |
|---|:---:|---|
| Cases App | 90% | ✅ Feature-complete — needs E2E tests, code dedup |
| Auth & SSO (NextAuth v5 beta.30) | 85% | ⏳ Blocked — waiting on upstream stable release |
| B2B Portal | 90% | ✅ Built across all apps — basic analytics only |
| Notifications (GHL SMS/Email/WhatsApp) | 80% | 🔧 Sending works; needs tests + retry logic |
| Legal App | 82% | 🔧 Core built; RescissionTracker + DisputeTracker use mock data |
| Insurance App | 72% | 🔧 Core built; underwriting automation + risk scoring missing |
| Finance App | 72% | 🔧 Core built; credit/insurance/legal/forensic UI + invoice reminders missing |
| Forensic Audit App | 70% | 🔧 Core built; forensic engine (ledger analysis, risk scoring, report gen) incomplete |
| Reporting | 75% | 🔧 Basic stats + CSV export; advanced analytics missing |

---

## Recently Completed

### 2026-02-26 — Production Readiness (Security, Logging, Validation)
- Secured git history by renaming `.env` to `.env.local`, adding safe `.env.example` templates, and updating `.gitignore`.
- Replaced all `console.log` calls with structured JSON `pino` logger across the entire monorepo.
- Synced Zod validation schemas (`parseBody`) from `cases` app to over 80 API routes in `finance`, `forensic-audit`, `insurance`, and `legal`.
- Verified React Error Boundaries are correctly implemented across all 5 apps.

### 2026-02-21 — Forensic Audit Engine + UI + PDF Report
- `lib/forensic-engine.ts` expanded: `analyzeAccount()` + `runFullForensicAudit()` — multi-account loop, prescription, reckless lending (NCR expenses norm), interest rate (NCA cap), insurance premium benchmark
- `lib/audit-report-pdf.ts` — A4 PDF generator (pdf-lib): risk score panel, findings list, per-account table, recommendation box
- `POST /api/forensic/run/[caseId]` — runs audit, upserts ForensicAudit + RecklessLendingAssessment in DB
- `GET /api/forensic/results/[caseId]` — fetches saved audit results
- `GET /api/forensic/report/[caseId]` — generates + streams PDF download
- `components/cases/ForensicAuditTab.tsx` — full React UI: risk meter, findings list, per-account table, recommendation, PDF button
- Case detail page: added 🔍 Forensic Audit tab (4th tab alongside Activity / Documents / Comm Hub)
- Corrected all 5 app completion percentages based on deep code scan

### 2026-02-21 — Finance Phase 1
- Finance Phase 1: Invoice system + Revenue dashboard
  - Invoice model in Prisma schema
  - PDF generation (`invoice-pdf.ts`)
  - Full CRUD API (`/api/finance/invoices`)
  - Invoice list, new, detail pages
  - Revenue dashboard with KPI cards + charts

### 2026-02-20
- Zod validation on all 19 JSON mutation routes in Cases app
- 105 Vitest unit tests written + passing
- Credential cleanup: removed hardcoded passwords from seed files
- Added `.db` files to `.gitignore`

### 2026-02-19
- Documentation system: CLAUDE.md, 6 docs in `/docs/`, 13 agent skills
- Local MCP documentation server (`mcp-server/`)
- STATUS.md created as universal progress tracker

---

## Architecture Summary

```
cases-app-main/          ← pnpm monorepo (Turborepo)
├── apps/
│   ├── cases/           ← Port 3000 — Core case management (95%)
│   ├── insurance/       ← Port 3001 — Insurance workflow (50%)
│   ├── legal/           ← Port 3002 — Legal proceedings (55%)
│   ├── forensic-audit/  ← Port 3003 — Reckless lending (40%)
│   └── finance/         ← Port 3004 — Invoicing + revenue (25%)
└── packages/
    ├── database/        ← Single Prisma schema (PostgreSQL on Contabo VPS)
    ├── auth/            ← Shared NextAuth v5 config (SSO across all apps)
    ├── statuses/        ← 80+ workflow statuses + state machine
    ├── integrations/    ← DHS + GoHighLevel configs
    ├── ui/              ← Shared React components (migration ongoing)
    ├── config/          ← Shared constants (minimal)
    ├── tsconfig/        ← Shared TypeScript config
    └── eslint-config/   ← Shared ESLint rules
```

---

## Known Issues / Tech Debt

| Severity | Issue | Action |
|---|---|---|
| 🔴 High | 520KB+ code duplication across 5 apps | Extract to shared packages (in progress) |
| 🔴 High | `dhs.ts` is 2,357 lines — needs decomposition | Split into modules |
| 🟡 Medium | No tests on 4 apps (only Cases has Vitest + Playwright) | Roll out test setup to all apps |
| 🟡 Medium | NextAuth v5 still beta.30 — no stable release yet | Re-check when upstream publishes |
| 🟢 Low | `openai.ts` is 908 lines — could be modularised | Decompose into smaller files |
| 🟢 Low | No tests in Finance app (zero Vitest/Playwright) | Roll out test setup from Cases app |

---

## Credentials Note (Read This)

The `.env` files across all 5 apps contain real credentials (DB password, OpenAI key, auth secrets).

**The issue is NOT having credentials — it's having them committed to git.**

**The safe solution:**

1. Rename `.env` → `.env.local` in each app (Next.js ignores `.env.local` by default)
2. Add `.env` to root `.gitignore` as a safety net
3. On the Contabo VPS: use `.env.local` or set environment variables directly in Docker Compose
4. Create `.env.example` files with placeholder values only — commit those

Your credentials keep working exactly the same way. They just stop being tracked by git.

---

## Key File Locations

| Need | File |
|---|---|
| What to work on next | `STATUS.md` |
| Prisma schema | `packages/database/prisma/schema.prisma` |
| NextAuth config | `packages/auth/src/auth.ts` |
| Workflow statuses | `packages/statuses/src/statuses.ts` |
| Shared UI components | `packages/ui/src/` |
| CI/CD pipeline | `.github/workflows/ci-cd.yml` |
| Deployment guide | `DEPLOYMENT.md` |
| Architecture docs | `docs/ARCHITECTURE.md` |
| Security docs | `docs/SECURITY.md` |
