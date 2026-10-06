# Phase 1 — Tenant Boundary Readiness Audit

> Date: 2026-09-26 · Branch: `feat/phase-0-company-profile` · Read-only audit, no schema changed.
> Goal: let several companies (Zenowethu, Mokgoshi Empire, future customers) share one
> platform and one database without ever seeing each other's data.

## 1. Size of the change

| Item | Count | Notes |
|---|---|---|
| Prisma models | **93** | none has `organisationId` today; no `Organisation` model |
| Prisma call sites | **~3,900** | `case` 603, `project` 240, `document` 196, `user` 168, `client` 149, `caseComment` 135, `workflowLog` 132, `invoice` 101, `systemSettings` 87 |
| API route files | **679** | across 8 apps |
| Raw SQL files | **13** | bypass any Prisma scoping — must be scoped by hand (list in §5) |
| Files building `storage/uploads` paths | **64** | upload folders are shared across companies today |
| Cron routes | **11** | all in Cases; each currently processes every record in the DB |

**Good news:** `packages/database/src/index.ts` already wraps every query in a
`$extends({ query: { $allModels: { $allOperations } } })` hook (connection retry).
Automatic tenant scoping can be added to that same hook, so most of the ~3,900 call
sites will not need editing by hand.

## 2. Model classification

Five **tenant roots** get an `organisationId` column directly: `User`, `Client`,
`Case`, `Project`, `ConsumerAccount`.

**68 child models** reach a root through a foreign key (e.g. `Document → Case`,
`Invoice → Case`, `ProjectMember → Project`). Recommendation: add a denormalised
`organisationId` to each child as well, so the scoping extension and Postgres RLS can
filter without joins, and so a mis-set foreign key can never cross companies.

**20 models have no link to a root** — each needs a decision:

| Model | Recommendation |
|---|---|
| `SystemSettings` | **Per company** — holds the Company Profile, DHS credentials, letterhead. Unique key becomes `(organisationId, key)`; platform-level settings get `organisationId = null`. |
| `MessageTemplate`, `ServicePrice`, `DocumentResource`, `DocumentSequence`, `BankAccount`, `UserGroup`, `AuditLog`, `XdsSyncLog`, `TelegramSession` | **Per company** |
| `DCCPPolicy`, `DCCPCreditAccount`, `DCCPFuneralDependant`, `DCCPCommissionRecord`, `DCCPMonthlyCommissionSummary` | **Per company** (insurance book belongs to the firm) |
| `AiProvider` | **Platform-wide** (one platform AI key, per the 2026-09-18 decision) |
| `CreditProvider`, `CreditLifeRateTable` | **Platform-wide reference data** (creditors are the same for every firm) — confirm |
| `CredoTenant`, `CouponCode` | **Replace/merge** — `CredoTenant` is an earlier, Crediva-only tenant idea (name, slug, colours, NCRDC). Fold it into the new `Organisation` model rather than running two tenant concepts. |

## 3. Unique constraints that must become per-company

These are globally unique today; with several companies they would collide or leak.

| Model.field | Why it matters | Change to |
|---|---|---|
| `Client.idNumber`, `ConsumerAccount.idNumber` | the **same consumer can be a client of two firms** | `@@unique([organisationId, idNumber])` |
| `Case.fileNumber`, `Invoice.invoiceNumber`, `DocumentSequence(prefix, year)` | each firm numbers its own files/invoices | add `organisationId` to the unique |
| `User.email`, `User.username` | **decision needed**: one login per person across firms, or separate per firm? (see §7) | global + membership table, or per-org unique |
| `Referrer.idNumber`, `DebtCounsellor.ncrdcNo`, `InsurancePolicy.policyNumber`, `MailboxAccount.emailAddress` | per-firm registries | per-org unique |
| `SystemSettings.key`, `ServicePrice.serviceKey`, `UserGroup.name`, `CouponCode.code` | per-firm configuration | per-org unique |
| Token fields (`PoaSigningRequest.token`, `DebtReviewRemovalConsent.token`, `Invoice.publicToken`, `PasswordResetToken.tokenHash`, `ApiKey.key`) | random, collision-free | **stay global** — they resolve the organisation |

## 4. Data flows that are shared today

- **File storage:** `storage/uploads/<caseId>/…` for every company (64 files build these
  paths). Move to `storage/uploads/<organisationId>/…` behind one shared path helper;
  the new shared `serve-uploads-route` should also check the file belongs to the
  signed-in user's organisation.
- **Integrations:** DHS credentials come from `SystemSettings` with env fallback
  (`DHS_USERNAME`/`DHS_PASSWORD`); GHL and SMTP come from **env only**. Each firm needs
  its own DHS/XDS/GHL/SMTP/DCCP credentials → per-org encrypted settings (Phase 2).
- **Cron jobs (11):** each scans the whole database. They must loop per organisation
  and use that organisation's credentials and company profile.
- **Company Profile (Phase 0):** stored in `SystemSettings` → becomes per-org
  automatically once `SystemSettings` is scoped. The website must then pick the
  organisation from the request host (custom domain / `{slug}.product` subdomain).
- **Sessions:** the NextAuth JWT must carry `organisationId`; the scoping extension
  reads it from the request context (AsyncLocalStorage) and **fails closed** when absent.

## 5. Raw SQL (not covered by automatic scoping)

`apps/{cases,finance,forensic-audit,insurance,legal}/app/api/finance/invoices/stats/route.ts`
(5 copies of the same stats query), `apps/*/app/api/health/route.ts` (5 — `SELECT 1`, safe),
`apps/reporting/app/api/reporting/{check-in,check-out,presence/sessions}/route.ts` (3).
The 5 stats copies should be merged into one shared, org-scoped function first.

## 6. Recommended build order

1. **Staging database** — a copy of production to rehearse migrations (the only DB today
   is live production and is unreachable from the dev machine).
2. `Organisation` model + seed **Zenowethu** as org #1; migrate `CredoTenant` into it.
3. Add nullable `organisationId` to all tenant tables → backfill every row to Zenowethu →
   make it required → switch unique constraints (§3). One migration per batch, rehearsed on staging.
4. Session carries `organisationId`; request-scoped context; Prisma scoping extension on the
   existing `$allModels` hook, **fail-closed**; then Postgres RLS as a second wall.
5. Scope the 13 raw-SQL files, 64 storage paths and 11 crons.
6. Per-org integrations (Phase 2): DHS/XDS/GHL/SMTP/DCCP credentials and Puppeteer sessions.
7. Acceptance test: onboard **Mokgoshi Empire** from scratch and prove zero Zenowethu data,
   branding, numbering or credentials are visible.

Every step needs cross-tenant tests: create two organisations, and assert that
each API returns nothing from the other.

## 7. Decisions needed from the owner

1. **Logins across firms** — can one person (e.g. a consultant) work for two firms with one
   login (global user + memberships), or does each firm have fully separate accounts?
   *Recommendation: global user + `OrganisationMember` table; simpler for the platform owner.*
2. **Consumers in two firms** — a consumer who is a client of both Zenowethu and Mokgoshi:
   separate records per firm (recommended, POPIA-clean) or one shared record?
3. **Creditor reference data** (`CreditProvider`, rate tables) — shared across firms (recommended)?
4. **Staging database** — on the VPS (recommended) or a local copy of production?
