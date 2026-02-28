# ZenoCasesSystem — Comprehensive Codebase Analysis

> **Zeno System Takeover** — This document records the findings from the initial codebase audit so the team knows exactly what problems need attending to.

---

## 1. Executive Summary

Zenowethu Cases System is a debt counselling case management platform built for the South African market. It manages the full lifecycle of consumer debt review: client intake, document analysis (AI-powered), DHS (Debt Help System) automation, insurance assessment, legal matter tracking, forensic auditing, and financial reconciliation.

The system is structured as a monorepo with 5 independent Next.js apps, all sharing a single PostgreSQL database.

> [!CAUTION]
> The codebase has critical structural tech debt — the 5 apps are near-identical copies of each other, with massive file duplication. This is the single biggest issue to address.

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.0.6 |
| Language | TypeScript | ^5.x |
| UI | React | 19.2.0 |
| Styling | Tailwind CSS | v4 |
| Database | PostgreSQL | 5432 |
| ORM | Prisma | ^5.22.0 |
| Auth | NextAuth.js v5 (beta) | ^5.0.0-beta.30 |
| AI | OpenAI API | ^6.9.1 |
| PDF | pdf-lib, pdfjs-dist, Puppeteer | Various |
| Email | Nodemailer | ^7.0.11 |
| CRM | GoHighLevel (GHL) | Custom integration |
| Spreadsheets | xlsx (SheetJS) | ^0.18.5 |
| Deployment | Docker + Traefik (reverse proxy + SSL) | Debian Bullseye |
| Hosting | Contabo VPS | 213.199.57.111 |
| Domain | *.zenowethu.co.za | SSO across subdomains |

### Key Integrations

| Integration | Purpose | Implementation |
|------------|---------|----------------|
| NCR DHS | Automated transfer status checks and requests via ncrdebthelp.co.za | 2,357-line Puppeteer scraper (`dhs.ts`) |
| OpenAI | Document analysis (ID, POA, Credit Reports, Payslips, Bank Statements) | 832-line service (`openai.ts`) |
| GoHighLevel | SMS, Email, WhatsApp messaging via CRM | `ghl-service.ts` |
| Nodemailer | Password reset emails, notifications | Standard SMTP |

---

## 3. Application Architecture

### 3.1 The 5 Apps

```
Traefik Reverse Proxy (SSL + Routing)
├── Cases App         → app.zenowethu.co.za      :3000
├── Insurance App     → insurance.zenowethu.co.za :3001
├── Legal App         → legal.zenowethu.co.za     :3002
├── Forensic Audit App                            :3003
└── Finance App                                   :3004
         │
         └──── PostgreSQL (Shared Database)
```

### 3.2 App-Specific Features

| App | Unique Domain Logic | Status |
|-----|-------------------|--------|
| **Cases** | Core case management, DHS automation, document AI analysis, B2B portal, payment tracking | Most complete |
| **Insurance** | `insurance-engine.ts`, `substitution-notice.ts` — premium assessment, cancellation letters | Partially built |
| **Legal** | `legal-engine.ts`, `court-docs.ts`, `reckless-lending.ts`, `rescission-engine.ts`, `ocr-parser.ts`, `document-generator.ts` | Most domain-specific code |
| **Forensic Audit** | `forensic-engine.ts`, `affordability-engine.ts` — reckless lending assessment | Partially built |
| **Finance** | No unique domain logic files | Bare — essentially a clone |

### 3.3 Database Schema (25 Models)

Core relationships:
- **Client** → has many **Case** → has many **Document**, **CreditAccount**, **Payment**
- **Case** → has **InsuranceAssessment**, **LegalMatter**, **ForensicAudit**, **CaseComment**
- **Project** → has many **Case** (B2B organization)
- **User** → assigned to **Case** (case worker)
- **CreditAccount** → has **CancellationLetter**, **InsurancePolicy**
- **LegalMatter** → has **LegalLetter**, **LegalPrescriptionCheck**
- **ForensicAudit** → has **AuditEvidence**, **RecklessLendingAssessment**

---

## 4. Features & Their Goals

### 4.1 Core Case Management
- **Client intake** — Create clients with SA ID numbers, contact details, employment info
- **Case creation** — File numbers, assignment, service fees, B2C/B2B acquisition types
- **80+ workflow statuses** — Organized into categories: Intake, Documentation, DHS, Processing, Legal, Insurance, Payment, Follow-up, Inactive
- **SLA tracking** — Deadline monitoring, overdue detection, days-in-status counter

### 4.2 AI Document Analysis
- Auto-extract client info from ID documents, Proof of Address, Credit Reports, Payslips, Bank Statements
- Combined PDF splitting — Identifies and separates mixed documents using OpenAI vision
- Credit account extraction — Parses creditor names, balances, monthly instalments from credit reports

### 4.3 DHS Automation
- Auto-login to NCR Debt Help System portal
- Transfer status checks — Consumer lookup, debt counsellor info extraction
- Transfer requests — Automated filing with POA and ID document uploads
- Decline reason extraction — Popup scraping from DHS responses

### 4.4 Insurance Module
- Credit life premium assessment — Analyzes credit accounts for insurance replacement opportunities
- Rate tables — Creditor-specific premium rates
- Cancellation letter generation — Auto-generated letters for old insurers
- Policy tracking — New policy issuance and management

### 4.5 Legal Module
- Prescription checking — SA prescription law analysis (3-year rule)
- Legal matter tracking — Judgments, court orders, debt review status
- Letter management — Draft, send, track legal correspondence
- Court document generation
- Reckless lending assessment

### 4.6 Forensic Audit Module
- Reckless lending detection — Income vs. affordability analysis
- Evidence collection — Document/file uploads per audit
- Audit findings & recommendations

### 4.7 Finance Module
- Payment tracking — Manual and batch (Excel upload) payments
- Payment matching — Link payments to cases/clients
- Batch reconciliation

### 4.8 Cross-Cutting Features
- **SSO** — Single sign-on across all apps via JWT cookies on `.zenowethu.co.za`
- **B2B Portal** — Partner dashboards, API keys, project-based case organization
- **Notifications** — Email + in-app notification system with @mention support
- **GoHighLevel CRM** — SMS/Email/WhatsApp integration
- **Reports** — Reporting dashboard per app
- **User management** — Roles (Admin, Manager, Member), groups, account locking
- **Document resource library** — Shared templates and resources per project
- **Theme** — Dark/light mode switching

---

## 5. Tech Debt Assessment

### 🔴 Critical Debt (Severity: 9/10)

#### 1. Massive Code Duplication Across 5 Apps

| File | Size | Duplicated x5? |
|------|------|:--------------:|
| `schema.prisma` | 752 lines (25,597 bytes) | ✅ Identical |
| `dhs.ts` | 2,357 lines (104,011 bytes) | ✅ Identical |
| `openai.ts` | 832+ lines (32-41 KB) | ✅ Near-identical |
| `auth.ts` | 166 lines (6,422 bytes) | ✅ Identical |
| `statuses.ts` | 654 lines (18,797 bytes) | ✅ Identical |
| `ghl-service.ts` | 116 lines (4,510 bytes) | ✅ Identical |
| `ghl-config.ts` | ~60 lines (2,406 bytes) | ✅ Identical |
| `dhs-config.ts` | ~60 lines (2,270 bytes) | ✅ Identical |
| `globals.css` | ~250 lines (9,857 bytes) | ✅ Identical |
| All `components/` | 24-25 files | ✅ Near-identical |
| All `api/` routes | 65-67 routes | ✅ Near-identical |
| `public/` directory | ~1,239 files | ✅ Identical |

> [!WARNING]
> ~520KB+ of code is duplicated 5 times across the apps. A bug fix in one app must be manually replicated to four others, which is error-prone and unsustainable.

#### 2. Zero Automated Tests
- 0 test files found (no `.test.ts`, `.spec.ts`, no jest/vitest config)
- No E2E testing framework
- No CI/CD pipeline evident

#### 3. NextAuth v5 Beta in Production
- Using `next-auth@5.0.0-beta.30` — an unstable pre-release version in a production system

### 🟡 Moderate Debt (Severity: 5-7/10)

| Issue | Severity | Details |
|-------|:--------:|---------|
| Giant files | 6/10 | `dhs.ts` is 2,357 lines, `openai.ts` is 832 lines |
| Console.log debugging | 5/10 | Auth, DHS, GHL all use `console.log` for debugging — no structured logging |
| No input validation library | 5/10 | No Zod schemas for API route validation (despite being installed) |
| Hardcoded strings | 5/10 | Status codes, categories, types are string literals scattered throughout |
| No rate limiting | 6/10 | API routes have no rate limiting beyond the ApiKey model's `rateLimit` field |
| Credentials in DEPLOYMENT.md | 7/10 | Database password is committed to the repo |
| No DB migrations | 6/10 | Uses `prisma db push` instead of `prisma migrate` — no migration history |
| Separate `node_modules` | 5/10 | Each app has its own `node_modules` + `package-lock.json` (~191-283KB each) |
| Mixed `any` types | 5/10 | Frequent use of `any` in auth callbacks, GHL payloads, OpenAI responses |

### 🟢 Low Debt (Severity: 1-4/10)

| Issue | Severity | Details |
|-------|:--------:|---------|
| Default README | 2/10 | `README.md` is the default Next.js create-next-app template |
| Mixed file organization | 3/10 | Some `.txt` planning files in root |
| No error boundary components | 4/10 | No React error boundaries for graceful failure |

---

## 6. Completion Status

### Overall Estimate: ~55-65% Complete

| Module | Completion | Notes |
|--------|:----------:|-------|
| Cases (Core) | 80% | Most feature-rich app. Dashboard, case CRUD, documents, workflow, DHS, AI analysis all functional |
| Insurance | 50% | Assessment engine exists, but cancellation workflow, policy management need polish |
| Legal | 55% | Has the most domain-specific code (6 unique files), but limited UI integration evident |
| Forensic Audit | 40% | Basic engine + evidence collection, but thin feature set |
| Finance | 25% | No domain logic files — essentially a copy of cases app with a different dashboard page |
| Auth & SSO | 85% | Login, SSO, password reset, account management all working |
| B2B Portal | 60% | Dashboard exists, API keys work, but partner-specific features incomplete |
| Notifications | 60% | Email + in-app work, GHL SMS/WhatsApp integration exists but may not be fully tested |
| Reporting | 40% | Basic reports exist, but no advanced analytics |

### What Still Needs to Be Done

1. **Finance app** — Needs actual financial management features (invoicing, revenue tracking, partner split calculations, reconciliation dashboards)
2. **Insurance workflow completion** — End-to-end cancellation letter sending, new policy issuance tracking
3. **Legal workflow completion** — Court filing integration, prescription check automation, judgment tracking dashboards
4. **Forensic audit workflow** — Full reckless lending calculation engine, report generation
5. **Testing** — The entire system has zero tests
6. **Proper error handling** — Replace `console.log` with structured logging, add error boundaries
7. **API validation** — Add Zod schemas to all API routes
8. **Mobile responsiveness** — Likely needs attention across all apps
9. **Documentation** — Developer docs, API docs, deployment runbook
10. **CI/CD pipeline** — Automated builds, tests, deployments

---

## 7. Recommended Improvements

### Phase 1: Architecture — Eliminate Code Duplication (Critical)

The #1 priority is restructuring the monorepo to eliminate the 5x duplication:

```
cases-app-main/
├── packages/
│   ├── shared-lib/          # auth, prisma, openai, dhs, statuses, ghl, notifications
│   ├── shared-ui/           # All shared components
│   ├── shared-config/       # Tailwind, ESLint, PostCSS configs
│   └── database/            # Single prisma schema + migrations
├── apps/
│   ├── cases/               # Only cases-specific pages + API routes
│   ├── insurance/           # Only insurance-specific pages + API routes
│   ├── legal/               # Only legal-specific pages + routes
│   ├── forensic-audit/      # Only forensic-specific pages + routes
│   └── finance/             # Only finance-specific pages + routes
├── turbo.json
└── package.json             # Root workspace config
```

**Benefits**: Fix a bug once → all apps benefit. Reduced bundle size. Faster builds. Single Prisma schema to maintain.

### Phase 2: Testing & Quality

| Action | Details |
|--------|---------|
| Add Vitest | Unit tests for lib functions (statuses, workflow, working days) |
| Add Playwright | E2E tests for critical flows (login, case creation, DHS check) |
| Add Zod validation | Schema validation on all API route inputs |
| Structured logging | Replace `console.log` with a logging library (pino or winston) |
| Error boundaries | React error boundaries on all page layouts |

### Phase 3: Security Hardening

| Action | Severity |
|--------|----------|
| Remove credentials from DEPLOYMENT.md | 🔴 Immediate |
| Upgrade NextAuth to stable release | 🔴 High |
| Add CSRF protection on API routes | 🟡 Medium |
| Add rate limiting middleware | 🟡 Medium |
| Implement proper RBAC middleware | 🟡 Medium |
| Use `prisma migrate` instead of `db push` | 🟡 Medium |
| Add Content Security Policy headers | 🟢 Low |

### Phase 4: AI-Powered Enhancements

| Enhancement | Description |
|-------------|-------------|
| Intelligent case routing | Use AI to analyze incoming cases and auto-assign to appropriate staff based on complexity, specialty, workload |
| Predictive SLA alerts | ML model to predict which cases will likely breach SLA based on historical patterns |
| Smart document classification | Improve the existing OpenAI pipeline with fine-tuned models for SA-specific documents |
| AI-assisted legal research | Use RAG (Retrieval Augmented Generation) over SA consumer protection law to assist with prescription analysis and reckless lending assessments |
| Automated status workflow | AI to suggest next workflow steps based on case progress and required documents |
| Client communication drafts | Auto-generate client update emails/SMS based on case status changes |
| Anomaly detection | Flag unusual payment patterns, duplicate cases, data quality issues |

---

## 8. Recommended Path Forward

### Immediate Actions (This Week)
1. Remove credentials from DEPLOYMENT.md and rotate the exposed passwords
2. Set up npm/pnpm workspaces with Turborepo to enable shared packages
3. Extract `packages/database` — single Prisma schema, shared across all apps
4. Extract `packages/shared-lib` — auth, openai, dhs, statuses, ghl, notifications

### Short Term (1-2 Weeks)
5. Extract `packages/shared-ui` — all duplicated components
6. Add Vitest and write first round of unit tests for critical lib functions
7. Add Zod validation to all API routes
8. Upgrade NextAuth to latest stable

### Medium Term (3-4 Weeks)
9. Complete Finance app domain logic
10. Add Playwright E2E tests for critical paths
11. Add structured logging and monitoring
12. Build proper CI/CD pipeline

### Long Term (1-2 Months)
13. AI enhancements (smart routing, predictive SLA, RAG legal research)
14. Mobile app or PWA improvements
15. Advanced reporting/analytics dashboard
16. WhatsApp business API integration (beyond GHL)

---

## 9. Key Files Reference

| File | Path | Purpose |
|------|------|---------|
| Prisma Schema | `schema.prisma` | 25 database models, 752 lines |
| Auth Config | `auth.ts` | NextAuth SSO with JWT cookies |
| DHS Automation | `dhs.ts` | NCR portal scraper, 2,357 lines |
| AI Analysis | `openai.ts` | Document analysis pipeline, 832 lines |
| Workflow Statuses | `statuses.ts` | 80+ case statuses across 9 categories |
| GHL Integration | `ghl-service.ts` | SMS/Email/WhatsApp messaging |
| Deployment | `DEPLOYMENT.md` | Docker/Traefik setup guide |
| Run Apps | `run-apps.md` | Local development workflow |
