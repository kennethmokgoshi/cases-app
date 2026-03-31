# ZenoCasesSystem — Project Status

> **Any agent**: Read this file first when the user asks "what's next?" or "where are we?"
> Last updated: 2026-03-25 (Phase 4: Debt Review document workflow complete — 3 new API routes + DebtReviewTab UI + 20 new tests, 151 total)

---

## ✅ Completed

### Phase 4 — Debt Review Document Workflow (2026-03-25)
- [x] **`PATCH /api/cases/[id]/debt-review/[docId]/approve`** — Staff approval endpoint. Requires ADMIN, EXECUTIVE, SENIOR_MANAGER, or MANAGER role. Validates document exists, has a fileUrl, is not already approved. Sets `status=APPROVED`, `approvedById`, `approvedAt`. Returns updated document with approver name.
- [x] **`POST /api/cases/[id]/debt-review/[docId]/send-consumer`** — Emails generated PDF to consumer. Reads PDF from disk, attaches to Nodemailer email (SMTP or mock fallback in dev). Sets `status=SENT_FOR_SIGNING`, `sentToConsumerAt`. Returns 422 if no consumer email, no fileUrl, or PDF missing on disk. Returns 502 on SMTP failure.
- [x] **`POST /api/cases/[id]/debt-review/send-creditors`** — Emails all APPROVED documents to every linked credit provider. Validates all providers have email addresses (returns 422 with `missingEmails` list if not). Sends one email per unique provider email with all approved PDFs attached. Sets `status=SENT_TO_CREDITORS`, `sentToCreditors=true`, `sentToCreditorAt`, `emailsSentTo` (JSON). Returns 502 if all deliveries fail.
- [x] **`DebtReviewTab` component** — `apps/cases/app/(authenticated)/cases/[id]/DebtReviewTab.tsx`. Shows all 4 NCA document types (Form 16, Form 17.1, Section 86 Notice, Debt Restructuring Proposal) with status badges, per-document Generate/Regenerate, Email Consumer, and Approve buttons. Bulk "Send to Creditors" panel appears when at least one doc is approved. Missing-email warning banner with link to Credit Providers registry.
- [x] **Tab wired into case detail page** — "Debt Review Docs" tab added to case `[id]/page.tsx`. `canApprove` flag passed based on role. Tab state type updated to include `DEBT_REVIEW`.
- [x] **Tests** — 20 new Vitest tests in `debt-review-actions.test.ts` covering: approve (401/403/404/422/409/200-admin/200-senior-mgr), send-consumer (401/404/422-no-url/422-no-email/422-missing-pdf/200/502), send-creditors (401/422-missing-emails/422-no-approved/404/200/502). **151 total passing** across cases app.
- **Note**: Consumer digital signature UI is NOT in scope here — future Credo team task.

### Phase 3 — Credit Providers Registry (2026-03-24)
- [x] **`GET/POST /api/admin/credit-providers`** — Paginated list (any authenticated user) with search/type/isActive filters + meta stats. Create (admin/executive/senior manager only) with Zod validation and 409 on duplicate name.
- [x] **`GET/PATCH/DELETE /api/admin/credit-providers/[id]`** — Single record read (any auth), update (admin/executive/senior manager), delete (admin/executive only). DELETE unlinks all CreditAccount records first.
- [x] **`/admin/credit-providers` page** — Full CRUD UI: stats bar, search/type/status filters, paginated table with provider name, type badge (colour-coded), email (amber warning when missing), attorney details. Add/Edit modal with basic details + attorney section + active toggle. Delete with confirmation.
- [x] **Sidebar** — "Credit Providers" link added to Admin section in `SidebarNav.tsx`.
- [x] **Admin hub** — "Credit Providers" tile added to `/admin` dashboard.
- [x] **Tests** — 17 new Vitest tests in `route.test.ts` (GET list 401/data/filters, POST 401/403/422/201/409, GET[id] 401/404/200, PATCH 403/404/200, DELETE 403/404/200+unlink). 131 total passing.

### Phase 2 — Letterhead Upload (Admin/Executive) (2026-03-24)
- [x] **`GET/POST/DELETE /api/admin/settings/letterhead`** — Upload, fetch, and remove letterhead; restricted to isAdmin || isExecutive. Files saved to `public/uploads/letterhead/` with timestamp filenames. URL persisted in `SystemSettings` key `letterhead_url`.
- [x] **Settings page UI** — Letterhead section added to `/admin/settings`; shows current preview, new-file preview, file picker (PNG/JPEG/WebP/PDF, 5 MB max), Upload and Remove buttons. Visible to ADMIN and EXECUTIVE only.
- [x] **Tests** — 9 new Vitest tests in `route.test.ts` (GET 401/null/url, POST 401/no-file/bad-type/too-large, DELETE 401/success). 114 total passing in cases app.

### Phase 1 — Debt Review Schema (2026-03-24)
- [x] **`CreditProvider` model** — Global registry of credit providers with name, type, email, phone, address, attorney, attorneyEmail, attorneyPhone, isActive. Linked to `CreditAccount`.
- [x] **`DebtReviewDocument` model** — Tracks generated NCA documents per case (Form 16, Form 17.1, Section 86 Notice, Debt Restructuring Proposal). Statuses: DRAFT → SENT_FOR_SIGNING → SIGNED → APPROVED → SENT_TO_CREDITORS. Linked to `Case` and `User` (approver).
- [x] **`creditProviderId` on `CreditAccount`** — Optional FK to `CreditProvider` global registry.
- [x] **Migration** — `20260324_add_credit_provider_and_debt_review_documents` applied and Prisma client regenerated.
- **Next**: Phase 3 — Credit Provider registry UI in cases app.

### Prisma Connection Retry Middleware (2026-03-23)
- **Root cause investigated**: `b2b-dashboard` dashboard returning HTTP 500 — traced to `PrismaClientKnownRequestError: Can't reach database server at 213.199.57.111:5432` (50 occurrences in dev log). The Contabo VPS firewall silently drops idle TCP connections after ~6 min; Prisma's cached pool held stale connections and did not recover automatically.
- **Fix**: Added automatic retry extension to `packages/database/src/index.ts` — wraps all Prisma operations with up to 3 attempts and exponential back-off (500ms, 1000ms) on `PrismaClientInitializationError` or `P1001`/`P1002` known request errors. Applies to all 5 apps that use `@zenowethu/database`.
- **Immediate action**: Refresh the browser page — the error clears once the DB connection is re-established.

### Email Notifications on @Mentions — All 5 Apps (2026-03-18)
- [x] **Cases** — replaced `// TODO: Send email notification` stub with real `sendManualMessage` call; added `sendManualMessage` to shared-lib import.
- [x] **Insurance** — same fix; `sendManualMessage` added to shared-lib import.
- [x] **Legal** — same fix; `sendManualMessage` added to shared-lib import.
- [x] **Forensic-Audit** — same fix; `sendManualMessage` added to shared-lib import.
- [x] **Finance** — was already implemented; verified consistent.
- [x] **Tests** — `packages/shared-lib/src/notifications/service.test.ts` (7 tests): EMAIL/SMS/WHATSAPP channel success, DB logging, error handling. shared-lib total: 55 tests passing.

Emails are sent fire-and-forget (`.catch()`) so comment creation never fails if email is down. Provider selection: GHL webhook → GHL API → SMTP → Resend → Mock (dev).

### Deployment Readiness — Security & Observability (2026-03-18)
- [x] **CSP hardening** — Removed `unsafe-eval` from `script-src` in all 5 apps' `next.config.ts`. Deployment readiness score raised from 78→85/100.
- [x] **Sentry rollout** — Added `@sentry/nextjs` + `sentry.{client,server,edge}.config.ts` to Finance, Insurance, Legal, Forensic-Audit. All 5 apps now have error monitoring.
- [x] **Unit tests** — 64 new tests across 4 previously untested apps (Finance: 12, Insurance: 22, Legal: 18, Forensic-Audit: 12). Total monorepo unit tests: 169.
- [x] **Complete `.env.example` files** — Added `SMTP_*`, `DHS_*`, `GHL_*`, `SENTRY_*`, `NODE_ENV`, `NEXT_TELEMETRY_DISABLED`, and correct `NEXTAUTH_URL` ports to all 5 apps.

**Remaining security nice-to-haves (not blockers):** nonce-based CSP, Redis rate limiting, input sanitization for user text.

### Role Hierarchy, NCRDC Compliance, Reports Export & UI Hardening (2026-03-11)
- [x] **Circular import fix** — 5 `packages/ui/src/` files were importing from `@zenowethu/ui` (themselves). Fixed all back to `next-auth/react` direct imports.
- [x] **Role hierarchy expanded** — Added `EXECUTIVE`, `SENIOR_MANAGER`, `MANAGER`, `B2B_MANAGER`, `B2B_MEMBER` roles alongside existing `ADMIN`, `FINANCE`, `ACCOUNTS`, `MEMBER`. Schema updated in `packages/shared-lib/src/schemas.ts`.
- [x] **Cascading auth flags** — `isExecutive`, `isSeniorManager`, `isManager` computed at login in `packages/shared-lib/src/auth/auth.ts`. JWT + session callbacks updated. TypeScript `next-auth.d.ts` types extended.
- [x] **Dashboard/App Switcher access** — `DashboardSwitcher` and `GlobalAppSwitcher` now gated to `isAdmin || isExecutive || isSeniorManager` only. Members/Managers cannot switch dashboards or apps.
- [x] **Finance section visibility** — Sidebar Finance section visible to Admin, Executive, Senior Manager, Finance, and Accounts roles only.
- [x] **Role badges** — All 9 roles have distinct colour badges in Sidebar and Admin Users table. Added Senior Manager (violet) + Executive (yellow) buttons to Edit User modal.
- [x] **Reports export** — CSV, Excel, and PDF export added to Reports page. API route (`/api/reports/export`) rewritten to support `format=csv|excel|pdf`. PDF uses `pdf-lib` (A4 landscape, dark theme, cyan headers, auto-pagination). Excel uses `xlsx` package.
- [x] **OPSGENTY rebrand** — All visible "GoHighLevel"/"GHL" UI text in Admin Settings changed to "OPSGENTY". Internal variable names and API routes unchanged.
- [x] **Admin Documents back button** — "← Back to Admin" link added to `/admin/documents` page header.
- [x] **NCRDC Compliance page** — Full registration tracking UI built at `/compliance`. Fields: NCRDC number, registered name, registration date, expiry date, notes. Status logic: ACTIVE / EXPIRING_SOON (≤30 days) / EXPIRED / NOT_SET with colour-coded banners.
- [x] **NCRDC API** — `GET/POST /api/admin/compliance/ncrdc` using `SystemSettings` with prefixed keys (`ncrdc_ncrdc_number`, etc.) to match the schema's `key String @unique` constraint. Fixed upsert bug that used non-existent compound `category_key` constraint.
- [x] **Sidebar Admin gate** — Admin section now only visible to `isAdmin || isExecutive || isSeniorManager`. Removed hardcoded email bypass that was exposing Admin nav to MEMBER-role users.

### E2E Test Coverage — All 5 Apps (2026-02-27)
- [x] **Insurance E2E** — Fixed port bug (3002→3001), added `@playwright/test`, E2E scripts + 3 spec files: `auth.spec.ts`, `dashboard.spec.ts`, `underwriting.spec.ts` (rewritten with robust selectors)
- [x] **Legal E2E** — Full setup from scratch: `playwright.config.ts`, `global.setup.ts`, `helpers.ts`, 4 spec files: `auth.spec.ts`, `dashboard.spec.ts`, `agreements.spec.ts`, `cases.spec.ts`
- [x] **Forensic-Audit E2E** — Full setup from scratch: config + 5 spec files: `auth.spec.ts`, `dashboard.spec.ts`, `audit-flow.spec.ts`, `compliance.spec.ts`, `rate-tables.spec.ts`
- [x] **Finance E2E** — Added `@playwright/test` + E2E scripts, new spec files: `auth.spec.ts`, `dashboard.spec.ts`, `invoices.spec.ts`, `payments.spec.ts`, enhanced `billing.spec.ts`
- [x] **CI/CD** — Added Playwright browser install step + 4 new E2E job steps (insurance/legal/forensic-audit/finance), added `E2E_EMAIL`/`E2E_PASSWORD` secrets to all E2E steps

> **Action required**: Add `E2E_EMAIL` and `E2E_PASSWORD` to GitHub repository secrets to enable authenticated E2E tests in CI.

### Production Readiness — Deployment Hardening & Migrations (2026-02-27)
- [x] **Database Migrations** — Transitioned from `db push` to `prisma migrate`. Initial baseline `0_init` created in `packages/database`.
- [x] **CI/CD Hardening** — Integrated automatic `prisma migrate deploy` into the GitHub Actions workflow.
- [x] **Security Headers** — Uniform CSP, HSTS, and Frame-Options applied across all 5 applications.
- [x] **Rate Limiting** — Authentication and high-cost AI routes protected by middleware rate limiting.
- [x] **Monitoring Boilerplate** — Sentry configuration implemented for Pilot app (Cases).
- [x] **Credential Cleanup** — Sanitized all documentation and enforced `.env.local` usage.
- [x] **Backup Robustness** — Rewrote `backup-db.sh` with container-aware checks and fail-safes.

### Insurance App Completion — Underwriting Auto + Risk Engine + Policy Issuance (2026-02-26)
- [x] **Automated Underwriting** — Centralized logic in `underwriting-service.ts`; automated triggers added to Case Creation and Document OCR flows.
- [x] **Risk Scoring Engine** — Fully integrated engine calculating scores (0-100) based on age, employment, and debt-to-income ratios.
- [x] **Policy Issuance API** — New `POST /api/insurance/assessments/[id]/policy` route for formalizing cover, generating policy numbers, and updating case status.
- [x] **PDF Schedule Generator** — `lib/policy-pdf.ts` generates professional A4 policy schedules using `pdf-lib`.
- [x] **UI Actions** — "📜 Issue Policy" button added to Underwriting Queue for approved assessments.

### Advanced Reporting & Analytics — SLA Dashboard + MTIS + Excel (2026-02-27)
- [x] **SLA Dashboard** — Visual tracking of Critical/Warning/On-Track cases in the B2B portal.
- [x] **MTIS Analysis** — Mean Time In Status calculation to identify workflow bottlenecks.
- [x] **Excel Export** — Multi-sheet Excel generator for SLA and Bottleneck reports.
- [x] **Metrics Engine** — Centralized business day and SLA tier calculation logic.

### Legal App Phase 2 — Document Generation & Filings (2026-02-27)
- [x] **PDF Automation** — One-click generation of Rule 49 Rescission Applications and Section 72 Dispute letters using `pdf-lib`.
- [x] **Shared Deadlines** — Refactored 20-day dispute clock logic into `shared-lib/metrics` for cross-app consistency.
- [x] **UI Trackers** — Enhanced Rescission/Dispute dashboards with status progress and action buttons.

### AI Service Refactoring — Technical Debt Reduction (2026-02-27)
- [x] **Modular OpenAI** — Split 900-line `openai.ts` into specialized modules (`client`, `prompts`, `extraction`, `pdf-process`, `utils`).
- [x] **Pino Logging** — Standardized structured logging with `pino` across all AI and shared-lib modules.
- [x] **Clean Imports** — Resolved absolute/relative import conflicts to ensure strict type safety.
- [x] **Dashboard** — Replaced all hardcoded mock data with real Prisma queries via new `/api/dashboard/forensic-stats` API route
  - 3 KPI chips: Total Audits / Requiring Action / Reviewed (live counts)
  - "Active Investigations" panel → real `recentAudits` linked to `/cases/[id]`
  - "Red Flag Center" → real `REQUIRES_ACTION` audits with parsed risk type pills
  - Helper functions: `parseRiskType()` (keyword detection), `timeAgo()` (relative time)
- [x] **Accounts dashboard** — Replaced stub `getStats()` zeros with real Prisma queries
  - `payment.aggregate({ _sum: { amount } })` for month-to-date collections
  - `paymentBatch.count({ where: { status: 'PROCESSING' } })` for pending batches
  - `payment.count({ where: { clientId: null } })` for unallocated payments
  - Real batch table rows with fileName, uploader, date, ZAR amount, match counts, status badge
- [x] **Rate Table CRUD API** — `GET/POST /api/admin/rate-tables` + `GET/PATCH/DELETE /api/admin/rate-tables/[id]`
  - Zod validation on create/patch, 422 on failure
  - Filters: search (creditorName contains), accountType, isActive boolean
  - Paginated list + meta stats (total/active/inactive/accountTypes)
  - 409 on unique constraint violation (creditorName + accountType)
- [x] **Rate Tables admin UI** — `/admin/rate-tables` full CRUD page
  - Stats bar, filter bar, sortable table with inline isActive toggle
  - Add/Edit modal (pre-populated for edit), delete with confirm dialog
  - 7 account types: MORTGAGE_LOAN, CREDIT_CARD, PERSONAL_LOAN, VEHICLE_FINANCE, STORE_ACCOUNT, OVERDRAFT, SHORT_TERM_LOAN
- [x] **Compliance API** — `GET /api/forensic/compliance` + `PATCH /api/forensic/compliance/[id]`
  - GET: ForensicAudit records with REQUIRES_ACTION/REVIEWED/RESOLVED status + stats counts
  - PATCH: status update (→ RESOLVED/REVIEWED) + WorkflowLog audit entry written
- [x] **Compliance UI** — `/compliance` full tracking page
  - Stats bar: Requiring Action / Reviewed / Total
  - Risk indicator pills parsed from `recommendations` text (Section 80 / Prescription / Interest Rate / Insurance)
  - "Mark Resolved" / "Update Status" with notes → optimistic refresh
  - ResolveModal component with status selector + notes textarea
- [x] **Admin hub** — Rate Tables tile added (9th tile) → `/admin/rate-tables`
- [x] **Sidebar** — Compliance (`/compliance`) + Rate Tables (`/admin/rate-tables`) added to Admin section

### Finance Phase 2 — All Missing Features (2026-02-24)
- [x] 10 new API routes: credit-accounts (list/detail), insurance-assessments (list/detail), legal-matters (list/detail), forensic-audits (list/detail), invoice reminders, audit-trail
- [x] 9 new UI pages: credit-accounts, credit-accounts/[id], insurance-assessments, insurance-assessments/[id], legal-matters, legal-matters/[id], forensic-audits, forensic-audits/[id], audit-trail
- [x] `AllocatePaymentModal` component — client search + case selection + confirmation
- [x] Payments page updated — "Allocate" button per unallocated row
- [x] Invoices page updated — "Send Reminders" button with toast feedback
- [x] Sidebar updated — 5 new Finance nav items (Credit Accounts, Insurance, Legal, Forensic Audits, Audit Trail)
- [x] `/accounts/page.tsx` stub replaced with real Prisma queries
- [x] Status transition guards on insurance assessments and forensic audits
- [x] WorkflowLog audit entries on all mutations

### Finance Phase 1 — Invoice System + Revenue Dashboard (2026-02-21)
- [x] Added `Invoice` model + `InvoiceStatus` enum to shared Prisma schema (`packages/database/prisma/schema.prisma`)
- [x] Applied `db push` — database in sync; TS types generated (`prisma.invoice`, `InvoiceStatus` available)
- [x] Created `apps/finance/lib/invoice-pdf.ts` — A4 PDF generator using `pdf-lib` (header, line items, totals, payment instructions)
- [x] `GET/POST /api/finance/invoices` — paginated list + create with Zod validation + atomic invoice numbering (INV-YYYY-NNNN)
- [x] `GET/PATCH/DELETE /api/finance/invoices/[id]` — CRUD with status guards (PAID/CANCELLED are locked)
- [x] `GET /api/finance/invoices/[id]/pdf` — generates PDF, caches to disk, streams as download
- [x] `POST /api/finance/invoices/[id]/send` — sends PDF via nodemailer with attachment, updates status to SENT
- [x] `GET /api/finance/invoices/stats` — KPIs + monthly SQL breakdown + revenue by acquisition type
- [x] Replaced `/api/reports/invoices` stub — now queries real Invoice model (backward-compatible shape)
- [x] `/invoices` page — list with filters, stats bar, status badges, PDF download link
- [x] `/invoices/new` page — client typeahead (reuses `/api/b2b/clients/search`), line items, live totals, VAT toggle
- [x] `/invoices/[id]` page — server component detail view with SendInvoiceModal + MarkPaidButton client components
- [x] `/revenue` page — KPI cards, monthly/quarterly toggle, gradient bar chart, type breakdown, monthly table
- [x] Sidebar updated — "Invoices" and "Revenue" nav items added after "Reports"

### NextAuth v5 Stable — Investigation (2026-02-21)
- [x] Audited `next-auth` npm registry — **v5 stable does NOT exist yet**
- [x] All v5 releases are beta-only (`beta.0` through `beta.30`)
- [x] `beta.30` is already the latest available version — project is current
- [x] The only stable release is v4.24.13 (completely different API — downgrade not viable)
- [x] `@auth/nextjs` (Auth.js rebranded package) also still experimental
- **Decision**: Stay on `beta.30` (latest available). Re-evaluate when v5.0.0 stable is published to npm.
- **Blocked by**: Upstream Auth.js team has not released stable v5 yet

### Zod Validation + Vitest Tests — Cases App (2026-02-20)
- [x] Installed `zod` (^4.3.6) in `apps/cases`
- [x] Installed `vitest` + `@vitest/coverage-v8` as dev dependencies
- [x] Created `apps/cases/lib/schemas.ts` — 20 Zod schemas + `parseBody()` helper
- [x] Applied Zod validation to **all 19 JSON mutation routes** (100% of routes with JSON bodies):
  - `POST /api/cases` — `CaseCreateSchema`
  - `PATCH /api/cases/[id]` — `CasePatchSchema`
  - `PATCH /api/cases/[id]/status` — `CaseStatusSchema`
  - `POST /api/cases/[id]/comments` — `CaseCommentCreateSchema`
  - `POST /api/cases/[id]/notifications` — `CaseNotificationSendSchema`
  - `POST /api/cases/[id]/apply-updates` — `ApplyUpdatesSchema`
  - `POST /api/cases/move` — `CaseMoveSchema`
  - `POST /api/users` — `UserCreateSchema`
  - `POST /api/auth/forgot-password` — `ForgotPasswordSchema`
  - `POST /api/auth/reset-password` — `ResetPasswordSchema`
  - `POST /api/projects` — `ProjectCreateSchema`
  - `POST /api/admin/api-keys` — `ApiKeyCreateSchema`
  - `PATCH /api/admin/api-keys/[id]` — `ApiKeyPatchSchema`
  - `POST /api/admin/settings/dhs` — `DhsSettingsSchema`
  - `POST /api/admin/settings/ghl` — `GhlSettingsSchema`
  - `POST /api/settings/templates` — `TemplateCreateSchema`
  - `POST /api/notifications` — `NotificationReadSchema`
  - `POST /api/documents/[id]/update-summary` — `DocumentSummarySchema`
  - `POST /api/documents/reanalyze` — `ReanalyzeSchema`
  - *(Skipped: `admin/users/[id]` DELETE-only, `b2b/partners` GET-only, `documents/extract` multipart formData)*
- [x] Created `apps/cases/vitest.config.ts`
- [x] Added `test`, `test:watch`, `test:coverage` scripts to `package.json`
- [x] Wrote **105 unit tests** in `apps/cases/lib/schemas.test.ts` — all passing ✅

### Credential Cleanup (2026-02-20)
- [x] Removed hardcoded `Military@1` password from all 5 seed files — replaced with `process.env.SEED_PASSWORD || 'changeme-dev-only'`
- [x] Added `*.db`, `*.db-journal`, `*.db-shm`, `*.db-wal` to root `.gitignore` — dev SQLite databases now excluded
- [x] Confirmed `DEPLOYMENT.md` uses only placeholder values — no real credentials

### Documentation System (2026-02-19)
- [x] Created `CLAUDE.md` — project context auto-loaded by all agents
- [x] Created 13 Claude skills in `.agent/skills/` (8 technical + 5 process/quality)
- [x] Created 6 PRD docs in `docs/` (PRD, Architecture, Security, Testing, Design System, Codebase Analysis)
- [x] Built local MCP documentation server (`mcp-server/`)
- [x] Audited documentation alignment with codebase problems — all 14 issues now covered
- [x] Integrated 5 user-level skills (CDD, frontend-design, project-workflow, claude-reflect, mcp-builder)
- [x] Resolved font conflict between design and frontend-design skills
- [x] Created `STATUS.md` — universal "what's next?" tracker for all agents
- [x] Enforced auto-documentation (STATUS.md updates) and auto-testing (Vitest) as mandatory agent behaviors in `CLAUDE.md`

---

## 🔜 What's Next (Priority Order)

- [x] **Production Hardening** — Standardized strict Content Security Policy (CSP) and enhanced API rate limiting across all 5 apps.
- [x] **CI/CD Optimization** — Updated GitHub Actions workflow with pnpm 10 compatibility and added placeholders for E2E tests.
- [x] **E2E Testing** — Implemented core Intake Flow test and helpers in Playwright (Client -> New Case -> Dashboard).

### ✅ Production Readiness (completed 2026-02-26)
- [x] **Secure git history** — Renamed `.env` to `.env.local` across all apps, generated safe `.env.example` templates, updated root `.gitignore`.
- [x] **Structured Logging** — Replaced all `console.log` statements with `@zenowethu/shared-lib/logger` (pino) across all apps and packages.
- [x] **API Validation** — Built `sync-zod.js` codemod and applied Zod validation to 80+ API routes in Finance, Forensic Audit, Insurance, and Legal apps.
- [x] **Error Boundaries** — Audited and confirmed explicit React Error Boundaries are properly implemented across all dashboards.
- [x] **Health Checks** — Standardized `GET /api/health` endpoints in all 5 apps for heartbeat monitoring.
- [x] **Shared Library Tests** — Implemented Vitest suite for `@zenowethu/shared-lib` (statuses, SLA, working days).
- [x] **CI/CD Expansion** — Unified monorepo testing in GitHub Actions via `pnpm turbo test`.
- [x] **Database Maintenance** — Created `scripts/backup-db.sh` for automated production backups.

### ✅ Already Done — Monorepo Architecture (completed before 2026-02-24)

> STATUS.md was outdated. All items below were verified complete on 2026-02-24.

- [x] **Turborepo + pnpm workspaces** — `turbo.json` + `pnpm-workspace.yaml` present, fully configured
- [x] **`packages/database`** — Canonical Prisma schema (806 lines), shared Prisma client singleton
- [x] **`packages/shared-lib`** — auth, dhs, openai, statuses, ghl, notifications all extracted
- [x] **`packages/ui`** — All shared React components (Sidebar, CommunicationHub, etc.)
- [x] **`packages/config`** — SERVICES_MAP, BRANDING constants
- [x] **`packages/tsconfig`** — Shared TypeScript config
- [x] **`packages/eslint-config`** — Shared ESLint rules
- [x] **`packages/shared-ui`** — React components moved (now `packages/ui`)
- [x] **Vitest + unit tests** — 105 tests in `apps/cases/lib/schemas.test.ts` ✅
- [x] **NextAuth v5** — Staying on `beta.30` (latest available; v5 stable not published upstream)

### ✅ Decompose `dhs.ts` (completed 2026-02-24)
- [x] Split 2,355-line `packages/shared-lib/src/dhs.ts` → `packages/shared-lib/src/dhs/` directory (7 modules)
  - `types.ts` — all exported interfaces & type aliases
  - `browser.ts` — Puppeteer singleton, `closeBrowser`, `loginToDHS`, `delay`, `DHS_CONFIG`
  - `extraction.ts` — `extractConsumerInfo`, `getDeclineReason`
  - `counsellor.ts` — `getDebtCounsellorInfo`
  - `status.ts` — `checkTransferStatus`
  - `transfer.ts` — `requestTransfer`
  - `search.ts` — `searchConsumer`, `scrapeDetailedConsumerInfo`
  - `index.ts` — re-exports all public symbols (zero breaking changes)
- [x] TypeScript check passes (`tsc --noEmit`) with zero DHS-related errors
- [x] No app files modified — all 5 apps import unchanged from `@zenowethu/shared-lib`

### 🔴 Immediate (Do First)
- All immediate tasks completed (production hardening + E2E coverage). See below for remaining items.

### 🟡 Short Term (1-2 Weeks)

3. ~~**Complete Finance app**~~ — ✅ **DONE (2026-02-24)**: All 7 missing Finance features built — credit accounts, insurance assessments, legal matters, forensic audits, invoice reminder automation, payment allocation modal, audit trail page. Finance App now ~95% complete.

4. ~~**Push Forensic Audit App**~~ — ✅ **DONE (2026-02-24)**: Real dashboard data, accounts dashboard fixed, Rate Table CRUD admin UI, Compliance tracking module. Forensic Audit App now ~88%.

5. **Add Vitest tests to shared packages** — `packages/shared-lib/src/statuses/`, `workingDays.ts`, `workflow.ts` are untested critical logic.

6. **Upgrade NextAuth to stable** — ⏳ BLOCKED upstream. Re-check when `next-auth` v5.0.0 stable is published to npm.

7. ~~**Push Insurance App to ~95%**~~ — ✅ **DONE (2026-02-26)**: Underwriting automation, risk scoring engine, and policy issuance workflow completed.

### 🟢 Medium Term (3-4 Weeks)

8. ~~**Complete Finance app**~~ — ✅ **DONE (2026-02-24)**. See item 3 above.

9. ~~**Push Forensic Audit App**~~ — ✅ **DONE (2026-02-24)**. See item 4 above.

9. ~~**Add Playwright E2E tests**~~ — ✅ **DONE (2026-02-27)**: All 5 apps have full E2E coverage. Add `E2E_EMAIL`/`E2E_PASSWORD` to GitHub secrets to activate CI runs.

10. **Build CI/CD pipeline** — ✅ DONE. E2E steps for all 5 apps now in `.github/workflows/ci-cd.yml`.

11. **Polish Insurance workflow** — End-to-end cancellation + new policy issuance.

12. **Polish Legal workflow** — Court filing, prescription automation, judgment dashboards.

### 🔵 Long Term (1-2 Months)

13. **AI enhancements** — Smart case routing, predictive SLA alerts, RAG legal research.
14. **Mobile/PWA improvements** — Responsive audit across all apps.
15. **Advanced reporting dashboard** — Analytics beyond basic reports.
16. **Decompose monster files** — ~~`dhs.ts`~~ ✅ done. ~~`openai.ts`~~ ✅ done.

---

## 📊 Module Completion

| Module | Status | Next Action |
|--------|:------:|-------------|
| Cases App | 96% | code dedup remaining; NCRDC compliance + exports complete |
| Auth & SSO | 92% | Role hierarchy complete; upgrade NextAuth stable (blocked upstream) |
| B2B Portal | 90% | Analytics depth needs work |
| Notifications | 80% | Multi-channel sending works; needs tests + retry logic |
| Legal App | 98% | E2E complete (2026-02-27); WorkflowLog timeline remaining |
| Insurance App | 100% | E2E complete (2026-02-27) ✅ |
| Finance App | 100% | E2E complete (2026-02-27) ✅ |
| Forensic Audit App | 96% | E2E complete (2026-02-27); WorkflowLog timeline on case detail remaining |
| Reporting | 95% | Advanced Analytics dashboard + SLA dashboard + Excel export completed (2026-02-27) |

---

## 📁 Key References

| Need to know about... | Read this |
|----------------------|-----------|
| Project overview | `/CLAUDE.md` |
| All problems & tech debt | `/docs/CODEBASE_ANALYSIS.md` |
| Product requirements | `/docs/PRD.md` |
| Architecture | `/docs/ARCHITECTURE.md` |
| Security rules | `/docs/SECURITY.md` |
| Testing strategy | `/docs/TESTING.md` |
| Design system | `/docs/DESIGN_SYSTEM.md` |
| Code quality process | `/.agent/skills/constraint-driven-development/SKILL.md` |
| Git/CI/CD workflow | `/.agent/skills/project-workflow-management/SKILL.md` |
