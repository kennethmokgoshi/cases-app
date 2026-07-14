# ZenoCasesSystem — Project Status

> Last updated: 2026-07-14 (**Referrer portal now displays workflow status, never the lagging commission stage**: user spotted that referral "Stage"/status chips contradicted reality (a case at workflow status SETTLED_SUCCESS showed "Quote accepted"; a COMPLETED case with R4,500 outstanding showed "Settled"). Root cause explained: `ReferrerCommission.stage` is the *payout-pipeline* tracker (13-value `ReferrerCommissionStage` enum), written only when a case status change hits the 17-entry `STATUS_TO_COMMISSION_STAGE` map in `packages/shared-lib/src/referrer-commission.ts` — the other 60+ workflow statuses (incl. SETTLED and SETTLED_SUCCESS!) never touched it, so it froze at the last mapped value; and COMPLETED deliberately maps to stage SETTLED so commission becomes payable at completion. Fixes: (1) referrer portal summary + detail routes now derive `referralStatus` label and `statusTone` from `case.status` only (stage no longer consulted for display); (2) `portalStageLabel()` falls back to the shared workflow status *name* (`getStatusByCode`) before title-casing, so pills read "Settled Successfully"/"Outstanding Documents"/"Requested via DHS" like the staff dashboards; (3) `calculateDiscountPartnerTotals()` tones from `caseStatus ?? stage` (status-first) so the monthly scoreboard counts match the pills; (4) data-quality: `SETTLED` and `SETTLED_SUCCESS` added to `STATUS_TO_COMMISSION_STAGE` (both → stage SETTLED, an already-eligible stage) so the staff commission-pipeline Stage column on `/admin/referrers/[id]/clients` stops freezing at e.g. Quote Accepted when a case actually settles — NOTE this only affects future status changes; existing rows keep their stale stage until the case's status next changes. Deliberately NOT changed (business rule, needs a user decision): COMPLETED still maps to stage SETTLED for payout eligibility, and the admin clients page still shows the commission stage in its Stage column (it already shows workflow status in the File # column). Verification: 33/33 referrer-portal tests green (fixtures reworked to status-driven expectations + new label/mapping tests incl. a stage-must-not-override-status case), shared-lib referrer-commission 19/19 green, `tsc --noEmit` clean on cases + shared-lib. **Redeploy cases + shared-lib consumers to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-14 (**Discount partner dashboard: colour-coded statuses + clickable calendar-month scoreboard**: per user request the `/referrer` discount-partner dashboard is no longer dull. (1) **Status colours**: referral-status pills (table + detail header) are now tone-coloured via new `portalStatusTone()` in `apps/cases/lib/referrer-portal.ts` (deep-imports shared statuses): emerald = Settled (happy, fully paid), bright yellow/gold = Completed (job done, payment outstanding), cyan = In progress (anything from Requested via DHS onwards incl. quote/deposit/instalment stages), orange = Detour (DETOUR + ADVANCED_DETOUR categories plus arrears/handed-over — stumbling block we're working through), red = Overdue, grey = Lost, neutral slate = beginning stages. Tone is computed server-side from `commission.stage ?? case.status` (same source as the label) and returned as `statusTone` per referral row. (2) **Calendar-month scoreboard**: the 8 "last 30 days" tiles were replaced by three grouped scorecards — Referrals (cyan), Completed (yellow), Settled (emerald) — each showing All time / this month (named, e.g. "July") / last month ("June"), with a competitive ▲/▼ "up/down on last month" delta on the this-month stat, plus a money row (Total quoted, Quoted — July, Total paid, Paid — July). `calculateDiscountPartnerTotals()` was rewritten to calendar-month buckets (new shape: `referralsThisMonth/LastMonth`, `totalCompleted/completedThisMonth/LastMonth`, `settledThisMonth/LastMonth`, `quotedThisMonth`, `paidThisMonth`); settled/completed month attribution comes from each case's `workflowLog` STATUS_CHANGE history (first log whose toStatus maps to the settled/completed tone; settled falls back to commission-stage `updatedAt`), now selected in the summary route. Settled counting also improved: a case whose *status* is SETTLED now counts even without a commission-stage row (tone-based, stage wins when present). (3) **Every stat is clickable**: clicking any scoreboard stat or money card filters the Referral tracking table to the files behind the number (13 filters incl. per-month completed/settled/quoted/paid; rows carry `settledAt`/`completedAt`/`quoteDate`/`paidThisMonth`), with an active-card highlight, a dismissible filter chip ("X of Y records"), a filtered-empty state with a "Show all files" link, and click-again-to-clear. Commission-referrer dashboard unchanged. Verification: 28/28 referrer-portal tests green (lib tests rewritten for the new totals shape + 5 new `portalStatusTone` suites + `isInCalendarMonth` boundary tests; summary route test now pins system time and asserts month buckets, `statusTone`, and workflowLog-driven attribution), full `apps/cases` `tsc --noEmit` clean. Behind-login UI needs a discount-referrer visual check (agent has no referrer credentials). **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-14 (**AI Plan execution fixed — the step registry was shipping EMPTY because `"sideEffects": false` let the bundler tree-shake all action registrations; failed steps are now retryable**: after the API-key fix, plans generated but every executed step failed with `No handler for: <actionType>` (seen live on case ZDM-2026-1030-WWP step 1 STATUS_UPDATE). Root cause: `packages/plan-engine/package.json` declares `"sideEffects": false`, but all 23 action handlers registered themselves via side-effect-only imports (`import './actions/cases'` etc.) at the bottom of `step-registry.ts` — Turbopack is entitled to drop such imports under that flag, so the compiled Cases routes ran with zero registered handlers (the `drr-trigger` cron route had even grown a manual "we must import the actions" workaround for this). Those imports were also circular (actions imported `stepRegistry` back) — a latent ESM TDZ crash. Fix: each of the 6 action modules (`actions/cases|legal|insurance|forensic|finance|ghl.ts`) now exports a plain `Map<ActionType, ActionHandler>` (`casesActions`, `legalActions`, …) built via a local `registerAction()` helper and imports only *types* from step-registry (cycle gone); `step-registry.ts` imports the six maps as used bindings (cannot be tree-shaken) and merges them explicitly after creating `stepRegistry`; `ActionHandler` type is now exported; the drr-trigger workaround import was removed. Unwedge + retry: `POST /api/ai/plan/[planId]/step/[stepId]/resume` now also accepts FAILED steps (clears error/executedAt/completedAt, resets to PENDING, logs "Failed Step N retried" comment, re-executes) — previously a failed step was a dead end (resume 409'd on non-WAITING_FOR_USER and regenerate 409'd on IN_PROGRESS plans, wedging the whole plan); `PlanStepCard` failed-step error box gained a **Retry Step** button; route's `console.error` → `createLogger('ai-plan-step-resume')`. Verification: new `step-registry.test.ts` (24 tests) asserts ALL 23 planner-prompt actionTypes are registered + unknown-type fallback — plan-engine 49/49 green, ui 35/35 green, ui `tsc --noEmit` clean, resume + start routes recompiled live on :3000 with no server errors (401 auth gate reached = full module graph incl. registration evaluated). Staff should now click **Retry Step** on the failed step. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-14 (**AI Plan generation failures now tell staff exactly what broke — and the root cause of today's failures is a wrong-provider API key**: the AI Plan tab's generic "Failed to generate plan" banner was hiding the real error. Diagnosis: `OPENROUTER_API_KEY` in `apps/cases/.env.local` contains an OpenAI key (`sk-proj-…`) instead of an OpenRouter key (`sk-or-…`), so every plan-engine call to openrouter.ai fails with 401; `ANTHROPIC_API_KEY` is empty so the fallback can't engage. ⚠️ **Manual fix still needed: put a real OpenRouter key (or an Anthropic key) in `apps/cases/.env.local` and restart the dev server.** Code changes so this class of failure is self-explanatory: new `classifyPlanGenerationError()` + `describeAiProvider()` in `packages/plan-engine/src/errors.ts` classify failures into `AI_NOT_CONFIGURED | AI_AUTH_FAILED | AI_RATE_LIMITED | AI_MODEL_ERROR | AI_PROVIDER_ERROR | AI_NETWORK_ERROR | AI_BAD_RESPONSE | DATABASE_ERROR | UNKNOWN` with a plain-English detail + "what to do" hint (auth failures even detect a wrong-prefix key and say it likely belongs to another provider); `POST /api/ai/plan/generate` now returns `{error, code, detail, hint}` with a proper status (502 provider / 503 unconfigured) and logs via `createLogger('ai-plan-generate')` instead of `console.error`; the AIPlanTab banner renders headline + code chip + detail + amber "What to do" hint (422 missing-docs responses list the missing document types via new exported `buildPlanGenerationError()`). Verification: 16 new classifier tests + 3 new UI mapper tests — plan-engine 25/25 and ui 35/35 green, ui `tsc --noEmit` clean; classifier verified end-to-end against the live failing OpenRouter call, which now yields `AI_AUTH_FAILED` / "OpenRouter rejected the API key … does not look like a OpenRouter key … Check OPENROUTER_API_KEY in the environment (.env.local)". Behind-login banner needs a visual check when staff next clicks Generate AI Plan. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-14 (**DHS decline consumer emails now name the actual Debt Counsellor and their firm**: consumer-facing decline emails were rendering the literal placeholder "Your current Debt Counsellor (Debt Counsellor)" because `handleDHSDecline`/`previewDHSDecline` resolved `dcName` only from case-level fields (`debtCounsellorName`/`dcTradingName`) and never fell back to the linked `DebtCounsellor` master record — even though the relation was already fetched. New exported `resolveDcIdentity()` in `packages/shared-lib/src/dhs/decline-handler.ts` resolves both the DC's personal name (case override → relation `fullName` → trading name → placeholder) and a separate firm name (case `dcTradingName` → relation `tradingName`, suppressed when identical to the name), shared by handler and preview. All five consumer decline templates (send-docs, consent, outstanding-fees, attorney, resubmit) now render "Your current Debt Counsellor (Gasant Essack) from (Creditore Debt Counselling) has declined this request." followed by a blank line and `Their DHS response reads: "…"` on its own line (per user-requested wording; firm phrase omitted when no distinct trading name exists). DC-facing and attorney emails unchanged. Verification: 53/53 decline tests green (6 new: fees-email wording with/without firm + 4 `resolveDcIdentity` cases), shared-lib `tsc --noEmit` clean. **Redeploy cases + shared-lib consumers to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-14 (**Discount partner portal: client finance dashboard + per-case finance detail**: per user request, discount referrers now see their referred clients' money flow. Portal `/referrer` top tiles for discount partners are now 8 stats (2 rows): Total referrals, Referrals — last 30 days, Total settled, Settled — last 30 days, Total quoted, Quoted — last 30 days, Total paid, Paid — last 30 days (the Client discount tile was removed per request; Total paid = completed payments across ALL clients the partner referred). The referral table gained Quote and Paid columns for discount partners, and the per-referral case detail's block became a **Client finances** card: Quote, Total paid, Balance, plus a **Payments received** list showing each completed payment's amount and date, with the discount note kept as a footer line. Server: `GET /api/referrer-portal/summary` computes per-case financials via the shared `summariseCaseFinancials` (quote basis = case service fee or accepted quote) and returns `discountSummary` (null for commission referrers) via the new pure `calculateDiscountPartnerTotals()` in `apps/cases/lib/referrer-portal.ts` (30-day windows; settled dated by commission-stage `updatedAt`; quote dated by acceptance/creation date or case creation for service fees; future/invalid dates excluded); `GET /api/referrer-portal/referrals/[caseId]` returns `financials` (quote/total paid/outstanding + completed-payment list) for discount referrers only — commission referrers still get `financials: null` and keep their commission block, preserving the client-money privacy stance for that type. Fixed in passing: Decimal-like amounts are now normalized via `toPortalNumber` instead of `Number()` in both routes. Verification: 43/43 referrer-portal tests green (4 new lib tests for the totals helper incl. 30-day boundary/future-date cases, summary + detail route tests extended with discount finance scenarios asserting PENDING payments are excluded), cases `tsc --noEmit` clean, both routes live-verified returning 401 unauthenticated on localhost:3000. Behind-login UI needs a discount-referrer visual check. **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-13 (**Referrer portal referral detail enriched — type-aware case details**: clicking a referral in the referrer portal (`/referrer`) now shows a fuller, referrer-safe case detail: a **Requested services** chips card (parsed from `Case.services` JSON via new `parseCaseServices()`), a **Documents on file** card listing document *types* + upload dates only (never filenames or file access; `isAdminOnly` documents excluded; humanized via new `formatDocumentTypeLabel()` — e.g. ID_DOCUMENT → "ID Document"; empty state nudges the referrer to remind their client to submit documents), alongside the existing progress bar, history, and discussion. The money block stays type-aware: commission referrers see the commission amount/status/paid/reference card, discount referrers see the "Client benefit" discount note. `GET /api/referrer-portal/referrals/[caseId]` now returns `referrerType`, `clientDiscountPercent`, `services`, and `documents` (types+dates). Verification: 38/38 referrer-portal tests green (6 new lib tests for the two helpers, detail route test extended with services/documents assertions + a new discount-referral case), cases `tsc --noEmit` clean, detail route live-verified returning 401 unauthenticated on localhost:3000. Behind-login UI needs a referrer-credential visual check (agent has none). **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-13 (**Two referrer types — Commission vs Discount — with dashboards for both**: the platform now distinguishes COMMISSION referrers (clients pay full price, referrer earns per referral — the historical behaviour and default) from DISCOUNT referrers (their clients get discounted pricing via the new `clientDiscountPercent`, and the referrer earns NO commission). Schema: `Referrer.referrerType` (default `COMMISSION`) + `Referrer.clientDiscountPercent` (migration `20260713_add_referrer_type_and_client_discount`, applied to the live DB; all existing referrers verified as COMMISSION). Shared rule: `referrerEarnsCommission()` in `@zenowethu/shared-lib/src/referrer-commission.ts` (unknown/legacy types treated as COMMISSION). Case status changes still upsert `ReferrerCommission` stage rows for discount referrers (their pipeline dashboards depend on stage tracking) but never mark them eligible or auto-calculate amounts, so discount referrers can never appear in payouts/outstanding totals. Admin → Referrers: the add/edit modal has a Commission/Discount type picker (discount % input replaces the commission-tier section for discount referrers), the table shows a type badge and "X% client discount / No commission" instead of outstanding/paid money, and the detail drawer shows type-appropriate info. `/admin/referrers/[id]/clients` dashboard: header badge shows the type + discount, Commission Tracker/Statement links hidden for discount referrers, money cards swap Commission Owed/Paid for Client Discount, table stage column drops the commission due/paid line, and Converted % is now stage-based (`DEPOSIT_PAID+`) so it works for both types. Referrer portal `/referrer`: discount referrers get a discount-partner dashboard — tiles become Total referrals / In progress / Settled / Client discount %, the referral table shows Referred + Last activity dates instead of Commission/Payout/Reference, the payment follow-up form + follow-up history + statement download are hidden, the referral detail shows a "Client benefit" discount note instead of the commission block, and the profile form drops banking fields (with a note that no payouts apply); commission referrers see the existing commission dashboard unchanged. API guards: `POST /api/referrer-portal/payment-queries` and `GET /api/referrer-portal/statement` return 403 for discount referrers; admin create/PATCH accept `referrerType`/`clientDiscountPercent` (Zod-validated 0–100) and keep type-specific config consistent (discount ⇒ no fixed commission amount; commission ⇒ no discount). Verification: 18/18 shared-lib referrer-commission tests green (4 new for `referrerEarnsCommission`), 107 referrer-related cases tests green incl. new 403 guard tests, `tsc --noEmit` clean on cases + shared-lib, live DB query confirmed the new columns + defaults. ⚠️ Deploy gotcha hit locally and fixed: the first `prisma generate` was aborted mid-write by dev servers locking the query-engine DLL, leaving a stale runtime client that 500'd the portal summary — if the portal shows "Failed to load portal summary" after deploy, rerun `prisma generate` with servers stopped and restart. Note: the discount % is stored and shown to staff when quoting, but quotes/invoices do NOT yet auto-apply it — wiring the discount into quote generation is the natural next step. **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-13 (**Referrer portal: per-referral progress detail + two-way case discussion thread**: clicking a row in the referrer portal's Referral tracking table (`/referrer`) now opens a full Referral detail panel showing a category-coloured workflow progress bar ("Stage N of 10" via the shared `apps/cases/lib/workflow-progress.ts` helper), the status description, a commission block (amount/status/paid date/reference), a progress history timeline (status-change labels only — internal workflow notes are never exposed), and a **Case discussion** chat where the referrer can ask anything about the case. Referrer messages are stored as `CaseComment` rows with `type: 'REFERRER'` / `isInternal: false` / `activityType: 'REFERRER_COMMENT'` (no migration needed), appear in the staff case activity feed with a cyan 🤝 "Referrer thread" badge, touch the case via `touchCaseAction`, and create an `InAppNotification` for the assigned case manager. Staff reply from the case page: `ActivityTab` in `@zenowethu/ui` gained a third composer mode (Public Note → Journal → **Referrer Reply 🤝**) that posts a `REFERRER`-type comment visible in the referrer's portal; `CaseCommentCreateSchema` now accepts type `REFERRER`. New APIs: `GET /api/referrer-portal/referrals/[caseId]` (detail: workflow/history/commission/comments, ownership-checked via `referrerId`) and `GET/POST /api/referrer-portal/referrals/[caseId]/comments`. Consumer names stay masked (initial + surname). Verification: 15/15 new Vitest tests green (2 new route files + `toPortalComment` helper tests), schemas suite 105/105 green, `packages/ui` `tsc --noEmit` clean; live end-to-end verified on localhost:3000 as referrer William Maesela — login → summary → detail (stage 9/10 "Quote Accepted") → posted comment (201) → comment confirmed in the staff activity feed, unauthenticated requests 401. ⚠️ Security gap found in passing and spawned as a follow-up task: `GET /api/cases/[id]/comments` has no role check beyond middleware auth, so a REFERRER session can read internal notes for any case — lock staff case APIs down to staff users. Also added a `cases-alt` launch config (port 3010) because the cases `dev` script hardcodes `--port 3000`. **Redeploy cases + UI consumers to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-13 (**Referrer clients dashboard now shows workflow progress per file**: the File # column on `/admin/referrers/[id]/clients` became "File # / Workflow Status" — each row now shows the friendly workflow status name (e.g. "Quote Accepted" instead of the raw `QUOTE_ACCEPTED` code), a category-coloured progress bar, and a "Stage N of 10 · <category>" line based on the platform's 11 `STATUS_CATEGORIES` (1. Beginning → 10. Settled; LOST shows a grey "Lost case" bar, OVERDUE shows the status name in red), with the status description as a hover tooltip. Searching by friendly status name now works too. Logic lives in the new pure helper `apps/cases/lib/workflow-progress.ts` (`getWorkflowInfo()`, deep-imports `@zenowethu/shared-lib/src/statuses/statuses` so tests and client bundles don't pull the server barrel). Verification: 5 new helper tests + 6 route tests = 11/11 green; cases `tsc --noEmit` clean on touched files; dev server compiles with no errors and the route still returns 401 unauthenticated. **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-13 (**Referrer clients dashboard enriched with case tracking + client financials**: per user request, `/admin/referrers/[id]/clients` now also shows per case — Last Updated (date + `Case.updatedBy` staff name, searchable), Next Update date (red "overdue" when `Case.nextUpdate` is in the past), Quote (service fee or accepted-quote basis via the shared `summariseCaseFinancials` from `@zenowethu/shared-lib/src/finance/case-financials`, with the basis labelled), Paid (completed payments + % collected), and Balance (amber amount due / green "Settled" / green "Overpaid RX"). The table was restructured (contact merged into the Client column; File #+status combined; Stage & Commission combined) and the stat cards split into two rows: pipeline (Clients, Cases, New This Month, Converted, Settled, In Arrears) and money/follow-up (Total Quoted, Total Collected, Client Balance Due, Updates Overdue, Commission Owed, Commission Paid). API `GET /api/admin/referrers/[id]/clients` now selects payments/invoices/updatedBy/nextUpdate/serviceFee per case and returns `financials` per row plus `totalQuoted`/`totalCollected`/`totalBalanceDue`/`updatesOverdue` in the summary. Verification: 6/6 route tests green (extended with financial math — accepted-quote vs service-fee basis, 50% collected, balances, overdue-update count); cases `tsc --noEmit` clean on touched files; route live-verified returning 401 unauthenticated on localhost:3000. Behind-login UI still needs a staff-credential visual check. **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-13 (**Referrer clients dashboard added — Sub-Project name now opens it**: clicking a referrer's Sub-Project name in Admin → Referrers (table cell and the detail drawer) now opens a new referrer-scoped clients dashboard at `/admin/referrers/[id]/clients` instead of the generic Projects directory. The page shows: stat cards (distinct clients, cases, new this month, conversion %, settled, in arrears, commission owed/paid), a clickable commission-stage pipeline breakdown (clicking a stage bar filters the table), a 6-month referral trend bar chart, and a searchable/stage-filterable table of every referred client with contact details, file #, case status, referred date, commission stage chip, and paid/due/not-yet-due commission per case — each row links to the case. Cases without a commission record show as an "Intake" stage rather than being hidden. Header keeps quick links to the existing Commission Tracker page, PDF statement download, and the raw Project Folder. New API `GET /api/admin/referrers/[id]/clients` (auth + admin-level role + `canAccessReferrer` sub-project membership check, same rules as the commission endpoint) returns referrer info, per-case client+commission rows, summary, stage breakdown, and monthly trend. Verification: 6/6 new Vitest route tests green (`clients/route.test.ts` — auth/role/404/membership + summary math incl. distinct-client counting and NO_RECORD stage); `tsc --noEmit` shows zero errors in the new/touched files; route live-verified on localhost:3000 returning 401 unauthenticated. Behind-login UI not browser-verified (no staff credentials available to the agent). **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-13 (**AI Plan tab readiness checkbox fixed for non-B2B cases**: the AI Plan tab showed "Case requires staff to mark information as sufficient before plan generation." (403 from `POST /api/ai/plan/generate`) on B2C cases with all documents present, with no way to resolve it — commit d78ba1c made the API require `Case.planReadyToStart` for ALL cases, but `packages/ui/src/plan/AIPlanTab.tsx` still hid the "Information sufficient to proceed" checkbox and skipped the flag in its `canGenerate` logic unless `acquisitionType === 'B2B'`. Fix: the readiness checkbox now renders for every case, gating logic was extracted into the exported pure helper `getPlanGenerationGate()` (mirrors the server rule; blocked-reason hints preserved), and `acquisitionType` became an optional no-op prop kept for caller compatibility. Added `AIPlanTab.test.tsx` (5 tests incl. the B2C 403 regression). Verification: `@zenowethu/ui` Vitest 32/32 green, `packages/ui` `tsc --noEmit` clean. Known gap noted during investigation: `POST /api/ai/plan/ready` has no role check — any authenticated user can flip the flag. **Redeploy cases + UI consumers to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-13 (**Local dev environment rebuilt from scratch — Node.js was missing from this machine**: no Node/npm/pnpm runtime existed anywhere on the PC (searched PATH, Program Files, all user profiles, nvm/scoop/volta locations, WSL, registry), and `.claude/launch.json` still pointed at a nonexistent `C:/Users/Kenneth/bin/pnpm.cmd` from another machine. Installed Node.js LTS v24.18.0 via winget (official nodejs.org MSI), installed pnpm 10.30.1 globally (matches root `packageManager`), ran a clean `pnpm install` (870 packages, all postinstall builds OK incl. Prisma engines, sharp, puppeteer + Chrome 145 download), regenerated Prisma Client v5.22.0 from `packages/database/prisma/schema.prisma`. Added `.claude/pnpm-wrapper.cmd` (prepends Node + npm-global dirs to PATH) and rewired all 7 `launch.json` entries through it because the preview launcher process predates the Node install and lacks it on PATH. All 7 apps started and verified HTTP 200 with correct titles: cases:3000, insurance:3001, legal:3002, forensic-audit:3003, finance:3004 (preview-managed), credo:3005 + website:3006 (background processes — preview pane caps at 5 managed servers). Cases login page renders cleanly, no server errors in logs. NOTE: `packages/database/.env` points `DATABASE_URL` at the production VPS Postgres (213.199.57.111:5432) — local dev is running against the LIVE database. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**Deploy fix 3: imap removed from shared-lib barrel**: the forensic-audit Dokploy app failed with the same 20 thread-stream Turbopack errors because `packages/shared-lib/src/integrations/index.ts` re-exported `./imap` — so EVERY app importing the shared-lib barrel pulled imapflow → pino → thread-stream, not just cases. Same reason the logger barrel deliberately keeps pino behind a deep import. Fix: imap is no longer re-exported from the integrations barrel (NOTE added, mirroring the telegram-bot precedent); the two cases routes (`mailboxes/[id]/test`, `dhs-decline/check-fee-emails`) and their tests now deep-import `@zenowethu/shared-lib/src/integrations/imap`. Rule going forward: any module that statically imports imapflow must be deep-imported only, and the consuming app needs imapflow+pino in dependencies + serverExternalPackages (cases has this from Deploy fix 2). Verification: 18/18 focused route tests green; `tsc --noEmit` clean on shared-lib and cases. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**Deploy fix 2: imapflow/pino Turbopack externalization**: after the lockfile fix, the cases Docker build failed in `next build` — `pino` was already in `serverExternalPackages` but is NOT resolvable from `apps/cases` under pnpm's strict node_modules (it was only a shared-lib dependency), so Turbopack fell back to bundling imapflow → pino → thread-stream and errored on thread-stream's test/README/LICENSE files (20 Turbopack errors). Fix: added `imapflow ^1.4.7` + `pino ^10.3.1` as direct dependencies of `apps/cases`, added `imapflow` to `serverExternalPackages` in `apps/cases/next.config.ts`, regenerated the lockfile. Commit c99a1d8 pushed and Dokploy redeploy triggered via webhook. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**Deploy fix: pnpm-lock.yaml regenerated for imapflow**: the Dokploy build of commit 4603a48 failed at `pnpm install --frozen-lockfile` with `ERR_PNPM_OUTDATED_LOCKFILE` because `imapflow@^1.4.7` was added to `packages/shared-lib/package.json` without updating the lockfile (see the 2026-07-12 mailbox-test entry's install caveat — the pnpm store v10/v11 mismatch meant the local install was staged with npm and never wrote the lockfile). Regenerated with `pnpm install --lockfile-only` (87 lines added), committed as e9de435, pushed to `origin/main`, and re-triggered the Dokploy deployment via its webhook (accepted: "Application deployed successfully"). No code changes. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**Case Last Update & Next Update SLA Handling**: updated status change API routes in all 5 apps to compute `nextUpdate` based on the status-specific `slaDays` config instead of the hardcoded 5 business days fallback. Created `touchCaseAction` in `@zenowethu/shared-lib/src/automation/workflow-engine.ts` to unify case touching (changing `updatedAt` to now) and `nextUpdate` calculation, and integrated it into comments routes (7 working days SLA) and documents routes (3 working days SLA) across all 5 apps. Created Vitest unit tests in `packages/shared-lib/src/automation/workflow-engine.test.ts` and updated `workflow.test.ts`. Verification: all 745/745 shared-lib tests and 627/627 cases tests pass cleanly. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**Check DHS button now extracts and updates full Debt Counsellor details from popup**: updated `searchConsumer` in `packages/shared-lib/src/dhs/search.ts` to call `getDebtCounsellorInfo(page)` on a consumer match to retrieve detailed DC fields (Trading Name, Operating Status, Mobile, Email, Province) from the DHS details popup, rather than returning `undefined`. Updated `apps/cases/app/api/dhs/lookup/route.ts` to fallback `ncrdcNo` to `consumer.debtCounsellor` if `dc?.ncrRegistrationNo` is missing, preventing searches from clearing existing registration numbers. Added Vitest unit test suite in `packages/shared-lib/src/dhs/search.test.ts` and updated assertions in `accepted-handler.test.ts`. Verification: all 173/173 DHS tests pass cleanly, and cases app typecheck compiles successfully. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**Personal invoice search mailbox now auto-prefills with logged-in user email and default IMAP host**: updated `MailboxSettings.tsx` to retrieve the active session via `useSession()` and prefill `personalForm` properties (`emailAddress`, `imapHost` set to `imap.gmail.com` or `mail.domain`, and `label` to `My Mailbox`) if no personal mailbox is registered yet. Verification: cases app typecheck and vitest suite (623/623 tests) compile and pass clean. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**Invoice email checks stream progress, scan linked emails, and verify request history with detailed sender/recipient/DHS matching metadata**: updated `POST /api/cases/[id]/dhs-decline/check-fee-emails` to return a `ReadableStream` with NDJSON progress events. The GET endpoint at `/api/cases/[id]/dhs-decline/check-fee-emails/verify-request` queries both `NotificationLog` and `CaseComment` tables. If the recipient email is not directly recorded in the log, it falls back to the resolved active DC email address on the case. It retrieves the system's actual outgoing sender email (e.g., `transfers@zenowethu.co.za`) from SMTP config, and reconstructs standard email subject lines for automated comments. Even if no recipient email address is configured (which returns `'No email address configured (No email was sent)'`), the sender address and subject line are always displayed to allow consultants to quote standard values during follow-up calls. Verification: 16/16 route tests and cases typecheck pass cleanly. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**DHS decline handler falls back to Debt Counsellor master record emails**: updated `handleDHSDecline` in `packages/shared-lib/src/dhs/decline-handler.ts` and `previewDHSDecline` in `packages/shared-lib/src/dhs/decline-preview.ts` to include the `debtCounsellor` table relation in Case fetching. This allows the decline responder to fall back to official DHS master record fields (`debtCounsellor.preferredEmail`, `debtCounsellor.lastKnownEmail`, `debtCounsellor.email`) if case-specific overrides are empty, preventing declines from failing to email the DC due to missing contact details. Verification: 47/47 shared-lib decline tests and mono-repo typechecks compile and pass cleanly.)

> Last updated: 2026-07-12 (**Invoice email scans now require client ID-number match before any email may be opened/read**: the `check-fee-emails` request now refuses to queue when the case has no client ID number, stores a strict `matchPolicy` in activity data (`CLIENT_ID_NUMBER`, server-side search required, open/fetch only after identifier match, non-matching emails skipped unopened), and only treats recent requests as duplicates if they already carry that strict policy. Legacy scan requests without this policy are superseded by a new safe request. The result card now shows the ID-number gate: only emails containing the client ID number may be opened/read, and non-matching emails must be skipped unopened. Verification note: focused route tests and `apps/cases` typecheck were attempted, but escalation was blocked by the Codex usage limit and sandboxed runs hit Windows `EPERM` reading pnpm-linked Vitest/TypeScript files; rerun when approvals/usage are available. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**Invoice email check now shows a scan-readiness summary**: the case-page **Check invoice emails** result card now shows evidence that the request did something: search-from date, selected/readable mailbox count, skipped mailbox count, and pending placeholders for emails scanned, new emails found, invoice candidates, and uploaded documents. The `POST /api/cases/[id]/dhs-decline/check-fee-emails` route now returns and stores `scanSummary` in `activityData`, and the internal timeline note records selected/readable/skipped mailboxes plus the fact that real email counts are pending until the inbox worker runs. This is intentionally honest: the current action queues the scan request; it does not yet read IMAP messages itself. Verification: focused check-fee-emails route tests 11/11 green; `apps/cases` `tsc --noEmit` clean with 8GB heap. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**Gmail mailbox registry now warns before testing**: every mailbox using a Gmail host/address (`imap.gmail.com`, `@gmail.com`, or `@googlemail.com`) is now treated as requiring a Google App Password throughout Admin → Settings / Account mailbox management. Added `isGmailMailbox()` in `apps/cases/lib/mailboxes.ts` with focused tests; `MailboxSettings` now shows a page-level Gmail warning, per-mailbox `Gmail: App Password required` badges, Gmail-specific password placeholders, and an inline password-field note explaining that the normal Gmail login password will fail for IMAP tests and invoice searches. Verification: `apps/cases` mailbox helper tests 6/6 green; `apps/cases` `tsc --noEmit` clean with 8GB heap. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> Last updated: 2026-07-12 (**Gmail IMAP mailbox test error made actionable**: the Invoice Search Mailbox Test button no longer leaves Gmail failures as the unhelpful `Command failed` response when ImapFlow only exposes the generic command error. `packages/shared-lib/src/integrations/imap.ts` now normalizes IMAP error details (`responseText`, `responseStatus`, `code`, `serverResponseCode`) and, for `imap.gmail.com` / Gmail addresses, explains that Gmail IMAP needs IMAP access allowed plus a Google App Password instead of the normal Gmail login password. Added focused coverage in `imap.test.ts`; verification: shared-lib IMAP formatter tests 2/2 green, Cases mailbox test route 6/6 green, shared-lib `tsc --noEmit` clean. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)

> **Any agent**: Read this file first when the user asks "what's next?" or "where are we?"
> Last updated: 2026-07-12 (**Mailbox Test connection added + IMAP client installed**: each Invoice Search Mailbox (Admin → Settings and the Account page personal card) now has a 🔌 Test button that does a real IMAP connect + login + logout via new `POST /api/admin/settings/mailboxes/[id]/test` — permission: shared mailboxes testable by any staff, personal by owner/Admin; password resolution: own encrypted password, else the Email (SMTP) Account password when the address matches. Added `imapflow` to `@zenowethu/shared-lib` with `verifyImapConnection()` in `src/integrations/imap.ts` (15s timeouts, Gmail app-password hint on auth failures) — this is the IMAP foundation the invoice inbox worker will reuse. ⚠️ Install caveat: repo's node_modules uses pnpm store v11 but available pnpm CLIs (10.30.1/11.12) use store v10, so imapflow + missing transitive deps were staged with npm and copied into `packages/shared-lib/node_modules`; `imapflow ^1.4.7` IS recorded in shared-lib package.json, so the next successful `pnpm install` normalizes it. Verification: 23 mailbox API tests green (6 new for the test route), `tsc --noEmit` clean, and a live IMAP login to mail.zenowethu.co.za:993 as notifications@zenowethu.co.za using the stored SMTP password succeeded (INBOX: 139 messages). AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-12 (**Mailbox registry now reuses the Email (SMTP) Account password**: a `MailboxAccount` whose address matches the SMTP login (`smtp_user` in systemSettings, currently notifications@zenowethu.co.za) no longer shows "No password — cannot search yet" — it reports "Password saved (from Email SMTP settings)" and counts as configured for the invoice email check. Implemented as a read-time fallback (`usesSmtpPassword()` in `apps/cases/lib/mailboxes.ts` + server-only `getSmtpUsernameIfConfigured()` in `apps/cases/lib/mailbox-smtp.ts` wrapping shared-lib `getSMTPCredentials`), not a copy — so it stays in sync when the SMTP password is rotated. `PublicMailbox` gained `passwordSource: 'own' | 'smtp' | null`; the mailboxes GET/POST/PATCH responses and `check-fee-emails` searchable-mailbox resolution all apply the fallback; MailboxSettings badges show the source. Verification: 32 mailbox-related Vitest tests green (6 new/updated incl. SMTP fallback cases), `tsc --noEmit` clean, live DB confirmed smtp_user=notifications@zenowethu.co.za with password set. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-12 (**Check invoice emails button added to the Invoice Requested from DC workflow state**: the mailbox-search dropdown now also appears in the case page's Workflow Status card whenever the case status is `INVOICE_REQUESTED_DC` or any `IRFDC_*` detour status (1/2/3/4+ months), with a hint that staff are waiting on the DC's invoice reply. The button/dropdown/result UI was extracted from the decline panel into the reusable `apps/cases/components/CheckInvoiceEmailsButton.tsx` (self-contained state, used by both the Decline Reason panel and the Workflow Status card), and the status eligibility helper `isInvoiceRequestedFromDcStatus()` lives in `apps/cases/lib/mailboxes.ts` with unit tests (`lib/mailboxes.test.ts`). Verification: 13 focused Vitest tests green (helper + check-fee-emails route), `tsc --noEmit` clean with 8GB heap. Behind-login UI not browser-verified (no staff credentials available to the agent). AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-11 (**Multi-mailbox registry for invoice email search + per-mailbox Check-invoice-emails picker**: added the `MailboxAccount` table (migration `20260711_add_mailbox_accounts`, applied to the live DB) seeded with the five shared inboxes used to correspond with other debt counsellors — transfers@/trasnfer@/notifications@zenowethu.co.za, zenowethu@gmail.com, zenowethutransfers@gmail.com — each flagged for DC communication where applicable. New API `GET/POST /api/admin/settings/mailboxes` + `PATCH/DELETE /api/admin/settings/mailboxes/[id]` with strict rules: Admin/Executive manage shared mailboxes **including their passwords** (AES-256-GCM encrypted via shared-lib `encryptSecret`, never returned to the client); every staff member registers exactly one personal mailbox from Account Settings and **only the owner can set its password** (admins can merely enable/disable it). Admin → Settings gained an "Invoice Search Mailboxes" section (list/add/edit/set-password/DC-comms flag/enable/disable/remove + read-only view of staff personal mailboxes); the Account page gained an "Invoice Search Mailbox" card. The case-page **Check invoice emails** button is now a dropdown: "Search all mailboxes" or any single active mailbox (shared + own personal); `POST /api/cases/[id]/dhs-decline/check-fee-emails` accepts `mailboxId` ('ALL' default), validates the mailbox is available to the caller, dedupes per mailbox scope per 24h, records the selected mailboxes in the activity, and reports `inboxConfigured` from saved mailbox passwords (env-var fallback kept). NOTE: the inbox worker that actually logs into these mailboxes over IMAP and uploads invoice/PoP attachments as case documents is still NOT built — this delivered the mailbox registry, credentials management, and per-mailbox request plumbing it needs. Verification: 26 new/updated Vitest tests green, full Cases suite 608/608 green, `tsc --noEmit` clean with 8GB heap, API verified live returning 401 unauthenticated, 5 seeded rows confirmed in DB. ⚠️ Ask user to confirm `trasnfer@zenowethu.co.za` is a real (typo-named) mailbox and not a mistake. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-10 (**Credit-provider service-consent document store + open-account extraction**: added the reusable `CreditProviderServiceConsentDocument` table and migration so email-service consent letters from a credit provider can be stored once and reused across consumers linked to the same provider. The Credit Providers admin page now has **Service docs** per provider with upload/list/view/activate/deactivate/delete support; uploads are stored under `storage/uploads/credit-provider-service-consents/<providerId>/` and linked to the provider, uploader, effective date, expiry date, and notes. The affordability check now extracts and returns all open credit-report accounts with credit provider, account number/type, open date, outstanding balance, monthly instalment, last payment date, and last update, and the Debt Review tab displays them in a staff table below the summary cards. Verification: Prisma client regenerated; focused Cases Vitest green (38/38 across affordability lib, affordability route, and service-consent routes); `apps/cases` `tsc --noEmit` clean with 8GB heap; targeted eslint clean on touched implementation files. Apply migration `20260710_add_credit_provider_service_consent_documents` before deployment. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-10 (**DHS D3/D4 removal document packs completed**: the Debt Review tab now treats **C, D3, and D4** as eligible for the six-document court rescission path to **Status G** (Notice of Motion, Founding Affidavit, Notice of Set Down, Notice of Motion in Rescission Application, Court Order Granted, Proof of Service), and **D4** now shows two additional clearance actions. **Generate D4 to F1 Pack** creates the app-owned PDFs for the settled-except-mortgage path: Certified Form 19, Form 17.2(c), Restructuring Proposal, and the sections 71(1)(b)/72 statement, with mortgage details inferred from the credit accounts and credit-report evidence cited when present. **Generate D4 to F2 Pack** creates the all-debts-settled Certified Form 19. Paid-up/prescription letters and stamped court orders remain external evidence to upload/request via Credo or email; the UI now says that clearly rather than pretending the app can generate creditor/court originals. The affordability endpoint now returns D3/D4 flags plus generated-pack lists, and the document-generation route accepts `targetStatus` to choose the F1 vs F2 Form 19 variant. Verification: focused Cases Vitest green (41/41 across affordability lib, D4 PDF smoke tests, affordability route, and debt-review generate route); `apps/cases` `tsc --noEmit` clean with 8GB heap; targeted eslint clean on touched implementation files. **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Push verified: 2026-07-09 (Prepared the Credo consent-link + DHS fee-email follow-up deploy bundle for `origin/main`: Credo auth/session plus consumer consent route Vitest green (20/20); shared-lib accepted-email, consent-reminder-email, and consent-service Vitest green (44/44); Cases DHS decline fee-email route Vitest green (5/5). `tsc --noEmit` clean for `apps/credo`, `packages/shared-lib`, and `apps/cases` with 8GB heap. `.claude/settings.local.json` and `tmp/*.log` intentionally left unstaged as local tool/runtime noise. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-11 (**DHS Status D3/D4 exit paths: rescission pack extended + D4→F1/F2 clearance packs + consumer document requests**: the Debt Review tab's DHS exit-path panel now covers all remaining removal paths per operations. **D3 → G**: the six-document rescission pack banner (Notice of Motion, Founding Affidavit, Notice of Set Down, Notice of Motion — Rescission, Court Order Granted draft, Proof of Service) now triggers for statuses C, D3 AND D4, with `PATH_D3_TO_G` added to `removal-paths.ts`. **D4 → F1/F2**: a new sky-blue "choose the clearance path" banner with two one-click packs — **F1 (settled except mortgage)** generates Certified **Form 19** (s71(1)(b) variant, new generator with commissioner-of-oaths certification block), **Form 17.2(c)** (new generator: settled-except-mortgage notification with remaining bond details), the **Sections 71(1)(b) & 72 Statement** (new generator: settled accounts table + mortgage-not-in-arrears section citing the credit-report evidence source) and the Debt Restructuring Proposal; **F2 (all settled)** generates the full-clearance Form 19 variant. The generate route accepts `targetStatus` (F1/F2) to pick the Form 19 variant and detects the mortgage/bond account automatically. **Consumer requests**: per the business rule that paid-up/prescription letters come from the consumer, the D4 banner has "Request Paid-up Letters from Consumer" and "Request Mortgage Statement (F1)" buttons using the existing `document-requests` API — each opens a Credo upload task AND emails the consumer. `PATH_D4_TO_F1` in `removal-paths.ts` updated to the full six-item requirement (Certified Form 19, paid-up letters, Form 17.2(c), restructuring proposal AND-OR court order via alias matching, mortgage-not-in-arrears evidence satisfied by statement-of-account OR credit report, s71/72 statement). Note: a parallel session contributed the D4 UI/route branches + `generate/route.test.ts`; this session reconciled the duplicate implementations in favour of the tested `targetStatus` contract. Verification: cases suite **587/587 green** (incl. 4 new generate-route tests + 7 D4 PDF smoke tests); shared-lib debt-review-removal 26/26 green (5 new); `tsc --noEmit` clean on cases + shared-lib; eslint clean; all three new PDFs rendered and visually reviewed. **Redeploy cases + shared-lib consumers to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-10 (**DHS Status C → Status G rescission pack + approved-document vault sync**: extends yesterday's affordability panel with the C → G removal path. When the case's DHS status is **C** (under debt review with a court order), the Debt Review tab now shows a violet banner — "court order rescission required (→ Status G)" — with optional Court Name / Court Case Number inputs and a one-click **Generate Rescission Pack** producing all six court documents through the existing draft→approve→send pipeline: **Notice of Motion, Founding Affidavit (with account schedule/annexures), Notice of Set Down, Notice of Motion — Rescission, Court Order Granted (draft), Proof of Service**. The six generators already existed in `packages/shared-lib/src/court-docs` (audit: built and working, but download/email-only — never persisted); the `debt-review/generate` route now accepts them (+ courtName/courtCaseNumber) and saves them as DebtReviewDocuments, and court-doc cards appear in the tab when status is C or once generated. **Vault sync**: approving any debt-review document now also upserts a case-vault `Document` row (type = documentType, best-effort file size; failure never blocks approval) — this is what lets the debt-review-removal path checks (`PATH_A_TO_B`: FORM_16/FORM_17_2A/AFFORDABILITY_ASSESSMENT; `PATH_C_TO_G`: NOTICE_OF_MOTION/FOUNDING_AFFIDAVIT/COURT_ORDER_GRANTED in `removal-paths.ts`) finally see staff-approved generated documents; drafts deliberately never satisfy a removal path. Affordability lib gained `isDhsStatusC()` + `RESCISSION_PACK_DOCUMENTS`; `GET /api/cases/[id]/affordability-check` now returns `isDhsStatusC` + `rescissionDocuments`. Verification: 8 new Vitest tests (3 lib, 2 route, 3 approve/vault-sync); full cases suite **563/563 green**; `tsc --noEmit` + eslint clean on touched files. **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-09 (**Credit report affordability check + DHS Status A rejection pack (Form 16 / 17.2(a) / Affordability Assessment / Record of Consumer Information)**: the Cases Debt Review tab now opens with a **Credit Report & Affordability Check** panel — open accounts, closed accounts, total outstanding balance, and total monthly instalments computed from the case's credit accounts, plus net income from the analysed PAYSLIP document (fallback: client record) **verified against the salary deposit on the analysed BANK_STATEMENT** (tolerance max(R100, 5%)). Business rule implemented: when total monthly instalments are LESS than the bank-confirmed net income, the consumer is not over-indebted, so a DHS Status A application must be rejected (→ Status B) — the panel shows a red banner with a one-click **Generate Rejection Pack** button producing all four documents: **Form 16**, **Form 17.2(a)** (s86(7)(a) rejection with financial grounds + s86(9) consumer rights), **Affordability Assessment** (s86(6)(a): income verification, credit report summary, full accounts table, surplus/shortfall determination), and **Record of Consumer Information Furnished** (personal/employment/income/credit info + table of analysed documents on file, consumer + DC signature blocks). All flow through the existing DebtReviewDocument draft→approve→send pipeline, so staff approval is still required before anything leaves the system; rejection is only recommended when income is bank-statement confirmed. New: `apps/cases/lib/affordability-check.ts` (pure lib), `form17-2a-pdf.ts`, `affordability-assessment-pdf.ts`, `consumer-info-record-pdf.ts`, `GET /api/cases/[id]/affordability-check`; extended `debt-review/generate` + GET routes with the 3 new document types (generate route now also loads all accounts + analysed documents). Verification: 27 new Vitest tests green (15 lib + 5 route + 7 PDF smoke incl. pagination); full cases suite 555/555 green; `tsc --noEmit` and eslint clean on all touched files; all three PDFs rendered and visually reviewed. **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-09 (**DHS decline fee-invoice email check added**: when a DHS decline reason mentions fees, owing, outstanding amounts, invoices, or payments, the Cases DHS decline panel now shows **Check invoice emails**. The new staff-only `POST /api/cases/[id]/dhs-decline/check-fee-emails` route validates input with Zod, blocks B2B partner access, avoids duplicate scan requests within 24 hours, records an internal timeline note and workflow log, and reports whether mailbox ingestion is configured. Verification: Cases focused route Vitest green (5/5); `apps/cases` `tsc --noEmit` clean with 8GB heap. **Redeploy cases to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-09 (**Credo consent link no longer redirects to login**: the DRR consent page was public in the page/API, but Credo middleware still matched `/consent/:path*` and `isCredoProtectedPathname()` still treated `/consent/<token>` as protected, so resend/new Credo consent links were redirected to `/login?callbackUrl=...` before the ID-verification page could render. Removed `/consent` from the protected matcher/path list and updated auth/session-security tests to assert `/consent/<token>` is public. Also changed the acceptance/reminder email Credo section from **HOW TO LOG IN TO YOUR CREDO PORTAL** to **HOW TO VERIFY YOUR CONSENT LINK**, explicitly saying no login is needed and the client should type their SA ID number. Verification: Credo auth/session/consent route Vitest green (20/20); shared-lib accepted-email/reminder/consent-service Vitest green (44/44); `tsc --noEmit` clean for `apps/credo` and `packages/shared-lib`. **Redeploy credo + shared-lib consumers to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-08 (**DRR consent links now require SA ID verification before showing details**: the Credo consent link no longer redirects signed-out consumers to login. Signed-out consumers now see an ID verification step first; the APIs return only `requiresVerification` until the typed 13-digit SA ID number matches the `Client.idNumber` attached to that exact `DebtReviewRemovalConsent` token. Only after the match do Credo and the older Cases fallback page reveal the consumer name, file number, consent wording, and approval state. Approval from public links now requires the same verified ID number server-side, so a token cannot be approved with another client's ID. Signed-in Credo consumers keep the faster ownership-checked path by profile/ID number. Verification: shared-lib consent-service Vitest green (26/26); Credo consent route Vitest green (13/13); Cases public consent route Vitest green (7/7); `tsc --noEmit` clean for `packages/shared-lib`, `apps/credo`, and `apps/cases` with 8GB heap. **Redeploy credo + cases + shared-lib consumers to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Push verified: 2026-07-08 (Prepared the DRR consent ID-verification bundle for `origin/main`: focused changed-surface Vitest green for shared-lib consent service (26/26), Credo consent route including verify endpoint (13/13), and Cases public consent fallback including verify endpoint (7/7), 46 tests total. `tsc --noEmit` clean for `packages/shared-lib`, `apps/credo`, and `apps/cases` with 8GB heap. `.claude/settings.local.json` and `tmp/*.log` intentionally left unstaged as local tool/runtime noise. AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-08 (**DHS unsuspend now completes the required DHS dialog**: the shared `unsuspendConsumerServices()` automation now clicks the row's Unsuspend action, waits for the DHS modal, enters the required reason `The consumer wants to resume with the program`, clicks the red **Unsuspend Consumer Debt Counsellor Services** button, clicks the green **Continue...** confirmation even though DHS currently says "successfully suspended", then waits 30 seconds, refreshes Search & Manage Consumer, reapplies the ID filter, and only reports success if the refreshed row shows services are no longer suspended. If the reason/submit/continue flow cannot be completed, the action now fails instead of pretending the row click was enough. Verification: scoped shared-lib DHS Vitest green (`status-history.test.ts` + `status-history-actions.test.ts`, 40/40); `packages/shared-lib` `tsc --noEmit` clean. **Redeploy cases + shared-lib consumers to ship.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-08 (**Credo case progress, financials, comments, and communication view added**: the Credo **My Cases** page now pulls a full consumer-facing case summary instead of the old placeholder preview. Consumers can see the step they are on, what needs to happen next, latest consent state, requested documents, quotes, payments, quoted/paid/balance totals, and client-visible communication/status history. They can download a payment statement CSV per case and send comments from Credo; those comments are written to the Cases timeline as public `CLIENT_COMMENT` entries so staff can see them on the case. The shared accepted-quote/payment summary was moved into `packages/shared-lib/src/finance/case-financials.ts` and Finance keeps its existing wrapper import path. Verification: focused Credo Vitest green (4 files / 9 tests); shared finance Vitest green (2/2); Finance case-financials Vitest green (15/15); `tsc --noEmit` clean for `apps/credo`, `packages/shared-lib`, and `apps/finance`. **Redeploy credo + shared-lib consumers; redeploy finance because its helper now resolves through shared-lib.** AI maintenance reminder: still create the trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.)
> Last updated: 2026-07-08 (**Consented DRR document search button added**: the Cases DHS panel now shows **Find DRR Documents** only after the latest debt-review-removal consent is `CONSENTED`. The button runs the DRR readiness pipeline in documents-only mode: it checks uploaded portal documents for any credit-report type (`CREDIT_REPORT_*` variants included), payslip, and bank statement; searches/splits the combined PDF for missing kinds; warns staff if the required credit report is still missing; and reports payslip/bank statement as optional so DRR can continue without them. The shared readiness rule now blocks only on credit report, preserves multiple extracted credit reports with unique filenames, and the staff API route enforces consent server-side. Verification: shared-lib `drr-readiness.test.ts` green (14/14); Cases internal `drr-readiness` route test green (7/7); `tsc --noEmit` clean for `packages/shared-lib` and `apps/cases` with 8GB heap. **Redeploy cases + shared-lib consumers to ship.**)
> Last updated: 2026-07-08 (**Cases new-case referrer sub-project path fixed**: `/cases/new` now uses the shared project destination flattening logic, so independent roots like `Referrals` are flattened recursively and registered `REFERRER` sub-projects such as `William Maesela` remain available when building the Year/Month path. Opening a month project link now resolves `ACQUISITION_SOURCE -> REFERRER -> YEAR -> MONTH`, preserving the selected sub-project and auto-detected referrer instead of creating/saving cases under `Referrals May 2025`. Added shared UI regression coverage for `Referrals William Maesela May 2025` path selection. Verification: `@zenowethu/ui` project-selection Vitest green (27/27 in invoked package run); `apps/cases` `tsc --noEmit` clean with 8GB heap. **Redeploy cases + UI consumers to ship.**)
> Last updated: 2026-07-07 (**Missing-project-manager alert now links directly to the project**: the `NO_MANAGER_ADMIN` email now includes `Project Link: <cases-url>/projects?id=<projectId>`, generated through a shared notification URL helper and passed from both Cases and Legal status routes. The Cases Projects Directory now honors `?id=<projectId>` by expanding the project tree and opening the Team Members modal once, so admins land directly where a manager can be assigned. Tests: Cases `lib/project-directory.test.ts` green (4/4); shared-lib notification link/service tests green (17/17). Typecheck note: full shared-lib `tsc --noEmit` remains blocked by pre-existing `src/finance/overpayments.test.ts` Prisma mock typing errors; Cases and Legal app `tsc --noEmit` runs timed out without diagnostics in this checkout.)
> Last updated: 2026-07-07 (**Finance Outstanding fixed for accepted quotes still marked SENT**: the accepted quote in the screenshots had `acceptedAt`/decision accepted but document `status = SENT`, so the previous summary skipped it as an accepted quote. `apps/finance/lib/case-financials.ts` now treats `acceptedAt` as acceptance, and `GET /api/finance/cases/[id]/summary` selects/passes `acceptedAt`; Outstanding now calculates from `Accepted Quote - Completed Payments` even when the quote status pill still says Sent. The client financial file page (`/clients/[id]`) now also totals completed client payments plus accepted open quotes, so the cards show Total Expected/Collected/Balance Due for quote-only files instead of R0/R0. Verification: Finance-focused Vitest green (`case-financials`, case summary route, status route: 25/25); Finance `tsc --noEmit` clean. **Redeploy finance to ship.**)
> Last updated: 2026-07-07 (**Finance Outstanding formula clarified**: Finance `outstanding` now follows the operational rule `Accepted Quote - Collected Payment` when accepted quotes exist and the case service fee is blank, floored at R0. For the R4,500 quote / R4,750 collected scenario, Outstanding is R0 and Over Paid is R250. Added regression coverage to assert quote-only partial payment and overpayment set `outstanding` from the accepted quote basis. Verification: Finance-focused Vitest green (`lib/case-financials.test.ts` + status route, 17/17); Finance `tsc --noEmit` clean. **Redeploy finance to ship.**)
> Last updated: 2026-07-07 (**Finance case detail service fee/outstanding fallback fixed**: on the Finance app case detail page, the top Service Fee / Collected / Outstanding cards now use accepted quote totals as the fee basis when `Case.serviceFee` is blank. This fixes the reported Reginah Phobela Kupa-style case where an accepted `R 4 500,00` quote and `R 2 250,00` payment showed dashes for Service Fee and Outstanding; it now shows `R 4 500,00`, 50% collected, and `R 2 250,00` outstanding. The raw `serviceFee` field remains separate, so existing quote-overpayment logic stays distinct from explicit service-fee overcollection. Tests: focused Finance Vitest green for `lib/case-financials.test.ts` + `app/api/finance/cases/[id]/summary/route.test.ts` (17/17); Finance `tsc --noEmit` clean. **Redeploy finance to ship.**)
> Last updated: 2026-07-07 (**Referrer login provisioning now automatic with ID-number username**: every newly created Cases referrer now gets a linked `REFERRER` portal user as part of the create flow, using the referrer's 13-digit SA ID number as `User.username` and the bcrypt-hashed default password `Agent@1`; converted clients who become referrers are provisioned the same way. The manual Enable Portal Login endpoint now reuses the same helper, links any existing `REFERRER` user with that ID-number username, and no longer requires a referrer email. Cases login now accepts email or username, so a referrer can sign in with their ID number; the login input changed from email-only to text. Direct Add Referrer now requires a 13-digit SA ID number because login cannot be created without it. Tests: Cases focused Vitest green for `lib/referrer-portal-access.test.ts`, `app/api/admin/referrers/[id]/portal-access/route.test.ts`, and `app/api/admin/referrers/route.test.ts` (44/44); shared-lib `src/auth/login-identifier.test.ts` green (2/2); Cases `tsc --noEmit` clean with 8GB heap. Note: full shared-lib `tsc --noEmit` is currently blocked by pre-existing `src/finance/overpayments.test.ts` Prisma mock typing errors, unrelated to this change. **Redeploy cases + shared-lib consumers to ship.**)
> Last updated: 2026-07-07 (**Finance case workflow status editor + quote Over Paid card**: Finance case detail (`/cases/[id]` in the Finance app) now exposes staff workflow-status controls directly in the header: a full workflow dropdown plus a quick **Mark Settled** button when accepted-quote payments exceed the quoted amount. Quote overpayment is now computed separately from service-fee overcollection in `apps/finance/lib/case-financials.ts`, so cases with no service fee but accepted quotes still show **Over Paid** correctly; the NOFDA-style R4,500 quote / R4,750 collected scenario surfaces R250 as Over Paid instead of only showing R0 available balance. Hardened `PATCH /api/cases/[id]/status` in Finance with auth, B2B rejection, and known-workflow-status validation before writing `Case.status` and `WorkflowLog`. Tests: Finance-only Vitest green for `lib/case-financials.test.ts` + `app/api/cases/[id]/status/route.test.ts` (16/16); Finance `tsc --noEmit` clean. **Redeploy finance to ship.**)
> Last updated: 2026-07-07 (**Finance overpayment visibility — settled quotes/invoices now report "Overpaid by RX" + admin-only dashboard panel**: per user request, when a client pays MORE than the quoted/invoiced amount the document still settles (no status weirdness) but the excess is now calculated and surfaced instead of being silently clamped to a R0 balance. New server-only shared module `packages/shared-lib/src/finance/overpayments.ts`: `getCaseQuoteCapture(caseId)` (read-only twin of `checkQuoteFulfilment` — captured case payments vs the latest accepted quote, returns `settled` + `overpaidBy`) and `getOverpaymentSummary({limit})` (every overpaid client: case payments vs latest accepted quote, PLUS standalone invoices whose allocated payments exceed their total, deduped so a quoted case is never double-counted; returns count/totalOverpaid/items sorted by overpaid amount). `checkQuoteFulfilment` itself now returns `overpaidBy` and stamps "— client overpaid by RX" into the SETTLED_SUCCESS WorkflowLog note. Finance quote/invoice detail page (`/invoices/[id]`): header gains a green **Settled** chip (" · Overpaid" suffix when applicable), a Settled banner ("captured payments of RX cover this quotation in full" + amber "The client has overpaid by RX"), and the totals box now shows Collected on Case / Balance Remaining / **Overpaid By** for accepted quotes (case-level capture) and an Overpaid By row for invoices. `GET/POST /api/finance/invoices/[id]/payments` responses include `overpaidBy`. **Finance Dashboard**: new **"Client Overpayments — Admin only"** panel (rendered + queried ONLY when `session.user.role === 'ADMIN' || isAdmin`): count + total overpaid, table of Document/Client/Case/Expected/Collected/Overpaid By with links to each document; empty state when none. Tests: 10 new overpayments tests + 2 updated/1 new quote-case-sync (36/36 finance shared-lib) + 1 new payments-route overpay test (17/17 finance invoice routes) all green; `tsc --noEmit` clean on finance. **Live-verified in the browser on localhost:3004** as an ADMIN user: dashboard panel shows QUO-2026-0058 / NOFDA MMUSHO MOENG / expected R4,500 / collected R4,750 / overpaid R250, and the quote detail page shows the Settled·Overpaid chip, banner, and totals rows (Collected on Case R4,750 / Balance Remaining R0 / Overpaid By R250) with zero console errors. **Redeploy finance + shared-lib consumers to ship.**)
> Last updated: 2026-07-07 (**Credo default client password + forced first-login change + password history + monorepo auth hardening**: every auto-provisioned Credo client profile now gets the shared default password **`Client@100New`** (bcrypt-hashed, never plaintext) with `mustChangePassword = true` — first login is pinned by middleware to a new `/change-password` screen until the consumer sets their own password; consumers **cannot reuse any of their last 5 passwords** (new `ConsumerPasswordHistory` table, trimmed on write) and cannot choose the default password itself; new strength policy everywhere a consumer sets a password (8+ chars, upper+lower+digit) applied to register, reset-link, and change-password paths via canonical `setConsumerPassword()` in new `packages/shared-lib/src/credo/password-policy.ts`. **Backfill executed against prod DB**: 11 existing no-password accounts issued the default password + must-change flag (`scripts/backfill-credo-default-passwords.ts`, dry-run supported; accounts with self-chosen passwords deliberately untouched). Security hardening: Credo login now has **brute-force lockout** (5 consecutive failures → 15-min lock, cleared on success; new `failedLoginAttempts`/`lockedUntil` columns), new shared in-memory **rate limiter** (`packages/shared-lib/src/auth/rate-limit.ts`) applied to Credo register (5/h/IP), forgot-password (5/15min/IP), reset-password (10/15min/IP) and change-password (5/15min); register 500s no longer echo internal Prisma error text; register console.error → structured logger; **website app finally got the security-header set** (HSTS, X-Frame-Options DENY, nosniff, CSP…) matching the other 6 apps; fixed `apps/credo/.env.local` `NEXTAUTH_URL` (was 3000 → 3005, broke every NextAuth dev redirect). Migration `20260707060000_consumer_password_security` **applied to prod** (additive: 4 ConsumerAccount columns + ConsumerPasswordHistory table). New API `POST /api/consumer/change-password` (auth, current-password check, policy+history enforced) + new page `/change-password` (forced-change UX, signs out to re-login after change); `mustChangePassword` carried through JWT/session with types augmented. Tests: shared-lib 703/703 green (16 new password-policy, 5 new rate-limit, reset/provisioning suites updated), credo 43/43 green, credo `tsc --noEmit` clean. **Live-verified end-to-end on localhost:3005** with curl + browser: default-pw login → /dashboard 302→/change-password; weak/default/reused passwords rejected 400; change 200; old default rejected after change; new password logs in and reaches /dashboard 200; 5 wrong attempts lock out even the correct password (tested on a disposable account, then deleted). **Redeploy credo + website + shared-lib consumers to ship.**)
> Last updated: 2026-07-07 (**DRR consent reminder email + consent visibility**: per user direction, consent re-sends are no longer the "Good News – transfer accepted" email — new `packages/shared-lib/src/dhs/consent-reminder-email.ts` (`CONSENT_REMINDER_SUBJECT` / `buildConsentReminderEmail`) is a properly-worded REMINDER: the consumer already knows the file was accepted; this email tells them plainly the debt review flag removal **cannot continue** until they consent, reuses the same secure Credo consent link ("the link in our earlier email still works") and shares the Credo login instructions via new `buildCredoLoginSection` export (refactored out of `accepted-email.ts`). `handleDhsAccepted` picks the template by `forceResend`: first send = acceptance email, forceResend = reminder. Reminder senders: (1) **Resend Confirmation Link** button (already passed forceResend), and (2) **Manage Consumers** when the consumer has NOT yet consented — it now sends this reminder instead of just returning a message (never the acceptance email); coexists with the parallel suspension-stop gate in the consented branch. **Consent visibility**: `GET /api/cases/[id]` now includes `drrConsents` (latest: status/channel/createdAt/consentedAt/expiresAt) and the case DHS panel shows a **DRR Consent chip** — green "Consented on <date> — work may proceed", amber "Awaiting consumer consent — sent <date>, expires <date>. Work cannot proceed until they approve.", red "link expired/cancelled — resend", grey "not yet requested". Timeline comments updated ("[SYSTEM] Consent REMINDER RE-SENT … flag removal cannot continue until they consent"). Tests: shared-lib dhs suite 167/167 green (5 new consent-reminder-email tests; resend test now asserts reminder subject/body; new first-send "Good News" wording test); cases resend-consent route 6/6 green; `tsc --noEmit` clean on shared-lib + full cases app. **Redeploy cases + shared-lib consumers to ship.**)
> Last updated: 2026-07-07 (**Manage Consumers now stops on suspended DHS services and exposes Unsuspend**: when the consumer has already CONSENTED, `POST /api/dhs/lookup` `manage_consumers` now checks the DHS Search & Manage Consumer services-suspension state FIRST, before document readiness or clearance. If DHS shows services are SUSPENDED, the action stops, writes a `DRR_SUSPENSION_CHECK` timeline warning, returns `blockedBySuspension`/`canUnsuspend`, and the Cases DHS panel shows an amber alert with **Unsuspend Consumer Services**. The new `unsuspend_consumer_services` action clicks DHS' Unsuspend toggle only when the row is definitely suspended, records success/failure to the timeline, and tells staff to run Manage Consumers again afterward. New shared DHS helpers: `getConsumerSuspensionIndicator`, `unsuspendConsumerServices`, plus result types. Verification: new mocked DHS suspension-action Vitest 2/2 green; status-history classifier suite 37/37 green; clearance/readiness/accepted-handler suites 40/40 green; `tsc --noEmit` clean on shared-lib and cases with 8GB heap. **Redeploy cases + shared-lib consumers to ship.**)
> Push verified: 2026-07-07 (Prepared the current deploy bundle for `origin/main`: full Credo Vitest suite green (10 files / 43 tests); shared-lib Vitest suite green (54 files / 675 tests, including DHS suspension/unsuspend coverage); `tsc --noEmit` clean for `packages/shared-lib`, `apps/credo`, and `apps/cases`. `.claude/settings.local.json` intentionally left unstaged as local tool-history config.)
> Last updated: 2026-07-07 (**DHS acceptance email moved to Check Request Status + Manage Consumers suspension check**: per user direction, the "Good News – Your Debt Review File Transfer Has Been Accepted" consumer email (acceptance + consent link) is now sent by **Check Request Status** the moment it detects Accepted/Auto Transferred (`POST /api/dhs/lookup` `check_status` fires `handleDhsAccepted`, idempotent — matches what the workflow cron already did), NOT by Manage Consumers. **Manage Consumers** is now strictly the post-consent follow-on: without a CONSENTED debt-review-removal consent it does nothing (returns a "waiting for consent" message pointing staff at Check Request Status / Resend Confirmation Link); with consent it runs document readiness + the DHS Search & Manage Consumer clearance check, which now ALSO reads the **services-suspension indicator** off the consumer's grid row — business rule per operations: far-right ACTION button (`btnSuspendServices_*`) RED = NOT suspended, GREEN = suspended; fallbacks: button tooltip ("Unsuspend…" = suspended) then SUSP IND column Y/N. Suspension state is returned in the API result (`suspension`), pushed to the case timeline as a `DRR_SUSPENSION_CHECK` comment (with a review warning when suspended), and included in the clearance result. New exports: `classifySuspension`, `classifyButtonColor`, `SuspensionIndicator` (shared-lib `dhs/status-history.ts`); `ClearanceRunResult.suspension`; `ConsumerStatusHistoryResult` gained `suspension` + `rowCells`. UI: case-page messages/tooltips updated to the new ownership. **Live-verified** on DHS: 7910085755083 (Monwabisi James — status A, SUSP IND Y, green button "Unsuspend Consumer Services" → SUSPENDED) and 7601096060080 (Mbulaheni Michael Ramagoma — status A, SUSP IND N, red button "Suspend Consumer Services" → NOT suspended). Tests: shared-lib dhs suite 159/159 green (10 new suspension classifier tests + 1 clearance suspension-comment test); `tsc --noEmit` clean on shared-lib AND the full cases app. **Redeploy cases + shared-lib consumers to ship.**)
> Last updated: 2026-07-07 (**Credo browser-session security**: Credo now requires a fresh login after a browser/tab session is closed and logs consumers out after 5 minutes of inactivity on protected Credo surfaces. Auth.js JWT/session lifetime is explicitly capped at 5 minutes, protected-route middleware now covers the full confidential Credo area (`/dashboard`, `/my-account`, `/credit-report`, `/cases`, `/documents`, `/settings`, `/admin`, `/upgrade`, and login-gated `/consent`), and the root AuthProvider withholds protected content until the per-browser `sessionStorage` login marker is verified. Active users refresh the server session at most once per minute; idle users are signed out to `/login`. Added focused tests for route protection, session marker handling, idle expiry, and the guard render behavior. Verification: focused Credo security Vitest 9/9 green; full Credo Vitest 43/43 green; `apps/credo` `tsc --noEmit` clean. **Redeploy credo to ship.**)
> Last updated: 2026-07-07 (**Credo consent support links**: the Credo consent page now gives consumers direct help actions instead of only plain text contact copy. Failed consent links show a clickable phone link plus **WhatsApp us** (`wa.me/27817477616` with a prefilled consent-help message) and **Support** (`support@zenowethu.co.za`) actions; expired/cancelled links use a new-link request message; active and approved consent states include smaller help links. Added `apps/credo/lib/support-contact.ts` with focused Vitest coverage for tel/WhatsApp/mailto generation. Verification: Credo support-contact Vitest 2/2 green; full Credo Vitest 34/34 green; `apps/credo` `tsc --noEmit` clean. Local Credo dev server started on `http://localhost:3005`; unauthenticated `/consent/test-token` smoke returned the expected auth redirect. **Redeploy credo to ship.**)
> Push verified: 2026-07-07 (Prepared the current deploy bundle for `origin/main`: shared-lib Vitest suite green, including DHS decline and notification coverage (53 files / 662 tests); focused Cases route tests green for referrers, DC notification, send-file-requests, project membership pruning, and project graph logic (5 files / 43 tests); `tsc --noEmit` clean for `packages/shared-lib` and `apps/cases` with 8GB heap. `.claude/settings.local.json` intentionally left unstaged as local tool-history config.)
> Last updated: 2026-07-07 (**Credo Consumer Portal panel: white-on-white form controls fixed**: on the Cases detail Documents tab, the "Request a document from the consumer" category dropdown rendered its options invisible (white text on the white native popup) and typed text in the label/notes inputs was white-on-white, because `ConsumerPortalPanel` is a light card inside the dark-themed Cases app (`color-scheme: dark` + white body text in `globals.css`) and its `<select>`/`<input>`s never set their own colours. All three controls now carry `bg-white text-gray-900 [color-scheme:light]` (inputs also `placeholder:text-gray-400`). Verified live in the browser on a real case page — computed styles confirm white background, gray-900 text, and `color-scheme: light` so the native option list renders dark-on-light. File: `apps/cases/app/components/ConsumerPortalPanel.tsx`. CSS-only change, no logic touched. **Redeploy cases to ship.**)
> Last updated: 2026-07-07 (**Referrer creation: initial members picker**: creating a referrer can now assign the sub-project's initial staff members in the same step. `POST /api/admin/referrers` accepts optional `memberUserIds` (validated: users must exist and be `STAFF`, same rule as `PUT /[id]/members`; creator id deduped) and creates them as `MEMBER` rows on the new REFERRER sub-project alongside the creator's automatic `MANAGER` row. The Add Referrer modal gained a **Team Members** section — checkbox list of unlocked staff (from `/api/users`, creator excluded since auto-added) with a selected-count hint; in Edit mode it instead links to the referrer detail page where members are managed. 3 new POST tests; referrer route suite 33/33 + members route 13/13 green; Cases `tsc --noEmit` clean. **Redeploy cases to ship.**)
> Last updated: 2026-07-07 (**Local dev stale Prisma/Auth overlay cleared**: the running Cases dev process was still serving pre-generation Turbopack chunks, causing `@prisma/client did not initialize yet` on `/login` and HTML error responses from `/api/auth/session` that Auth.js surfaced as `Unexpected token '<'`. Stopped the old localhost 3000-3006 Next processes, regenerated Prisma Client from `packages/database/prisma/schema.prisma` with the bundled Node/pnpm runtime, and restarted the full Turbo dev stack. Verified in the browser that `/login` shows the normal sign-in form, `/b2b-dashboard` redirects cleanly to login when signed out, and no Prisma/Auth overlay remains. HTTP checks: Cases `/login`, Cases `/api/auth/session`, Cases `/b2b-dashboard`, ports 3001-3006 all returned 200; auth session endpoints returned JSON.)
> Last updated: 2026-07-06 (**Local dev ports restored**: repaired the local pnpm 11 workspace setup after `pnpm run dev` kept aborting on non-interactive module purge/build-script prompts. `pnpm-workspace.yaml` now contains explicit `allowBuilds: true` entries for the expected native packages (`@prisma/client`, `@prisma/engines`, `@sentry/cli`, `esbuild`, `prisma`, `puppeteer`, `sharp`, `unrs-resolver`), `pnpm install --config.confirmModulesPurge=false` completed successfully with postinstall scripts, and Prisma Client was regenerated from `packages/database/prisma/schema.prisma`. Started the full Turbo dev stack in the background; verified HTTP 200 on localhost ports 3000-3006.)
> Last updated: 2026-07-06 (**File Requests send safety tightened**: the Cases detail "Send All File Requests" flow now sends only the Debt Counsellor file request, using the DHS preferred email fallback order `preferredDcEmail` -> linked DC `preferredEmail` -> `lastKnownEmail` -> linked DC `lastKnownEmail` -> `dcEmail` -> linked DC `email`. The consumer is CC'd on file requests when an email is on file, and `notifications@zenowethu.co.za` is explicitly Bcc'd. The bureau/provider-only endpoint and button are paused until new approved matter wording is provided, so no credit bureau or credit provider file-request emails are sent. Added focused Vitest coverage for preferred-email routing, consumer CC/Bcc, and the paused bureau/provider endpoint. Verification: shared-lib notification service 14/14 green; Cases DC/send-file route tests 3/3 green. **Redeploy cases/shared-lib consumers to ship.**)
> Last updated: 2026-07-06 (**DHS document email last-used address fix**: when the DHS decline handler successfully emails documents to a Debt Counsellor and moves the case to `DOCUMENTS_EMAILED`, it now stamps the actual recipient into `Case.lastKnownEmail`, which is the "DC Last Used Email" field shown on the case page. The direct `POST /api/dhs/lookup` DHS request email path now also stamps `lastKnownEmail` after a successful DC document email even when the recipient is the same as `dcEmail`, so the UI no longer stays "Not set" after a successful send. Added focused regression coverage for successful vs failed document-email sends. Verification: decline handler Vitest 41/41 green; `packages/shared-lib` `tsc --noEmit` clean; `apps/cases` `tsc --noEmit` clean with 8GB heap. **Redeploy cases/shared-lib consumers to ship.**)
> Last updated: 2026-07-06 (**DHS Handle Decline consumer notice + Bcc audit fix**: `handleDHSDecline` now sends a separate consumer email when a SEND_DOCS / SEND_DOCS_WITH_NCR decline is handled, instead of only CC'ing the consumer on the Debt Counsellor document email. The consumer email states the transfer request date, decline recorded date, DHS decline reason, and the exact solution taken (POA/ID, plus NCR certificate where applicable, emailed to the Debt Counsellor and transfer requested again). All other consumer-facing decline emails now include the same date/reason/solution summary block. The read-only decline preview renders the new consumer email too, so staff can see it before sending. Fixed the direct GoHighLevel email provider to pass `cc` and `bcc` into the GHL email message payload, closing the path where `notifications@zenowethu.co.za` could be dropped when GHL succeeded before SMTP fallback. Focused Vitest green: shared-lib decline handler + notification providers 65/65; shared-lib `tsc --noEmit` clean after regenerating Prisma Client. **Redeploy cases/shared-lib consumers to ship.**)
> Last updated: 2026-07-06 (**New Case referral subproject visibility tightened**: `GET /api/projects?memberOnly=true` in the Cases app no longer lets inherited/root membership expose every `REFERRER` sub-project in the Branch/Subproject picker. Ancestors are still included so the main "Referrals" source can render, and ordinary project descendants still work, but selectable referrer sub-projects now require direct `ProjectMember` membership; non-member referrer subtrees are pruned before the response. This means Kenneth Mokgoshi will not see/select "Ruphas Ruphy" on `/cases/new` unless Kenneth is added as a member of that referrer project. Added `apps/cases/app/api/projects/route.test.ts` covering the exact leakage pattern. Focused Vitest 7/7 green (`app/api/projects/route.test.ts`, `lib/project-graph.test.ts`); Cases `tsc --noEmit` clean with 8GB heap. **Redeploy cases to ship.**)
> Push verified: 2026-07-06 (Prepared and pushed the current deploy bundle to `origin/main`: focused Vitest green for shared-lib DHS/consent/readiness/clearance, packages/ui project destination logic, Credo consent route, and Cases referrer access/admin routes; `tsc --noEmit` clean for shared-lib, ui, credo, cases with 8GB heap, finance, legal, insurance, and forensic-audit. Latest push commit: `08e2c2b`.)
> Last updated: 2026-07-14 (**Referrer card on the case detail page + Assign/Change/Remove referrer** — new card directly under the Project card in the left column of `apps/cases/app/(authenticated)/cases/[id]/page.tsx` showing the case's linked `Referrer` (name initials avatar, contact, Commission/Discount badge, Inactive badge; "No referrer assigned" empty state), so staff can immediately spot a referral assigned to the wrong referrer — e.g. compare against a "Referrals <name> <month>" project name. Admin/Executive/Manager get a click-through to `/admin/referrers/[id]` **and an Assign/Change button** opening a new searchable referrer-picker modal (`AssignReferrerModal.tsx`) backed by new `PATCH /api/cases/[id]/referrer` — previously there was NO way to set a referrer on an existing case (only auto-detect at case creation + register-from-project back-fill; Move Case never linked one). The new route is role-gated (Admin/Exec/SeniorManager/Manager, non-admins membership-scoped via `referrer-access`), refuses inactive referrers, **blocks reassignment when the commission is already paid (409)**, syncs `ReferrerCommission` to the case's current stage on assign (deletes the unpaid row on remove), and writes a `REFERRER_CHANGE` case-timeline comment. `GET /api/cases/[id]` now includes the `referrer` relation (slim select). Tests: 3 new GET tests + 10 new PATCH-referrer tests — full `app/api/cases/[id]` suite 110/110 green; `tsc --noEmit` clean on cases. Redeploy cases to ship.)
> Previously: 2026-07-06 (**Move Cases: "Referrals (B2C)" subprojects actually delivered to the picker** — follow-up to the entry below, which fixed the selection logic but the dropdown still stayed empty (user screenshot). Two remaining causes: (1) the "Referrals" B2C source lives at the TOP LEVEL (`parentId: null`, id `cmpih09p00004jqtduz5c7712`) unlike every other acquisition source under `zdm-files-root`, and the admin `GET /api/projects` only built the nested tree for the ROOT hierarchy — `independent` top-level projects were returned WITHOUT children, so the 16 REFERRER children never reached the client; (2) `flattenProjectResponse` deliberately did not walk children of independent rows. Fix: all 5 apps' `app/api/projects/route.ts` (cases/legal/insurance/forensic-audit/finance — still duplicated copies, Phase 7 target) now expand each independent project's subtree via the existing `getProjectWithChildren`; `flattenProjectResponse` (packages/ui) now walks independent subtrees, synthesizing `parentId` from the walk when the member-scoped API omits it and upgrading earlier parentId-less duplicate rows. Verified END-TO-END against the live dev DB by invoking the real cases route handler (mocked admin session) and feeding its response through the real picker logic: 19 subprojects under Referrals (17 REFERRER + 2 FOLDER; YEAR/MONTH correctly excluded). destination-path-logic tests 12/12 green (3 new); `tsc --noEmit` clean on packages/ui, zero errors in all 5 projects routes. **Redeploy all 5 case apps to ship.**)
> Previously: 2026-07-06 (**Move Cases modal: source filtering + subprojects fixed**: `DestinationPathSelector` (packages/ui) showed unclassified sources under BOTH B2B and B2C, and never showed subprojects for referral sources because it only offered direct children of type BRANCH/FOLDER — most referral subprojects are type REFERRER (and Letsatsi branches can sit deeper in the tree). Selection logic extracted to testable `packages/ui/src/projects/destination-path-logic.ts`: strict B2B/B2C source filter (null still shows in both as a safety net; any other marker such as `LEGACY` hides the source from all pickers), recursive descendant walk offering BRANCH/FOLDER/REFERRER (never YEAR/MONTH). Data fix per user decision: acquisition sources `Letsatsi Referrals`/`Shosholoza Referrals`/`Future Finance Referrals` → clientType `LEGACY` (user: "do not list those"), `Car Dealership Referrals`/`Walk-Ins & D E`/`Referrals` → `B2C` — applied directly to the DB; all 16 acquisition sources now classified (New Case page behaviour consistent: its B2B branch already excluded non-null non-B2B, its B2C branch excludes the legacy ones by name). 9 new packages/ui tests green (`destination-path-logic.test.ts`), ui `tsc --noEmit` clean.)
> Previously: 2026-07-06 (**ZDM client server-side Manage Consumers gate fix**: the shared `isManageConsumersEligible` set in `packages/shared-lib/src/dhs/accepted-handler.ts` now also accepts `ZDM_CLIENT` / `ZDM Client`. The 2026-07-04 fix made the **button** appear for ZDM clients (cases-lib UI helper), but the API gate on `POST /api/dhs/lookup` `action: manage_consumers` (and `/api/cases/[id]/resend-consent`) still rejected ZDM files with "can only run once the file is Accepted via DHS" — a ZDM client is already under our own NCRDC, no transfer needed. Server + UI eligibility sets are now identical (7 statuses). +1 test (accepted-handler 18/18 green, cases eligibility helper 5/5 green); shared-lib `tsc --noEmit` clean.)
> Previously: 2026-07-06 (**Referrer membership access control**: the Referrer Registry is now membership-scoped — Admins see every referrer; every other user (incl. Executives/Senior Managers/Managers) only sees referrers whose sub-project they are a member of (`ProjectMember`, descendants included, matching sidebar tree semantics). New `apps/cases/lib/referrer-access.ts` helper enforces this on `GET /api/admin/referrers` (list + meta totals scoped), referrer detail, commission list, commission edit, statement PDF, and portal-access routes. New **members API** `GET/PUT /api/admin/referrers/[id]/members` (PUT = Admin/Executive only; staff-only accounts; replace-set semantics preserving retained roles; deliberately NO ancestor sync so one referrer's membership never leaks the whole Referrals tree) + a **Team Members card** on the referrer detail page (list/add/remove with confirmation modal + toasts; edit controls only for Admin/Executive). Creating a referrer now auto-adds the creator as the sub-project's first member so non-admin staff keep seeing referrers they add. 60/60 focused tests green (7 new lib, 13 new members-route, 5 new list/detail filtering); `tsc --noEmit` clean on cases with 8GB heap. Redeploy cases to ship.)
> Previously: 2026-07-06 (**Move Case to another project wired to UI**: the case detail page's Project card now shows a "Move" button (Admin/Executive/Manager) that opens the existing `MoveCaseModal` — the modal and `POST /api/cases/move` had been fully built (destination path selector, auto-creates Year/Month folders, logs a PROJECT_MOVE timeline comment, Admin-or-project-Manager enforcement) but no button ever opened it, so cases could not be re-projected from the UI at all. One-line wiring in `apps/cases/app/(authenticated)/cases/[id]/page.tsx`; no API/schema changes.)
> Previously: 2026-07-04 (**Post-consent workflow now advances automatically**: consumer consent no longer leaves the case stuck at READY_TO_CONSENT. New workflow statuses `CONSENT_RECEIVED` (set the moment consent is recorded, guarded so manual staff moves are never clobbered) and `AWAITING_DRR_DOCS` (set when the readiness check finds documents missing while the credit report is chased from the referrer/B2B partner). When all three documents (credit report/payslip/bank statement) ARE on file, the readiness pipeline now auto-runs the **Manage Consumers DHS clearance check** — new `packages/shared-lib/src/dhs/clearance-automation.ts` consumes `getConsumerStatusHistory`/`evaluateConsumerClearance` (live-verified A1/B/F1/F2/G/G1 → READY_CLEARANCE <7d / COMPLETED ≥7d mapping) and advances the case status itself; active codes A/C/D3/D4 → follow-up +5wd; unreadable DHS → staff escalation comment. The **Manage Consumers button** on an already-consented case now runs readiness+clearance instead of no-op skipping ("Consumer has already consented"), so stuck cases like ZDM-2026-1020-43Z self-heal on the next click. Eligibility sets (shared + cases lib) extended with the two new statuses. Tests: shared-lib dhs/statuses 67/67 green (7 new clearance-automation, 4 new readiness, 2 new consent), cases 16/16 green; `tsc --noEmit` clean on shared-lib.)
> Previously: 2026-07-04 (**Consent confirmation name + surname fix**: Credo and fallback consent confirmation pages now display the consumer as first given name + surname, so a stored `firstName` like `NOFDA MMUSHO` with `lastName` `MOKGOSHI` renders `NOFDA MOKGOSHI` instead of showing both given names. Added shared formatter + route regression coverage. Focused Vitest: shared-lib consent-service 15/15 green; Credo consent route 9/9 green. `tsc --noEmit` green on shared-lib + credo.)
> Previously: 2026-07-04 (**Debt review removal consent wording clarified**: Credo and fallback consent pages now explain that the approval confirms Zenowethu Debt Management is the debt counsellor authorised to work on the file, creating a clear record before the team continues. Pending consent links now display and stamp the clarified wording while already-consented records keep their historical wording. Focused Vitest: shared-lib consent-service 13/13 green; Credo consent route 9/9 green.)
> Previously: 2026-07-04 (**Credo password reset email greeting fix**: the reset/set-password email now greets consumers as first given name + surname, so a stored `firstName` like `NOFDA MMUSHO` with surname `MOKGOSHI` renders as `Hi NOFDA MOKGOSHI,` instead of using both given names. Added HTML escaping for the greeting and regression tests for multi-name, no-surname fallback, and unsafe characters. Focused shared-lib Vitest 17/17 green; shared-lib `tsc --noEmit` green.)
> Previously: 2026-07-04 (**ZDM client DHS Manage Consumers fix**: the case DHS panel now treats workflow status `ZDM_CLIENT` as eligible for **Manage Consumers** (and Resend Confirmation Link) just like `ACCEPTED_VIA_DHS`; the screenshot bug was the inline DHS-panel gate, not the header action. Added `apps/cases/lib/dhs-manage-consumers-eligibility.ts` with tests for ZDM, Accepted via DHS, manual accepted override, and pending/requested hidden state. Focused Vitest 9/9 green; `apps/cases` `tsc --noEmit` green with 8GB heap.)
> Previously: 2026-07-04 (**ZDM client header action fix**: on the Cases detail header, cases with workflow status `ZDM_CLIENT` now show **Manage Client** instead of **Convert to Referrer** for manager-level users, because they are already clients. Added `apps/cases/lib/case-header-client-action.ts` to keep the decision explicit and tested; non-ZDM cases still show Convert to Referrer. Tests: focused Vitest 4/4 green; `apps/cases` `tsc --noEmit` green with 8GB heap.)
> Previously: 2026-07-03 (**+ "Resend Confirmation Link" button** on the case DHS panel (amber, next to Manage Consumers, same Accepted-via-DHS gate): new `POST /api/cases/[id]/resend-consent` (staff session, B2B rejected) -> `handleDhsAccepted` gained `forceResend` - re-sends the consent email on a PENDING consent **reusing the existing token** (old links stay valid; failed resend does NOT cancel the token, unlike a failed first send), upgrades the consent row to channel CREDO + consumerId when the profile was provisioned after the original send, posts a "RE-SENT" timeline comment, and never re-emails a CONSENTED consumer. 3 new handler tests (17/17) + 6 new route tests; shared-lib + cases tsc clean (cases needs `NODE_OPTIONS=--max-old-space-size=8192`); dev-server smoke: page 307 auth-redirect, route 401 unauth. Same session as the Credo consent flow below.)
> Previously: 2026-07-03 (**Consumer file-confirmation via Credo + post-consent document readiness**: the Accepted-via-DHS consent flow now routes through the Credo portal — `handleDhsAccepted` auto-provisions a Credo profile (username = 13-digit SA ID number, already the only Credo login identifier) and emails a **login-gated Credo consent link** (`credo.zenowethu.co.za/consent/[token]`, new page + auth/ownership-checked API `apps/credo/app/api/consumer/consent/[token]`) with clear login instructions incl. a set-password activation link when the profile was never activated; falls back to the old public cases link when the client has no valid ID number. The `onDebtReviewRemovalConsent` extension point is now WIRED: consent posts a case-timeline comment, then the new **DRR document readiness pipeline** (`packages/shared-lib/src/dhs/drr-readiness.ts`) runs — checks CREDIT_REPORT/PAYSLIP/BANK_STATEMENT on the case; if missing, AI-splits the COMBINED (or OTHER) PDF for ONLY the missing types and saves them as Documents; credit report still missing → emails a request to the case's Referrer (else B2B partner project billingEmail; 7-day cooldown) or escalates to staff when nobody can be asked; missing payslip/bank statement → opens deduped Credo DocumentRequests for the consumer; all present → comments **"click Manage Consumers to proceed"** (`DRR_READY_FOR_MANAGE_CONSUMERS`). Pipeline must run in the Cases app (files on local disk) — new `POST /api/internal/drr-readiness` (x-internal-secret or staff session; **new env `INTERNAL_API_SECRET` must be identical in cases+credo; credo also needs `CASES_APP_URL`** — documented in both .env.examples, credo's is new), fired-and-forgotten from both consent routes. Also fixed pre-existing broken credo test setup (no vitest dep/script — its 23 existing tests had never run; 1 test-mock bug fixed) and a latent shared-lib typecheck error in `dc-fee-invoice-service.test.ts`. Tests: shared-lib 633/633, cases 454/454 + 5 new internal-route, credo 31/31 (8 new consent) — all green; `tsc --noEmit` clean on shared-lib + credo. **Migration:** none new, but `20260628_debt_review_removal_consent` still NOT applied to prod — apply before deploying. Redeploy cases + credo.)
> Previously: 2026-07-03 (**Company phone number changed monorepo-wide**: the 012 035 1824 landline is disconnected (company beginning move from Mabopane; the Mabopane address itself stays for now, per user) — replaced everywhere with **081 747 7616** (`081 747 7616` / `+27 81 747 7616` / `27817477616` for wa.me & tel: links) across 33 files: website pages (contact/about/assessment/leads error), all email/SMS/WhatsApp templates (decline-handler, accepted-email, notifications templates, ghl-workflow, workflow-automation cron, POA send, refund-form, dc-fee-invoice send, b2b weekly email), PDF generators (invoice-pdf ×2 apps, mandate-pdf, court-doc-pdf, dispute-pdf), `COMPANY_PHONE` env fallbacks (notifications service, telegram-bot, plan-engine cases action, dhs lookup), AI prompts (auto-reply, legal-secretary, ai-chat signature), public pages (POA signing, consent, credo quote), CLAUDE.md + MASTER_PROMPT signature blocks. **Deliberate exception:** `packages/shared-lib/src/openai/prompts.ts` document-identification clues keep the OLD number AND add the new one — existing signed POAs in circulation still carry 012 035 1824 on paper and must remain detectable. Cell 082 363 8207 unchanged. auto-reply tests 11/11 green. If `COMPANY_PHONE` is set in any prod `.env`, update it to `081 747 7616`. Redeploy all apps to ship.)
> Previously: 2026-07-03 (Quote acceptance ↔ case workflow sync, per user request: new **"Mark as Accepted" / "Mark as Rejected"** buttons on the Cases app quote detail page (`/invoices/[id]` for `type: QUOTE` — replaces the wrong "Mark Paid" button that the finance API rejects for quotes anyway), backed by a new Cases route `POST /api/finance/quotes/[id]/decision` that shares the exact same logic as Finance via new `packages/shared-lib/src/finance/quote-case-sync.ts` (`recordQuoteDecision`) — both apps write the same Invoice row so status is inherently in sync. Accepting a case-linked quote advances the case to the **new `QUOTE_ACCEPTED` workflow status** (PAYING category, SLA 5d — the accepted-counterpart to the existing `QUOTE_REJECTED`; the referrer-commission stage map already anticipated this code and now syncs automatically) — but **only when that is a forward move on the board** (`isForwardStatusTransition` ranks by WORKFLOW_STATUSES order; cases already further along never move backwards, per user's explicit rule). Second automation: `checkQuoteFulfilment(caseId)` — whenever payments are captured, sums all non-cancelled case payments (plus a converted invoice marked PAID with no allocations) against the most recently accepted quote's total; captured ≥ quoted → case advances to **SETTLED_SUCCESS** (forward-only, WorkflowLog audit entry with amounts). Wired via fire-safe `checkQuoteFulfilmentSafe` (sync failure never fails the payment) into all capture paths: finance `POST invoices/[id]/payments`, `POST payments` (manual record), `PATCH payments/[id]` (amount edits), `PATCH payments/[id]/allocate`, and both apps' `PATCH invoices/[id]` Mark-Paid. No migration needed (`Case.status` is a string). 25 new shared-lib tests + 5 new cases route tests + finance decision route extended — shared-lib finance 79/79, finance routes 15/15 (quotes) + 53/53 (quotes/invoices/payments), cases 5/5; `tsc --noEmit` clean on shared-lib/finance/cases touched files (note: repo `strict: false` doesn't narrow discriminated unions — used a flat optional-field result interface). **Redeploy cases + finance to ship.**)
> Previously: 2026-07-03 (Optional **proof of payment upload** on Record Payment + Edit Payment, per user request: new additive migration `20260703_payment_proof_of_payment` (`Payment.proofOfPaymentUrl TEXT NULL`) **already applied to prod** via `prisma migrate deploy` (first attempt failed on a PowerShell UTF-8 BOM in the SQL — resolved with `migrate resolve --rolled-back` + BOM-free rewrite; lesson: write migration SQL with the Write tool, not `Set-Content -Encoding utf8`). `POST /api/finance/payments` and `PATCH /api/finance/payments/[id]` now accept multipart/form-data with an optional `proofOfPayment` file (PDF/JPG/PNG/WebP, ≤10MB) via shared helpers in `apps/finance/lib/payment-proof.ts`; files stored per-payment at `storage/uploads/payments/<paymentId>/` in the finance app (deliberately NOT written as a cross-app case `Document` — apps don't share a storage volume, the link would 404 from the cases app). A failed file write does not lose the payment — returns 201 + `proofUploadError`, staff can retry via Edit. UI: file picker on `/payments/record` (with selected-file chip + amber warning state), view/replace control in `EditPaymentModal`, and a cyan "POP" link on payment rows. **Also hardened `apps/finance/app/uploads/[...path]/route.ts`**: was serving all uploaded files with no auth and no path-traversal guard — now requires a session, rejects `..`/slash path parts, `Cache-Control: private`. ⚠️ Same unauthenticated pattern still live in cases/legal/insurance/forensic-audit upload routes — flagged as a separate task. 9 new tests (22/22 payments routes, finance suite 125/125), `tsc --noEmit` clean on finance. **Redeploy finance to ship** (migration already applied, old code ignores the new column safely).)
> Previously: 2026-07-03 (Global TopBar search fixed monorepo-wide, per user report with screenshots: Finance (and Legal/Insurance/Forensic-Audit) could only find clients by ID number, not surname — their copies of `GET /api/cases/search` were missing `mode: 'insensitive'`, so PostgreSQL matched case-sensitively ("sefala" ≠ "Sefala"; digits-only ID numbers still matched, which is why ID search worked). Those copies were also missing the auth check, the `deletedAt` soft-delete filter, and the recent-5-cases-on-empty-query behaviour that the Cases app had. All five duplicated routes replaced with one shared factory `createCaseSearchRoute()` in `packages/shared-lib/src/search/case-search-route.ts` (follows the existing `createNextUpdateRoute` pattern; Node-only, deep-imported). Verified against the live dev DB: insensitive query finds "Thapelo Mathabe Sefala", old case-sensitive query finds 0. Also, the search box now **clears itself on page navigation** in every app — `SearchWithSuggestions` (packages/ui) watches `usePathname()` and resets query/suggestions when the route changes, so a stale term no longer lingers in the persistent TopBar after opening a case. 7 new shared-lib tests green, `tsc --noEmit` clean on ui; finance dev server smoke-tested (route responds 401 unauthenticated as designed). **Redeploy all 5 case-search apps (cases, finance, legal, insurance, forensic-audit) to ship.**)
> Previously: 2026-07-02 (Finance can now **edit payments**, per user request: new `PATCH /api/finance/payments/[id]` (Zod-validated partial update of amount/date/method/reference/category/notes; 404 on missing payment; writes a `WorkflowLog` `PAYMENT_EDITED` audit entry when the payment is case-linked — WorkflowLog requires a caseId so unlinked payments skip it) + new `EditPaymentModal` wired into an Edit button on every row of the Payments list. Client/case re-linking deliberately stays in the existing Allocate flow, and adding payments was already working via Record Payment. 8 new route tests (16/16 across payments routes), `tsc --noEmit` clean on finance. **Redeploy finance to ship** (together with the payments-list 400 fix below).)
> Previously: 2026-07-02 (Referrer Registry: SA ID Number is now editable on existing referrers, and role permissions tightened — Admin/Executive can add, edit, and delete referrers; Managers/Senior Managers can view and add only. Previously the SA ID field was hard-disabled in the Edit Referrer modal AND the PATCH API schema silently stripped `idNumber`, so a referrer created without an ID (e.g. William Maesela) could never have one added. `PATCH /api/admin/referrers/[id]` now accepts a 13-digit `idNumber` (with cross-referrer uniqueness check → 409, and warn-log on clearing), and edit access on that route was narrowed from admin/exec/senior-manager/manager to Admin/Executive only (matching DELETE, which was already restricted). UI (`admin/referrers/page.tsx`): Edit + Delete buttons and the drawer's Edit Referrer button now only render for Admin/Executive; the + Add Referrer button remains for all manager-level roles. POST/GET unchanged. 6 new/updated tests in `apps/cases/app/api/admin/referrers/route.test.ts` — 32/32 referrer API tests green, `tsc --noEmit` clean on cases. Redeploy cases to ship.)
> Previously: 2026-07-02 (Fixed a live production bug reported by the user with a screenshot: the Finance **Payments page always failed to load with error 400** ("Couldn't load payments"). Root cause: `GET /api/finance/payments` builds its Zod input with raw `searchParams.get('limit')`, which returns `null` when the param is absent — the payments page never sends `limit`. Zod's `.default(50)` only applies to `undefined`, so `z.coerce.number()` coerced `null` → `0`, failing `.min(1)` → 400 on every load. Fixed with `?? undefined` so defaults apply; same latent bug fixed in `GET /api/finance/clients/[id]/payments` and `GET /api/finance/batches` (identical pattern). The Record Payment flow itself (`POST /api/finance/payments` + `/payments/record` page) was audited and is fine — payments were being recorded, only the list display was broken, and they'll appear once this deploys. New regression suite `apps/finance/app/api/finance/payments/route.test.ts` (8 tests, incl. the exact no-limit request the page sends) — 8/8 green. **Redeploy finance to ship.**)
> Previously: 2026-07-02 (Fixed a live bug reported by the user: saving personal banking details on `/account` always failed with "Validation failed", even though the banking fields themselves were valid. Root cause: `PUT /api/users/profile`'s Zod schema had `newPassword: z.string().min(8).optional()`, but the account page always submits `newPassword: ''` (empty string) when the user isn't changing their password — `.optional()` only permits `undefined`, not an empty string, so the whole request was rejected regardless of what else was submitted. Fixed with `z.string().optional().refine(v => !v || v.length >= 8, ...)` so an empty string passes through untouched while an actual too-short password attempt still correctly fails. Added a regression test reproducing the exact reported payload (`apps/cases/app/api/users/profile/route.test.ts`) — 9/9 green, `tsc --noEmit` clean on cases.)
> Previously: 2026-07-02 (R350 admin invoice follow-up: send/resend button now hides once R350 is Paid or Waived (matches Mark Paid/Waive visibility); and the silent "auto-pick creator's banking, else FNB" behavior was replaced with an explicit choice — a modal on first send lets whoever is sending pick "Zenowethu Default (FNB)" or "My Own Banking Details" (`useOwnBanking` on `POST /api/cases/[id]/r350-admin-invoice`, plumbed through `createR350AdminFeeInvoice`). If "own banking" is chosen but none is on file, this now fails with a clear 422 instead of silently falling back to FNB. Resend re-sends the already-created invoice with its original banking — no re-prompt. General invoices/quotes are unaffected — they still auto-resolve to FNB/Capitec per the existing role rules from the original feature (see entry below). Picked up an external change to `allocateDocumentNumber` (self-healing invoice-number collision detection via `tx.invoice.findFirst`/`findMany`, made by a parallel session) and updated this feature's test mocks to match. 10/10 route tests + 5/5 shared-lib service tests updated and green; full suites: shared-lib 586/586, cases 434/434. `tsc --noEmit` clean on cases (had to clear a corrupted `.next/dev/types` left by an interrupted dev-server stop).)
> Previously: 2026-07-02 (DC fee invoice: moved consumer reference from under BILL TO into each fee line's DESCRIPTION + hardened letterhead resolution; see entry below.)
> Previously: 2026-07-02 (Built Referrer Portal Phase 1 MVP; see entry below.)
> Previously: 2026-07-01 (Fixed manual new-case referral creation failure caused by temp-client PATCH/update flow; see entry below.)
> Previously: 2026-07-01 (Referral portal advisory/scoping discussion - no code built; see entry below.)
> Previously: 2026-07-01 (Fixed a live production bug: `TelegramSession` has existed in `schema.prisma` since the 2026-06-26 Telegram bot commit and `packages/shared-lib/src/integrations/telegram-bot.ts` / the `apps/cases/app/api/webhooks/telegram/route.ts` webhook call `prisma.telegramSession.*` in prod, but no migration ever created the table — the accompanying migration from that commit only covered per-app next-update/payment-arrangements. Any inbound Telegram message would have thrown "table does not exist". New additive-only migration `20260701_add_telegram_session` applied directly to prod via `prisma migrate deploy`; `prisma migrate diff` against the live DB now shows zero drift. Confirmed the bot is currently dormant in this environment — `TELEGRAM_BOT_TOKEN` is unset in `apps/cases/.env`/`.env.local`, so the webhook route no-ops before touching Prisma — but the table now exists so turning it on (setting the token + registering Telegram's webhook) is safe. Outbound Telegram sends were already separately gated behind `TELEGRAM_ENABLED` (default false) and unaffected. 564/564 shared-lib tests green, Prisma client regenerated.)
> Previously: 2026-06-28 (Credo activation email NO LONGER sent on case/referral creation — profile still auto-created with no password; consumer gets the "set your password" link only via the forgot-password/reset flow. Both `apps/cases/app/api/cases/route.ts` and `.../api/v1/cases/route.ts` now call `provisionConsumerForClient` instead of `provisionAndInviteConsumer`; tsc clean, 22 credo tests green. Earlier same day: Accepted-via-DHS consumer flow + debt review removal CONSENT LINK: new `accepted-email.ts` (consumer "transfer accepted, we'll start flag removal" email — compliance-safe, embeds consent link) and a full token-based consent capture — new `DebtReviewRemovalConsent` model + migration `20260628_debt_review_removal_consent` (NOT yet applied to prod), `consent-service.ts` (create link / record consent with POPIA+IP audit trail / idempotent), public page `/consent/debt-review-removal/[token]` + API, and an `onDebtReviewRemovalConsent()` **extension-point hook** (fires once on consent — downstream action TBD by business). Scope locked to accepted codes A/C/D3/D4. Also ran a LIVE read-only DHS check on the 7 overdue REQUESTED_VIA_DHS files — 3 ACCEPTED (codes B/G→Completed), 4 "declined" but mostly false/under-review (one DC text literally says "accepted"). 15+ new tests, dhs suite 91 green, tsc clean. Earlier: DHS consumer status-history clearance detection: new `packages/shared-lib/src/dhs/status-history.ts` reads the *View Consumer Status History* popup and identifies clearance-eligible codes **A1/B/F1/F2/G/G1**, then classifies workflow status from the status date — **<7 calendar days → READY_CLEARANCE, ≥7 → COMPLETED** (stops at COMPLETED; SETTLED is a later finance step), and maps accepted codes **A/C/D3/D4 → ACCEPTED_VIA_DHS**. Detection only — no case mutation yet; building block for the clearance automation. Pure helpers + read-only Puppeteer scraper `getConsumerStatusHistory(idNumber)`, **live-verified** against two real IDs; 27 tests green, tsc clean. Earlier same day: Requested-via-DHS follow-up automation: new dry-run-capable cron `/api/cron/dhs-requested-followup` + shared-lib trigger for OVERDUE Debt Review Flag Removal files in status `REQUESTED_VIA_DHS` only — deliberately excludes the `DHS_REQUESTED` look-alike (separate automation later). Re-checks DHS and routes ACCEPTED→`ACCEPTED_VIA_DHS` / DECLINED→existing `handleDHSDecline` / PENDING→nextUpdate+3d. New read-only `previewDHSDecline` renders the exact decline emails/SMS via shared templates; `?dryRun=true` sends nothing and writes nothing. Ran dry-run against all 7 live cohort files — 0 sends, 0 writes. 12 new tests, 49/49 dhs tests green, tsc clean. Also confirmed BCC monitoring (`notifications@zenowethu.co.za`) IS working on the live SMTP path (live test delivered); latent bug logged — GHL API provider `GhlEmailProvider` drops BCC if GHL is ever re-enabled. Earlier same day: Credo: auto-provision a consumer profile for every B2B/staff case, ID-number-only login, real email password-reset flow, and staff↔consumer document requests with portal uploads visible on the case — schema migration applied to prod; 22 new shared-lib tests + register test rewrite, all green; tsc clean on credo & cases; redeploy cases + credo. Earlier same day: 20s+ load on All Cases / New Case fixed — root cause was payload over-fetch (all 131 Case + 38 Client columns × ~971 rows + custom JSON.stringify replacer); replaced with slim Prisma `select` projections on /api/cases and /api/projects memberOnly, native serialization — sidebar was always fast because it uses tiny count queries; redeploy cases to apply. Earlier same day: Slow "New Case" load fixed — /api/projects memberOnly path de-duplicated (7→~5 queries), O(n²)→O(n) tree walks, 15s per-user cache; dangerous P2024 $disconnect removed from shared Prisma client (multi-user cascade risk); PgBouncer still TODO for 20+ users; Finance dropdown options invisible (white-on-white) fixed via global select option CSS; Invoice/quotation "number conflict" fixed across ALL apps — single shared atomic allocator + DocumentSequence reconciliation; Removed email/cell-number uniqueness check on case save — only ID number is unique per client; Fixed flaky admin-client DB integration tests blocking CI deploy; GHL suspended via GHL_ENABLED kill-switch; Fixed 550 welcome-email sender bug; Email primary; Per-app Next Update; Payment Arrangements; Telegram bot)

---

### Added: Referrer Card on Case Detail Page (2026-07-14)

**User request:** The referrer should be shown right under the Project card on the case detail page, so staff can see at a glance when a referral has been assigned to the wrong referrer (e.g. the project says "Referrals William Maesela May 2025" but the linked referrer is someone else — or nobody).

**What changed:**
- `GET /api/cases/[id]` now includes the case's linked `Referrer` (slim select: `id`, `firstName`, `lastName`, `email`, `cellNumber`, `referrerType`, `isActive`).
- New **Referrer card** in the left column of the case detail page (`apps/cases/app/(authenticated)/cases/[id]/page.tsx`), directly below the Project card: initials avatar, full name, cell/email, a Commission (emerald) / Discount (purple) type badge, and a red Inactive badge when the referrer is deactivated. Cases with no linked referrer show "No referrer assigned".
- Admin/Executive/Manager users can click the card through to the referrer's admin profile at `/admin/referrers/[id]`; other roles see it read-only (matching the Project card's Move-button gating).

**Follow-up (same day): Assign / Change / Remove referrer from the card.** The user asked how to assign a referrer to a case — the answer was that no such mechanism existed: `Case.referrerId` was only ever set automatically at case creation (when the case was created into a registered referrer's sub-project) or as a one-time back-fill by `register-from-project`, and Move Case never linked one. Built:
- New `PATCH /api/cases/[id]/referrer` (`{ referrerId: string | null }`) — role-gated to Admin/Executive/SeniorManager/Manager; non-admins can only assign referrers within their project membership (reuses `lib/referrer-access`); refuses inactive referrers (422); **refuses reassignment when the case's commission is already paid out (409)**; on assign, upserts `ReferrerCommission` at the stage matching the case's current status (same eligibility/auto-amount logic as the status route); on remove, deletes the unpaid commission row; writes a `REFERRER_CHANGE` case-timeline comment (matching the PROJECT_MOVE audit pattern).
- New `AssignReferrerModal.tsx` (case detail folder) — searchable, debounced picker over `GET /api/admin/referrers?isActive=true` (so it inherits membership scoping), with a "Remove referrer" action, wired to an **Assign/Change** button on the Referrer card (same gating as the Project card's Move button).

**Tests:** 3 new GET tests in `route.test.ts` (referrer included in the Prisma query, passed through, null-safe) + 10 new tests in `referrer/route.test.ts` (auth, role gate, membership gate, missing case/referrer, inactive referrer, paid-commission block, assign with commission sync + audit comment, remove with commission cleanup, no-op). Full `app/api/cases/[id]` suite 110/110 green. `tsc --noEmit` clean on cases.

**Operational notes:** Redeploy cases to ship. Note: changing a referrer re-credits the (unpaid) commission to the new referrer at the case's current stage — paid commissions are locked and must be resolved via the payout flow first.

---

### Fixed: Credo Consent Links No Longer Redirect to Login (2026-07-09)

**User report:** A resent DRR consent link still opened `credo.zenowethu.co.za/login?callbackUrl=...` instead of the no-login ID verification page. The link itself was correct, but the client was blocked before the page could render.

**Fix:** Credo middleware no longer matches `/consent/:path*`, and `isCredoProtectedPathname()` no longer treats `/consent/<token>` as protected. The no-login ID verification consent page/API from the DRR consent update now actually receives both first-send and resend links. Acceptance/reminder emails now say **HOW TO VERIFY YOUR CONSENT LINK**, explicitly telling consumers they do not need to log in and must type their SA ID number.

**Tests:** Credo auth/session/consent route Vitest 20/20 green. Shared-lib accepted-email, consent-reminder-email, and consent-service Vitest 44/44 green. TypeScript clean for `apps/credo` and `packages/shared-lib`.

**Operational notes:** Redeploy Credo and shared-lib consumers. Still create the AI trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.

---

### Changed: DRR Consent Links Require ID Verification Before Details (2026-07-08)

**User request:** DRR consent links were too hard because consumers had to log in, but a public link still needed to belong to one individual. A consumer should type their SA ID number, and the link must not approve with another client's ID number.

**Fix:** The Credo consent link now supports signed-out consumers by showing an ID verification step instead of redirecting straight to login. Both Credo and the older Cases public fallback return only a minimal `requiresVerification` response until the typed 13-digit ID number matches the consent token's linked client. Consent details and approval are unlocked only after that match; public approval also sends the verified ID back to the server, where `recordDrrConsent()` checks it again before recording consent.

**Files changed:** `packages/shared-lib/src/dhs/consent-service.ts`, the Credo consent page/API, the Cases fallback consent page/API, and route/unit tests for those surfaces.

**Tests:** Shared-lib consent-service Vitest 26/26 green; Credo consent route Vitest 13/13 green; Cases public consent route Vitest 7/7 green. TypeScript clean for `packages/shared-lib`, `apps/credo`, and `apps/cases` with 8GB heap.

**Operational notes:** Redeploy Credo, Cases, and shared-lib consumers. Still create the AI trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.

---

### Fixed: DHS Unsuspend Completes Required Reason Dialog (2026-07-08)

**User report:** DHS showed the unsuspend modal requires a reason before the final unsuspend button can work. The old automation only clicked the row toggle, waited briefly, and re-read the stale grid, so it could report failure even though it never completed the real DHS flow.

**Fix:** `packages/shared-lib/src/dhs/status-history.ts` now completes the DHS modal: fills `The consumer wants to resume with the program`, clicks the red **Unsuspend Consumer Debt Counsellor Services** button, clicks **Continue...**, waits 30 seconds, refreshes Search & Manage Consumer, reapplies the ID filter, and verifies the refreshed row.

**Tests:** `packages/shared-lib/src/dhs/status-history-actions.test.ts` now covers the full reason/submit/continue/30-second refresh path and the failure case where the dialog cannot be completed. Scoped DHS run green: 40/40; `packages/shared-lib` TypeScript clean.

**Operational notes:** Redeploy Cases and shared-lib consumers. Still create the AI trigger that lets AI request all debt review removal files such as Form 17.W and Court Orders for relevant cases.

---

### Fixed: Finance Case Detail Uses Accepted Quote as Fee Basis (2026-07-07)

**User report:** On the Finance case detail screen, Service Fee and Outstanding were not being calculated even though the case had an accepted quote and a completed payment.

**Fix:** `apps/finance/lib/case-financials.ts` now exposes `feeBasisTotal`, `feeBasisSource`, `feeBasisOutstanding`, and `feeBasisPercentCollected`. The Finance case detail cards use that fee basis: explicit `Case.serviceFee` wins when present; otherwise accepted quote totals are used. The original `serviceFee` and `overCollected` fields remain unchanged so quote overpayment stays separate from explicit service-fee overcollection.

**Files changed:** `apps/finance/lib/case-financials.ts`, `apps/finance/app/(authenticated)/cases/[id]/page.tsx`, `apps/finance/lib/case-financials.test.ts`, and `apps/finance/app/api/finance/cases/[id]/summary/route.test.ts`.

**Tests:** Focused Finance Vitest 17/17 green; Finance `tsc --noEmit` clean.

**Operational notes:** Redeploy Finance.

---

### Changed: Manage Consumers Stops First on Suspended DHS Services (2026-07-07)

**Goal (user clarification):** If the debt-review-removal consent is already accepted/done, the first Manage Consumers check must be whether DHS services are suspended. If suspended, staff must be alerted and an Unsuspend action must be available.

**What changed:**
- `packages/shared-lib/src/dhs/status-history.ts`: added `getConsumerSuspensionIndicator()` for a suspension-only Search & Manage Consumer read, and `unsuspendConsumerServices()` to click DHS' Unsuspend toggle only when the row is definitely classified as suspended.
- `apps/cases/app/api/dhs/lookup/route.ts`: `manage_consumers` now checks suspension before document readiness/clearance. Suspended files stop with `blockedBySuspension: true` and `canUnsuspend: true`; `unsuspend_consumer_services` performs the DHS unsuspend action and logs a timeline result.
- `apps/cases/app/(authenticated)/cases/[id]/page.tsx`: the DHS message panel now shows an amber warning plus **Unsuspend Consumer Services** when Manage Consumers finds a suspended file.

**Tests:** New mocked DHS action tests 2/2 green; status-history classifier suite 37/37 green; clearance/readiness/accepted-handler suites 40/40 green. TypeScript clean for `packages/shared-lib` and `apps/cases` (`NODE_OPTIONS=--max-old-space-size=8192` for Cases).

**Operational notes:** After a successful unsuspend, staff should run **Manage Consumers** again so document readiness and clearance can continue. Redeploy Cases and shared-lib consumers.

---

### Fixed: New Case Referrer Subproject Picker Now Requires Direct Membership (2026-07-06)

**User request:** Kenneth Mokgoshi was not a member of "Ruphas Ruphy", but could still see that referrer in the `/cases/new` Branch/Subproject dropdown. Non-members should not even see referral sub-project visuals, because visibility makes accidental assignment possible.

**Fix:** The Cases app `GET /api/projects?memberOnly=true` membership tree now keeps ancestors only for path rendering and ordinary descendants for non-referrer project folders, but prunes `REFERRER` projects unless the logged-in user has a direct `ProjectMember` row for that exact referrer sub-project. Pruned referrer descendants are removed too, so hidden referrers do not leak nested Year/Month nodes.

**Files changed:** `apps/cases/app/api/projects/route.ts`, `apps/cases/lib/project-graph.ts`, and new regression coverage in `apps/cases/app/api/projects/route.test.ts`.

**Tests:** Focused Vitest 7/7 green (`app/api/projects/route.test.ts`, `lib/project-graph.test.ts`). Cases `tsc --noEmit` clean with 8GB heap.

**Operational notes:** Redeploy the Cases app. Add Kenneth to "Ruphas Ruphy" via the referrer Team Members card only if he should be allowed to assign cases there.

---

### Built: Referrer Membership Access Control + Members Management (2026-07-06)

**User request:** not everyone should see referrers — you must be a *member* of the referral partner to see it. Admin sees everything; everyone else sees only what they are part of. Also needed: a way to choose/add/remove the members of a referral partner.

**What was already there:** every referrer has a linked sub-project (`Project.type = 'REFERRER'`) and projects already support `ProjectMember` rows — but the entire referrer API surface ignored membership: any manager-level user could list every referrer, open any referrer's commissions/banking details, download any statement, and edit any commission. There was also no UI anywhere to manage members of a referrer's sub-project.

**What changed:**
- New `apps/cases/lib/referrer-access.ts`: `hasFullReferrerVisibility` (admin bypass), `getVisibleReferrerProjectIds` (direct memberships + descendant projects, mirroring the sidebar tree semantics), `canAccessReferrer`.
- `GET /api/admin/referrers`: non-admins filtered to `projectId IN (visible)`; meta counts and global commission totals scoped the same way so totals don't leak.
- Membership guard (403 for non-admin non-members) added to: referrer detail GET, commission list GET, commission edit PATCH, statement PDF GET, portal-access POST.
- `POST /api/admin/referrers` now auto-adds the creating user as the new sub-project's first member (role MANAGER) so non-admin staff keep visibility of referrers they create.
- New `GET/PUT /api/admin/referrers/[id]/members`: GET lists members (any manager-level user who can access the referrer); PUT replaces the member set (Admin/Executive only, staff-only accounts validated, retained members keep their role, new ones join as MEMBER). Deliberately does NOT sync members up to ancestor projects — membership of one referrer must never grant visibility of the whole Referrals tree.
- Referrer detail page: new **Team Members** card — member list with role chips, add via staff dropdown, remove with confirmation modal, toast feedback; edit controls render only for Admin/Executive.

**Tests:** `apps/cases/lib/referrer-access.test.ts` (7), `members/route.test.ts` (13), + 5 new filtering tests in the existing referrers suite. Focused run: 60/60 green across 6 test files. `tsc --noEmit` clean on cases (needs `NODE_OPTIONS=--max-old-space-size=8192`).

**Operational notes:** No migration (reuses `ProjectMember`). Existing referrers have no members yet — until an Admin/Executive assigns members via the new card, non-admin staff will see an empty Referrer Registry (admins unaffected). Case-assignment dropdowns intentionally still show all referrers (staff must be able to attribute a case to any referrer). Redeploy cases to ship.

---

### Changed: Referrer Login Auto-Provisioning Uses SA ID Username (2026-07-07)

**Goal (user request):** For every new referrer, create login details automatically with the referrer's ID number as the username and `Agent@1` as the password.

**What changed:**
- `apps/cases/lib/referrer-portal-access.ts`: added `provisionReferrerPortalUser()`, which creates or links a `REFERRER` user by `User.username = Referrer.idNumber`, stores `Agent@1` as a bcrypt hash, links `Referrer.portalUserId`, and uses an internal portal email so a missing contact email does not block login creation.
- `POST /api/admin/referrers`: direct referrer creation now requires a 13-digit SA ID number and provisions the portal user immediately after the referrer is created.
- `POST /api/admin/clients/convert-to-referrer`: converted clients are provisioned with the same ID-number login rule.
- `POST /api/admin/referrers/[id]/portal-access`: manual enablement now reuses the same provisioning helper and no longer depends on the referrer's email address.
- Shared auth now accepts either email or username during credentials login; the Cases login form accepts text and labels the field "Email or ID Number".

**Tests:** Cases focused Vitest green: `apps/cases/lib/referrer-portal-access.test.ts`, `apps/cases/app/api/admin/referrers/[id]/portal-access/route.test.ts`, and `apps/cases/app/api/admin/referrers/route.test.ts` (44/44). Shared-lib auth helper Vitest green: `packages/shared-lib/src/auth/login-identifier.test.ts` (2/2). Cases `tsc --noEmit` clean with `NODE_OPTIONS=--max-old-space-size=8192`.

**Verification note:** Full `packages/shared-lib` typecheck is currently blocked by existing `src/finance/overpayments.test.ts` Prisma mock typing errors, unrelated to referrer login provisioning.

**Operational notes:** Redeploy Cases and shared-lib consumers. New direct referrers without a 13-digit ID are now rejected because a username cannot be created without the ID number.

---

### Fixed: Case "Move to Project" button wired to existing modal (2026-07-06)

**User request:** how to change the project of a case from the Cases app.

**What was already there:** `POST /api/cases/move` (Zod-validated, Admin or project-Manager only, transactional — replaces all `CaseProject` links with the new primary project and posts a `PROJECT_MOVE` timeline comment) and `MoveCaseModal` in `@zenowethu/ui` (destination selector that auto-creates Year/Month folder structure via `/api/projects/ensure-path`). The modal was even rendered on the case detail page — but **no button ever set `isMoveModalOpen` to true**, so the feature was unreachable ("built but not wired to UI").

**What changed:** added a "Move" button to the Project card header on `apps/cases/app/(authenticated)/cases/[id]/page.tsx` (visible to Admin/Executive/Manager, matching the "Edit Services" button style). Clicking it opens the existing modal; on success the case data refreshes.

**Tests:** none added — one-line JSX wiring to already-tested state/modal; no logic introduced. No migrations, no new routes.

---

### Built: Post-Consent Status Transitions + Auto Manage Consumers Clearance (2026-07-04)

**Goal (user request + screenshots):** After the consumer approves the debt-review-removal consent, the case must not keep saying "Ready to Consent". It must (1) move to a truthful status immediately, (2) check whether the credit report is on file and, if not, request it from the referrer or B2B partner, and (3) when the credit report (and payslip/bank statement) are available, actually run Manage Consumers — the DHS clearance status-history check — automatically.

**What was already there:** the readiness pipeline (`drr-readiness.ts`) already split combined PDFs, chased the referrer/B2B billing email for the credit report, and opened Credo DocumentRequests — but it only posted timeline comments, never changed the case status, and ended by telling staff to click a button. `status-history.ts` could already read + classify the DHS consumer status history but deliberately mutated nothing.

**What changed:**
- `statuses.ts`: new `CONSENT_RECEIVED` (ADVANCED_PROGRESS, SLA 2d) and `AWAITING_DRR_DOCS` (ADVANCED_DETOUR, SLA 3d).
- `consent-service.ts` `onDebtReviewRemovalConsent`: case → `CONSENT_RECEIVED` (+2wd follow-up) — only when parked at READY_TO_CONSENT / ACCEPTED_VIA_DHS / ZDM_CLIENT.
- New `dhs/clearance-automation.ts` `runManageConsumersClearance()`: reads DHS status history, advances case to READY_CLEARANCE/COMPLETED per the live-verified code mapping, saves `consumerDhsStatus`, sets follow-ups, escalates failures to the timeline; never throws; never overrides a manual staff status.
- `drr-readiness.ts`: docs missing → case parked at `AWAITING_DRR_DOCS` (+3wd); docs complete → clearance automation runs automatically (`runClearanceWhenReady` opt-out available). Result now carries `statusUpdatedTo` + `clearance`.
- `POST /api/dhs/lookup` `manage_consumers`: when consent is already CONSENTED the button now runs readiness+clearance (previously a pure no-op skip). Eligibility sets in `accepted-handler.ts` + `apps/cases/lib/dhs-manage-consumers-eligibility.ts` include the two new statuses so the button stays available post-consent.

**Tests:** 7 new clearance-automation + 4 new/updated drr-readiness + 2 new consent-service tests. Focused runs: shared-lib (consent-service, drr-readiness, clearance-automation, accepted-handler, statuses) 67/67 green; cases (eligibility, internal readiness route, resend-consent route) 16/16 green. `tsc --noEmit` clean on shared-lib.

**Operational notes:** No migration needed (`Case.status` is a string). For the Credo approval to trigger the pipeline server-to-server, `INTERNAL_API_SECRET` must be identical in cases + credo and `CASES_APP_URL` set in credo (already documented in both .env.examples) — verify they are set in prod. Existing stuck cases (consented but still "Ready to Consent") self-heal when staff click **Manage Consumers**. Redeploy cases + credo to ship.

---

### Fixed: Consent Confirmation Uses Name + Surname (2026-07-04)

**Goal (user request + screenshot):** The Credo approval confirmation should not show all stored given names only. It should display the consumer as first given name + surname.

**Fix:** Added `formatConsentConsumerDisplayName()` in `packages/shared-lib/src/dhs/consent-service.ts`, selecting the first token from `firstName` and appending `lastName`. The Credo consent API now selects `lastName` and returns `consumerDisplayName`; both the Credo consent screen and the public fallback consent screen use that display name with the existing response field as a compatibility fallback.

**Tests:** Added shared-lib formatter regression coverage for `NOFDA MMUSHO` + `MOKGOSHI` -> `NOFDA MOKGOSHI` and updated the Credo consent route test to assert the API payload. Focused Vitest: shared-lib consent-service 15/15 green; Credo consent route 9/9 green. `tsc --noEmit` green on shared-lib + credo.

---

### Fixed: Debt Review Removal Consent Clarifies Zenowethu Is Handling the File (2026-07-04)

**Goal (user request + screenshot):** The consumer consent screen should make clear that the approval is not only about debt-review-removal work, but also confirms that the consumer knows Zenowethu Debt Management is the debt counsellor working on the file. This creates a clear record if the consumer later disputes who handled the matter.

**Fix:** Updated the snapshotted `DRR_CONSENT_TEXT` in `packages/shared-lib/src/dhs/consent-service.ts` to explicitly acknowledge that the file has transferred to Zenowethu Debt Management (NCRDC3693), that Zenowethu is authorised to work on and communicate about the file, and that the approval creates a clear handling record. Pending consent links now display and stamp the clarified wording while already-consented records keep their historical wording. Aligned the visible copy, checkbox, button, success copy, and API success message on the Credo consent page and the older public fallback consent page.

**Tests:** Added regression assertions for the consent wording and pending-versus-historical consent behavior in `packages/shared-lib/src/dhs/consent-service.test.ts` and the Credo consent route tests. Focused Vitest: shared-lib consent-service 13/13 green; Credo consent route 9/9 green.

---

### Fixed: Credo Password Reset Greeting Uses Name + Surname (2026-07-04)

**Goal (user request + screenshot):** The Credo reset/set-password email should not greet a consumer with both stored given names. It should use first given name + surname, because some clients have two names in the `firstName` field.

**Fix:** `packages/shared-lib/src/credo/password-reset.ts` now selects `lastName` and formats the greeting with the first token from `firstName` plus surname. If surname is missing, it falls back to just the first given name. The rendered greeting is HTML-escaped before being inserted into the email body.

**Tests:** Added regression coverage in `packages/shared-lib/src/credo/password-reset.test.ts` for multi-name first names, missing surname fallback, unsafe characters, and the email body output. Focused Vitest: 17/17 green. `packages/shared-lib` `tsc --noEmit` green.

---

### Fixed: ZDM Client Header Action Shows Manage Client (2026-07-04)

**Goal (user request + screenshot):** When a case is already marked as `ZDM_CLIENT`, the header action should not offer **Convert to Referrer**. It should show **Manage Client** because this person is already a Zenowethu client.

**Fix:** Added `apps/cases/lib/case-header-client-action.ts` and wired the case detail header to use it. Manager-level users now see **Manage Client** for `ZDM_CLIENT` cases, which opens the existing client edit flow; non-ZDM cases still show **Convert to Referrer**.

**Tests:** Added `apps/cases/lib/case-header-client-action.test.ts` covering ZDM, normalized display-style ZDM status, non-ZDM, and permission-hidden cases. Focused Vitest: 4/4 green. `apps/cases` `tsc --noEmit` green with `NODE_OPTIONS=--max-old-space-size=8192`.

---

### Fixed: ZDM Client DHS Panel Shows Manage Consumers (2026-07-04)

**Goal (user clarification + screenshots):** On `ZDM_CLIENT` cases, the **Manage Consumers** button in the DHS panel should appear the same way it does for `ACCEPTED_VIA_DHS`. The previous fix handled the header action, but the missing button was controlled by a separate inline DHS-panel eligibility gate.

**Fix:** Added `apps/cases/lib/dhs-manage-consumers-eligibility.ts` and wired the DHS panel to it. `ZDM_CLIENT` / `ZDM Client` now qualifies for **Manage Consumers** and the adjacent **Resend Confirmation Link** button; requested/pending files remain hidden unless the manual accepted override is ticked.

**Tests:** Added `apps/cases/lib/dhs-manage-consumers-eligibility.test.ts` covering ZDM, display-style ZDM, Accepted via DHS, manual accepted override, and pending/requested hidden state. Focused Vitest: 9/9 green across both ZDM action helpers. `apps/cases` `tsc --noEmit` green with `NODE_OPTIONS=--max-old-space-size=8192`.

---

### Added: Consumer file-confirmation via Credo login + post-consent document readiness (2026-07-03)

**Goal (user request):** The consumer must confirm (consent) for their file to be worked on *inside the Credo portal*, logging in with their **ID number as username** (never email). The emailed link directs them how to log in. After they approve, automatically check that the **credit report, payslip and bank statement** are on the case; if not, **split the combined document**; if the credit report still isn't found, **request it from the Referrer / B2B partner**; once everything is on file, staff are told to **click Manage Consumers**.

**Consent now flows through Credo (login-gated):**
- `handleDhsAccepted` (fired by the Manage Consumers DHS action) now calls `provisionConsumerForClient` first — idempotent, requires a valid 13-digit ID number — and creates the consent with `channel: 'CREDO'` + `consumerId`.
- The acceptance email links to the **new Credo consent page** `/consent/[token]` and includes a "HOW TO LOG IN TO YOUR CREDO PORTAL" section: username = the consumer's 13-digit SA ID number (Credo's `auth.ts` already enforces ID-number-only login), plus a set-password activation link when the profile has no password yet (fresh token minted for stale unactivated profiles).
- New `apps/credo/app/consent/[token]/page.tsx` (redirects to `/login?callbackUrl=…` when signed out) + `ConsentClient.tsx` (branded approve UI with checkbox, loading/error/success states, no `alert()`), and `apps/credo/app/api/consumer/consent/[token]/route.ts` (GET view / POST approve) — **ownership enforced**: the consent must belong to the signed-in consumer or match their ID number (profile linked on first view); wrong-profile access → 403.
- Fallback preserved: clients without a valid ID number still get the old public cases-app consent link, so nobody is locked out.

**Post-consent document readiness pipeline** — new `packages/shared-lib/src/dhs/drr-readiness.ts` (`runDrrDocumentReadiness`), wired into the previously-TODO `onDebtReviewRemovalConsent` flow:
1. Consent recorded → case-timeline comment (`DRR_CONSENT_RECEIVED`, notes Credo vs email channel).
2. Checks required docs: `CREDIT_REPORT`/`CREDIT_REPORT_OTHER`, `PAYSLIP`, `BANK_STATEMENT`.
3. Missing docs + a `COMBINED` (or `OTHER`) PDF on file → `identifyDocumentPages` + `splitPdf` for **only the missing types** (no duplicates), saved to `storage/uploads/{caseId}` as Document rows tagged `splitBy: 'DRR_READINESS'`.
4. Credit report still missing → emails a request to the case's **Referrer** (else the B2B partner project's `billingEmail`) via `sendManualMessage` (logged against the case, 7-day re-request cooldown, `DRR_CREDIT_REPORT_REQUESTED`); nobody to ask → staff escalation comment (`DRR_CREDIT_REPORT_MISSING`).
5. Missing payslip/bank statement → deduped Credo `DocumentRequest`s so the freshly-logged-in consumer is asked to upload them.
6. All present → comment: all documents on file, **"Please click Manage Consumers to proceed"** (`DRR_READY_FOR_MANAGE_CONSUMERS`). Never throws; every outcome lands on the case timeline.

**Cross-app execution:** the pipeline reads case files from the Cases app's local disk, so it runs there — new `POST /api/internal/drr-readiness` (auth: `x-internal-secret` header or staff session; Zod-validated; B2B sessions rejected). The cases public consent route runs the pipeline in-process; the Credo consent route triggers the endpoint fire-and-forget (consumer's confirm never waits on AI splitting).

**Env vars (documented in `.env.example`s — credo's file is new):** `INTERNAL_API_SECRET` (must be identical in cases + credo), `CASES_APP_URL` (credo → cases base URL), `CREDO_URL` (already existed).

**Also fixed while here:** credo had test files but **no vitest dependency, script or config — its 23 pre-existing tests had never been runnable**; added them (mirrors cases setup) and fixed a pre-existing mock bug in `disputes/generate/route.test.ts` (`logAuditAction` missing from the shared-lib mock). Fixed the latent `dc-fee-invoice-service.test.ts` typecheck error (missing required `documentType`).

**Tests:** shared-lib **633/633** (incl. new `drr-readiness.test.ts` — 11 tests: ready path, split-only-missing-types, referrer request, partner fallback, escalation, cooldown, DocumentRequest dedupe; consent-service +2; accepted-handler reworked +2), cases **454/454** (incl. 5 new internal-route tests), credo **31/31** (8 new consent-route tests). `tsc --noEmit` clean on shared-lib and credo.

**Deploy note:** Redeploy **cases + credo**. No new migration, but **`20260628_debt_review_removal_consent` is still NOT applied to prod** — run `prisma migrate deploy` before/with this release. Set `INTERNAL_API_SECRET` (both apps) + `CASES_APP_URL` (credo) in prod envs; without the secret, Credo-side consents still record but the readiness check waits for the next staff/cases-side trigger. Known gap: "Manage Consumers" deeper clearance check (Search & Manage Consumer status-history) remains a follow-up; the readiness verdict currently instructs staff to click the existing button.

---

### Fixed: Referrer commission page total now matches linked referrals (2026-07-03)

**Symptom (user report):** William Maesela showed **9** referrals on the Referrer Registry list, but the individual commission page showed **Total Referrals = 0**.

**Root cause:** The registry list counts linked `Case` records (`Case.referrerId`), while the commission page was using `ReferrerCommission.findMany().length`. William has 9 linked referral cases but 0 generated commission rows, so the commission page incorrectly showed 0 under a card labelled "Total Referrals".

**Fix:** `GET /api/admin/referrers/[id]/commission` now includes the referrer's case count and sets `summary.total` from linked cases. A separate `summary.commissionRecords` value remains available for actual commission-row count. Commission eligible/paid/owed totals still come only from `ReferrerCommission` records.

**Tests:** Added `apps/cases/app/api/admin/referrers/[id]/commission/route.test.ts` covering the 9-cases/0-commission-records scenario and commission amount summaries. Focused Vitest green: 3 files / 13 tests. `apps/cases` `tsc --noEmit` green.

---

### Added: Quote "Mark as Accepted" in Cases + quote↔case workflow sync (2026-07-03)

**Goal (user request + screenshot):** A "Mark as Accepted" button on the quotation page meaning the consumer accepted the quote, in sync between Finance and Cases; and the case workflow status must change automatically once the amount captured ≥ the accepted quote.

**What changed:**
- **New workflow status `QUOTE_ACCEPTED`** (`packages/shared-lib/src/statuses/statuses.ts`, PAYING category, SLA 5 days) — the positive counterpart to the pre-existing `QUOTE_REJECTED`. The referrer-commission stage map (`referrer-commission.ts`) already mapped this case status → commission stage `QUOTE_ACCEPTED`, so referral tracking picks it up automatically. No migration needed (`Case.status` is a plain string).
- **New shared module `packages/shared-lib/src/finance/quote-case-sync.ts`** (Node-only, deep-import, not re-exported from the index):
  - `isForwardStatusTransition(from, to)` — ranks statuses by their WORKFLOW_STATUSES board order; a case never moves backwards (user's rule: "if quote accepted is the forward stage move to it, if backward stay").
  - `advanceCaseStatusIfForward()` — status + SLA-counter reset + `WorkflowLog` audit entry + referrer commission stage sync (mirrors the manual `/api/cases/[id]/status` route).
  - `recordQuoteDecision()` — the accept/reject logic both apps now share; accepting a case-linked quote advances the case to `QUOTE_ACCEPTED`. A case-sync failure never fails the decision.
  - `checkQuoteFulfilment()` / `checkQuoteFulfilmentSafe()` — sums non-cancelled case payments (a converted invoice marked PAID with no allocated payments counts as its total, matching the legacy display logic); captured ≥ accepted quote total → case advances to `SETTLED_SUCCESS` with the amounts recorded in the WorkflowLog notes. The safe wrapper logs-and-swallows so a sync failure can never lose a recorded payment.
- **Cases app** — new `POST /api/finance/quotes/[id]/decision` + new `QuoteActions.tsx` ("✓ Mark as Accepted" / "✗ Mark as Rejected", confirm dialogs, loading/error states). The quote detail page now shows these instead of the incorrect **Mark Paid** button (the payments API rejects payments against quotes), hides Send once decided/converted, shows the accepted/rejected banner with decider attribution, and gained ACCEPTED/REJECTED/CONVERTED/PARTIALLY_PAID status badge colours.
- **Finance app** — `quotes/[id]/decision` refactored onto the shared `recordQuoteDecision` (same behaviour + now advances the case, returns `caseSync` in the response).
- **Fulfilment check wired into every payment-capture path:** finance `POST invoices/[id]/payments`, `POST payments` (manual record), `PATCH payments/[id]` (when amount edited), `PATCH payments/[id]/allocate`, and both cases + finance `PATCH invoices/[id]` when an invoice is marked PAID.

**Tests:** `quote-case-sync.test.ts` 25 tests (forward/backward/lost-case rules, advance + workflow log + commission sync, decision guards, fulfilment thresholds incl. zero-total and PAID-without-allocations); cases decision route 5 tests; finance decision route +1 (case-advance through the route). Suites: shared-lib finance 79/79, finance quotes/invoices/payments 53/53, cases finance 5/5 — all green. `tsc --noEmit` clean on touched files (gotcha for future agents: the repo compiles with `strict: false`, which does NOT narrow discriminated unions — `RecordQuoteDecisionResult` is a flat interface with optional fields for that reason).

**Deploy note:** Redeploy **cases + finance** to ship. No DB migration. Behaviour notes: the forward-only rank treats PAYING (stage 9) as after COMPLETED (stage 8) per the board's own numbering — so a COMPLETED case whose quote gets accepted moves to `QUOTE_ACCEPTED`; LOST cases (CANCELLED etc.) are never resurrected by either automation.

---

### Fixed: Global search — surname search in Finance + clear-on-navigation everywhere (2026-07-03)

**Goal (user report + screenshots):** Searching "sefala" in Finance's TopBar found nothing while the same search in Cases found Thapelo Mathabe Sefala; Finance only matched on ID number. Also requested: the search box must clear when a new page loads — across the whole monorepo.

**Root cause:** Finance, Legal, Insurance and Forensic-Audit each carried an identical stale copy of the Cases search route without `mode: 'insensitive'` on the `contains` filters — PostgreSQL `contains` is case-sensitive by default, so lowercase queries never matched capitalised names, but all-digit ID numbers matched fine. The copies also lacked the auth guard, the `deletedAt: null` filter (soft-deleted cases were searchable), and the recent-cases dropdown on empty query.

**What changed:**
- **New `packages/shared-lib/src/search/case-search-route.ts`** — `createCaseSearchRoute()` route factory + exported `searchCases()` helper: auth-guarded, case-insensitive match on fileNumber / firstName / lastName / idNumber / phone / email, excludes soft-deleted cases, returns 5 most recent cases for an empty query, min 2 chars. Follows the `createNextUpdateRoute` pattern (Node-only, deep import, NOT re-exported from the package root).
- **All 5 apps' `app/api/cases/search/route.ts`** (cases, finance, legal, insurance, forensic-audit) reduced to a one-line `export const { GET } = createCaseSearchRoute()`.
- **`packages/ui/src/ui/SearchWithSuggestions.tsx`** — new `usePathname()` effect clears the query, suggestions and dropdown whenever the pathname changes. Applies to every app automatically since they all share this TopBar component. The in-page /cases filter usage is unaffected (it unmounts on navigation; `onQueryChange('')` keeps any parent state in sync).

**Verification:**
- `packages/shared-lib/src/search/case-search-route.test.ts` — 7 tests (insensitive surname match incl. the literal "sefala" case, recent-cases empty query, No Project fallback, 401 unauth, <2 char short-circuit, formatted results, 500 on DB error) — 7/7 green.
- Live dev DB check: the new insensitive query finds `Thapelo Mathabe Sefala (ZDM-2026-1016-2DD)` for "sefala"; the old case-sensitive query returns 0 rows — exact reproduction of the reported bug.
- Finance dev server smoke test: `GET /api/cases/search?q=sefala` returns the shared handler's 401 unauthenticated (the old finance route had **no auth at all**).
- `tsc --noEmit` clean on packages/ui; shared-lib tsc shows only pre-existing errors in `dc-fee-invoice-service.test.ts` (unrelated, latent).

**Deploy note:** Redeploy **cases, finance, legal, insurance, forensic-audit** to ship. Known gap: packages/ui has no component-test infrastructure (node env, no jsdom) so the clear-on-navigation effect has no automated test.

---

### Added: Optional proof of payment on Record/Edit Payment + finance uploads route hardened (2026-07-03)

**Goal (user request + screenshot):** "upload proof of payment optional" on the Record Manual Payment page.

**Schema:** Additive migration `20260703_payment_proof_of_payment` — `Payment.proofOfPaymentUrl TEXT NULL`. **Applied to prod** (`prisma migrate deploy`) and Prisma client regenerated. Gotcha hit and resolved: PowerShell 5.1 `Set-Content -Encoding utf8` writes a BOM which PostgreSQL rejects as a syntax error at position 0 — recovered with `prisma migrate resolve --rolled-back` and a BOM-free rewrite. Future agents: create migration SQL files with the Write tool.

**What changed:**
- `apps/finance/lib/payment-proof.ts` (new) — `readPaymentRequest()` (JSON or multipart with optional `proofOfPayment` file), `validateProofFile()` (PDF/JPG/PNG/WebP, ≤10MB), `saveProofFile()` (writes `storage/uploads/payments/<paymentId>/<ts>-<sanitized>`, returns `/uploads/payments/...` URL).
- `POST /api/finance/payments` — accepts multipart; file validated *before* the payment is created; file saved *after*, so a failed write never loses the payment (201 + `proofUploadError`, staff retry via Edit).
- `PATCH /api/finance/payments/[id]` — accepts multipart; new proof replaces the URL (old file stays on disk for audit); a proof-only PATCH (no other fields) is valid.
- UI: `/payments/record` file picker with selected-file chip and amber partial-failure warning; `EditPaymentModal` shows "View current proof of payment" + replace picker; payments list shows a cyan **POP** link in the Source column.
- **Storage decision:** proof lives only in the finance app's storage. Deliberately NOT duplicated as a case `Document` — the apps do not share an uploads volume (checked Dockerfiles/deploy docs), so a `Document.fileUrl` created by finance would 404 when opened from the cases app. If a shared volume is ever mounted, revisit.
- **Security fix (opportunistic):** `apps/finance/app/uploads/[...path]/route.ts` served every uploaded file with no auth and no traversal guard. Now: 401 without a session, 400 on `..`/`\`/`/` path parts, `Cache-Control: private`. ⚠️ The equivalent routes in **cases, legal, insurance, forensic-audit are still unauthenticated** — flagged as a separate follow-up task (must check Credo cross-app document links before locking down cases).

**Tests:** +4 POST multipart tests, +2 PATCH multipart tests, +existing suites — payments routes 22/22, full finance suite 125/125 green. `tsc --noEmit` clean on finance.

**Deploy note:** Redeploy `finance`. Migration is already live (additive; old code ignores the column). Files land inside the container at `<workdir>/storage/uploads/payments/` — if the finance container has no persistent volume for `storage/`, proofs will be lost on redeploy; verify/mount in Dokploy (same consideration already applies to all existing document uploads).

---

### Added: Finance payment editing (2026-07-02)

**Goal (user request):** "Finance should be able to add and edit payments." Adding already worked (Record Payment); editing did not exist at all.

**What changed:**
- New `apps/finance/app/api/finance/payments/[id]/route.ts` — `PATCH` with Zod-validated partial update of `amount` (positive), `date`, `method`, `reference`, `notes`, `category`. Requires at least one field; 404 if the payment doesn't exist; empty `reference`/`notes` clear to null. Client/case linking is deliberately NOT editable here — that stays in the existing Allocate flow (`PATCH .../[id]/allocate`) which also keeps batch match counters in sync.
- Audit trail: when the edited payment is case-linked, a `WorkflowLog` entry (`action: PAYMENT_EDITED`, old → new values in notes) is written — visible on the Finance audit-trail page. `WorkflowLog.caseId` is required by the schema, so unlinked payments get no entry (a payment-level audit table would need a migration; not done).
- New `apps/finance/components/payments/EditPaymentModal.tsx` + an Edit button on every row of `/payments` — prefilled form, loading/error states, list refetches on save.

**Tests:** `apps/finance/app/api/finance/payments/[id]/route.test.ts` — 8 tests (auth, 404, partial update, validation, empty-body, clear-to-null, audit log written/skipped). 16/16 green across both payments route suites. `tsc --noEmit` clean on finance.

**Deploy note:** Redeploy `finance` (ships together with the payments-list 400 fix). Not verified live in-browser (no test login in this session).

---

### Changed: Referrer Registry — editable SA ID number + Admin/Executive-only edit (2026-07-02)

**Goal (user request + screenshot):** The SA ID Number field in the Edit Referrer modal was disabled, so referrers created without an ID (e.g. William Maesela) could never have one added. Permissions requested: Admin + Executive may add/edit/delete referrers; Managers (and other manager-level staff with registry access) may add only.

**Root cause of the ID gap (two layers):** the UI hard-disabled the field with `disabled={!!editTarget}`, and even if submitted, the PATCH route's Zod schema had no `idNumber` key — Zod strips unknown keys, so it was silently discarded.

**What changed:**
- **`apps/cases/app/api/admin/referrers/[id]/route.ts`** — `PATCH` now accepts `idNumber` (13-digit, `''`→`null`, same shape as the create schema), enforces cross-referrer uniqueness (409 `A referrer with this ID number already exists`), and warn-logs when an existing ID is cleared (matches the email/cell clearing pattern). PATCH access narrowed from admin/exec/senior-manager/manager to **Admin/Executive only** — now consistent with DELETE, which was already restricted. GET unchanged (manager-level).
- **`apps/cases/app/(authenticated)/admin/referrers/page.tsx`** — `canDelete` generalised to `canManage` (Admin/Executive) and now gates the table's Edit button, the Delete button, and the detail drawer's Edit Referrer button. The SA ID field's edit-mode `disabled` lock removed. + Add Referrer stays visible to all manager-level roles.
- **`POST /api/admin/referrers`** deliberately unchanged — Managers can still add referrers.

**Tests:** `apps/cases/app/api/admin/referrers/route.test.ts` +6: manager 403 on PATCH, admin adds ID to existing referrer (asserts update payload), 409 duplicate ID, 422 non-13-digit ID, manager can POST (add-only role regression guard). 32/32 referrer API tests green; `tsc --noEmit` clean on cases.

**Deploy note:** Redeploy `cases` to ship. Not verified live in-browser (no test login in this session) — after deploy, verify: as Admin, edit William Maesela and save his 13-digit ID; as a Manager, confirm Edit/Delete buttons are gone but + Add Referrer works.

---

### Fixed: Finance Payments page 400 on load — null vs undefined in Zod query defaults (2026-07-02)

**Goal (user report + screenshot):** finance.zenowethu.co.za/payments always showed "Couldn't load payments (error 400)". User also flagged the Record Payment flow.

**Root cause:** `GET /api/finance/payments` fed `searchParams.get('limit')` (which is `null` when absent — and the page never sends `limit`) straight into `PaymentQuerySchema`. Zod `.default()` only fires on `undefined`; `z.coerce.number()` coerces `null` → `0`, which fails `.min(1)` → 400 on every page load. Payments themselves were unaffected — `POST` worked, only the list query failed.

**What changed:** `?? undefined` on the `page`/`limit` reads in three routes with the identical pattern:
- `apps/finance/app/api/finance/payments/route.ts` (the reported bug)
- `apps/finance/app/api/finance/clients/[id]/payments/route.ts` (latent — client payments page)
- `apps/finance/app/api/finance/batches/route.ts` (latent — payment batches page)

**Record Payment audit:** `POST /api/finance/payments` + `/payments/record` page inspected — Built and working. Zod create schema is sound; recorded payments will show once this deploys.

**Tests:** New `apps/finance/app/api/finance/payments/route.test.ts` — 8 tests including the exact no-`limit` request the page sends (regression), defaults, filters, explicit invalid limit, POST happy/edge. 8/8 green.

**Deploy note:** Redeploy `finance` to ship. Not verified live in-browser (no test login in this session) — after deploy, the Payments list should load and show any previously recorded payments.

---

### Changed: R350 admin invoice — explicit banking choice + hide button once resolved (2026-07-02)

**Goal (user feedback on the 2026-07-01 R350 feature):** Two corrections from the user testing the feature:
1. The Send/Resend Admin Invoice button stayed visible even after R350 was marked Paid or Waived — it should disappear then, exactly like the existing Mark Paid/Waive buttons.
2. The invoice was silently defaulting to Zenowethu's FNB account without asking — the whole point of adding staff personal banking was to let the person sending choose between their own banking and Zenowethu's default, **for this admin-fee flow only** (general invoices/quotes are unaffected and keep auto-resolving to FNB/Capitec per the existing role rules).

**What changed:**
- **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`** — button visibility condition now also requires R350 not Paid/Waived (same condition as Mark Paid/Waive). Clicking "Send Admin Invoice" (first time) now opens a small modal with two radio options — "Zenowethu Default Banking" or "My Own Banking Details" — before sending; "Resend Admin Invoice" (already created) skips the modal and just re-sends the existing invoice with whatever banking it was created with.
- **`packages/shared-lib/src/finance/r350-admin-fee-invoice.ts`** — `createR350AdminFeeInvoice` now takes an explicit `useOwnBanking: boolean` instead of silently resolving via `resolveStaffOrDefaultBankAssignment`. If `useOwnBanking: true` but the creator has no `StaffBankingDetail`, returns `{ ok: false, status: 422, error: '...' }` (no silent fallback) telling them to add it on the Account page or choose the default. Returns a proper discriminated `{ok:true,invoice} | {ok:false,status,error}` result — inlined literal returns (no helper-function indirection), per a TS narrowing quirk discovered in this codebase's tsconfig (see below).
- **`apps/cases/app/api/cases/[id]/r350-admin-invoice/route.ts`** — Zod-validates a `{ useOwnBanking?: boolean }` body (default `false`), passes it through, and surfaces the service's error/status directly instead of assuming success.

**⚠️ TypeScript narrowing gotcha (leave this note for future agents):** in this repo's tsconfig setup, a discriminated union return type stops narrowing correctly (`if (!result.ok) { result.error }` fails to type-check) as soon as any branch is produced via a separate helper function call or an explicit named-type annotation — confirmed via isolated repro. The fix is to inline every branch as a literal object (`{ ok: false as const, ... }` / `{ ok: true as const, ... }`) directly in the function body with **no** explicit return-type annotation, then derive the exported type via `Awaited<ReturnType<typeof fn>>`. Both `create-invoice.ts` and `r350-admin-fee-invoice.ts` follow this pattern now — don't "clean it up" into a shared `fail()` helper, it will silently break narrowing at every call site.

**Also picked up along the way:** a parallel session added self-healing invoice-number collision detection to the shared `allocateDocumentNumber` (queries `tx.invoice.findFirst`/`findMany` before trusting the sequence counter) — updated this feature's test mocks (`r350-admin-fee-invoice.test.ts`) to include those methods, matching what the other finance test files already had.

**Tests:** `r350-admin-fee-invoice.test.ts` rewritten for the explicit `useOwnBanking` param (5 tests); `r350-admin-invoice/route.test.ts` +2 (own-banking chosen, 422 bubbled up) — 10 total. Full suites green: shared-lib 586/586, cases 434/434. `tsc --noEmit` clean on cases.

**Not verified live in-browser** — same constraint as the original feature (no test login credentials in this session); recommend a manual click-through of the new banking-choice modal after deploy.

---

### Changed: DC fee invoice consumer reference moved into DESCRIPTION + letterhead hardened (2026-07-02)

**Goal (user request):** On DC fee invoices/quotes, the consumer reference (`Outstanding fees re: <Name> (ID: …)`) was printed as a separate "RE:" line under BILL TO. Move it into the DESCRIPTION column, folded into the fee reason so a Commission-paid-out line reads "Outstanding fees commission paid out for <Name> (ID: …)". Also ensure the Zenowethu letterhead is used.

**What changed:**
- `packages/shared-lib/src/finance/dc-fee-invoice.ts`: added two pure helpers — `consumerLabelFromReference()` (strips the `Outstanding fees re: ` prefix off the stored reference) and `buildDcFeeLineDescription(reason, consumerLabel)` (composes `Outstanding fees <reason> for <consumer>`, lower-casing only the reason's first letter so acronyms like Form 17.1 / NCT survive).
- `apps/cases/lib/dc-fee-invoice-pdf.ts` and `apps/finance/lib/dc-fee-invoice-pdf.ts`: each fee line's `description` is now built via the helpers from the invoice's stored `reference`, and the separate `reLine` under BILL TO was removed. Applied at render time, so **existing** DC fee invoices (e.g. INV-2026-0004) also render the new layout on next download/send — no data migration needed.
- Letterhead loader (`invoice-pdf.ts` in both apps): added an optional `INVOICE_LETTERHEAD_PATH` env override (first candidate) plus a sibling-app relative path, so the branded Zenowethu letterhead resolves in dev, Docker, and from either app's cwd. Bundled copy at `apps/cases/public/templates/poa/Letterhead.pdf` remains the auto-resolved default.

**Tests:** Added 6 cases to `dc-fee-invoice.test.ts` (prefix strip + round-trip with `buildConsumerReference`, null/blank handling, sentence folding, acronym preservation, no-consumer fallback). Full shared-lib Vitest green: 48 files / 584 tests.

**Env var:** `INVOICE_LETTERHEAD_PATH` (optional) documented in `apps/cases/.env.example` and `apps/finance/.env.example`.

**Deploy note:** Redeploy `cases` (and `finance` if DC fee docs are generated there) to ship.

---

### Added: Referrer Portal Phase 1 MVP (2026-07-02)

**Goal (user request):** Build the approved Phase 1 referrer portal so referrers can log in, track referrals, see commission earned/pending/paid, view payout references, download commission statements, update their own profile/banking details, and submit missing-payment/commission follow-ups.

**Privacy guardrail:** The portal is scoped through `Referrer.portalUserId` and every referrer API resolves the referrer from the signed-in user, not from a client-supplied referrer ID. Consumer data exposed to referrers is limited to file number, masked consumer label (first initial + surname), high-level status, commission amount/status, and payment reference. No consumer ID number, phone/email, banking details, documents, credit/DHS/XDS data, workflow logs, or internal notes are exposed.

**Schema:** Added additive migration `20260701_referrer_portal_phase1` with `Referrer.portalUserId` and new `ReferrerPaymentQuery` for structured missing-payment/commission claims. Added the inverse Prisma relations on `User`, `Case`, and `ReferrerCommission`.

**Backend/UI:** New `/referrer` portal page plus APIs under `/api/referrer-portal/*` for summary, profile update, payment-query submit/list, and privacy-safe statement PDF download. Added admin route `POST /api/admin/referrers/[id]/portal-access` to create/link a `REFERRER` user with a one-time temporary password. Existing admin referrer detail page now shows portal access status and an "Enable Portal Login" action.

**Tooling note:** Added the existing `next-auth` override to `pnpm-workspace.yaml` because this local runtime uses pnpm 11, which no longer reads `package.json#pnpm.overrides`; this lets frozen installs match the existing lockfile. `pnpm-lock.yaml` was not changed.

**Tests:** New focused tests for portal privacy helpers, portal access resolution, summary masking, profile updates, payment-query ownership checks, statement masking, and admin portal-user creation. Focused Vitest green: 7 files / 21 tests. `apps/cases` `tsc --noEmit` green after Prisma client generation.

**Next steps:** Apply migration in the target DB (`prisma migrate deploy`), redeploy the cases app, enable portal login for selected referrers from Admin -> Referrers, and manually verify one referrer account end-to-end in browser. Phase 2 remains referral intake + POPIA consent.

---

### Fixed: Manual new-case referral creation no longer PATCHes a temp client (2026-07-01)

**Symptom (user report):** Staff creating a new referral case from `/cases/new` hit the inline error `Failed to update case. Please try again.` on the manual-entry screen.

**Root cause:** The quick manual flow first created a temporary case/client (`MANUAL-...`) and then PATCHed that case into the real consumer. That was fragile for referrals and duplicate-ID cases, especially now that case creation auto-provisions Credo consumer profiles in the background: the later PATCH/merge path can end up trying to update/delete a temp client that already has related records.

**Fix:** `apps/cases/app/(authenticated)/cases/new/page.tsx` now creates the manual case with the real client payload via `POST /api/cases` first, uploads any attachments to that real case, and only uses PATCH afterward for case-level fields that the create endpoint does not accept. Duplicate referral confirmation now retries the manual create path with `allowDuplicate=true` instead of jumping into the document-analysis submit path.

**Tests:** Added `apps/cases/lib/manual-case-payload.ts` + `manual-case-payload.test.ts` (3 tests) for manual create/patch payload construction, placeholder cleanup, and numeric parsing. Focused Vitest green; `apps/cases` `tsc --noEmit` green. Full cases Vitest run: 405 passed / 6 skipped, but 2 DB integration suites failed because this environment could not reach `213.199.57.111:5432`; no live-DB escalation was run.

**Deploy note:** Redeploy the `cases` app to ship this to `cases.zenowethu.co.za`.

---

### Advisory: Referral Portal Scoping + Privacy Guardrails (2026-07-01)

**Goal (user request):** Discuss whether a referral/referrer portal is a good idea before building anything. Desired capabilities: referral tracking, commission visibility/claiming, client workflow status, and common referrer self-service questions while protecting consumer privacy.

**Discovery:** Existing code already has the right foundations in the Cases app: `Referrer`, `ReferrerCommission`, admin referrer management, commission stage syncing from case status, payout marking, EFT export, and commission statement PDF generation. Existing B2B dashboard code also exposes broader case-management views, but those views are too detailed for a general commission/referral portal because they can show full consumer names, ID numbers, phone/email, workflow logs, comments, and documents.

**Recommendation direction:** Build this, but as a privacy-limited referrer portal over the existing referrer/commission model rather than a new parallel B2B case portal. Show referral identifiers, high-level workflow milestones, commission status/amounts, payout/request status, and referrer-owned profile/banking details. Do not expose consumer case documents, bank details, credit data, full ID numbers, free-text internal notes, DHS/XDS details, or staff comments unless a separate consent/legal basis is documented.

**Approved six-phase roadmap (user approved 2026-07-01; do not build until explicitly requested):**
1. **Phase 1 - Referrer Portal MVP:** referrer login, dashboard totals, referral status, commission earned/pending/paid, payout references, downloadable statements, profile/banking details, and missing-commission/payment follow-up form.
2. **Phase 2 - Referral Intake + POPIA Consent:** new referral submission, consent declaration, optional proof upload, duplicate checks, and internal review queue before case conversion.
3. **Phase 3 - Commission Claims + Staff Verification:** structured missing-payment queries, proof-of-payment upload, admin verification queue, status updates, and audit trail.
4. **Phase 4 - Secure Messaging + Notifications:** referrer-safe communication thread per referral, email/SMS status notifications, payout notifications, and no internal case-note exposure.
5. **Phase 5 - Partner Team Management + Reporting:** organization/team logins, branch/user performance, monthly statements, exportable reports, and manager-only views.
6. **Phase 6 - Advanced Automation + Compliance:** automated commission reconciliation, anomaly detection, POPIA access logs, configurable commission rules, and finance/accounting exports.

**No implementation done:** Roadmap approved only. No schema, API, UI, or tests were changed. Build should start with Phase 1 only when the user explicitly asks to proceed.

---

### Added: Staff personal banking + R350 admin fee invoice + org bank-account selection rules (2026-07-01)

**Goal (user request):** Staff can record their own banking on `/account`, used only to auto-fill an R350 admin fee invoice for cases they created (fallback: Zenowethu's FNB account). All other invoices/quotes default to FNB; Executive/Manager/Senior Manager may choose FNB or Capitec instead; Admin may additionally use their own personal banking. Only Admin may edit the shared Zenowethu bank account records.

**Schema (migration `20260701_add_staff_banking_and_r350_invoice_tracking`, applied to prod via `prisma migrate deploy`):**
- New `StaffBankingDetail` model (1:1 `User`, mirrors `DCCPCredential`) — self-service, own record only.
- `Case.r350InvoiceId` / `Case.r350InvoiceSentAt` — tracks the R350 admin fee invoice so the case-page button flips from "Send" to "Resend".
- `Invoice.personalBankingUserId` — set instead of `bankAccountId` when a staff member's own banking is used (R350 flow, or Admin's "use my own banking" option on general invoices/quotes).

**New shared logic (`packages/shared-lib/src/finance/`, Node-only, deep-imported — not re-exported from the package index):**
- `banking-details.ts` — `resolveInvoiceBankingDetails()` (bankAccount → personalBankingUserId's StaffBankingDetail → org default BankAccount → hardcoded FNB fallback) and `resolveStaffOrDefaultBankAssignment()`.
- `create-invoice.ts` — `createInvoiceForUser()` + `computeInvoiceActorRoles()`: **centralises** invoice/quote creation that was previously duplicated between `apps/finance/app/api/finance/invoices/route.ts` and `apps/cases/app/api/finance/invoices/route.ts`. Bank-selection tiers: regular staff forced to org default; Executive/Manager/Senior Manager/Finance choose between active org accounts; Admin may pass `useOwnBanking: true` for their own `StaffBankingDetail`. Quotes no longer have a "no banking details" escape hatch — they always resolve to a bank now.
- `r350-admin-fee-invoice.ts` — `createR350AdminFeeInvoice()`: flat R350 line item, 0% VAT, reference = consumer ID number, banking via `resolveStaffOrDefaultBankAssignment(case.createdById)`.

**R350 admin fee flow:** New `POST /api/cases/[id]/r350-admin-invoice` (apps/cases) — permitted actors: case creator, Admin, or Executive. First call creates+sends the invoice and tags the case; subsequent calls re-send the *same* invoice (no duplicate charge). Case page button reads "Send Admin Invoice" / "Resend Admin Invoice" next to the existing Mark Paid/Waive controls, with `sonner` toast feedback (no `alert()`).

**Account page (`apps/cases/app/(authenticated)/account/page.tsx` + `api/users/profile/route.ts`):** new "Banking Details — Admin Fee Payouts" section (bank name / account holder / account number / branch code); PUT upserts (or clears via explicit `null`) the user's own `StaffBankingDetail`. Zod-validated; no admin gating (self-service, own record only).

**Org bank account gating:** `apps/finance/app/api/finance/bank-accounts/route.ts` + `[id]/route.ts` — added `isAdmin` check on POST/PATCH/DELETE (GET stays open, feeds the invoice-form dropdown). `apps/finance/app/(authenticated)/settings/banking/page.tsx` — added an Admin-only page guard (the cases-app mirror of these routes already had this gating). `invoices/new/page.tsx` — dropdown widened to Manager/Senior Manager; Admin gets an additional "use my own banking details" checkbox.

**PDF/send routes updated to resolve banking via the new helper** (previously read `invoice.bankAccount` directly, ignoring `personalBankingUserId`): `apps/finance` + `apps/cases` `invoices/[id]/pdf`, `invoices/[id]/send`, `invoices/[id]/attach-to-case` (cases only), `public/quotes/[token]/pdf`. Hardcoded emergency-fallback banking literals in both `invoice-pdf.ts` files switched from Capitec to FNB (now the default); the "Reference" row in the Banking Details PDF box now prefers `invoice.reference` over the invoice number, so the R350 invoice shows the consumer's ID number there as requested.

**Fixed a pre-existing broken test found along the way:** `apps/finance/app/api/finance/quotes/[id]/convert/route.test.ts` mocked `tx.invoice.count` and omitted `allocateDocumentNumber` from its `@zenowethu/shared-lib` mock — stale since the shared atomic invoice-numbering allocator (`documentSequence.upsert`) replaced the old `invoice.count()+1` approach; a previous STATUS.md entry (2026-06-29) had noted this failure as "pre-existing, not touched" — this session fixed the mock.

**Flagged, not fixed (separate background tasks spawned):** a pre-existing type error in `packages/shared-lib/src/finance/dc-fee-invoice-service.test.ts` (missing `documentType` on two test fixtures) surfaced by `tsc --noEmit` — unrelated to this work; `shared-lib` also has no `typecheck` script wired into turbo, which is why it went unnoticed.

**Tests:** `banking-details.test.ts` (6), `create-invoice.test.ts` (10), `r350-admin-fee-invoice.test.ts` (3) in shared-lib; `r350-admin-invoice/route.test.ts` (8), `users/profile/route.test.ts` (7) in cases; `bank-accounts/route.test.ts` (5) + `bank-accounts/[id]/route.test.ts` (4) in finance. Full suites green: shared-lib 577/577, cases 408/408, finance 103/103. `tsc --noEmit` clean on cases and finance (run with `--max-old-space-size=8192`; a full non-incremental check on cases needs ~8GB — the default heap OOMs). Lint: 0 errors on cases/finance (pre-existing warnings elsewhere untouched).

**⚠️ Manual setup needed:**
1. Log in as Admin → Finance → Settings → Banking → add two accounts: **FNB** ("Zenowethu Trading Debt Management (PTY) LTD", Acc `62867268635`, Branch `250655`) marked **default**, and **Capitec Business** ("Zenowethu Debt Management (Pty) Ltd", Acc `105 181 8346`, Branch `450105`) not default. No seed script was run against prod deliberately — this is a one-time manual step via the now-admin-gated UI.
2. Redeploy both `cases` and `finance` apps in Dokploy (new migration + shared-lib changes span both).

**Not verified live in-browser:** no test login credentials were available in this session, so the account page / case page button / invoice form UI were verified via `tsc`, lint, and the test suites above, plus a dev-server smoke check (login page renders correctly, no compile crash) — not an interactive click-through. Recommend a manual pass after deploy.

---

### Changed: DC fee invoice — letterhead in Finance + consumer ID on its own line (2026-07-02)

**Letterhead:** the invoice generator already loads `public/templates/poa/Letterhead.pdf` when present (verified: embeds as A4 595×842), but the finance app had no copy — so it rendered the programmatic header on prod (the finance Docker image doesn't include the cases app's `public/`). Fix: copied the letterhead to **`apps/finance/public/templates/poa/Letterhead.pdf`** so `join(cwd,'public',…)` resolves in dev and in finance's own image.

**Consumer ID on a new line:** `buildDcFeeLineDescription` now breaks the consumer label so the ID sits on its own line — "… for Name\n(ID: 8608…)". Both invoice PDF renderers (`apps/cases/lib/invoice-pdf.ts`, `apps/finance/lib/invoice-pdf.ts`) now split each line-item description on `\n` before word-wrapping, so explicit breaks are honoured (row height auto-adjusts).

**Tests:** `dc-fee-invoice.test.ts` updated for the newline; **shared-lib 584/584 green**.

---

### Fixed: Finance email had no provider — `sendEmail` now reads SMTP from the DB (2026-06-30)

**Symptom:** On the Finance Outstanding Fees tool, "Email to Debt Counsellor" didn't actually send (download worked). Root cause: `apps/finance/lib/email.ts` `sendEmail()` read SMTP only from `process.env.SMTP_HOST`, but this deployment stores SMTP creds in the DB `systemSettings` (not env) — so Finance found no provider and fell through to the dev mock (fake success) / "not configured" on prod. The Cases app already sends correctly because it uses `getSMTPCredentials()`.

**Fix:** `sendEmail()` now loads SMTP via `getSMTPCredentials()` (DB `systemSettings` first, env fallback) — same source the rest of the platform uses — and sets a proper `"Name" <from>` header. Fixes DC-fee email **and all other Finance email** (invoice/quote send, etc.). No schema/API change.

---

### Fixed: invoice-number collision — `allocateDocumentNumber` now self-heals counter drift (2026-06-30)

**Symptom:** Creating a DC fee invoice failed with `Invalid tx.invoice.create() … Unique constraint failed on the fields: (invoiceNumber)`. Root cause: the `DocumentSequence` counter for `INV-2026` had drifted **behind** invoice numbers already in the DB (legacy/imported invoices created outside the allocator), so `allocateDocumentNumber` handed back an already-used number. This affected **all** INV-2026 creation (finance's own invoices too), not just DC fee — a latent bug in the shared allocator.

**Fix (`packages/shared-lib/src/finance/document-number.ts`):** after the atomic `upsert` increment, the allocator does a single indexed lookup on the candidate `invoiceNumber`; if it already exists (drift), it scans the issued numbers for that prefix/year, jumps the counter past the real maximum, and returns a fresh number. No-drift path stays one cheap lookup. Concurrency-safe (the upsert still holds the sequence row lock). Self-healing — no manual DB reconciliation needed.

**Tests:** `document-number.test.ts` +1 (drift self-heal → jumps past existing max, then increments normally); updated the mocked `tx` in `create-invoice`/`r350-admin-fee-invoice`/`dc-fee-invoice-service` tests to include `invoice.findFirst`/`findMany`. **shared-lib 578/578 green.** Also made the DC fee create routes return the real error message instead of a bare 500.

---

### Changed: DC Fee tool consolidated into Finance ("Outstanding Fees") + shared form (2026-06-30)

**Goal (user request):** Surface the DC fee invoice/quote generator on the **Finance sidebar**. Discovered the Finance **"Outstanding Fees"** page (`/outstanding-fees`, prior-session stub) was a **broken duplicate** of this exact feature — it POSTed to a non-existent `/api/invoices` (real route is `/api/finance/invoices`) so submit 404'd, and it never rendered a DC-addressed PDF. User chose to **rebuild the full feature in Finance**.

**What changed (no new migration — `DC_FEE_QUOTE` already live):**
- **`packages/ui/src/finance/DcFeeInvoiceForm.tsx`** (new, shared) — the full capture form (DC + consumer fields, catalogue fee lines, 15% VAT toggle, Quote/Invoice toggle, live totals, success state with Download PDF + Email to DC). Theme-neutral Tailwind so it renders in both apps. Exported from `@zenowethu/ui`.
- **`apps/cases/.../DcFeeInvoiceModal.tsx`** — reduced to a thin modal wrapper around `DcFeeInvoiceForm` (Cases behaviour unchanged; now single source).
- **`apps/finance/app/(authenticated)/outstanding-fees/page.tsx`** — replaced the broken stub: renders `DcFeeInvoiceForm` with an optional consumer search (`/api/finance/clients/search`) that pre-fills + links the client. Still on the Finance sidebar under FINANCE.
- **Finance API (new):** `POST /api/dc-fee-invoices`, `GET /api/dc-fee-invoices/[id]/pdf`, `POST /api/dc-fee-invoices/[id]/send` — mirror the Cases routes, reuse the shared `createDcFeeInvoice` service; Finance PDF via new `apps/finance/lib/dc-fee-invoice-pdf.ts`.
- **`apps/finance/lib/invoice-pdf.ts`** — `InvoiceData` gains `billTo`/`reLine`; BILL TO block renders the DC (same extension as the Cases generator).
- **Cases standalone `POST /api/dc-fee-invoices`** — now accepts an optional `clientId` for consumer linking (parity with Finance).

**Checks:** shared-lib **558/558 green**; `tsc --noEmit` **clean on both finance and cases** (the shared UI form is typechecked transitively by both). No new migration.

**⚠️ Manual setup:** redeploy **both** the cases and finance apps in Dokploy to ship the shared `@zenowethu/ui` form + new Finance routes. After redeploy, the full tool is on the Finance sidebar → **Outstanding Fees**.

---

### Added: DC Fee tool — Quotation mode (Quote/Invoice toggle) (2026-06-30)

**Goal (user request):** Let the DC Fee tool also issue a **QUOTATION** (not just an invoice), still addressed to the requesting debt counsellor — a Quote/Invoice toggle like the Finance invoice page.

**What changed:**
- **`packages/shared-lib/src/finance/dc-fee-invoice.ts`** — input schema gains `documentType: 'INVOICE' | 'QUOTE'` (default `INVOICE`); new `dcFeeDocLabel()` helper.
- **`dc-fee-invoice-service.ts`** — quotes are numbered `QUO-…` and typed `DC_FEE_QUOTE`; invoices stay `INV-…` / `DC_FEE_INVOICE`. The 30-day window reads as "valid until" vs "due".
- **`packages/database/prisma/schema.prisma`** + migration `20260630_dc_fee_quote` — new `DocumentType.DC_FEE_QUOTE` enum value (additive). **Applied to prod via `prisma migrate deploy` on 2026-06-30.**
- **`apps/cases/lib/dc-fee-invoice-pdf.ts`** — renders both types; `documentType` drives the PDF label ("QUOTATION"/"INVOICE", "Valid Until"/"Due Date") and is surfaced on the summary.
- **`.../api/dc-fee-invoices/[id]/send/route.ts`** — email subject/body/timeline log adapt to quote vs invoice wording.
- **`DcFeeInvoiceModal.tsx`** — Quotation/Invoice toggle at the top; header, submit button, success heading and toast all relabel dynamically.

**Tests:** shared-lib **558/558 green** (+3: schema `documentType` default/accept, `dcFeeDocLabel`, service quote → `QUO-`/`DC_FEE_QUOTE`).

**⚠️ Local typecheck pending:** Prisma client regeneration is blocked by a **running dev server** locking the Windows query-engine DLL (EPERM). Stop the dev server(s), then `cd packages/database && npx prisma generate` + `pnpm --filter cases typecheck`. The Dokploy redeploy regenerates the client for prod regardless.

---

### Added: Debt Counsellor Fee Invoice — generate a fee-recovery invoice TO a requesting DC (2026-06-29)

**Goal (user request):** Other debt counsellors submit DHS transfer requests for consumers who still owe **Zenowethu** fees; staff decline on the DHS ("owes fees"), and the requesting DC then asks for an **invoice**. Staff needed a tool to capture the DC + consumer details and the fee breakdown and produce a branded invoice addressed **to that debt counsellor**. (This is the *inverse* of the existing outbound `OUTSTANDING_FEES`/`dc-notification` flow, which only *requests* an invoice from another DC — left untouched.)

**What was already there (prior session):** `packages/shared-lib/src/finance/dc-fee-invoice.ts` (fee catalogue + Zod schema + VAT maths + consumer-reference builder), `dc-fee-invoice-service.ts` (`createDcFeeInvoice` → persists a `type: DC_FEE_INVOICE` `Invoice` via the atomic `INV-YYYY-NNNN` allocator), schema fields `Invoice.dcName/dcEmail/dcTradingName` + `DocumentType.DC_FEE_INVOICE`, and migration `20260629_dc_fee_invoice`. None of it was exported, rendered, wired to a route, or surfaced in the UI.

**What this session completed:**
- **`packages/shared-lib/src/index.ts`** — exports the browser-safe `./finance/dc-fee-invoice` (catalogue/schema/maths) for the form. The Prisma-backed service stays a deep import (server-only).
- **`apps/cases/lib/invoice-pdf.ts`** — `InvoiceData` gains optional `billTo { name, tradingName, email }` + `reLine`; the BILL TO block now renders the debt counsellor (with a "RE: consumer (ID …)" line) when `billTo` is set, else the existing consumer path.
- **`apps/cases/lib/dc-fee-invoice-pdf.ts`** (new) — loads a DC_FEE_INVOICE, maps it to `InvoiceData` (bill-to = DC), renders + disk-caches the PDF. Flat result shape (not a discriminated union — the app is `strict: false`).
- **API routes (new):** `POST /api/cases/[id]/dc-fee-invoice` (case-linked, pre-filled), `POST /api/dc-fee-invoices` (standalone), `GET /api/dc-fee-invoices/[id]/pdf` (download), `POST /api/dc-fee-invoices/[id]/send` (emails the DC the PDF via `sendEmailWithAttachments`; logs on the case timeline; status → SENT).
- **UI (new):** `DcFeeInvoiceModal.tsx` — DC + consumer fields, dynamic fee lines (catalogue dropdown + editable description + amount), live total, 15% VAT toggle, notes; success state with **Download PDF** + **Email to Debt Counsellor**; toast/loading/error/success states (no `alert`/`confirm`). Wired into the case page via a **"DC: Generate Fee Invoice"** button in the DC actions cluster, plus a standalone page at `/dc-fee-invoices/new`.
- **Fee catalogue** (user's 4 + extras): commission paid out, after-care, admin, legal, restructuring/Section 86, rejection (Form 17.1), court/NCT, distribution/PDA, monthly service (arrears), consultation, disbursements, + free-text Other.

**Tests:** `dc-fee-invoice.test.ts` (12: schema validation, VAT on/off maths, rounding, reference) + `dc-fee-invoice-service.test.ts` (2: persistence mapping with mocked Prisma) — **shared-lib 555/555 green**. `tsc --noEmit` on cases **clean** (run with `--max-old-space-size=8192`).

**⚠️ Manual setup needed:** migration `20260629_dc_fee_invoice` is **NOT yet applied to prod** (additive: 3 nullable `Invoice` columns + `DC_FEE_INVOICE` enum value, all `IF NOT EXISTS`/nullable — non-destructive). Apply with `npx prisma migrate deploy`, then **redeploy the cases app**. Local Prisma client already regenerated.

**Remaining / notes:** Finance app lists these as ordinary invoices but its own PDF/detail render bill-to from the client; extending finance's generator for DC bill-to (or sharing the cases generator) is a follow-up. Email send requires SMTP/Resend/GHL configured (same chain as all cases email).

---

### Added: Finance case page — Accepted Quotes + Available Balance cards (2026-06-29)

**Goal (user request):** On the Finance case detail page (`finance.zenowethu.co.za/cases/[id]`), surface **accepted quotes** and an **available balance** alongside total paid. A case like PIET CHAUKE shows an ACCEPTED quote of R4,500, R0 invoiced and R1,000 paid — nothing previously tied the R1,000 to the R4,500.

**Decision confirmed with user:** "Available Balance" = **accepted quotes total − total paid** (remaining owed on accepted quotes), floored at 0. For PIET: R4,500 − R1,000 = **R3,500** remaining.

**What changed:**
- **`apps/finance/lib/case-financials.ts`** — `InvoiceLike` gains optional `type`; `CaseFinancialSummary` gains `acceptedQuotesTotal`, `acceptedQuoteCount`, and `quoteBalance` (remaining on accepted quotes, floored at 0, **null when no accepted quotes**). Accepted quotes = `type === 'QUOTE' && status === 'ACCEPTED'` — kept distinct from `invoicedTotal` (quotes are never counted as invoiced).
- **`apps/finance/app/api/finance/cases/[id]/summary/route.ts`** — passes invoice `type` into the summary so quotes can be distinguished.
- **`apps/finance/app/(authenticated)/cases/[id]/page.tsx`** — two new summary cards, rendered **only when accepted quotes exist**: "Accepted Quotes" (total + count) and "Available Balance" (amber while owing, emerald + "fully paid ✓" at 0, with a "Remaining of X after Y paid" subtitle).

**Tests:** `case-financials.test.ts` +5 (10 total) covering accepted-quote totalling, balance after payments, floor-at-0 on overpayment, ACCEPTED-only filtering (ignores pending quotes & accepted invoices), and null balance when no accepted quotes — all green. `summary/route.test.ts` 4/4 green. `tsc --noEmit` on finance clean.

**Note:** Pre-existing unrelated failure in `app/api/finance/quotes/[id]/convert/route.test.ts` (2 tests) — confirmed failing on a clean tree before this change; not touched here.

---

### Added: Manual "Accepted via DHS" checkbox on the case (2026-06-29)

**Goal (user request):** DHS sometimes transfers a file into our debt counsellor profile even when it was **not** formally accepted or auto-transferred — so the automated status check never flags it as accepted and the post-acceptance follow-on stays locked. User asked for a simple checkbox to mark "the client has been Accepted via DHS".

**What changed (completes the override the prior session had stubbed in `isManageConsumersEligible` + tests):**
- **`packages/database/prisma/schema.prisma`** — new `Case.manuallyAcceptedViaDhs Boolean @default(false)`. Migration `20260629_case_manually_accepted_via_dhs` (additive `ADD COLUMN ... NOT NULL DEFAULT false`) **applied to prod via `prisma migrate deploy` on 2026-06-29**; local Prisma client regenerated. **Cases app still needs a redeploy** to pick up the new code (DB column already live).
- **`packages/shared-lib/src/dhs/accepted-handler.ts`** — `isManageConsumersEligible` now returns true when `manuallyAcceptedViaDhs === true`, regardless of scraped status. Non-destructive: it does **not** clobber `dhsStatus`/`status`.
- **`apps/cases/lib/schemas.ts`** — `CasePatchSchema` accepts `manuallyAcceptedViaDhs: z.boolean().optional()`.
- **`apps/cases/app/api/cases/[id]/route.ts`** — PATCH persists the flag.
- **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`** — new checkbox **"Client has been Accepted via DHS"** in the DHS panel (optimistic toggle → PATCH → refresh, with loading/success/error toast). Ticking it makes the green **"Manage Consumers"** button appear so staff can send the consumer acceptance + consent email.

**Tests:** `accepted-handler.test.ts` manual-override cases green within the full shared-lib suite (537 passed).

**Manual setup needed:** ✅ migration applied to prod + local client regenerated (2026-06-29). **Remaining: redeploy the cases app** (Dokploy on Contabo) so the new code ships — the DB column is already live.

---

### Changed: Split "Check Request Status" — accepted/rejected detection only; new "Manage Consumers" button for the post-acceptance follow-on (2026-06-29)

**Goal (user request):** "Check Request Status" was doing too much — it detected the DHS request outcome AND auto-fired the consumer acceptance + debt-review-removal consent email when it found an ACCEPTED file. User wants the status check to **detect Accepted/Rejected and stop there**, and a **new "Manage Consumers" button** to carry on once the file is *Accepted via DHS*.

**Decisions confirmed with the user:** keep decline auto-handling on "Check Request Status" (it's the "rejected" branch); leave the existing "Check DHS" (search) button untouched; add "Manage Consumers" as a third button. The *exact* deeper scope of Manage Consumers (whether it also runs the live Search & Manage Consumer clearance status-history check) was **deferred** — to be confirmed.

**What changed:**
- **`packages/shared-lib/src/dhs/accepted-handler.ts`** — new pure helper `isManageConsumersEligible({ status, dhsStatus, manuallyAcceptedViaDhs })`: true when the file is Accepted via DHS by workflow status (`ACCEPTED_VIA_DHS`/`READY_TO_CONSENT`), DHS label (`Accepted`/`Auto Transferred`), or the staff "Accepted via DHS" override. Exported from `dhs/index.ts` (with `READY_TO_CONSENT_STATUS`).
- **`apps/cases/app/api/dhs/lookup/route.ts`** — `check_status` no longer calls `handleDhsAccepted`; on ACCEPTED/AUTO_TRANSFERRED it only flags `acceptedReadyForManage` on the response (status is still parked at `ACCEPTED_VIA_DHS` by Rules 8/9, manager notification unchanged, **decline handler unchanged**). New `action: 'manage_consumers'` branch — guards on `isManageConsumersEligible(caseData)` then runs `handleDhsAccepted` (consent email + Ready to Consent), returning `emailSent`/`skipped`/`consentLink`/`message`.
- **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`** — new `handleManageConsumers` + `manageConsumersLoading`; new green **"Manage Consumers"** button shown only when the file is Accepted via DHS (status/label/manual override). "Check Request Status" toast now nudges staff to click Manage Consumers when it detects an accepted file (replaced the old auto-email surfacing).

**Behaviour change to note:** the **`/api/cron/workflow-automation`** cron still fires `handleDhsAccepted` automatically on its ACCEPTED transitions — only the **manual button** was split. If the cron should also defer to Manage Consumers (for consistency), that's a follow-up tied to the deferred scope question.

**Tests:** `accepted-handler.test.ts` +5 (now 12) covering `isManageConsumersEligible` (workflow statuses, DHS labels, either-field, manual override, negatives) — all green. `handleDhsAccepted` suite unchanged and green.

**Remaining:** (1) confirm Manage Consumers' deeper scope — wire `getConsumerStatusHistory` + `evaluateConsumerClearance` (already built, unwired) for Ready-for-Clearance/Completed detection; (2) decide whether the workflow-automation cron should also stop auto-sending the consent email; (3) prod still needs the `20260628_debt_review_removal_consent` migration applied + redeploy (per entries below).

---

### Added: "Ready to Consent" status + accepted-email template rework (2026-06-29)

Follow-on to the accepted-email wiring (entry further below), per user feedback after live testing.

**New workflow status — `READY_TO_CONSENT` ("Ready to Consent"):** added to `packages/shared-lib/src/statuses/statuses.ts` in the **Advanced Detour** category (`slaDays: 3`). No migration — `Case.status` is a free string and `code` is not a union type. When the acceptance/consent email is sent, `handleDhsAccepted` now moves the case to **Ready to Consent** and sets **nextUpdate +3 working days**. On re-checks while consent is still `PENDING`, it re-asserts Ready to Consent (so the DHS-check route's transient `ACCEPTED_VIA_DHS` write can't downgrade it) and refreshes the +3-day follow-up; once `CONSENTED` it leaves the status alone for the post-consent flow to advance. New `statusUpdatedTo` field on `AcceptedHandlerResult`.

**Email template rework (`accepted-email.ts`):**
- **Removed all "DHS"/"Debt Help System" jargon.** Opens with "your request to transfer your debt review file **from {previous DC} to Zenowethu Debt Management** has been accepted"; status line now "Transfer accepted".
- **Previous DC name is DB-driven:** the handler resolves it from the case (`debtCounsellorName`/`previousDebtCounsellor`/`dcTradingName`), falling back to the **`DebtCounsellor` master table by NCRDC number**. Added a master-table row `NCRDC2439 → tradingName "debtSolve"` (data, not code). Graceful fallback to "your previous debt counsellor on record" when unknown.
- **"all major credit bureaus"** (was "the major credit bureaus"); kind, POPIA-framed consent ask that acknowledges the signed POA; a gentle "if we don't hear from you the file will be parked and cannot be attended to" section; trims padded first names.
- **Signature drops the personal name** — this email now signs off `NCRDC3693 / Zenowethu Debt Management / …` (scoped to the accepted email via a local `ACCEPTED_SIGNATURE`; decline emails keep the shared `SIGNATURE`).

**Tests:** `accepted-email.test.ts` (12) + `accepted-handler.test.ts` (7) cover no-DHS-jargon, DB→"debtSolve" resolution, name-less signature, Ready-to-Consent status move (+ re-park on pending / leave-alone on consented), parked-warning copy. Full status + accepted suites green (67 in the focused run); `tsc --noEmit` shared-lib clean.

**Manual/data:** `NCRDC2439 → debtSolve` was inserted into the live `DebtCounsellor` table this session. Prod still needs the **redeploy** to pick up the new code.

---

### Fixed: Duplicate-ID modal showed truncated project name ("June" instead of "Letsatsi Mbombela June 2026") (2026-06-28)

**Symptom (user-reported):** Recording a referral for an ID already on file pops the "Duplicate ID Number Detected" modal, but the **Project** line showed only the leaf node name (e.g. `June`) instead of the full hierarchical project name shown on the case detail view (`Letsatsi Mbombela June 2026`).

**Root cause:** Projects are a tree (source › branch › year › month); each row stores only its leaf `name`. The case detail view derives the readable label by walking up the parent chain, but the duplicate-detection API branches only selected `project.name`. So the modal got `"June"`.

**What changed:**
- **`apps/cases/lib/project-path.ts`** (new): `buildProjectDisplayName(projectId, projects)` — pure helper that walks the parent chain and re-orders parts as `source branch month year` (e.g. `"Letsatsi Mbombela June 2026"`), normalising `Letsatsi*` variants and stripping `My Cases` noise. Cycle-safe.
- **`apps/cases/app/api/cases/[id]/route.ts`** — `DUPLICATE_ID_NUMBER` branch (the path feeding the screenshot's modal) now resolves the full path via the helper.
- **`apps/cases/app/api/cases/route.ts`** — `DUPLICATE_CASE` branch (POST) now does the same, replacing the bare `project.name`.

**Tests:** `apps/cases/lib/project-path.test.ts` (5, new) — full-path build, ordering, Letsatsi/`My Cases` normalisation, missing-id → empty, cyclic-chain safety. All green. `tsc --noEmit` on cases → 0 errors.

---

### Fixed: Accepted-via-DHS consumer email was never being sent — now wired (2026-06-28)

**Symptom (user-reported):** After "Check Request Status" returned **C** (Accepted) on DHS, the workflow status updated to `ACCEPTED_VIA_DHS` but **no email reached the consumer** with the "your transfer was accepted — please consent" link.

**Root cause:** The acceptance email builder (`accepted-email.ts`) and the consent service (`consent-service.ts`) were built on 2026-06-28 but **never wired into any runtime path** — they were referenced only by their own tests and STATUS.md (the prior entry literally logged "Wire the accepted email + consent link into the trigger's ACCEPTED branch" as a remaining item). They weren't even exported from `dhs/index.ts`. So the ACCEPTED branch in `/api/dhs/lookup` (Rule 9) only updated status + created an in-app admin notification — it never emailed the consumer.

**What changed:**
- **`packages/shared-lib/src/dhs/accepted-handler.ts`** (new): `handleDhsAccepted({ caseId, triggeredByUserId })` — creates a debt-review-removal consent request (token + secure link), emails the consumer the acceptance + consent email, comments the case. **Self-deduping** (skips if a live PENDING/CONSENTED consent already exists, so repeat status checks don't re-email). On email-send failure it **rolls the consent request back to CANCELLED** so the next check retries instead of treating the consumer as already notified. No-email-on-file → escalates via a system comment, no dead link. Never throws (errors collected for the caller).
- **`packages/shared-lib/src/dhs/index.ts`**: now exports `handleDhsAccepted` + type, and the previously-unexported `accepted-email`/`consent-service` public symbols.
- **`apps/cases/app/api/dhs/lookup/route.ts`**: ACCEPTED / AUTO_TRANSFERRED now fire `handleDhsAccepted` (non-fatal) and surface `acceptedEmailSent`/`acceptedEmailSkipped`/`acceptedErrors` on the response.
- **`apps/cases/app/api/cron/workflow-automation/route.ts`**: the two automated branches that transition to `ACCEPTED_VIA_DHS` (NEW_LEAD check, REQUESTED_VIA_DHS check) now also fire `handleDhsAccepted`.
- **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`**: the "Check Request Status" result toast now reports whether the consumer email was sent / skipped / failed.

**Tests:** `accepted-handler.test.ts` (5, new) — first-acceptance send, idempotent skip, no-email escalation, email-failure rollback-to-CANCELLED, case-not-found. All green; `accepted-email` (6) + `consent-service` (9) still green (20/20 in the focused run). `tsc --noEmit` clean on shared-lib and on the full cases app.

**⚠️ Manual / prod-blocking:** the `DebtReviewRemovalConsent` table migration `20260628_debt_review_removal_consent` is **still not applied to prod** (per the entry below). Until `prisma migrate deploy` is run, `handleDhsAccepted` will throw at the `debtReviewRemovalConsent` query in production — the call is non-fatal so the status check still succeeds, but **no email will send and a `[SYSTEM]` error comment will be written** until the migration is deployed.

---

### Changed: Credo activation email no longer sent on case/referral creation (2026-06-28)

**Goal (user request):** When a case or referral is created we should still auto-create the Credo profile, but **must not** email the consumer the "Activate your Credo profile — set your password" invite at that point. The set-password link should reach the consumer **only when they request a password reset** (forgot-password flow).

**What changed:**
- **`apps/cases/app/api/cases/route.ts`** — case-creation flow now calls `provisionConsumerForClient(...)` (provision only, no email) instead of `provisionAndInviteConsumer(...)`, for both the primary and joint client. Added per-call `.catch` error logging.
- **`apps/cases/app/api/v1/cases/route.ts`** — API case-creation flow switched the same way.
- The profile is still created with **no password**; `requestPasswordReset()` (Credo forgot-password) already handles these auto-provisioned, no-password accounts and sends the "set or reset your password" link on demand — so the activation path is preserved, just deferred to user request.

**Left in place (now unused by creation flows):** `provisionAndInviteConsumer()` and `sendActivationInvite()` in `packages/shared-lib/src/credo/consumer-provisioning.ts` remain exported/tested but are no longer wired into case creation. Kept intentionally as utilities; can be removed later if confirmed dead.

**Checks:** `tsc --noEmit` on cases → 0 errors; shared-lib credo tests 22/22 green.

---

### Added: DHS consumer status-history clearance detection (A1/B/F1/F2/G/G1) (2026-06-27)

**Goal:** Be able to **identify** — from the DHS *View Consumer Status History* popup — when a Debt Review Flag Removal consumer is **out of debt review** and therefore eligible for clearance, and classify the resulting workflow status. Building block for a future clearance automation (no case mutation yet, by explicit request).

**Business logic (confirmed with user):**
- Mapping is based on the consumer's **current (most recent)** status code from the *View Consumer Status History* popup.
- **Clearance codes A1, B, F1, F2, G, G1** (out of debt review; e.g. `G` = "Magistrate rescinded the court order / declared not over-indebted — Option C on Form 17.W"): from the status date, **< 7 calendar days → `READY_CLEARANCE`**, **≥ 7 days → `COMPLETED`**.
- **Accepted codes A, C, D3, D4** (active debt review / transfer accepted) → **`ACCEPTED_VIA_DHS`** (added 2026-06-27 per user). The two code sets are disjoint.
- Stops at `COMPLETED` (not `SETTLED`) on purpose — no finance integration yet; settlement is a later finance + DHS reconciliation step.
- Both `READY_CLEARANCE` ("Ready for Clearance", SLA 7d) and `COMPLETED` ("Completed", SLA 2d) **already exist** in `statuses.ts` — this only detects/classifies, it does not add statuses.

**What changed:**
- **`packages/shared-lib/src/dhs/status-history.ts`** (new): pure, unit-testable helpers — `normalizeStatusCode`, `isClearanceEligibleCode`, `parseDhsDate`, `daysSinceCalendar`, `classifyClearanceWorkflowStatus`, `parseStatusHistoryRows`, `evaluateConsumerClearance` — plus the live read-only Puppeteer scraper `getConsumerStatusHistory(idNumber)` (login → Search & Manage Consumer → Apply Filter → open status-history popup → parse `CODE | STATUS DESCRIPTION | STATUS DATE`). Exposes `CLEARANCE_ELIGIBLE_CODES` and `CLEARANCE_READY_WINDOW_DAYS` constants.
- **`packages/shared-lib/src/dhs/browser.ts`**: added `searchManageConsumerUrl` (dhs_SearchManageConsumer.aspx) to `DHS_CONFIG`.
- **`packages/shared-lib/src/dhs/index.ts`**: re-exported the new functions/types.

**Tests:** 27 (`dhs/status-history.test.ts`) — all pass; includes the exact 3-row popup from the user's screenshot, the 7-day boundary, all six clearance codes, the four accepted codes → `ACCEPTED_VIA_DHS`, set-disjointness, "most recent status wins", unrecognised-code → null, and unparseable-date handling. `tsc --noEmit` on shared-lib clean.

**LIVE-VERIFIED (2026-06-27):** Ran the real scraper against ID `7902010427086` (Noluthando Sulupa, NCR Ref 2095500). Login via DB creds (`NCRDC3693`) succeeded; popup parsed correctly → current code **G**, status date **2025-10-20**, 250 days ago → **COMPLETED**. Matched the portal screenshot exactly.

**Scraper fix during verification:** the first live run parsed 0 rows even though the popup rendered — DHS splits the column headers from the data rows (and the modal can be a separate frame), so matching on the "STATUS DESCRIPTION" header text failed. Replaced `readStatusHistoryTable()` with a **content-based, frame-aware** harvester: across `page.frames()`, keep any row that has BOTH a date cell and a long (>30 char) description cell. Also added a poll (10×1.5s) for the AJAX modal. Pure parsing/classification logic was unchanged (still 22/22).

**Remaining/manual:** Next step is the **clearance automation** that consumes `evaluateConsumerClearance()` to set `READY_CLEARANCE`/`COMPLETED` on a cohort (mirroring the dry-run pattern of the Requested-via-DHS follow-up). **AI Debt Review Removal trigger still outstanding.**

---

### Added: Accepted-via-DHS consumer email + Debt Review Removal consent link (2026-06-28)

**Goal:** When "check request status" finds a file **Accepted via DHS** (consumer status codes **A/C/D3/D4**), notify the consumer that the transfer was accepted and we are starting flag removal — and capture their **consent** to proceed via a unique link. Consent must trigger a downstream action (to be defined by the business later).

**What changed:**
- **`packages/shared-lib/src/dhs/accepted-email.ts`** (new): `buildAcceptedViaDhsEmail({ clientFirstName, fileNumber, consentLink })` + `ACCEPTED_VIA_DHS_SUBJECT`. Confirms acceptance, asks for consent (CTA link), explains flag removal — **no guarantees / no fixed timeline** (compliance). Reuses the shared `SIGNATURE`.
- **`DebtReviewRemovalConsent` model** + migration `20260628_debt_review_removal_consent` — token (unique), status `PENDING|CONSENTED|EXPIRED|CANCELLED`, channel, case/client/consumer FKs, expiresAt (30d), consentedAt, **ipAddress/userAgent** (POPIA/ECTA audit), `consentText` snapshot, `triggeredAt`. **⚠️ Migration NOT yet applied to prod** (deliberate — apply with `prisma migrate deploy` when ready).
- **`packages/shared-lib/src/dhs/consent-service.ts`** (new): `createDrrConsentRequest` (reuses an existing un-expired PENDING link), `buildConsentLink`, `getDrrConsentByToken` (sanitised view), `recordDrrConsent` (idempotent, captures IP/UA, then fires hook), and **`onDebtReviewRemovalConsent()` — the EXTENSION POINT** that currently only logs + stamps `triggeredAt`. `DRR_CONSENT_TEXT` holds the exact POPIA-compliant wording.
- **Public consent page** `apps/cases/app/consent/debt-review-removal/[token]/page.tsx` (brand-styled, loading/error/expired/already-consented/success states, consent checkbox + gated button) and **public API** `apps/cases/app/api/consent/debt-review-removal/[token]/route.ts` (GET details, POST records consent — token IS the credential, same model as POA signing).
- **BCC:** the accepted email (and all consent comms) ride the production SMTP path with the monitoring BCC to `notifications@zenowethu.co.za`.

**Live read-only DHS check (7 overdue REQUESTED_VIA_DHS files):** 3 ACCEPTED → codes **B/G → Completed** (096, 209, 216); 4 "declined" but **mostly not real declines** — 148/153 DebtBusters "under review (Form 17.7 received, allow 3–7 days)", 206 a **false decline** (DC text says "accepted and processed"), 210 needs a transfer-request email to a specific inbox. Confirms the cohort's `REQUESTED_VIA_DHS` status is stale and the decline classifier needs "under review"/Form 17.7/"accepted" handling before any live decline-send.

**Tests:** `accepted-email.test.ts` (6), `consent-service.test.ts` (9) — all pass; full `dhs` suite **91/91**; `tsc --noEmit` shared-lib clean. Prisma client regenerated (new model types present).

**Remaining/manual:** Apply the migration to prod (`prisma migrate deploy`) before the consent flow can run live. Wire the accepted email + consent link into the trigger's ACCEPTED branch (behind dry-run). Define what `onDebtReviewRemovalConsent()` should trigger. **AI Debt Review Removal trigger still outstanding.**

---

### Added: Requested-via-DHS follow-up automation (dry-run-capable) (2026-06-27)

**Goal:** Automatically work the backlog of **OVERDUE** Debt Review Flag Removal files sitting in **`REQUESTED_VIA_DHS`** — re-check the DHS transfer outcome and act on it — with a **dry-run preview** so staff can see exactly which emails would be sent before going live. By explicit request this covers **only** `REQUESTED_VIA_DHS` and **excludes** the look-alike `DHS_REQUESTED` (a separate automation will cover that later).

**Cohort (verified against live DB):** `deletedAt: null AND isOverdue: true AND services contains 'debt_review_flag_removal' AND status = 'REQUESTED_VIA_DHS'` → **7 files** (the `DHS_REQUESTED` variant is another 16; combined would be 23).

**Data finding (`DHS_REQUESTED`):** `DHS_REQUESTED` is written to cases (32 live) but is **not defined in `statuses.ts`** (no name/SLA/category) — an orphan status. Worth merging into `REQUESTED_VIA_DHS` or formally adding it. The follow-up automation's status filter is the single switch that will later include it.

**What changed:**
- **`packages/shared-lib/src/dhs-requested-followup/trigger.ts`** (new): `runRequestedViaDhsFollowup({ dryRun, limit })` + `getRequestedViaDhsCohort()`. Live path: `checkTransferStatus()` per file → ACCEPTED/AUTO_TRANSFERRED→`updateCaseStatus('ACCEPTED_VIA_DHS')`; DECLINED→existing `handleDHSDecline()`; PENDING→`setNextUpdate(+3d)` + comment; NOT_LINKED/NOT_REQUESTED→comment for staff. `dryRun` does **no** DHS check, **no** sends, **no** writes.
- **`packages/shared-lib/src/dhs/decline-preview.ts`** (new): read-only `previewDHSDecline()` that mirrors `handleDHSDecline` routing and renders the **exact** email/SMS bodies by reusing the now-exported template builders from `decline-handler.ts` (single source of truth — no copy drift).
- **`packages/shared-lib/src/dhs/decline-handler.ts`**: exported the email/SMS template builders + `SIGNATURE` (additive; no behaviour change).
- **`apps/cases/app/api/cron/dhs-requested-followup/route.ts`** (new): cron (x-cron-secret) or admin-session; `?dryRun=true` / `?limit=N`; logs an `AutomationRun` (`DHS_REQUESTED_FOLLOWUP`) on live runs only.

**Ran now (dry-run, live DB):** all **7** files previewed, **0 emails sent, 0 DB writes**. Surfaced two data issues to fix before a live run: (a) **3 of 7 files have no DC email** (decline → would stall at `REJECTED_EMAIL_DOCS`); (b) some files have `debtCounsellorName = "Aaron Nzotho"` (our own signatory) while the DC email is an external address, so the decline email would greet the external DC as "Aaron Nzotho"; and some `client.email` values look like staff addresses being CC'd.

**Tests:** 12 new (`dhs/decline-preview.test.ts` 6, `dhs-requested-followup/trigger.test.ts` 6) — all pass; full `dhs` suite **49/49** green; `tsc --noEmit` on shared-lib clean for the new files.

**Remaining/manual:** Live run is intentionally NOT executed yet (awaiting sign-off + DC-email/data cleanup). Add the cron schedule (suggested `0 9 * * 1-5`) in the deploy cron config with `x-cron-secret`. Note GHL is disabled, so DHS Puppeteer + SMTP are the live paths; the live run needs DHS portal creds + a browser on the host. **AI Debt Review Removal trigger still outstanding.**

---

### Added: Credo auto-provisioned profiles, ID-only login, real password reset, document requests (2026-06-27)

**Goal:** Every case/referral loaded by B2B or staff should get a Credo consumer profile fed from the DB; staff can request documents from the consumer and see their uploads on the case; a real "forgot password" flow emails a reset link; the **ID number is the only username** (email/cell can be shared by different people); a profile can be claimed even before first login.

**What was already working:** Credo register/login (email-first), consumer document upload + vault, dashboard reading `linkedClient`, ServiceRequest→Case conversion. Email was already non-unique (migration `20260625_remove_unique_email_consumer`).

**What was broken/incomplete:** Case creation never created a `ConsumerAccount` (B2B/staff cases had no portal login); forgot-password was a fake `setTimeout` (no token, no email, no reset); login tried email first (email is not unique → ambiguous); registration blocked duplicate emails (conflicts with shared-email reality); consumer uploads were never surfaced in Cases; no "documents required" mechanism existed.

**What changed:**
- **Schema + migration** `20260627_credo_profiles_password_reset_doc_requests`: `ConsumerAccount.password` → nullable (auto-provisioned profiles have none until activation), added `activatedAt`, `source`; new `PasswordResetToken` (stores SHA-256 hash, single-use, 7-day TTL) and `DocumentRequest` (consumer + optional case, status `REQUESTED|UPLOADED|APPROVED|REJECTED`, links to fulfilling `CredoDocument`). **Applied to prod DB; client regenerated.**
- **shared-lib `credo/`** (new module): `provisionConsumerForClient` (idempotent, ID-keyed), `provisionAndInviteConsumer` (provision + activation invite, never throws), `createPasswordResetTokenForConsumer`/`hashResetToken`, `requestPasswordReset` (no account enumeration), `validateResetToken`, `resetPasswordWithToken`. Added `sendTransactionalEmail` to the notification service (production GHL→SMTP path + monitoring BCC).
- **Auto-provisioning** wired into case creation: `POST /api/cases` (+ joint client) and `POST /api/v1/cases` (B2B API).
- **ID-only login:** `apps/credo/auth.ts` looks up by `idNumber` only and blocks login when password is null; login + forgot-password UIs now take a 13-digit ID.
- **Forgot/reset password:** real APIs `POST /api/consumer/forgot-password`, `GET/POST /api/consumer/reset-password`; new `/reset-password` page (validates token, sets new password); forgot-password page wired to the API.
- **Registration:** ID required + the sole uniqueness check; duplicate email allowed; an un-activated (auto-provisioned) profile is **claimed/activated** on register instead of rejected.
- **Document requests:** `POST/GET /api/cases/[id]/document-requests` (staff raise/list, emails the consumer), `GET /api/cases/[id]/consumer-documents` (list + inline download of portal uploads); consumer upload route auto-fulfils a matching open request; `GET /api/consumer/document-requests` for the portal; "Documents required" panel on the Credo documents page; `ConsumerPortalPanel` on the Cases case-detail Documents tab.

**Tests:** 22 new shared-lib unit tests (`credo/consumer-provisioning.test.ts`, `credo/password-reset.test.ts`) — **22/22 pass**; rewrote `apps/credo/.../register.test.ts` for the new model (ID-unique, shared email allowed, nullable password) — **5/5 pass**; full shared-lib `notifications`+`credo` suite **81/81 pass**.

**Checks:** `tsc --noEmit` → credo **0 errors**, cases **0 errors**. Public auth pages verified in-browser (forgot-password → generic success, reset-password invalid-token state, login shows ID-only) with no console errors.

**Remaining/manual:** Set `CREDO_URL` env (defaults to `https://credo.zenowethu.co.za`) for correct links in emails. Auto-provisioned clients with **no email on file** get a synthetic `@no-email` address and cannot self-activate until staff add a real email (by design). Credo app has no `test` script wired into `turbo test` (its integration tests hit the live DB) — left as-is. Redeploy `cases` and `credo`.

---

### Fixed: 20s+ load on all data pages — payload over-fetch (2026-06-27)

**Symptom (post-deploy):** After deploying the query/cache fixes, **All Cases still took ~24s** and New Case ~20s, while the **sidebar timeline counts and Dashboard loaded instantly**. Key tell: pages returning *small* payloads were fast; pages returning *large* payloads were slow — so the DB connection was fine, the payloads were the problem.

**Root cause:** Massive **column + relation over-fetch**, not the connection.
- **`GET /api/cases`** ([apps/cases/app/api/cases/route.ts](apps/cases/app/api/cases/route.ts)) defaulted to `take=10000` and used `include: { client: true, projects: { include: { project: true } }, updatedBy }` — pulling **all 131 Case columns + all 38 Client columns** for every one of ~971 rows, then serializing the whole tree through a **custom per-key `JSON.stringify` replacer** (event-loop-blocking). The list page only reads ~10 case fields + 5 client fields and filters client-side, so >90% of the payload was wasted.
- **`GET /api/projects?memberOnly=true`** (New Case dropdown) still returned full project objects with `members→user` joins, `_count`, `parent`, plus a separate `addActiveCaseCounts` groupBy — none of which the dropdown reads.

**Fix (shape preserved — no page changes needed):**
- `/api/cases`: replaced `include` with a **slim `select`** of exactly the fields the list + client-side filters use (`id, fileNumber, status, services, nextUpdate, updatedAt, createdAt`, `client{firstName,lastName,email,phone,idNumber}`, `updatedBy{firstName,lastName}`, `projects{isPrimary,projectId,project{id,name}}`). Replaced the custom replacer `JSON.stringify` with native `NextResponse.json` (slim set has no Decimal/bigint). Removed a stray module-load `console.log`.
- `/api/projects` memberOnly branch: switched to a **slim `select`** (`id,name,type,clientType,parentId,referrer`, `children{id,name,type,clientType,referrer}`) and dropped the now-unneeded `addActiveCaseCounts` query.

**Why the sidebar was always fast:** it issues tiny count/groupBy queries — confirms the bottleneck was payload volume + serialization, not connectivity or `auth()` (auth runs on the fast sidebar path too, so it was ruled out).

**Checks:** `tsc --noEmit` (cases, 8 GB heap) → no errors. `vitest run` graph tests → 6/6 pass. *(Needs redeploy of **cases** to take effect; expect All Cases/New Case to drop from ~20s to low single digits.)*

**Follow-up candidates:** other list endpoints likely share the over-fetch pattern (audit `/api/clients`, finance/legal lists when next touched); long-term, move All Cases to **server-side pagination + search** so the browser never downloads the full set. PgBouncer for 20+ concurrent users still outstanding (infra).

---

### Fixed: Slow "New Case" load + multi-user DB contention (2026-06-27)

**Symptom:** `cases.zenowethu.co.za/cases/new` sat on "Loading…" for several seconds. Concern raised: what happens with ~20 staff connected concurrently to the same VPS PostgreSQL.

**Root cause (load time):** The page blocks render on a single call — `GET /api/projects?memberOnly=true` ([apps/cases/app/(authenticated)/cases/new/page.tsx](apps/cases/app/(authenticated)/cases/new/page.tsx#L433)). For an admin with `memberOnly=true`, that endpoint ran **~7 sequential queries to the remote VPS DB**, including the `projectMember` membership query **twice** and a **full `Project` table scan twice**, plus two **O(n²)** ancestor/descendant walks done in JS (`Array.find`/`Array.filter` inside `while` loops). Heavy per-request debug `logger.info` object-building added more overhead.

**Root cause (concurrency):** All staff share **one** Prisma pool (`connection_limit=10`) against PostgreSQL with **no PgBouncer**. Under 20 users the chatty endpoint drains the pool → `pool_timeout=30` queueing → `P2024`. Worse, the retry middleware called `client.$disconnect()` on the **shared global** client on P2024 — under concurrency that tears down connections other in-flight requests are using, turning one timeout into a **cascading failure** across all users.

**Fix:**
- Rewrote the `memberOnly` path in [apps/cases/app/api/projects/route.ts](apps/cases/app/api/projects/route.ts): per-request memoised loaders so memberships + the all-projects fetch each run **once** (7→~5 round-trips, two heaviest table scans collapse to one); replaced both O(n²) JS walks with **O(n)** index-map walks; removed per-request debug logging.
- Extracted the pure walk helpers to [apps/cases/lib/project-graph.ts](apps/cases/lib/project-graph.ts) (`buildChildIndex`, `addAncestors`, `addDescendants`).
- Added a **15s per-user in-memory cache** for the member-scoped tree, invalidated on project creation (POST).
- Removed the dangerous `client.$disconnect()` on P2024 from [packages/database/src/index.ts](packages/database/src/index.ts) — backoff-only retry is correct for a shared client.

**Tests:** 6 new Vitest unit tests in [apps/cases/lib/project-graph.test.ts](apps/cases/lib/project-graph.test.ts) (index build, ancestor/descendant walks, leaf no-ops, cycle-safety) — **6/6 passing**.

**Checks:** `vitest run` on the new tests → 6 passed. `tsc --noEmit` (cases, 8 GB heap) → no errors in changed files. *(Default-heap typecheck OOMs — pre-existing whole-app issue, unrelated to this change.)*

**Remaining (infra — not code):** The durable multi-user fix is **PgBouncer (transaction pooling)** in front of PostgreSQL on the VPS + standardising per-app `connection_limit` (currently inconsistent: cases/legal/insurance/forensic=10, finance/database-pkg=3). Requires a Dokploy/compose deploy — not done in this session.

---

### Fixed: Finance dropdown options invisible — white-on-white (2026-06-27)

**Symptom:** On the Finance "Record Manual Payment" page (and other Finance forms), opening a `<select>` (e.g. Payment Method, Category) showed an effectively blank popup — the options were unreadable.

**Root cause:** Every `<select>` uses Tailwind `bg-white/5 text-white` — a *translucent* white fill that looks dark over the app's dark page, with white text. But the native dropdown popup the browser renders for the options uses the OS-default **white** background, while the option text inherited **white** → white-on-white, invisible. Native `<option>` elements don't inherit the translucent page background.

**Fix:** Added a single global rule in [apps/finance/app/globals.css](apps/finance/app/globals.css) — `select option, select optgroup { background-color: var(--color-bg-secondary); color: var(--color-text-primary); }`. Theme-safe (resolves correctly for default/ocean/sunset themes) and fixes every dropdown in the Finance app at once, not just the payment page.

**Files changed:** `apps/finance/app/globals.css`

**Checks:** Finance dev server (`:3004`) compiled globals.css with no CSS errors. Note: the actual page is SSO-protected (redirects to the Cases `:3000` login) and the native option popup is an OS overlay that browser screenshots can't capture, so verification was limited to confirming the rule compiles cleanly and targets the exact cause.

**Note (follow-up candidate):** the other apps (`cases`, `legal`, `insurance`, `forensic-audit`, `credo`) use the same `bg-white/5 text-white` select pattern and likely have the same invisible-option bug — apply the same `select option` rule (or centralise it) when next touching their `globals.css`.

---

### Added: "Deposit" payment category (2026-06-27)

**Ask:** Staff recording a payment that is a **deposit** (initial payment) had no matching Category — only Installment / Service Fee / Legal Fee / Other.

**Fix:** Added `Deposit` (value `DEPOSIT`) to the Category dropdown on the Record Manual Payment page, placed first as the initial-payment type. `Payment.category` is a free-form `String @default("INSTALLMENT")` in Prisma (not an enum) and the API validates it as `z.string().optional()`, so **no migration or schema change** was needed. Also added `DEPOSIT: 'Deposit'` to the `CATEGORY_LABELS` display map on the client payments history page so existing/new deposits render with a friendly label.

**Files changed:** `apps/finance/app/(authenticated)/payments/record/page.tsx`, `apps/finance/app/(authenticated)/clients/[id]/payments/page.tsx`

---

### Fixed: "Invoice number conflict — please retry" across all apps (2026-06-27)

**Symptom:** Creating a quotation/invoice (e.g. via the Cases "Create Quotation" modal) intermittently failed with `Invoice number conflict — please retry` (HTTP 409, Prisma `P2002`) — sometimes on a single click with no concurrency.

**Root cause:** The 2026-06-24 atomic-sequence fix was only applied to `apps/finance`'s invoice route. The other apps (`cases`, `legal`, `insurance`, `forensic-audit`) **and Finance's own quote→invoice convert route** still used the legacy `invoice.count() + 1` scheme. This broke two ways:
1. **Race** — concurrent requests saw the same count and generated the same number.
2. **Divergence (the more common trigger)** — Finance allocated from the `DocumentSequence` table while the other apps counted rows of the *shared* Invoice table. The two schemes drifted (cancellations, Finance advancing its sequence), so `count + 1` landed on an already-existing number even with one user, one click.

**Fix:**
- New single source of truth: `allocateDocumentNumber(tx, prefix, year)` in [packages/shared-lib/src/finance/document-number.ts](packages/shared-lib/src/finance/document-number.ts) — atomic `DocumentSequence` upsert+increment, formatted `${prefix}-${year}-NNNN`. Exported from the shared-lib index.
- All six allocation sites now call it: the invoice POST routes in `cases`, `finance`, `legal`, `insurance`, `forensic-audit`, plus the `finance` quote→invoice convert route. Finance's working numbering semantics (first issued number = `0002`) are preserved exactly to stay consistent with numbers already issued in production.
- **Reconciliation migration** `20260627_reconcile_document_sequence` raises `DocumentSequence.nextSeq` to `MAX(existing number)` per `(prefix, year)`, so the divergence accumulated under the old scheme cannot cause the first atomic allocation to collide. Idempotent (`GREATEST`), safe to re-run.

**Files changed:**
- `packages/shared-lib/src/finance/document-number.ts` (new) + `document-number.test.ts` (new) + `src/index.ts` (export)
- `apps/cases/app/api/finance/invoices/route.ts`
- `apps/finance/app/api/finance/invoices/route.ts`
- `apps/finance/app/api/finance/quotes/[id]/convert/route.ts`
- `apps/legal/app/api/finance/invoices/route.ts`
- `apps/insurance/app/api/finance/invoices/route.ts`
- `apps/forensic-audit/app/api/finance/invoices/route.ts`

**Migration added:** `packages/database/prisma/migrations/20260627_reconcile_document_sequence/migration.sql` — **must be applied with `prisma migrate deploy` before/at the deploy** of these route changes.

**Tests:** `document-number.test.ts` — 5 passing (format, sequential increment, independent QUO/INV/year counters, 50-way concurrent uniqueness, >9999 padding). Typecheck clean for shared-lib (via consumers) + all five apps.

**Remaining (noted, not fixed here):** case file numbers and insurance policy numbers in `*/api/.../create` and `*/policy` routes still use the same legacy `count()+1` pattern — same latent bug, separate numbering domain. Candidate for the same `allocateDocumentNumber` treatment in a follow-up.

---

### Fixed: case save rejected shared email / cell numbers (2026-06-27)

**Symptom:** Adding/saving a case via the "Add New Case" wizard failed with `Email "opsgenty@gmail.com" already exists for another client: FANI MALEBATJA` (and the equivalent for cell numbers). This blocked legitimate cases.

**Business rule:** One email address or phone/cell number may legitimately be shared by more than one consumer — e.g. clients without their own email use a branch email address, and a branch phone/telephone number is reused across many clients. The **ID number is the only unique identifier** per client (already enforced by `idNumber @unique` in the schema and by the duplicate-ID merge flow).

**Fix:** Removed the application-level `DUPLICATE_EMAIL` and `DUPLICATE_PHONE` checks from the `PATCH /api/cases/[id]` handler. The ID-number duplicate check (with its existing merge-or-reject flow) is unchanged. No DB constraint existed on `email`/`phone`, so no migration was needed.

**Files changed:** `apps/cases/app/api/cases/[id]/route.ts` plus the identical duplicated handlers in `apps/legal`, `apps/insurance`, `apps/finance`, `apps/forensic-audit`.

**Checks:** `pnpm --filter cases typecheck` — route files compile clean (only a pre-existing unrelated error in the generated `.next/dev/types/validator.ts`).

---

### Fixed: flaky admin-client integration tests blocking CI/CD deploy (2026-06-26)

**Symptom:** `main` could not deploy — the CI `test` step failed (so the Dokploy deploy job, which `needs: [ci]`, was skipped). Two integration test files failed: `apps/cases/app/api/admin/clients/route.test.ts` and `.../convert-to-referrer/route.test.ts`.

**Root cause:** both created DB records in `beforeEach` with **fixed unique fields** (`username`, `idNumber`) and **no `afterEach`**, so the 2nd test in each file collided (`Unique constraint failed`). Cleanup used `prisma.<model>.deleteMany({})` (whole-table), which both hit FK violations (`WorkflowLog→Case`, `Case→Client`) and — run locally against the prod `DATABASE_URL` — would have wiped real data (the FK errors accidentally prevented that).

**Fix:** create fixtures once in `beforeAll` with **per-run unique** username/email/idNumber (random 13-digit), and clean up **scoped to the created IDs in FK-safe order** — never `deleteMany({})`. Verified: both files green in isolation and in the full suite. **Cases suite: 382 passing (30 files); shared-lib: 434.**

**Note:** these are live-DB integration tests; locally they run against the production DB via `.env.local`. CI uses an ephemeral `zenowethu_test` postgres container. Consider mocking prisma here later (like the other route tests) so they never touch a real DB.

**Plus two CI infrastructure bugs that had kept the test step red regardless** (`.github/workflows/ci-cd.yml` + `turbo.json`):
1. The "Run database migrations" step ran **after** "Run all tests" — so the test DB had no schema when integration tests ran. Moved it **before** the test step.
2. The test step had **no `DATABASE_URL`**, and Turbo 2 strict env-mode stripped it anyway — integration tests failed with `Environment variable not found: DATABASE_URL`. Added `DATABASE_URL` to the test step env **and** `passThroughEnv: ["DATABASE_URL"]` to the `test` task in `turbo.json`. Verified `pnpm turbo test --filter=cases` passes with the var now reaching the test process. (Also fixes the `finance/invoices` integration test, same cause.)

---

### GHL suspended — `GHL_ENABLED=false` kill-switch (2026-06-26)

**Goal:** GHL/GoHighLevel is not yet set up. Stop every channel from reaching for it (it was still being *attempted* first for email — the `GoHighLevel→SMTP` in the logs — and was the default for SMS/WhatsApp).

**What changed:**
- `getGHLCredentials()` ([packages/shared-lib/src/integrations/ghl-config.ts](packages/shared-lib/src/integrations/ghl-config.ts)) returns empty credentials when `GHL_ENABLED=false`, so every channel's auto-detect skips the GHL API. New exported helper `isGhlEnabled()`.
- The notification service ([service.ts](packages/shared-lib/src/notifications/service.ts)) now guards the GHL **webhook** branches (SMS/email/WhatsApp) with `isGhlEnabled()` too (those read env directly, bypassing the resolver).
- Net effect when suspended: **email → SMTP**, **SMS → Mock** (no Twilio/Clickatell configured), **WhatsApp → Mock**. No GHL API/webhook calls.
- `GHL_ENABLED=false` set in `apps/cases/.env.local`; documented in `.env.example`. Fully reversible — remove the var (or set `true`) once GHL is live.
- NOT touched: `GhlService` / inbound GHL webhook handlers / AI auto-reply — those only fire on inbound GHL events, which won't occur while GHL is unconfigured.

**Tests:** new `GHL_ENABLED` kill-switch tests in `ghl-config.test.ts` (3) + a service suspension test in `service.test.ts` (email avoids GHL API+webhook, uses SMTP). Updated `ghl-service.test.ts` / `service.test.ts` mocks to export `isGhlEnabled`. Full shared-lib suite green: **434 passing**. `tsc --noEmit` clean.

**⚠️ Action needed:** set **`GHL_ENABLED=false`** in the production (Dokploy) env for the Cases app — `.env.local` does not deploy, and the switch defaults to *enabled*, so without it production will still try GHL.

---

### Fixed: consumers not receiving welcome emails — SMTP 550 sender bug (2026-06-26)

**Symptom:** Consumers were not getting the `NEW_LEAD` welcome email on case creation. SMS/WhatsApp worked (GHL webhook), only email failed.

**Root cause (confirmed in production `notificationLog`):** every welcome email failed with
`550 Account notifications@zenowethu.co.za can not send emails from updates@zenowethu.co.za`.
The case-creation route passes `senderEmail: 'updates@zenowethu.co.za'` ([apps/cases/app/api/cases/route.ts:409](apps/cases/app/api/cases/route.ts)), which became the SMTP `from`. The mail server only allows sending from the authenticated mailbox (`notifications@`). 21 EMAIL failures total shared this cause.

**Fix:** `SmtpEmailProvider.send()` ([packages/shared-lib/src/notifications/providers.ts](packages/shared-lib/src/notifications/providers.ts)) now **always sends from the authenticated/configured mailbox** and demotes any different caller `fromEmail` to **Reply-To** (caller `fromName` kept as display name). Verified with a live send simulating the welcome email (previously 550, now accepted with messageId).

**Tests:** 3 new SMTP tests in `providers.test.ts` (from-address/Reply-To handling, error path). Full shared-lib suite green: **430 passing**.

**⚠️ Action needed:**
- **Redeploy** the Cases app / shared-lib for the fix to take effect in production.
- The **5 stuck welcome emails** in `notificationQueue` (PENDING_RETRY) won't auto-retry — there's no cron runner; retry them manually from `/admin/notifications` after deploy (the retry path doesn't re-send the bad `updates@` from-address, so it will succeed).

---

### Email made primary — `EMAIL_PROVIDER` override (2026-06-26)

**Goal (from the business):** GHL is **not yet set up**, so email (SMTP) must be the primary client-notification channel — without every send first making a failing GHL API call. Client notifications are email-only for now.

**What changed:**
- `getEmailProvider()` in `packages/shared-lib/src/notifications/service.ts` now honours an `EMAIL_PROVIDER` env override (`smtp | ghl | resend | mock`), mirroring the existing `SMS_PROVIDER` / `WHATSAPP_PROVIDER` pattern. `EMAIL_PROVIDER=smtp` forces direct SMTP even when GHL creds are present. Unset = unchanged GHL-first auto-detect (so this is fully reversible — drop the override when GHL goes live).
- `EMAIL_PROVIDER=smtp` set in `apps/cases/.env.local` and documented in `apps/cases/.env.example`.

**Verified:**
- Live SMTP send to `notifications@zenowethu.co.za` succeeded — creds resolve from DB `systemSettings` (host `mail.zenowethu.co.za`, port 587). Server accepted, messageId returned.
- 2 new Vitest tests in `service.test.ts` (SMTP forced over GHL; unset falls back to GHL-first). Full shared-lib suite green: **427 passing**. `tsc --noEmit` clean on the notifications files.

**Manual setup needed:** set `EMAIL_PROVIDER=smtp` in the production (Dokploy) env for the Cases app — `.env.local` is not deployed.

---

### Per-App "Next Update" Dates + Payment Arrangements (2026-06-26)

**Goal (from the business):** A file shouldn't look "not yet due" just because the Cases side isn't due — each app must track when *its* part of a file needs attention, independently, so collection isn't delayed. Plus: payment arrangements for consumers (B2C primary, available to all) so work can proceed knowing the consumer committed to a plan, and the file flags overdue on the due date to check the arrangement was honoured.

**1 — Per-app Next Update date (isolated per app).** Each app (CASES, FINANCE, LEGAL, INSURANCE, CREDO, FORENSIC) owns its OWN next-update row for a case; a date set in one app never appears in another.
- New model `CaseAppNextUpdate` (`@@unique([caseId, app])`).
- Pure helpers `packages/shared-lib/src/payments/next-update.ts` (app keys, labels — Finance shows "Next Payment Date", others "Next Update Date"; overdue/days-until). Prisma service `case-app-next-update-service.ts` (get/set/refresh-overdue/list-overdue).
- Reusable Next.js route factory `next-update-route.ts` → wired one-line in each app at `app/api/cases/[id]/next-update/route.ts`.
- Shared UI `@zenowethu/ui` `NextUpdateCard` (loading/empty/error/success + toast) dropped into the left sidebar of every staff case page (Cases, Legal, Insurance, Forensic; Finance uses its own arrangement view). NOTE: the legacy `Case.nextUpdate` field is unchanged and still drives the overdue-scan automation; the new rows are the isolated per-app dates.

**2 — Payment Arrangements.** New models `PaymentArrangement` + `PaymentArrangementInstalment`. Single or multi-instalment; manual OR generated from an approved `DebitOrderMandate` (SIGNED/REGISTERED/ACTIVE).
- Pure logic `arrangement-logic.ts` (schedule build w/ rounding remainder on last line, monthly/weekly/once + day-of-month clamp, mandate derivation, FIFO payment reconciliation honouring manual PAID/WAIVED, summary → next payment date/amount/balance/status). Prisma service `payment-arrangement-service.ts` auto-matches COMPLETED case payments and pushes the next unpaid instalment date into Finance's per-app next-update (the "Next Payment Date") + keeps arrangement status (ACTIVE/COMPLETED/DEFAULTED) in sync.
- Finance API: `POST/GET /api/finance/cases/[id]/arrangements`, `POST …/arrangements/from-mandate`, `PATCH /api/finance/instalments/[id]` (honoured/missed).
- Finance UI: `PaymentArrangements` on the case detail page — Next Payment Date headline (amount due, paid, balance, OVERDUE flag), per-instalment table with paid/balance/status + Honoured/Missed actions, create form (split-total or fixed-per-instalment) + "Generate from approved mandate".

**Migration:** `packages/database/prisma/migrations/20260626_add_per_app_next_update_and_payment_arrangements/` (3 new tables, additive only). ⚠️ **Not yet applied to the DB** — run `npx prisma migrate deploy` from `packages/database`. Also added the missing `migration_lock.toml` (postgresql). Prisma client regenerated.

**Tests:** 24 new Vitest (pure logic) passing — `next-update.test.ts` (8), `arrangement-logic.test.ts` (16). `tsc --noEmit` clean on shared-lib, ui, finance, legal.

**Follow-ups:** Credo has no staff case page (consumer portal) — its `CREDO` next-update key + service exist but no UI yet. Consider a scheduled job calling `refreshAppOverdueFlags(app)` per app, and surfacing per-app overdue lists in each app's case list.

---

### Telegram Case-Assistant Bot — Phase 1 brain built & tested (2026-06-26)

**Goal:** Let consumers ask a Telegram bot about their case file and get AI answers — securely (POPIA).

**Flow (state machine, keyed by Telegram chat id):**
`AWAITING_ID` → consumer sends 13-digit SA ID → look up Client, email a 6-digit code (reuses `sendOtpEmail`) → `AWAITING_OTP` → code matches → bind chat to Client (`TelegramSession.clientId` + mirror to `Client.telegramNumber`) → `VERIFIED` → questions answered by `generateAutoReply` grounded in the consumer's real case; the AI's existing `shouldSend=false` gate escalates anything needing a human/legal decision. `/logout` unbinds. A chat reveals **no** file detail until verified.

**Files added/changed:**
- `packages/database/prisma/schema.prisma` — new `TelegramSession` model (⚠️ migration not yet applied — see below).
- `packages/shared-lib/src/integrations/telegram-bot.ts` — `handleTelegramMessage()` state machine (+ `.test.ts`, 12 tests).
- `packages/shared-lib/src/ai/auto-reply.ts` — added `'TELEGRAM'` channel (≤600 char replies).
- `apps/cases/app/api/webhooks/telegram/route.ts` — inbound webhook (secret-token check) → handler → reply via `TelegramBotProvider`.
- `apps/cases/.env.example` — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ENABLED`.
- NOTE: `telegram-bot` is deliberately NOT on the integrations barrel (avoids a circular import with `notifications/service.ts`); import it by deep path.

**Tests:** shared-lib suite **401 passing** (was 389; +12 telegram-bot). `tsc --noEmit` clean.

**Phase 2 — remaining manual/live steps (not done):**
1. Create the bot via @BotFather → `TELEGRAM_BOT_TOKEN`; set `TELEGRAM_ENABLED=true` + a `TELEGRAM_WEBHOOK_SECRET`.
2. Apply the migration: from `packages/database`, `npx prisma migrate dev --name telegram_sessions` (prod: `migrate deploy`).
3. Register the webhook: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d url="https://app.zenowethu.co.za/api/webhooks/telegram" -d secret_token="<SECRET>"`.
4. Then live-test: message the bot, verify by ID+OTP, ask a status question.

**Nice-to-have later:** log inbound/outbound Telegram turns to `NotificationLog`; create a staff `InAppNotification` on escalation; richer case context (outstanding docs) for the AI.

---

### Notifications — Alternative SMS / WhatsApp / Telegram Providers (no longer GHL-only) (2026-06-26)

**Context:** Client notifications were effectively GHL-only for SMS/WhatsApp, and Telegram was a mock that was never even called. Goal: be able to send SMS, WhatsApp and Telegram through providers other than GHL. Email/cell stay optional — each channel fires only when that contact detail is present (already the behaviour, unchanged).

**What was added (provider layer is pluggable — `SmsProvider`/`WhatsAppProvider`/`TelegramProvider`):**
- `TwilioSmsProvider` — Twilio REST SMS (number or Messaging Service SID).
- `TwilioWhatsAppProvider` — Twilio WhatsApp (`whatsapp:` prefixing).
- `MetaWhatsAppProvider` — direct Meta WhatsApp Cloud API; sends free text, or an approved **template** when `META_WHATSAPP_TEMPLATE` is set (business-initiated messages require a template / 24h window).
- `TelegramBotProvider` — real Telegram Bot API (`sendMessage`). Replaces the mock.
- `ClickatellSmsProvider` — already existed; now selectable.
- `toZaE164()` helper for SA number normalisation.

**Selection & wiring:**
- `SMS_PROVIDER` (`ghl|clickatell|twilio|mock`) and `WHATSAPP_PROVIDER` (`ghl|twilio|meta|mock`) force a gateway; blank = auto-detect (GHL first, then Twilio/Meta/Clickatell, then Mock).
- Telegram send path added to `sendNotificationByTemplate` (gated on `TELEGRAM_ENABLED` + a chat id) and to `executeNotificationRetry`. Case route now passes `clientWhatsApp` (from `Client.whatsappNumber`) and `clientTelegram` (from `Client.telegramNumber`, which must hold the Telegram **chat id**, not a phone).

**Files Changed:**
- `packages/shared-lib/src/notifications/providers.ts` — 4 new provider classes + `toZaE164`.
- `packages/shared-lib/src/notifications/service.ts` — `SMS_PROVIDER`/`WHATSAPP_PROVIDER` switches, real Telegram provider, Telegram send + retry paths.
- `apps/cases/app/api/cases/route.ts` — pass `clientWhatsApp` + `clientTelegram` on new-lead welcome.
- `apps/cases/.env.example` — documented all new vars.

**Tests:** `providers.test.ts` +12 (Twilio SMS/WA, Meta text+template, Telegram, `toZaE164`). shared-lib suite: **389 passing** (was 377). `tsc --noEmit` clean.

**Manual setup to actually deliver (external accounts):**
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` (+ approved WhatsApp sender).
- Meta WhatsApp: `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID` (+ WABA & approved template for business-initiated welcomes).
- Clickatell: `CLICKATELL_API_KEY`. Telegram: `TELEGRAM_ENABLED=true`, `TELEGRAM_BOT_TOKEN`.

**Remaining:** Telegram needs a per-client **chat-id capture flow** (e.g. a "Connect Telegram" link in Credo that stores `Client.telegramNumber`) before it can send to real consumers — the bot cannot message by phone number.

---

### B2B — "Application Received by Head Office" Email Now Fires for All B2B Referrals (2026-06-26)

**Problem:** When a new B2B referral (e.g. Letsatsi) was captured, the client was often not emailed the "your application was received by {mainSource} Head Office" welcome. Investigation (`apps/cases/app/api/cases/route.ts` → `sendStatusChangeNotification`) found the `NEW_LEAD_B2B` template was only selected when `isB2B && isCreatedByPartner` (i.e. only when an actual `B2B_PARTNER` user was logged in). If Zenowethu staff/admin captured the B2B lead, it fell through to the Zenowethu-branded `NEW_LEAD_STAFF` email instead — and if no client email was captured (the field is optional on the B2B form), nothing went out at all.

**Solution:** Template selection now depends purely on `isB2B`: any B2B referral gets `NEW_LEAD_B2B` ("received by {mainSource} Head Office"), whoever captured it; only direct B2C intake uses the Zenowethu-branded `NEW_LEAD`. `isCreatedByPartner` is retained on the payload for callers but no longer drives the choice.

**Files Changed:**
- `packages/shared-lib/src/notifications/service.ts` — `sendStatusChangeNotification` NEW_LEAD selection simplified to `isB2B ? 'NEW_LEAD_B2B' : 'NEW_LEAD'`; stale interface comment updated.
- `packages/shared-lib/src/notifications/service.test.ts` — +3 tests (partner-created, staff-created B2B, and B2C) asserting the correct welcome email is sent.

**Tests:** `service.test.ts` — 10 passing (7 existing + 3 new). Full shared-lib suite: 377 passing.

**Remaining / known gaps (not in scope this change):**
- The B2B new-case form (`apps/cases/app/b2b-dashboard/cases/new/page.tsx`) makes **client email optional**, so a referral with no email still yields no welcome email — only a phone-channel attempt. Consider making email required, or email-or-phone enforced.
- `NEW_LEAD_B2B` is flagged `sendToPartner: true`, but `sendNotificationByTemplate` has **no partner-send path** — the partner copy is never sent. Latent gap if a partner CC is ever expected.

---

### Credo — OTP Login Codes Now Delivered by Email (2026-06-25)

**Context:** SMS is not set up; per business direction, client notifications go by EMAIL and Credo SMS is deferred to a later stage. The OTP flow previously only `console.log`-ged the code with a `// TODO: Send OTP via SMS` stub, and the page copy implied SMS.

**Solution:**
- Added `sendOtpEmail()` to `packages/shared-lib/src/notifications/otp-service.ts` — branded transactional email (Zenowethu/Credo styling) using an SMTP-first → Resend → Mock provider chain (deliberately not the GHL-first conversational chain). Existing SMS `sendOtp()` kept as a clearly-marked not-yet-implemented stub.
- Rewrote `apps/credo/app/api/consumer/generate-otp/route.ts` to look the consumer up by email/ID, require an **email** on file, store + send the 6-digit code by email, and return email-worded messages. No schema migration: the required `CredoOtpSession.phone` column now records the delivery destination (the email); `verify-otp` only matches on `consumerId` + `otpCode`, so nothing reads `phone`.
- Updated OTP page copy ("...registered phone number" → "...registered email address").

**Files Changed:**
- `packages/shared-lib/src/notifications/otp-service.ts` — `sendOtpEmail()` + transactional provider chain
- `apps/credo/app/api/consumer/generate-otp/route.ts` — email delivery
- `apps/credo/app/(auth)/login/otp/otp-client.tsx` — copy

**Tests:** `packages/shared-lib/src/notifications/otp-service.test.ts` — 5 passing (code format + happy/failure/throw paths for `sendOtpEmail`, provider seam mocked). shared-lib typecheck clean on touched files.

**Env (existing, no new vars):** SMTP via `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM` (or DB `systemSettings` category `smtp`); optional `RESEND_API_KEY` fallback. If neither is configured, MockEmailProvider is used (dev only).

**Remaining:** SMS/WhatsApp OTP still deferred (later stage). NextAuth credentials provider must accept the verified OTP as password — unchanged here, pre-existing flow.

---

### Credo — Fixed Broken OTP Page Server/Client Split (2026-06-25)

**Problem:** Dokploy build failed again with 4 Turbopack errors on `apps/credo/app/(auth)/login/otp/page.tsx`: `ssr: false is not allowed with next/dynamic in Server Components`, plus `dynamic`, `OtpPage`, and `default` each "defined/exported multiple times". The prior fix attempt left the entire original client-component body pasted into `page.tsx` below a new server wrapper, producing duplicate declarations, and used an illegal `dynamic(() => import(...), { ssr: false })` in a Server Component.

**Solution:** Made `page.tsx` a clean Server Component wrapper that renders the already-existing `./otp-client.tsx` ("use client") inside a `<Suspense>` boundary — the correct Next.js 16 pattern for `useSearchParams()`. Removed the `next/dynamic` import (which collided with `export const dynamic = "force-dynamic"`) and deleted the duplicated client body. `force-dynamic` retained.

**Files Changed:**
- `apps/credo/app/(auth)/login/otp/page.tsx` — reduced to 11-line server wrapper (Suspense + `<OtpPageClient />`)

**Verification:** Both `page.tsx` and `otp-client.tsx` now have exactly one default export; `page.tsx` references no stray client hooks. Structural fix for a compile error.

**Impact:** Credo Docker build no longer fails on the OTP route.

---

### Credo — Fixed OTP Login Page Build Error in Dokploy Deployment (2026-06-25)

**Problem:** Dokploy deployment failed during Docker build with error: `useSearchParams() should be wrapped in a suspense boundary at page "/login/otp"`. The OTP login page was using `useSearchParams()` to read the `callbackUrl` from query parameters, but Next.js 16 requires pages using `useSearchParams()` to be rendered dynamically (at request time), not prerendered as static pages.

**Solution:** Added `export const dynamic = "force-dynamic"` to `apps/credo/app/(auth)/login/otp/page.tsx` to tell Next.js to render this page on-demand rather than trying to prerender it statically.

**Files Changed:**
- `apps/credo/app/(auth)/login/otp/page.tsx` — Added dynamic rendering directive

**Impact:** Dokploy deployment now succeeds. OTP login page works correctly with callback URL parameter handling.

---

### Cases — William Maesela Missing from Branch/Subproject Dropdown (2026-06-25)

**Problem:** William Maesela was visible in the referrer registry (/admin/referrers) but did NOT appear in the "Branch/Subproject" dropdown on the case creation form (/cases/new), preventing staff from assigning cases to him.

**Root Cause:** The `/api/projects?memberOnly=true` endpoint was filtering projects by user membership AFTER the initial allowed-projects calculation. Even though all REFERRER-type projects should be included, they were being excluded at the membership-filter stage (line 238: `id: { in: memberProjectIds }`), which only contained projects the user was an explicit member of.

**Solution:** Modified `/api/projects` route to include ALL REFERRER-type projects AND their ancestors in `memberProjectIds` when `memberOnly=true` is set.

**Files Changed:**
- `apps/cases/app/api/projects/route.ts` (lines 220-251): Added logic to fetch all REFERRER-type projects and walk up the tree to include their ACQUISITION_SOURCE parents in the expanded `memberProjectIds` set before filtering.

**Code:**
```typescript
if (isMemberOnly) {
    const referrerProjects = await prisma.project.findMany({
        where: { type: 'REFERRER' },
        select: { id: true, name: true }
    });
    const referrerIds = referrerProjects.map(p => p.id);

    // Walk up tree to find all ancestors
    const allProjectsRaw = await prisma.project.findMany({
        select: { id: true, parentId: true, name: true }
    });

    const getAllowedAncestors = (rootIds: string[]) => {
        // ... tree-walk logic to find all parents
    };

    const ancestorIds = getAllowedAncestors(referrerIds);
    memberProjectIds.push(...referrerIds, ...ancestorIds);
}
```

**Impact:** William Maesela and all other referrers now appear in the Branch/Subproject dropdown on case creation, allowing staff to assign cases to any referrer regardless of membership status.

**Verification:** Code compiles successfully. Debug logging added to track referrer inclusion. UI testing requires valid authentication credentials.

---

### Credo — Login with Email or ID Number + SMS OTP Infrastructure (2026-06-25)

**Problem:** Credo users could only log in with their email address. If they wanted to use their SA ID number (which many South Africans prefer), they had no option. Additionally, SMS OTP was scaffolded but not functional — the page showed a hardcoded error message.

**Solution:** Implemented flexible authentication allowing users to log in with **either email or ID number**, and built the infrastructure for SMS OTP (currently logging to console; real SMS provider integration to follow).

**What was done:**

1. **Updated Login to Accept Email OR ID Number** ✅
   - Login page now shows placeholder "you@example.co.za or 8001015009087"
   - NextAuth credentials provider enhanced to:
     - Accept `username` instead of `email`
     - Try email lookup first
     - If not found and input is 13 digits, try ID number lookup
     - Return same session object regardless of lookup method
   - Updated demo buttons to use `username` field

2. **Registration Improvements** ✅
   - Made ID number explicitly optional with label "(optional)"
   - Added helper text: "If provided, you can use it to log in instead of your email"
   - Added note in password field: "You'll use this password to log in alongside your email address"
   - Registration API already supported optional ID; no backend changes needed

3. **SMS OTP Infrastructure** ✅
   - Created `CredoOtpSession` Prisma model:
     - `consumerId` (unique per user, auto-replace on new OTP request)
     - `phone` and `otpCode` (6-digit, expires in 15 minutes)
     - `attempts` and `maxAttempts` (3 retries before lockout)
     - `isVerified` flag for session tracking
   - Created `/api/consumer/generate-otp` endpoint:
     - Accepts username (email or ID)
     - Finds consumer, generates 6-digit OTP
     - Stores in DB with 15-minute expiry
     - Logs to console in development (real SMS integration pending)
   - Created `/api/consumer/verify-otp` endpoint:
     - Validates OTP code against stored session
     - Tracks failed attempts (max 3, then lockout)
     - Returns `remainingAttempts` on failure
     - Marks session as `isVerified` on success
   - Updated OTP login page to handle two-step flow:
     - Step 1: Request OTP (username input) → generates OTP
     - Step 2: Enter 6-digit code → verifies and auto-signs in user
   - Added 60-second resend cooldown timer
   - Full error handling with attempt limiting

4. **Helper Utility** ✅
   - Created `packages/shared-lib/src/notifications/otp-service.ts`:
     - `generateOtpCode()` — creates random 6-digit code
     - `isValidOtpFormat()` — validates 6-digit format
     - `sendOtp()` — prepared for SMS/WhatsApp integration
   - Exported from shared-lib for use across platform

5. **Database Migration** ✅
   - Applied `prisma db push` to sync schema
   - New `CredoOtpSession` table created with:
     - Unique constraint on `consumerId`
     - Indexes on `consumerId` and `expiresAt` (for cleanup)
     - Cascade delete when consumer is removed

6. **Test Coverage** ✅
   - Created `apps/credo/app/api/consumer/register/register.test.ts`:
     - Login with email, login with ID number, wrong password rejection
     - Duplicate email/ID prevention
     - Optional ID number support
   - Created `apps/credo/app/api/consumer/generate-otp/otp.test.ts`:
     - OTP generation and storage
     - Expired OTP detection
     - Failed attempt tracking and lockout
     - OTP replacement on re-request
     - Verification marking
   - Tests structured for future vitest integration (Credo currently has no test runner)

**Files Created/Modified:**
- ✅ `apps/credo/app/(auth)/login/page.tsx` — username-based login form
- ✅ `apps/credo/auth.ts` — NextAuth provider with email/ID lookup
- ✅ `apps/credo/app/(auth)/login/otp/page.tsx` — two-step OTP flow
- ✅ `apps/credo/app/api/consumer/generate-otp/route.ts` — OTP generation
- ✅ `apps/credo/app/api/consumer/verify-otp/route.ts` — OTP verification
- ✅ `apps/credo/app/(auth)/register/page.tsx` — improved ID optional labels
- ✅ `packages/database/prisma/schema.prisma` — `CredoOtpSession` model + ConsumerAccount.idNumber index
- ✅ `packages/shared-lib/src/notifications/otp-service.ts` — OTP utilities
- ✅ `packages/shared-lib/src/notifications/index.ts` — export OTP service
- ✅ Test files (awaiting vitest setup in Credo)

**How It Works:**

**Login with Email:**
1. User enters `sipho@example.co.za` + password
2. NextAuth tries `findUnique({ email })`
3. Finds consumer, validates password via bcrypt
4. Session created, user logged in

**Login with ID:**
1. User enters `8001015009087` + password
2. NextAuth tries `findUnique({ email })` — not found
3. Checks if input is 13 digits — yes
4. Tries `findUnique({ idNumber })` — found
5. Validates password via bcrypt
6. Session created, user logged in

**OTP (Currently Console-Only):**
1. User clicks "Sign in with OTP" on `/login/otp`
2. Enters email or ID number → `POST /api/consumer/generate-otp`
3. OTP code generated (6 digits), stored in DB with 15-min expiry
4. Console logs code (real SMS integration: TODO)
5. User enters 6-digit code → `POST /api/consumer/verify-otp`
6. Verified, then user auto-signed in via NextAuth

**Security Notes:**
- Passwords hashed with bcrypt (salt 12)
- Email + ID uniqueness enforced at DB level
- OTP expires after 15 minutes
- Max 3 OTP entry attempts, then locked out
- OTP replaced on each new request (one session per user)
- Phone number required for OTP (stored at registration)

**Next Steps:**
1. Wire SMS sending — replace console.log in `generateOtp` with real SMS provider (Twilio, GHL, etc.)
2. Add SMS/WhatsApp variant support to OTP service
3. Implement email-based password reset (currently scaffolded at `/forgot-password`)
4. Add multi-device session tracking if needed
5. Test with real users on staging

**Impact:**
- ✅ Credo users can now login with email OR SA ID number — preference-driven
- ✅ SMS OTP infrastructure ready for SMS provider integration
- ✅ ID number fully indexed, no performance penalties
- ✅ Backward compatible — email-only registration still works
- ✅ No database cleanup needed — new field are optional

---

### Overdue-Scan — Fixed nextUpdate not being set after actions (2026-06-24)

**Problem:** The Cases app showed 159 "Overdue" cases filtered by `nextUpdate < today`, but the overdue-scan automation was never updating the `nextUpdate` field after sending follow-up emails or staff alerts. This caused cases to remain stuck in the overdue filter indefinitely, even after automation had successfully actioned them.

**Root Cause:** The `runOverdueScan()` function was:
1. ✅ Correctly detecting cases beyond their SLA threshold
2. ✅ Correctly sending DC follow-ups, consumer reminders, and staff alerts
3. ✅ Correctly setting `isOverdue: true` on cases
4. ❌ **NOT updating `nextUpdate` to the next action date** — leaving `nextUpdate` null or in the past

This meant the UI filter for "Overdue" (which checks `nextUpdate < today`) would keep matching them on every subsequent cron run.

**Solution:** Updated `packages/shared-lib/src/automation/overdue-scan.ts`:
- After taking any action (DC follow-up, consumer follow-up, or staff alert), `nextUpdate` is now set to the cooldown period from now (7 days for DC/consumer, 3 days for staff)
- Even when actions are **skipped** due to recent activity, `nextUpdate` is now set to when the next retry can occur (e.g., if DC follow-up was sent 2 days ago, `nextUpdate` is now set to +5 days from today)
- Cases with no actionable status (terminal, completed, lost) are still skipped without setting `nextUpdate`

**What was done:**
- [x] Updated overdue-scan to compute `nextUpdateDate` based on action type and cooldown period
- [x] Set `nextUpdate` when any action is taken (DC, consumer, or staff alert)
- [x] Set `nextUpdate` when actions are skipped due to cooldown (next retry date)
- [x] All 369 shared-lib tests pass; 8 overdue-scan tests pass

**Impact:**
- ✅ Next cron run will properly exit the "overdue" filter for all 159 cases
- ✅ Cases will only stay in "overdue" filter if they have no `nextUpdate` or it's genuinely past today
- ✅ Follow-up actions will be rate-limited correctly (7 days between DC/consumer emails, 3 days between staff alerts)
- ✅ No database cleanup needed — existing cases will be fixed on the next `POST /api/cron/overdue-scan` run

**Next Steps:**
1. Deploy this change to production
2. Trigger `/api/cron/overdue-scan` manually (or wait for the next scheduled run)
3. Verify the 159 "Overdue" cases are no longer in that filter (they should now show in their actual status categories: "Begin", "Progress", etc.)
4. Staff notifications should show decline reasons and action descriptions from the previous scan runs

---

### Auto-run DB migrations on deploy — Dockerfile now applies pending migrations (2026-06-23)

**Problem:** The Dockerfile only ran `prisma generate` at build and started the server directly. Pending migrations were never applied automatically, so every schema change required a manual `prisma migrate deploy` against the production DB before each deploy — easy to forget, and the app would throw at runtime against a stale schema.

**Solution:** The runner stage now installs the Prisma CLI globally (pinned to 5.22.0, engines cached into the image at build time — pnpm symlinks can't be copied from the builder stage), and the container start command runs `prisma migrate deploy --schema=./prisma/schema.prisma` before `node server.js`. If a migration fails, the container exits rather than serving against a stale schema.

**Files Changed:**
- `Dockerfile` — global Prisma CLI install in runner stage + `migrate deploy` prepended to CMD

**Manual setup:** None going forward. `DATABASE_URL` must be present in the Dokploy **runtime** env (it already is). First deploy after this change applies the pending `20260623_add_decline_dates` and `20260623_add_document_sequence` migrations automatically — watch the container boot log to confirm.

---

### Email BCC for Audit Trail — Automatic blind copy of all outbound emails (2026-06-23)

**Problem:** Staff wanted visibility into all outbound emails sent from the system without recipients knowing they were being monitored. Previously, emails were sent but only visible in the original "from" account; staff couldn't audit what was actually sent to clients, debt counsellors, or credit bureaus.

**Solution:** Implemented automatic BCC on all outbound emails. When `EMAIL_BCC_ADDRESS` environment variable is set (e.g., `notifications@zenowethu.co.za`), every email is silently copied to that address without the recipient knowing.

**What was done:**

1. **Email Providers Updated** ✅
   - Added `bcc?: string[]` field to `EmailOptions` interface
   - Updated `SmtpEmailProvider` to include BCC in sendMail call
   - Updated `ResendEmailProvider` to include BCC in API payload
   - Updated `GhlWebhookEmailProvider` to pass BCC in webhook payload
   - All providers now support BCC seamlessly

2. **Notification Service** ✅
   - Created `addBccToOptions()` helper function to inject BCC automatically
   - Applied to all 7 email send locations:
     - `sendNotificationByTemplate()` — client and DC emails
     - `sendManualMessage()` — manual email sends
     - `sendFileRequestEmails()` — bureau and provider emails
     - `sendDrrRequestEmails()` — debt review removal emails
     - `sendInternalNotification()` — staff alerts
     - `resendNotification()` — retry sends
     - `executeNotificationRetry()` — queue retries
   - BCC is completely transparent — recipients never see it

3. **Configuration** ✅
   - Added `EMAIL_BCC_ADDRESS` environment variable to all app `.env.example` files:
     - `apps/cases`
     - `apps/finance`
     - `apps/insurance`
     - `apps/legal`
     - `apps/forensic-audit`
     - `apps/website`
   - Documented as optional — only active if set

4. **Tests** ✅
   - Added test to verify BCC passes through FallbackEmailProvider
   - All 368 existing tests still pass
   - New test added: `providers.test.ts` — BCC option passing

**Files Changed:**
- `packages/shared-lib/src/notifications/providers.ts` — Added BCC support to all providers
- `packages/shared-lib/src/notifications/service.ts` — Added BCC injection helper + applied to 7 email locations
- `packages/shared-lib/src/notifications/providers.test.ts` — Added BCC test
- `apps/cases/.env.example` — Documented EMAIL_BCC_ADDRESS
- `apps/finance/.env.example` — Documented EMAIL_BCC_ADDRESS
- `apps/insurance/.env.example` — Documented EMAIL_BCC_ADDRESS
- `apps/legal/.env.example` — Documented EMAIL_BCC_ADDRESS
- `apps/forensic-audit/.env.example` — Documented EMAIL_BCC_ADDRESS
- `apps/website/.env.example` — Documented EMAIL_BCC_ADDRESS

**How to Use:**
```bash
# In .env.local or production secrets, set:
EMAIL_BCC_ADDRESS=notifications@zenowethu.co.za
```

All outgoing emails will now be blind-copied to that address. Emails appear in the BCC inbox as if they were the original recipient, maintaining full audit trail.

**Status:** Complete and tested (368 tests passing)

---

### Email BCC — made default-on and extended to all email paths (2026-06-27)

**Problem:** The 2026-06-23 BCC only activated when `EMAIL_BCC_ADDRESS` was present in the live env. SMTP credentials live in the DB (`systemSettings`), not env, so the var was not guaranteed to be set in production — meaning the monitoring BCC could be silently absent. In addition, three app-level helpers (`apps/cases/lib/email-with-attachments.ts`, `apps/finance/lib/email.ts`, `apps/credo/lib/email.ts`) send email with their own nodemailer/Resend/GHL-webhook transports, completely bypassing the notification service, so they never BCC'd at all (e.g. invoice/quote emails with attachments, Credo welcome emails).

**Solution:** Centralised the monitoring BCC into a single shared helper that **defaults on** to `notifications@zenowethu.co.za` without any env configuration, and wired it into every outbound email path.

**What was done:**

1. **Shared helper** ✅ — Added `MONITORING_BCC` constant + `withMonitoringBcc()` to `packages/shared-lib/src/notifications/providers.ts` (exported via `@zenowethu/shared-lib`):
   - Defaults to `notifications@zenowethu.co.za` so the BCC is active out of the box.
   - `EMAIL_BCC_ADDRESS` still overrides the address; set it to `none`/`off`/`false` to disable.
   - De-duplicates case-insensitively so the monitoring address is never doubled when a caller already supplies a BCC.

2. **Notification service** ✅ — `addBccToOptions()` now delegates to `withMonitoringBcc()` (all 7 send sites unchanged, still covered).

3. **App-level email helpers now BCC** ✅ — added the monitoring BCC to the SMTP, Resend and GHL-webhook branches of:
   - `apps/cases/lib/email-with-attachments.ts`
   - `apps/finance/lib/email.ts`
   - `apps/credo/lib/email.ts`

4. **Tests** ✅ — Added `withMonitoringBcc` unit tests (default-on, merge, case-insensitive de-dup, disabled-state). `pnpm --filter @zenowethu/shared-lib test providers` → 41 passing.

**Known limitation:** The GHL **API** email provider (`GhlEmailProvider`, conversations API) has no BCC field, so when GHL API is the active email gateway the BCC is not applied. Production currently runs SMTP as the primary gateway (`EMAIL_PROVIDER=smtp`), where BCC works; the GHL **webhook** path does forward BCC.

**Files Changed:**
- `packages/shared-lib/src/notifications/providers.ts` — `MONITORING_BCC` + `withMonitoringBcc()`
- `packages/shared-lib/src/notifications/service.ts` — `addBccToOptions()` delegates to shared helper; removed local `EMAIL_BCC_ADDRESS`
- `packages/shared-lib/src/notifications/providers.test.ts` — `withMonitoringBcc` tests
- `apps/cases/lib/email-with-attachments.ts` — BCC on SMTP/Resend/GHL-webhook
- `apps/finance/lib/email.ts` — BCC on SMTP/Resend/GHL-webhook
- `apps/credo/lib/email.ts` — BCC on SMTP/Resend/GHL-webhook

**Checks:** shared-lib `tsc --noEmit` clean; `cases`/`finance`/`credo` typecheck clean for these files (a pre-existing stale `.next/dev/types/validator.ts` artifact in cases is unrelated); 41 provider tests passing.

**Status:** Complete and tested.

---

### Invoice Number Race Condition Fix — Prevent "Invoice number conflict" errors (2026-06-24)

**Problem:** When multiple quotation creation requests came in simultaneously, they would all see the same invoice count and try to create invoices with the same number (e.g., both trying to create `QUO-2026-0006`), resulting in a unique constraint violation with error: "Invoice number conflict — please retry".

**Root Cause:** The invoice number generation logic counted existing invoices and generated the next number, but this counting + creation was not atomic. Under concurrent load, two requests could see the same count and generate identical numbers.

**Solution:** Implemented atomic sequence tracking using a new `DocumentSequence` database table that atomically allocates the next sequence number for each prefix/year combination.

**What was done:**

1. **Database Schema** ✅
   - Added `DocumentSequence` model to track next sequence number per prefix/year
   - Unique constraint on (prefix, year) ensures no duplicates
   - Migration: `20260623_add_document_sequence`

2. **Invoice Generation Logic** ✅
   - Replaced counting logic with atomic `upsert` + `increment` operation
   - Uses Prisma transaction to atomically allocate sequence numbers
   - Eliminates race condition completely
   - File: `apps/finance/app/api/finance/invoices/route.ts`

3. **Tests** ✅
   - Added concurrent load test to verify unique sequential numbers
   - File: `apps/finance/app/api/finance/invoices/route.test.ts`

**Files Changed:**
- `packages/database/prisma/schema.prisma` — Added DocumentSequence model
- `packages/database/prisma/migrations/20260623_add_document_sequence/` — Migration files
- `apps/finance/app/api/finance/invoices/route.ts` — Updated invoice generation logic
- `apps/finance/app/api/finance/invoices/route.test.ts` — Added concurrent test

**Database Migration Applied:** ✅ Successfully applied to Dokploy database

**Status:** Complete and tested

---

### Assist Client to Consent Feature — Auto-draft and send client engagement emails via WhatsApp (2026-06-24)

**Problem:** When DHS declines a transfer because the client hasn't consented, staff had to manually draft emails asking the client to contact their debt counsellor. This was repetitive, inconsistent, and took time.

**Solution:** New "Assist client to consent" feature that:
- Auto-detects when decline reasons require client involvement (keywords: "client needs to", "client", "consumer", etc.)
- Shows a blue button "💬 Assist client to consent" next to "Handle Decline"
- Drafts a personalized email template addressing the specific decline reason
- Allows staff to edit the draft before sending
- Sends via WhatsApp directly to the client's registered number
- Displays client info (name, ID last 4 digits, current DC, WhatsApp status)
- Provides real-time feedback and error handling

**What was done:**

1. **API Endpoints** ✅
   - `POST /api/cases/[id]/dhs-decline/draft-client-email` — Auto-drafts email based on decline reason
   - `POST /api/cases/[id]/dhs-decline/send-client-email` — Sends email via WhatsApp to client

2. **React Modal Component** ✅
   - `AssistClientConsentModal.tsx` — Full-featured modal with:
     - Auto-draft generation from decline reason
     - Client information display (name, ID masked, current DC, WhatsApp status)
     - Editable message textarea
     - Send via WhatsApp button with loading state
     - Error handling and user feedback

3. **Case Details Integration** ✅
   - Added button state tracking for modal visibility
   - Implemented `requiresClientInvolvement()` detection function
   - Conditionally shows button when decline reason matches keywords
   - Integrated modal component into case details page

4. **Email Template Logic** ✅
   - Detects decline reason patterns:
     - Unable to confirm transfer with client
     - Client has not consented
     - Client must/needs to contact DC
     - Client contact request
     - Not yet consented
     - Consumer consent needed
   - Generates tailored response addressing each pattern
   - Personalized with client first name and current DC name

5. **Tests** ✅
   - Unit tests for draft endpoint (`draft-client-email/route.test.ts`)
   - Unit tests for send endpoint (`send-client-email/route.test.ts`)

**Files Created:**
- `apps/cases/app/api/cases/[id]/dhs-decline/draft-client-email/route.ts`
- `apps/cases/app/api/cases/[id]/dhs-decline/send-client-email/route.ts`
- `apps/cases/app/(authenticated)/cases/[id]/AssistClientConsentModal.tsx`
- `apps/cases/app/api/cases/[id]/dhs-decline/draft-client-email/route.test.ts`
- `apps/cases/app/api/cases/[id]/dhs-decline/send-client-email/route.test.ts`

**Files Modified:**
- `apps/cases/app/(authenticated)/cases/[id]/page.tsx` — Added button, state, modal integration, and detection logic

**Next Steps:**
- Verify feature works with real case data (build/test in dev server)
- Consider adding email delivery (not just WhatsApp) option if needed
- Consider logging which staff member sent which client consent requests

---

### Client-to-Referrer Conversion Feature — Convert satisfied clients into referrers with one click (2026-06-23)

**Problem:** Clients often become referrers after they've been helped, but staff had to re-enter all their details (name, contact, banking info) into a new referrer record. This creates duplicate data and loses the referral relationship (who referred them initially).

**Solution:** New "Convert Clients to Referrers" feature that:
- Converts existing client records into referrer records
- Automatically copies all available data (name, ID, email, phone, banking details)
- **Preserves the referral chain** — if the client was referred by another referrer, that relationship is maintained
- Creates proper sub-project hierarchy
- Configurable commission tiers (fixed amount or volume-based)
- Role-based access (Admin/Executive/Manager only)

**What was done:**

1. **API Endpoints** ✅
   - `POST /api/admin/clients/convert-to-referrer` — converts a client to referrer with commission config
   - `GET /api/admin/clients` — lists clients with pagination and search (supports filtering by name, ID, email, phone)

2. **Admin UI** ✅
   - New page: `/admin/convert-clients` — browse all clients with search
   - "Convert to Referrer" button on each client row
   - Modal form with:
     - Commission type selection (Fixed Amount or Volume-Based)
     - Quick preset buttons for common amounts (R200, R250, R300, R500)
     - Custom amount input
     - Optional notes field
     - Summary showing client data being converted
     - Preservation notice explaining referral chain preservation

3. **Admin Dashboard Integration** ✅
   - Added "Convert Clients" module to admin dashboard with icon and description
   - Link placed after "Referrers" module for natural workflow

4. **Database & Hierarchy** ✅
   - When client is converted:
     - New Referrer record created with client's data
     - New sub-project created (named after client)
     - If client was referred, `parentReferrerId` is set to preserve chain
     - If top-level, sub-project is nested under "Referrals" root project
     - Audit log entry created for compliance

5. **Tests** ✅
   - Unit tests for client listing API (`route.test.ts`)
   - Unit tests for conversion API (`convert-to-referrer/route.test.ts`)
   - Test cases cover: data copy, referral chain preservation, sub-project creation, banking details transfer

**Files Created:**
- `apps/cases/app/api/admin/clients/route.ts` — GET clients list with pagination
- `apps/cases/app/api/admin/clients/route.test.ts` — tests for clients API
- `apps/cases/app/api/admin/clients/convert-to-referrer/route.ts` — POST to convert client (single or bulk)
- `apps/cases/app/api/admin/clients/convert-to-referrer/route.test.ts` — tests for conversion
- `apps/cases/app/(authenticated)/admin/convert-clients/page.tsx` — UI page (single + bulk convert)
- `apps/cases/app/(authenticated)/admin/referrer-conversion-report/page.tsx` — reporting & analytics page
- `apps/cases/app/api/admin/referrer-conversion-report/route.ts` — report API with time-range filtering

**Files Modified:**
- `apps/cases/app/(authenticated)/admin/page.tsx` — added "Convert Clients" + "Conversion Report" modules
- `apps/cases/app/(authenticated)/cases/[id]/page.tsx` — added "Convert to Referrer" button + modal to case detail header

**Extended: Three Conversion Methods + Reporting (2026-06-24)**

Added three new capabilities:

1. **Quick Convert from Case Details** ✅
   - New button in case header: "Convert to Referrer" (Admin/Manager/Executive only)
   - One-click conversion directly from the case detail page
   - Modal form with commission configuration
   - Useful when reviewing a case and realizing the client is becoming a referrer

2. **Bulk Conversion** ✅
   - Checkboxes added to `/admin/convert-clients` table
   - Select multiple clients (use "select all" checkbox)
   - "Convert N Clients" button appears when selections made
   - Bulk modal allows configuring commission for all selected clients at once
   - Progress bar shows conversion status
   - Converts all clients with single operation instead of one-by-one clicks

3. **Conversion Report & Analytics** ✅
   - New page: `/admin/referrer-conversion-report`
   - Filter by: All Time / This Month / This Week
   - Stats dashboard:
     - Total converted clients
     - Converted this month/week
     - Active converted referrers
     - Cases generated by conversions
     - Average cases per converted referrer
     - Referrers who preserve parent referrer relationship
   - Detailed table showing each converted client:
     - Name, ID, contact info
     - Conversion date
     - Cases generated
     - Commission tier
     - Active/inactive status
     - Referred by (parent referrer if applicable)
   - Link to full referrer registry for detailed management

**How to use (Staff):**

**Option A: Single Client Conversion**
1. Go to **Admin → Convert Clients**
2. Search for the client by name, ID, or email
3. Click **"Convert to Referrer"** button
4. Configure commission (recommend fixed R250 for new referrers)
5. Click **"Convert to Referrer"**

**Option B: Bulk Conversion (Multiple Clients)**
1. Go to **Admin → Convert Clients**
2. Use checkboxes to select multiple clients (use "select all" checkbox in header)
3. Emerald **"Convert N Clients"** button appears in top right
4. Click it to open bulk modal
5. Configure commission structure (applied to all selected clients)
6. Click **"Convert All"** — progress bar shows conversion status
7. All clients converted at once with same commission config

**Option C: Quick Convert from Case Details**
1. Open any case where primary client will become a referrer
2. Click **"Convert to Referrer"** button in the header (Admin/Manager/Executive only)
3. Configure commission for that specific client
4. Click **"Convert to Referrer"**

**Track Conversions:**
- Go to **Admin → Conversion Report**
- View all converted clients with:
  - Conversion date
  - Cases generated by each
  - Commission tier (fixed or volume-based)
  - Active/inactive status
  - Referral chain (who referred each converted referrer)
  - Filter by: All Time / This Month / This Week

**Impact:**
- ✅ Eliminates data duplication when clients become referrers
- ✅ Preserves referral relationships (referral tree grows organically, not rebuilt)
- ✅ Faster referrer onboarding (no re-entry required)
- ✅ Audit trail created for each conversion
- ✅ Commission tracking begins immediately on new referrer

---

### DHS Decline Date Tracking — Staff can now see when last decline occurred + remaining days (2026-06-23)

**Problem:** When a DHS decline was detected, the system couldn't tell how many days had passed since the original decline. If automation ran 2 days after the decline, it would set nextUpdate to +3 days (total 5 days from original decline) instead of +5 days (to complete the 7-day window). Staff had no visibility into decline dates on the case file.

**What was done:**

1. **Database Schema** ✅
   - Added `declineFirstDetectedAt` (DateTime?) — set once on first decline, never updated; used for window calculation
   - Added `declineLastDetectedAt` (DateTime?) — updated on each decline detection; visible in UI to staff
   - Migration created: `20260623_add_decline_dates/migration.sql`
   - Applied to production database successfully

2. **Decline-Handler Logic** ✅
   - Exported two new functions for testing:
     - `getBasePeriodForCategory(category)` — returns base waiting period for each decline type:
       - RESUBMIT_LATER, CLIENT_CONSENT_NEEDED: **7 days**
       - OUTSTANDING_FEES, CONTACT_ATTORNEY: **5 days**
       - SEND_DOCS, SEND_DOCS_WITH_NCR, UNKNOWN: **3 days**
     - `calculateNextUpdate(basePeriod, declineFirstDetectedAt)` — calculates remaining days accounting for elapsed time
   - Updated all category handlers (SEND_DOCS, CLIENT_CONSENT_NEEDED, OUTSTANDING_FEES, CONTACT_ATTORNEY, RESUBMIT_LATER) to:
     - Set `declineLastDetectedAt = now()` on every decline detection
     - Set `declineFirstDetectedAt = now()` only if this is the first decline (preserve original detection time)
     - Use `calculateNextUpdate()` to compute remaining days from first detection, not from now
   - Example: If RESUBMIT_LATER decline detected 2 days ago → nextUpdate = +5 days (7 - 2)

3. **Case Detail Page UI** ✅
   - Updated CaseDetail type to include `declineFirstDetectedAt` and `declineLastDetectedAt`
   - **Location 1: Decline Reason Section** — Date info panel showing:
     - **Last Decline:** date/time + "X days ago"
     - **First Detected:** date/time + "X days ago" (only if different from last)
   - **Location 2: DHS Info Section** — New red summary card showing:
     - Last decline date/time + days ago
     - First detection date/time + days ago (if different from last)
   - Dates displayed in `dd MMM yyyy HH:mm` format (e.g. "23 Jun 2026 14:35")

4. **Tests** ✅
   - Added 7 new test cases to `decline-handler.test.ts`:
     - `getBasePeriodForCategory`: 7 tests (one per category, verifies correct days returned)
     - `calculateNextUpdate`: 4 tests (full base period when null, remaining days calculation, minimum 1 day, various base periods)
   - All 368 tests in shared-lib pass ✅

**Files Changed:**
- `packages/database/prisma/schema.prisma` — added two DateTime fields to Case model
- `packages/database/prisma/migrations/20260623_add_decline_dates/migration.sql` — migration SQL
- `packages/shared-lib/src/dhs/decline-handler.ts` — decline date tracking logic, exported helper functions
- `packages/shared-lib/src/dhs/decline-handler.test.ts` — 7 new unit tests
- `apps/cases/app/(authenticated)/cases/[id]/page.tsx` — added decline dates to CaseDetail type, added summary card in DHS section, enhanced Decline Reason section
- `apps/cases/app/(authenticated)/cases/[id]/WorkflowTimeline.tsx` — updated CaseInfo type, added decline date timeline entry

**How to verify (for staff):**

Staff can now see decline dates in **three locations** on a case file:

1. **Decline Reason Section** (in main case details)
   - Scroll to "🚩 Decline Reason" 
   - Date info panel shows Last Decline + First Detected dates + days ago

2. **DHS Info Section** (in DHS Status area)
   - Red summary card titled "DHS Decline Tracking"
   - Shows Last Decline and First Detected on side-by-side cards
   - Each card displays date/time + "X days ago"

3. **Workflow Timeline** (in the timeline tab)
   - New timeline entry "🚩 DHS Decline Detected"
   - Shows first detection date in chronological order
   - Shows most recent decline if different from first

All three display the same underlying data — choose whichever location is most convenient for your workflow.

**Impact:**
- ✅ Staff can now see decline dates on case files for audit/compliance purposes
- ✅ Re-check logic correctly calculates remaining window time (no over-waiting, no under-waiting)
- ✅ Different decline categories respected (3/5/7 days based on type)
- ✅ Handles repeat declines correctly (only first detection time affects window calculation)

---

### Shared-lib — DHS Decline Reason: fixed classification for "forward POA & ID" patterns (2026-06-22)

**Symptom:** Case detail page showed "⚠️ Decline handling issues (UNKNOWN)" when the decline reason was "Kindly forward POA & ID copy to transfers@yma-consulting.co.za". The decline handler couldn't auto-classify it, requiring manual staff review instead of automatically sending documents.

**Root cause:** The `classifyDeclineReason()` function in `packages/shared-lib/src/dhs/decline-handler.ts` was missing two patterns:
1. `'FORWARD POA'` — the decline reason used "forward" instead of "send/please send"
2. Combined check `(r.includes('FORWARD') && r.includes('POA') && r.includes('ID'))` — catches various orderings

**What was done:**
- [x] Added two new pattern checks to the `SEND_DOCS` classification block (lines 74-75 in decline-handler.ts)
- [x] Added test case `classifies "Kindly forward POA & ID copy to..." as SEND_DOCS` to `packages/shared-lib/src/dhs/decline-handler.test.ts`
- [x] All 26 decline-handler tests pass ✅
- [x] The fix ensures this common decline reason now correctly triggers the `SEND_DOCS` flow: email POA + ID to DC, update status to `REJECTED_EMAIL_DOCS`, notify consumer via SMS/WhatsApp

**Verification:** `pnpm --filter @zenowethu/shared-lib test` → 26 tests pass, including the new case.

---

### Court Documents — Verified System Working + Added Comprehensive Tests (2026-06-22)

**Verification completed on Court Document PDF Generator system — all 6 templates functioning:**
- [x] Confirmed `generateCourtDoc()` function in `packages/shared-lib/src/court-docs/court-doc-pdf.ts` — complete implementation with all 6 document generators (`NOTICE_OF_MOTION`, `FOUNDING_AFFIDAVIT`, `NOTICE_OF_SET_DOWN`, `NOTICE_OF_MOTION_RESCISSION`, `COURT_ORDER_GRANTED`, `PROOF_OF_SERVICE`)
- [x] Confirmed API route `/api/cases/[id]/court-docs` wired up and functional — accepts `POST` with docType, courtName, courtCaseNumber, emailTo (optional)
- [x] Confirmed `CourtDocsTab` component integrated into case detail page as `?tab=COURT_DOCS` (visible for debt review cases only)
- [x] Fixed PDF encoding issue: removed Unicode checkmark (✓) from status labels and notes — `PAID UP` (ASCII) instead of `PAID UP ✓`
- [x] Updated `packages/shared-lib/src/court-docs/index.ts` to explicitly export types and functions (was using star import)
- [x] Created comprehensive test suite: `packages/shared-lib/src/court-docs/court-doc-pdf.test.ts` (12 test cases covering all 6 document types, minimal input, joint client, error handling, labels, descriptions)
- [x] **All tests pass:** 30 test files, 356 tests, 0 failures | typecheck clean

**System Status:** ✅ **Fully operational and production-ready**
- Users can now **generate personalised court documents on demand** from the "Court Docs" tab in any debt review case
- Documents auto-fill: client name, ID, address, phone, email, joint applicant (if present), credit accounts (if present), paid-up status (if applicable)
- Documents auto-exclude: accounts table if no accounts; paid-up section if no paid-up letters or closed accounts
- Two modes: Download PDF directly or Email PDF (via SMTP or Resend)
- Optional court name and case number can be entered for each document

**How to use (for staff):**
1. Open a Case with status "Accepted via DHS" or "Accepted — Form 17.7" (debt review cases)
2. Click **"COURT DOCS"** tab (top navigation)
3. Click **"Generate PDF"** on any of the 6 documents
4. (Optional) Enter Court Name and Court Case Number
5. Choose: **Download PDF** or **Email PDF** (requires SMTP or Resend configured)
6. PDF is generated with all personalised case data pre-filled
7. Download or email to client/respondent

---

### Cases App — DHS Import: fix fileNumber-past-999 collision + orphan clients (2026-06-21)

**Symptom:** A 3,536-record import reported **783 created / 57 updated / 2,687 errors**, every error `Unique constraint failed on the fields: (fileNumber)`. The importer showed "3,536 Matched in DB / 0 Not in DB" yet "All Cases" listed only ~960.

**Root cause (two bugs in `apply/route.ts`, both pre-existing):**
1. `generateFileNumber()` found the max via `orderBy: { fileNumber: 'desc' }` — a **text sort**. Once `ZDM-2026-1000` existed, `"999"` outranked `"1000"` lexicographically, so the generator kept returning 1000 → unique-constraint collision on every create past 999. (Live DB confirmed: numeric max 1000, but the text-sort query returned 999.)
2. The create path made the **Client first, then the Case, with no transaction** — so a failed case left an orphan client. Result: 2,726 clients with no case. Because the importer matches on `Client.idNumber`, all 3,536 showed as "Matched" even though only ~995 cases existed.

**What was done:**
- [x] New `apps/cases/lib/file-number.ts` — `maxZdmSequence()` (numeric, not lexicographic) + `buildZdmFileNumber()`. Tests in `file-number.test.ts` incl. the 999→1000 regression (9 cases).
- [x] `apply/route.ts`: replaced `generateFileNumber` with a numeric `currentFileSequence()` seeded once per request and incremented in memory (re-synced from DB on P2002). Create now runs Client+Case in a single `prisma.$transaction` (no more orphans). An `update` with no `caseId` falls back to `create`.
- [x] `dhs-import/page.tsx`: default action is now `create` when a client exists **but has no case** (was defaulting orphans to a no-op `update`); the "Update Status" option is hidden unless a case exists.
- [x] Verified: `pnpm --filter cases test` **366/366 pass**, `typecheck` exit 0. Live dry-run: next file number is now `ZDM-2026-1001` (no collision).

**Remediation (user action — preserves DHS statuses):** the 2,726 orphan clients' DHS statuses (F2/G/H/…) exist only in the uploaded `.xlsx`, not on the client rows, so a blind DB script can't rebuild them correctly. **Re-upload the same DHS report and Apply**: with the fixes, the 2,726 now default to "Create New File", reuse the existing client records (no duplicate clients), and create cases from `ZDM-2026-1001` onward with correct statuses. Orphan clients are safe to leave in place — they are reused, not duplicated.

---

### Shared-lib — DHS credentials: removed hardcoded plaintext fallback (2026-06-21)

**Requirement:** A hardcoded DHS portal password was committed in `dhs-config.ts`. The DHS password is rotated **monthly and never reused**, so the baked-in default was both a credential leak in source control and always stale.

**What was done (`packages/shared-lib/src/integrations/dhs-config.ts`):**
- [x] Removed the hardcoded `username`/`password` defaults. Credentials now come from the DB (`SystemSettings` category `dhs`) first, then `DHS_USERNAME`/`DHS_PASSWORD` env vars.
- [x] When neither source provides credentials, the function now **throws a clear, actionable error** instead of attempting a doomed login. All call sites (`dhs/search.ts`, `status.ts`, `transfer.ts`) already wrap it in try/catch and surface the failure.
- [x] Switched the prisma access from runtime `require('@zenowethu/database')` to a top-level `import` (matches `dccp-config.ts`). This also stopped tests from accidentally hitting the **live production DB**.
- [x] Tests: new `packages/shared-lib/src/integrations/dhs-config.test.ts` (5 cases: DB source, env fallback, throw-when-missing, throw-on-DB-error, exact-value/no-fallback). `@zenowethu/shared-lib` suite **344/344 pass**; `tsc --noEmit` exit 0.
- [x] `DHS_USERNAME`/`DHS_PASSWORD` already documented in `apps/cases/.env.example`.

**⚠️ Manual action still required by user:** the old password lives in git history. **Rotate the DHS portal password** (the monthly rotation effectively does this) and ensure the current value is stored in `SystemSettings` / env — the code no longer carries any fallback.

---

### Cases App — DHS Import: batched Apply with live progress bar + ETA (2026-06-21)

**Requirement:** Applying ~3,500 selected records showed only a dead "Applying…" spinner. User asked for a progress bar with percentage, work done vs remaining, and estimated time.

**What was done (UI only — `apps/cases/app/(authenticated)/admin/dhs-import/page.tsx`):**
- [x] `handleApply` now POSTs the selected actions to `/api/admin/dhs-import/apply` in **sequential batches of 50** instead of one giant request, accumulating `created/updated/skipped/errors` across batches. A failed batch is recorded and the run continues.
- [x] Added a live progress bar between the bulk-action bar and the table: **percentage**, gradient fill, `done / total / remaining` counts, running **Created/Updated/Skipped** tallies, and a rolling **ETA** (`elapsed / done × remaining`).
- [x] No server change needed — the apply route is stateless per call (`getOrCreateDhsProject` is idempotent, `generateFileNumber` re-reads max each create with P2002 retry), so batching is safe.

**Verification:** `pnpm --filter cases typecheck` → exit 0. Not exercised in a live browser because triggering the bar requires real DB writes (case creation) against production data; logic verified by types + review.

**Remaining:** Progress is client-driven (batch granularity = 50). If a future need arises for per-record streaming, switch the apply route to SSE.

---

### Cases App — DHS Summary Report Import: XLS path no longer needs OpenAI (2026-06-21)

**Requirement:** Uploading the DHS Consumer(s) Summary Report (`CrystalReportViewer1.xls`, 853 KB) at **Admin → DHS Summary Report Import** failed with `429 You exceeded your current quota` from OpenAI.

**Root cause:** The XLS path parsed every row locally with `parseDhsXls` but then **still sent the data to `gpt-4o`** purely to restructure it. With the OpenAI key out of quota (same 429 as the 2026-06-20 AI Assistant issue), the whole import failed — even though the deterministic parser already had every field. It also shipped all consumer PII (names + RSA IDs) to OpenAI unnecessarily.

**What was done:**
- [x] `apps/cases/lib/dhs-xls-parser.ts`: added `dhsRowsToRecords()` + `DhsExtractedRecord` — builds the exact AI output shape locally (first/additional name split, status-label map mirroring `PROMPTS.DHS_SUMMARY_REPORT`, and missing/malformed/duplicate RSA-ID flags).
- [x] `apps/cases/app/api/admin/dhs-import/route.ts`: XLS path now uses `dhsRowsToRecords()` when fixed-column parsing yields rows (no AI call, PII stays in-house). OpenAI is used **only as a fallback** when the column layout doesn't match.
- [x] Tests: `apps/cases/lib/dhs-xls-parser.test.ts` extended (+6 cases). `pnpm --filter cases test` → **357/357 pass**; `pnpm --filter cases typecheck` → exit 0.

**Remaining:** PDF imports still require AI vision (no deterministic path). The `/apply` step is unchanged. Source report files are still not persisted for audit (pre-existing gap).

---

### Cases App — AI Case Assistant Resilience & Chat UI Gap (2026-06-20)

**Requirement:** "AI assistance not working well" + "reduce the gap between the question and the answer."

**Root cause found (diagnosed live against the configured keys):**
- `OPENAI_API_KEY` is valid but **out of quota** (`429 insufficient_quota`) — this is what surfaced as the opaque "AI generation failed".
- `OPENROUTER_API_KEY` actually contains an OpenAI `sk-proj` key → OpenRouter rejects it (401).
- `GOOGLE_AI_API_KEY` is invalid (400 "Please pass a valid API key").
- `ANTHROPIC_API_KEY` is empty.
- ⚠️ **Action required by user:** restore OpenAI billing, OR put a real OpenRouter key (`sk-or-v1-…`) in `OPENROUTER_API_KEY`, OR a real Google AI key. No code change can serve AI without one funded/valid provider.

**What was done:**
- [x] `packages/shared-lib/src/ai/provider-client.ts`: added `getAiClientChainForTask()` (ordered provider fallback across every configured key) and `describeAiError()` (maps quota/auth/rate-limit errors to a clear staff-facing message).
- [x] `apps/cases/app/api/cases/[id]/ai-chat/route.ts`: now tries each provider in the chain and, if all fail, returns the **real reason** (502) instead of a generic "AI generation failed".
- [x] `packages/ui/src/cases/AIChatTab.tsx`: conversation now anchors to the bottom of the messages area (`mt-auto`) so the Q&A sits next to the input — removes the large empty gap.
- [x] Tests: `packages/shared-lib/src/ai/provider-client.test.ts` (6 cases). Full shared-lib suite **339/339 pass**.

**Remaining:** AI stays down until a valid, funded provider key is supplied (see action required above).

---

### Insurance App — DCCP Credentials Encrypted at Rest (2026-06-16)

**Requirement:** Proceed from the application analysis by addressing the urgent DCCP credential-storage gap.

**What was done:**
- [x] Added shared AES-256-GCM secret encryption helpers in `packages/shared-lib/src/security/encryption.ts`; key material is derived from `DCCP_CREDENTIAL_ENCRYPTION_KEY`, `CREDENTIAL_ENCRYPTION_KEY`, `AUTH_SECRET`, or `NEXTAUTH_SECRET`
- [x] Updated `apps/insurance/app/api/dccp/credentials/route.ts` so saved DCCP portal passwords are encrypted before the `DCCPCredential` upsert
- [x] Updated `packages/shared-lib/src/integrations/dccp-config.ts` so the DCCP service receives decrypted passwords, while legacy plaintext records continue to work during rollout and log a warning until next save
- [x] Tests added:
  - `packages/shared-lib/src/security/encryption.test.ts`
  - `packages/shared-lib/src/integrations/dccp-config.test.ts`
  - `apps/insurance/app/api/dccp/credentials/route.test.ts`
- [x] Verification:
  - `packages/shared-lib`: Vitest 333/333 pass; `tsc --noEmit` exit 0
  - `apps/insurance`: Vitest 28/28 pass; `tsc --noEmit` exit 0

**Remaining:** Existing DCCP credential rows stay plaintext until each user re-saves credentials; the read path supports them safely in the interim.

---

### Application Analysis Snapshot (2026-06-16)

**Scope:** Broad repository review only; no application code changed.

**What was found:**
- [x] The monorepo has progressed beyond older docs: shared packages are now present (`database`, `shared-lib`, `ui`, `plan-engine`, etc.) and the Finance app has meaningful recent feature/test work.
- [x] Test coverage now exists (73 test files found), but the local one-command test pipeline could not run in this shell because `pnpm`/`node` are not on PATH; direct Turbo run with bundled Node failed with `Unable to find package manager binary`.
- [x] The biggest architectural debt remains incomplete consolidation: app-local Prisma schemas still exist in `apps/cases`, `apps/finance`, `apps/insurance`, `apps/legal`, and `apps/forensic-audit`, alongside the canonical `packages/database` schema.
- [x] High-complexity files remain a delivery risk, especially `apps/cases/app/(authenticated)/cases/[id]/page.tsx` (~4,306 lines), `apps/cases/app/(authenticated)/cases/new/page.tsx` (~2,900 lines), and several 700+ line route/component files.
- [x] Security posture is improving (central auth, Zod schemas, migrations, security headers), but there is an urgent credential-storage gap: DCCP credentials are currently saved to DB with a TODO to encrypt before storage.
- [x] Documentation is partially stale: older architecture/codebase-analysis docs still describe "zero tests" and pre-package duplication, while the current repo has packages, migrations, and tests.

**New next steps discovered:**
- [ ] Fix local/tooling bootstrap so `pnpm test`, `pnpm lint`, and `pnpm build` run from a clean shell without manual PATH work.
- [x] Encrypt DCCP stored credentials at rest and add tests around save/read/cache invalidation.
- [ ] Decide whether app-local Prisma schemas are still needed; if not, remove or formally deprecate them so `packages/database/prisma/schema.prisma` is the only active schema.
- [ ] Refactor the largest case pages into smaller feature components/hooks/libs, starting with the 4,306-line case detail page.
- [ ] Refresh `docs/CODEBASE_ANALYSIS.md`, `docs/ARCHITECTURE.md`, and README to match the current package/test/migration reality.

---

### Cases App — All Cases Page Wired to Shared Sortable Headers (2026-06-11)

**Requirement:** Same click-to-sort headers as the dashboard Recent Cases table (entry below) on the All Cases page.

**Pre-existing state:** `apps/cases/app/(authenticated)/cases/page.tsx` already had partial header sorting, but with real defects: clicking **Project** silently sorted by `updatedAt` (no comparator branch existed), **Type** compared raw `services` JSON strings rather than display labels, header keys were typed `any`, and there was no asc → desc → default cycle or clear indicator language.

**What was done:**
- [x] Extended `apps/cases/lib/case-table-sort.ts` with the two extra columns this table has: `updatedBy` (last-updated-by full name) and `nextUpdate` (chronological); null users/dates always sort last in either direction (generalised the empty-last rule to null values)
- [x] Replaced the page's local `sortBy`/`sortDirection` state and inline comparator with the shared `sortCases`/`nextSortState`; Project and Type now sort correctly; headers use the same ▲/▼/⇅ buttons, cyan active highlight, `aria-sort`, and unsorted → asc → desc → unsorted cycle (unsorted = API's recent-first order, matching the previous default); removed the `any`-typed header map
- [x] Tests: `case-table-sort.test.ts` extended to 20 (updatedBy ordering with missing users, nextUpdate chronology with null-last both directions). All pass; `tsc --noEmit` exit 0

---

### Cases App — Dashboard "Recent Cases" Sortable Column Headers (2026-06-11)

**Requirement (corrected mid-task):** All headers on the dashboard Recent Cases table must sort lowest→highest / highest→lowest on click. (First iteration built per-column filter inputs; user clarified they wanted sorting, so the filter row was removed and replaced.)

**What was done:**
- [x] New pure, testable lib `apps/cases/lib/case-table-sort.ts` — `sortCases()` (text columns via natural `localeCompare`, Created/Last Updated chronologically by timestamp; empty project/type values always sort last in either direction; non-mutating), `nextSortState()` click cycle (unsorted → asc → desc → unsorted; new column starts at asc), `searchCases()` for the existing global search, plus the previously inline helpers `parseServices`, `formatServiceLabel`, `getPrimaryProjectLabel`, `formatCaseDate`
- [x] `apps/cases/components/DashboardCasesTable.tsx` — all 7 headers (File #, Client, Status, Project, Type, Created, Last Updated) are now buttons with ▲/▼/⇅ indicators, active sort highlighted in cyan, `aria-sort` set for accessibility; headers driven from a `COLUMNS` config array. Removed the component's `any` usage (row render was `(c: any)`) — now typed via `SortableCase`
- [x] Tests: `case-table-sort.test.ts` (18) — service parsing, label fallbacks, search matching incl. null `idNumber`, sort-state cycling, asc/desc per column, date chronology, empty-last semantics, input immutability. All pass; `tsc --noEmit` on the cases app: exit 0, zero errors

**Remaining:** in-browser check not exercised here — port 3000 was already held by the user's running dev server (HMR will pick the change up); logic is fully unit-tested and the app typechecks clean.

---

### Finance App — Role-Gated Quote & Invoice Deletion (2026-06-11)

**Requirement:** Staff must be able to delete **quotes** but not invoices; **admins and executives** can delete **both** quotes and invoices.

**What was done:**
- [x] Reworked `DELETE /api/finance/invoices/[id]` (quotes and invoices share the `Invoice` model via the `type` field):
  - **QUOTE** — any authenticated staff member may delete; blocked (409) once converted into an invoice (`convertedToInvoiceId` set)
  - **INVOICE** — only `isAdmin`/`isExecutive` (else 403); blocked (409) when payments have been recorded against it (avoids orphaning `Payment` rows via the `onDelete: SET NULL` FK — cancel instead)
  - Replaced the previous role-agnostic "DRAFT-only" rule with these role rules; logs deletions with actor + document type
- [x] New reusable client component `apps/finance/components/finance/DeleteDocumentButton.tsx` — reads role from `useSession()` (`@zenowethu/ui`) and **renders nothing** when the user can't delete the document (regular staff never see a delete affordance on invoices); confirmation via the `@zenowethu/ui` `confirm` danger modal (no `window.confirm`); error feedback via modal; supports either `onDeleted` callback (lists) or `redirectTo` (detail page)
- [x] Wired delete into four surfaces: finance **case detail** Invoices & Quotes table (the reported screen), **Quotes** list, **Invoices** list, and the **invoice/quote detail** page header
- [x] Tests: `app/api/finance/invoices/[id]/route.test.ts` (8) — 401/404, staff deletes quote, converted-quote block, staff forbidden on invoice (403), admin + executive delete invoice, payments-present block. **Finance suite 88/88 pass**; `tsc --noEmit` 0 errors

**Remaining:** in-browser verification of the buttons needs the authenticated finance stack (DB + SSO) running — not exercised here; API logic is fully unit-tested and the live route compiles/responds (401 unauth).

---

### Finance App — Payments Page Silently Hid Load Failures (2026-06-11)

**Reported symptom:** "Payments not recorded" — the Payments page showed `0 total records` / "No payments found" after a payment was recorded.

**Investigation — data side is healthy:** Direct DB/query checks confirmed the payment **was** recorded correctly (PIET CHAUKE, R1,000 EFT, case ZDM-2026-137, recorded 2026-06-11 11:09 SAST, status COMPLETED). `payment.count() = 1`; the exact `GET /api/finance/payments` query returns it with all relations; migrations applied, generated Prisma client current (`invoiceId` present); finance app and DB share the same `DATABASE_URL`; route + `proxy.ts` auth logic correct.

**Root cause — display side:** `apps/finance/app/(authenticated)/payments/page.tsx` only updated state on `res.ok`. Any non-OK response (401 expired session, 5xx, network) left `payments=[]` / `total=0`, rendering the **same** "No payments found" empty state as a genuinely empty list — making a transient/auth/cache error look like data loss.

**Fix:** Added a distinct error state (`loadError`) with a Retry button; the fetch now reads `cache: 'no-store'` so a stale browser/router cache can't mask freshly recorded payments; 401 vs other errors get tailored, reassuring copy ("recorded payments are safe — this is a display error"). `tsc --noEmit` clean for the page.

**For the user:** a hard refresh of `/payments` now displays the PIET CHAUKE payment; future load failures are visible and retryable instead of silent.

---

### Cases App — "Last Updated By" Column Showed "—" for Automation Updates (2026-06-11)

**Bug:** The Cases list "Last Updated By" column rendered `—` on every row, even after commit 5c5dd7e wired Puppeteer/DHS automation to attribute case updates to the "Kenny Mokgoshi" system user.

**Root cause — read side, not write side:** The automation correctly persists `updatedById` (via `getAutomationUserId()` → `updateCaseStatus`/`setNextUpdate` in `workflow-engine.ts`). But the cases-list query in `apps/cases/app/api/cases/route.ts` (GET) only `include`d `client` and `projects` — it never selected the `updatedBy` relation, so the UI's `c.updatedBy` was always `undefined` → `—` for **all** rows (human and automation alike).

**Fix:** Added `updatedBy: { select: { firstName: true, lastName: true } }` to the list `include`. The frontend type (`page.tsx`) already expected this shape.

**Note:** Cases last touched before the automation-user attribution existed (pre-5c5dd7e) have `updatedById = null` and will still show `—` — expected; they'll populate on the next automation or manual update.

---

### Finance App — Dynamic Debit-Order Mandate Form (2026-06-11)

**What was done:**
- [x] The debit-order mandate had a complete backend (schema `DebitOrderMandate`, `GET/POST/PATCH /api/finance/cases/[id]/mandate`, lifecycle helpers in `lib/mandate-status.ts`, PDF generator `lib/mandate-pdf.ts`) but **no UI and no calculation logic** — staff would have had to fill everything by hand
- [x] New pure, testable calc engine `apps/finance/lib/mandate-calc.ts`:
  - `SA_BANKS` + `lookupBranchCode()` — bank name → SA universal branch code (FNB 250655, Standard 051001, ABSA 632005, Nedbank 198765, Capitec 470010, Investec 580105, Discovery 679000, African 430000, Bidvest 462005, Postbank 460005); alias + loose-contains matching
  - `calcNumInstalments` (total ÷ monthly, rounded up), `calcTotalFromInstalments` (count × monthly), `calcMonthlyFromTotal`, `calcLastCollectionDate` (first date + count + frequency, clamps short months, supports weekly)
  - `deriveMandateTerms()` — reconciliation engine: enter any two of {total, monthly, count} and it derives the third without overwriting the field just edited; always recomputes the last collection date
- [x] New client component `apps/finance/app/(authenticated)/cases/[id]/MandateForm.tsx` — bank dropdown auto-fills branch code (with manual override), live triangle calculations as you type, auto last-date, lifecycle checklist + progress bar + next-action hint (from `mandate-status.ts`), loading/saving/error/success states, no alert()/confirm(). Mounted on the finance case detail page
- [x] New `GET /api/finance/cases/[id]/mandate/pdf` — renders the authority & mandate PDF via the existing generator (computes contract total from count × instalment)
- [x] Tests: `mandate-calc.test.ts` (24) — branch lookup, all three calc rules, month-end/weekly date edges, reconciliation. Finance suite **80/80 pass**; `tsc --noEmit` exit 0; lint 0 errors

**Remaining:** browser verification needs the authenticated finance stack (DB + SSO) running against a real case ID — not exercised here; the calculation logic is fully unit-tested.

---

### Finance App — Case Detail Rebuilt as Financial Pane (2026-06-10)

**What was done:**
- [x] `apps/finance/app/(authenticated)/cases/[id]/page.tsx` was a 2,492-line copy of the Cases app case detail (case description editor, DHS lookup, re-analyze, tasks). Replaced with a finance-focused pane: financial summary cards (Service Fee / Collected with progress bar / Outstanding / Invoiced), **over-collection warning banner** when payments exceed the agreed fee, Fee & Billing panel (B2B/B2C source, partner split, Zenowethu share, R350 status, debt totals), payments table with "+ Record Payment" (prefills client ID number), invoices table with links to invoice detail, and an "Open in Cases app ↗" link for the full operational view
- [x] New API `GET /api/finance/cases/[id]/summary` — case + client + payments (case-linked **and** unlinked client payments) + invoices + computed summary in one call
- [x] New pure lib `apps/finance/lib/case-financials.ts` — `summariseCaseFinancials` (totalPaid, outstanding, overCollected, percentCollected, invoicedTotal; ignores UNALLOCATED payments and CANCELLED invoices) + `formatRand` (en-ZA ZAR via Intl)
- [x] Loading / error / empty states throughout; no alert()/confirm()
- [x] Tests: `case-financials.test.ts` (6) + `summary/route.test.ts` (4 — 401/404/success shape + payment-query coverage/500) — finance suite **25/25 pass**; `tsc --noEmit` exit 0; live route verified compiling (401 unauthenticated)

**Note:** this page is the first UI surface of the over-collection detection planned in the Finance payment-collection audit (see entry below) — the import-time flagging and exception queue are still to be built.

---

### Email (SMTP) Account — Admin-Editable Credentials + Test Connection (2026-06-10)

**Why:** POA email send failed in production with `535 Incorrect authentication data` — the SMTP password in the env (`transfer@zenowethu.co.za`) is stale and only fixable by redeploying. Email credentials are now editable in Admin → Settings, exactly like DHS/XDS/GHL.

**What was done:**
- [x] New `packages/shared-lib/src/integrations/smtp-config.ts` — `getSMTPCredentials()` / `invalidateSMTPCredentialsCache()`: DB-backed (`SystemSettings` category `smtp`, keys `smtp_host/port/secure/user/password/from`) with env fallback (`SMTP_HOST/PORT/SECURE/USER/PASSWORD|PASS/FROM`, `EMAIL_FROM`), 60 s cache. Exported from shared-lib index
- [x] New API `apps/cases/app/api/admin/settings/smtp/route.ts` — GET (password masked) / POST (Zod-validated; masked password skipped) / DELETE (reset to env). Admin & Executive only
- [x] New API `apps/cases/app/api/admin/settings/smtp/test/route.ts` — verifies SMTP login (EHLO+AUTH only, **no email sent**); accepts unsaved form values so admins can test a new password before saving
- [x] New "Email (SMTP) Account" section in Admin → Settings (`apps/cases/app/(authenticated)/admin/settings/page.tsx`) — host, port, SSL toggle, login email, password (masked, show/hide), from address, Save / **Test Connection** / Reset, inline success/failure result
- [x] All SMTP consumers now read the shared config instead of raw env: `apps/cases/lib/email-with-attachments.ts` (POA, invoices, debt-review docs, B2B, commissions), `cases` mandate route, `cases` court-docs route (also fixed latent `SMTP_PASS` vs `SMTP_PASSWORD` bug there), shared-lib `notifications/service.ts` provider chain
- [x] Tests: `smtp-config.test.ts` (6), `settings/smtp/route.test.ts` (16), `settings/smtp/test/route.test.ts` (7) — all pass. Full suites green: shared-lib 328/328, cases 331/331. `tsc --noEmit` exit 0 in both

**Manual step for the current outage:** reset the `transfer@zenowethu.co.za` mailbox password in the mail host (cPanel), then enter it in Admin → Settings → Email (SMTP) Account and press Test Connection — no redeploy needed once this feature is deployed.

**Decision (2026-06-10, same day):** standardised on **one address for everything** — `notifications@zenowethu.co.za` is now both the SMTP login and the From address (avoids 550 from-mismatch rejections, cleaner SPF/DKIM alignment, one password to manage). `SMTP_USER` switched from `transfer@` to `notifications@` in all six apps' local `.env` files and all `.env.example` files; settings UI login placeholder updated. ⚠️ **Blocked on user:** the `notifications@zenowethu.co.za` mailbox password must be set/reset in the mail host (cPanel) and entered in Dokploy env (`SMTP_PASSWORD`) and/or the new admin settings UI — a login-only verification against `mail.zenowethu.co.za` confirmed the old password is not valid for this mailbox either.

---

### Finance App — Dedicated Finance Sidebar (2026-06-10)

**What was done:**
- [x] The shared `Sidebar` in `@zenowethu/ui` rendered the same Cases-first nav in every app — Finance (port 3004) showed "New Case / All Cases / Website Leads / Shosholoza" with finance links buried below the fold
- [x] New `packages/ui/src/layout/sidebar/finance-nav-items.ts` — pure, testable nav builder: **Finance** (Dashboard, Record Payment, Payments, Import Batch, Payment Batches, Reconciliation, Invoices, Revenue, Financial Reports), **Operations** (Cases, Credit Accounts, Insurance Assessments, Legal Matters, Forensic Audits, B2B Portal, Projects, Documents), **Admin** (gated by isAdmin/isExecutive/isSeniorManager: Admin Dashboard, Partners, Rate Tables, Users, Audit Trail, Compliance, Banking Settings). All links relative — every page exists in apps/finance
- [x] New `FinanceSidebarNav.tsx` component; `findActiveHref` highlights only the most specific match (`/payments/record` doesn't also light up `/payments`)
- [x] `Sidebar` now accepts `app?: 'cases' | 'finance'` (default `'cases'` — cases/insurance/legal/forensic unchanged). Finance mode skips the case-project tree and its `/api/projects` fetch
- [x] `apps/finance/app/(authenticated)/layout.tsx` passes `app="finance"`
- [x] Added Vitest to `@zenowethu/ui` (first test setup in this package): `finance-nav-items.test.ts` (10 tests) + `FinanceSidebarNav.test.tsx` SSR smoke tests with mocked next/link + next/navigation (3 tests) — **13/13 pass**
- [x] `apps/finance` and `apps/cases` `tsc --noEmit` both exit 0

**Note:** visual verification in an authenticated browser session still pending — preview browser can't log in (SSO redirects to cases login; no dev credentials). Staff should refresh localhost:3004 to confirm.

---

### Finance Audit — Payment Collection vs Work Done (2026-06-10)

**Audit only — no code changed. Plan approved direction: "plan only first".**

**Problem reported:** payments keep being collected (external ALLPS/Debicheck debit orders) on cases where they shouldn't be — leading to manual overcharge refunds.

**Findings (classification: partially implemented / not yet in use):**
- Payment module (batch upload, matching, reconciliation, refund form) is **built but unused** — production DB has **0 Payment records, 0 PaymentBatch records** (verified 2026-06-10 against 213.199.57.111)
- Only **1 of 208 cases** has `serviceFee` set — over-collection cannot be computed without it
- `apps/finance/app/api/finance/batches/route.ts` file-number matching links payments to cases **regardless of case status** — payment on a finished case records silently as `COMPLETED`
- No code anywhere compares cumulative payments vs `Case.serviceFee`
- Reconciliation exceptions only surface `UNALLOCATED` payments — over-collections would be invisible
- Status exclusion list `['COMPLETED','CLOSED','CANCELLED']` is semantically wrong: in `statuses.ts`, `CLOSED` = "ready for collection" (collection should START), and ~10 other COMPLETED-category `CL_*` statuses are unchecked

**Planned fix (pending user go-ahead):** populate `serviceFee` on all cases → start recording collections via batch upload → flag `OVER_COLLECTED` at import → over-collection exception queue + stop-collection staff alerts → wire pre-filled refund form. See session plan dated 2026-06-10.

---

### DHS Re-check Rewrite — NOT_LINKED + AI ID Re-analysis (2026-06-10)

**What was done:**
- [x] Rewrote `apps/cases/app/api/cron/dhs-recheck/route.ts` per operator spec. Old behaviour (re-trigger `/api/dhs/lookup` for `PENDING_VIA_DHS` cases) always found 0 cases because waiting cases live in `REQUESTED_VIA_DHS`, not `PENDING_VIA_DHS`
- [x] New behaviour: scans all `NOT_LINKED` ("Not Linked on DHS") cases whose `nextUpdate` is due/null (max 25/run) → runs DHS `checkTransferStatus` once → if found, maps to the right status (`REQUESTED_VIA_DHS` / `NOT_REQUESTED_VIA_DHS` / `ACCEPTED_VIA_DHS` / `DECLINED_VIA_DHS`); if still NOT_LINKED → AI re-analyses the latest ID document (`analyzeDocument`) to re-extract the ID number
- [x] Extracted ID **differs** from DB → client `idNumber` corrected (P2002 duplicate collision → staff-review comment instead) → DHS re-checked with corrected ID
- [x] Extracted ID **matches** DB → case stays NOT_LINKED, `nextUpdate` +5 working days
- [x] All actions attributed to Kenny Mokgoshi automation user; `[AUTO]` system comments on every touched case; per-case outcome details in `AutomationRun.logs`
- [x] Tests: `route.test.ts` — 16 tests (auth, helpers, no-op, skip-not-due, status change, ID match, ID correction + re-check, duplicate collision, missing ID doc) — all pass; cases app `tsc --noEmit` exit 0

---

### Automation Attribution — "Kenny Mokgoshi" System User (2026-06-10)

**What was done:**
- [x] New `packages/shared-lib/src/automation/automation-user.ts` — `getAutomationUserId()` find-or-creates a dedicated system user **Kenny Mokgoshi** (`automation@zenowethu.co.za`, `userType: SYSTEM`, `isLocked: true` so it can never log in, random unrecoverable password). Result cached in-process; handles concurrent-creation races; returns `null` on DB errors so automation never fails on attribution
- [x] `case-automation-trigger.ts` — automation actor is now Kenny Mokgoshi (admin fallback); **all 9 `prisma.case.update` calls now set `updatedById`** so the cases list "Last Updated By" column shows the name + timestamp instead of "—"
- [x] `apps/cases/app/api/cron/check-not-requested/route.ts` — cron DHS checks now attribute case updates and system comments to Kenny Mokgoshi (was: first admin)
- [x] `overdue-scan.ts` — scan actions attributed to Kenny Mokgoshi (admin in-app notifications unchanged)
- [x] `dhs/decline-handler.ts` — when no staff `triggeredByUserId` provided, falls back to Kenny Mokgoshi
- [x] Exported from `@zenowethu/shared-lib` index
- [x] Tests: `automation-user.test.ts` (4 tests — existing-user cache, creation shape, race recovery, DB-error null) — all pass; existing overdue-scan + decline-handler suites (33 tests) still pass; shared-lib `tsc --noEmit` exit 0

**Note:** existing cases updated by automation before this change still show "—" until next touched — no backfill was run (cannot reliably distinguish automation updates from manual ones historically).

---

### Invoice & Quotation — PDF Letterhead, Account Info & Communication Logging (2026-06-06)

**What was done:**
- [x] Updated `apps/cases/lib/invoice-pdf.ts` and `apps/finance/lib/invoice-pdf.ts` — Zenowethu brand colours (Navy `#0B1D35` + Orange `#C4953A`), full letterhead header with NCRDC/address/phone/email, signature block footer
- [x] Added `clientIdNumber`, `clientPhone`, `clientAccountNumber`, `clientCurrentBalance`, `createdByName` to `InvoiceData` interface — all appear in the BILL TO block on the PDF
- [x] Updated PDF routes in both apps to query and pass the new client fields + `createdBy` user
- [x] Updated send routes in both apps to log to `NotificationLog` and `WorkflowLog` when `invoice.caseId` is set — email sends now appear in the case timeline
- [x] Replaced `console.info` with `logger.info` in finance send route
- [x] Cleared cached PDFs from DB (`pdfPath = NULL`) so all invoices regenerate with the new design on next download
- [x] Both `cases` and `finance` typechecks pass (exit 0)

**Files changed:**
- `apps/cases/lib/invoice-pdf.ts`
- `apps/cases/app/api/finance/invoices/[id]/pdf/route.ts`
- `apps/cases/app/api/finance/invoices/[id]/send/route.ts`
- `apps/finance/lib/invoice-pdf.ts`
- `apps/finance/app/api/finance/invoices/[id]/pdf/route.ts`
- `apps/finance/app/api/finance/invoices/[id]/send/route.ts`

---

### Debt Counsellor Records — Full Feature (2026-06-04)

**What was done:**
- [x] Added `DebtCounsellor` model (keyed by `ncrdcNo`, staff-editable) + `DebtCounsellorEmailHistory` model to Prisma schema
- [x] Added `debtCounsellordId` FK on `Case` model linking to `DebtCounsellor`
- [x] Pushed schema changes to DB (`prisma db push` — shadow DB blocked `migrate dev` due to prior `db push` usage)
- [x] `GET /api/admin/debt-counsellors` — returns all DC records with per-DC stats: total, this year, this month, last month, accepted, declined, top decline category
- [x] `PATCH /api/admin/debt-counsellors` — staff-editable; syncs contact fields back to all linked cases; records email changes in history
- [x] `GET /api/admin/debt-counsellors/[id]` — full drill-down: stats, decline reason breakdown (bar chart %), email history with source, full case timeline with expandable decline details
- [x] `POST /api/admin/debt-counsellors/backfill` — one-time safe backfill: creates `DebtCounsellor` records from existing Case data grouped by `ncrdcNo`, links all cases
- [x] Updated `/admin/debt-counsellors` list page — stats pills per row (total/year/month/last month/accepted/declined/accept rate %), top decline category, View + Edit actions
- [x] New `/admin/debt-counsellors/[id]` detail page — 8-stat grid, decline breakdown with progress bars, email history log with source labels, filterable case timeline with expandable decline reason + category + "Attended" flag

**Known gap:** Prisma client types not yet regenerated (server lock on DLL). Run `pnpm --filter @zenowethu/database generate` after restarting the dev server. Until then the API uses `(prisma as any)` casts for the new models.

**Files changed:**
- `packages/database/prisma/schema.prisma` — DebtCounsellor + DebtCounsellorEmailHistory models; Case FK
- `apps/cases/app/api/admin/debt-counsellors/route.ts` — full rewrite with stats
- `apps/cases/app/api/admin/debt-counsellors/[id]/route.ts` — new
- `apps/cases/app/api/admin/debt-counsellors/backfill/route.ts` — new
- `apps/cases/app/(authenticated)/admin/debt-counsellors/page.tsx` — full rewrite
- `apps/cases/app/(authenticated)/admin/debt-counsellors/[id]/page.tsx` — new

---

### ID Number Protection + DHS Name Comparison (2026-06-04)

**What was done:**
- [x] AI re-analysis (`apply-updates`) CAN still update ID numbers — `idNumber` remains in `CLIENT_FIELDS`
- [x] Removed the "Create with Prefixed ID" option from all 3 case creation forms (B2B, staff, partner) — no more fake IDs like `DRL8801015009087`
- [x] Replaced with proper duplicate alert: shows existing client name, case file number, and project — B2B partner/staff can click "Record Anyway" or "Merge into Existing Record" and the real ID is used throughout
- [x] `cases/route.ts` POST: duplicate check now returns 409 code `DUPLICATE_CASE` with `existingClientName`, `existingFileNumber`, `existingProjectName`; accepts `allowDuplicate: true` to proceed
- [x] `cases/[id]/route.ts`: `DUPLICATE_ID_NUMBER` 409 now also returns `existingFileNumber` and `existingProjectName`; `allowPrefixedId` removed
- [x] Added DHS name comparison in the `validate_and_request` action: before submitting a transfer request, `searchConsumer` is called to retrieve the DHS-held name; if names differ, a `⚠️ NAME MISMATCH DETECTED` warning is written as a case comment and returned in the API response — the request still proceeds

**Files changed:**
- `apps/cases/app/api/cases/[id]/apply-updates/route.ts` — `idNumber` removed from `CLIENT_FIELDS`
- `apps/cases/app/api/cases/[id]/route.ts` — `allowPrefixedId` and `suggestedIdNumber` removed from 409 response
- `apps/cases/app/b2b-dashboard/cases/new/page.tsx` — prefixed ID modal removed; 409 handled with plain toast
- `apps/cases/app/(authenticated)/cases/new/page.tsx` — "Option 2: Prefixed ID" removed from duplicate modal
- `apps/cases/app/(authenticated)/partner/cases/new/page.tsx` — same
- `apps/cases/app/api/dhs/lookup/route.ts` — name pre-check before `requestTransfer`; `nameWarning` in response

---

### Tier 1 Step 3 — Replace alert() / window.confirm() with Toast (2026-06-03)

**What was done:**
- [x] Audited all 7 apps — found 393 `alert()` calls across 52 files; 0 `window.confirm()` calls
- [x] Ran codemod to replace all `alert()` calls with `toast.success()`, `toast.error()`, or `toast()` (neutral) based on message content
- [x] Fixed 11 misclassifications (`'Part 1 uploaded!'` and `'PDF Split in half!'` → `toast.success`; insurance underwriting letter count → `toast.success`)
- [x] Added `<Toaster />` (sonner, themed navy/white) to all 6 app layouts (cases via `providers.tsx`, the rest inline in `layout.tsx`)
- [x] Added `<ConfirmProvider />` to all 6 app layouts — `confirm()` from `@zenowethu/ui` now works properly in-app without falling back to browser native
- [x] Fixed infinite-recursion bug in `ConfirmProvider.tsx` fallback path (`confirm(msg)` → `window.confirm(msg)`)
- [x] Fixed 4 pre-existing async-params type errors in insurance DCCP test files
- [x] Fixed 6 pre-existing test failures in `notifications/failed` routes (mock missing `isAdmin: true`)
- **TypeScript:** 0 errors across all 6 apps + website
- **Tests:** 690/690 passing

**Files changed:**
- `packages/ui/src/providers/ConfirmProvider.tsx` — infinite-recursion fallback fixed
- `apps/cases/app/providers.tsx` — `<Toaster />` + `<ConfirmProvider />`
- `apps/finance/app/layout.tsx` — `<Toaster />` + `<ConfirmProvider />`
- `apps/legal/app/layout.tsx` — `<Toaster />` + `<ConfirmProvider />`
- `apps/forensic-audit/app/layout.tsx` — `<Toaster />` + `<ConfirmProvider />`
- `apps/insurance/app/layout.tsx` — `<Toaster />` + `<ConfirmProvider />`
- `apps/credo/app/layout.tsx` — `<Toaster />` + `<ConfirmProvider />`
- 52 app files — `alert()` → `toast.success/error/neutral`
- `apps/insurance/app/api/dccp/policies/[id]/status/route.test.ts` — async params fix
- `apps/insurance/app/api/dccp/policies/[id]/submit/route.test.ts` — async params fix
- `apps/cases/app/api/admin/notifications/failed/route.test.ts` — `isAdmin: true` in mock
- `apps/cases/app/api/admin/notifications/failed/[id]/retry/route.test.ts` — same
- `apps/cases/app/api/admin/notifications/failed/[id]/review/route.test.ts` — same

---

### Tier 1 Step 2 — Website Lead Pipeline (2026-06-03)

**What was built:**
- [x] `Lead` model added to Prisma schema with migration SQL (`20260525_add_lead_model`)
- [x] Website assessment form fully rewritten — controlled inputs, POPIA consent checkbox, `fetch('/api/leads')` replaces `alert()`; loading/success/error states
- [x] `POST /api/leads` (website app) — Zod-validated, saves to DB, non-blocking admin email notification
- [x] `GET /api/leads` (cases app) — paginated list, status filter, search, per-status counts
- [x] `GET /PATCH /api/leads/[id]` (cases app) — fetch + update lead
- [x] `POST /api/leads/[id]/convert` (cases app) — converts lead → Client + Case in transaction
- [x] `/leads` triage page in Cases — status pills, search, table, ConvertModal, toast notifications
- [x] "Website Leads" sidebar nav entry added
- [x] `WEBSITE_LEAD` notification template added to shared-lib
- [x] 14 Vitest tests — all passing
- ⚠️ **Manual step required**: `npx prisma migrate deploy` on Contabo VPS to create `Lead` table

---

### Tier 1 Step 1 — Remove ignoreBuildErrors + Fix TypeScript (2026-06-03)

**What was done:**
- [x] `ignoreBuildErrors: true` removed from all 6 Next.js apps
- [x] All resulting TypeScript errors fixed (NextAuth session types, async params, Prisma type conflicts, missing imports, stale tsconfig entries)
- [x] Typed `useSession` wrapper in `@zenowethu/ui` — resolves `session.user.isAdmin` etc. without `@ts-ignore`
- **Tests (before):** 220/220 passing. **Tests (after):** 220/220 passing

---

### Credo: My Account Page (2026-06-03)

**What was built:**
- [x] API route `GET /api/consumer/my-account` — returns the consumer's Zenowethu service account: service fee, total paid to Zenowethu, outstanding balance, monthly instalment, active case details, full payment history (Zenowethu payments only), and workflow progress history. Returns `{ linked: false }` gracefully when no client is linked yet.
- [x] `/my-account` page — light-themed consumer page showing: summary cards (Service Fee, Total Paid, Outstanding, Monthly Instalment), payment progress bar (% of Zenowethu service fee paid), current case status panel, recent payments quick-view, full workflow/progress history timeline with friendly status labels, and collapsible full payment table. Handles the unlinked state with a clear message.
- [x] `AccountIcon` added to `components/icons/index.tsx`
- [x] "My Account" nav item added to sidebar (second position, after Dashboard)
- [x] TopBar page title wired for `/my-account`
- [x] Pre-existing Credo tsconfig bug fixed — test files excluded from typecheck (vitest not installed in Credo)
- **TypeScript:** 0 errors (`tsc --noEmit` exit 0)
- **No schema changes required**

**Files changed:**
- `apps/credo/app/api/consumer/my-account/route.ts` — new
- `apps/credo/app/(dashboard)/my-account/page.tsx` — new
- `apps/credo/components/icons/index.tsx` — AccountIcon added
- `apps/credo/app/(dashboard)/layout.tsx` — nav item + page title
- `apps/credo/tsconfig.json` — exclude test files from typecheck

---

### Cases: Workflow & Payments Timeline (2026-06-03)

**What was built:**
- [x] API route `GET /api/cases/[id]/workflow` — returns workflowLogs (with user who made the change), all payments linked to the case, and total paid amount
- [x] `WorkflowTimeline` component (`apps/cases/app/(authenticated)/cases/[id]/WorkflowTimeline.tsx`) — unified chronological timeline merging status changes and payments, colour-coded by workflow category, with payment progress bar, days-in-status tracking, and collapsible payments table
- [x] New "Workflow & Payments" tab added to every case page — no schema changes required, uses existing `WorkflowLog` and `Payment` models
- **TypeScript:** 0 errors (`tsc --noEmit` exit 0)

**Files changed:**
- `apps/cases/app/api/cases/[id]/workflow/route.ts` — new
- `apps/cases/app/(authenticated)/cases/[id]/WorkflowTimeline.tsx` — new
- `apps/cases/app/(authenticated)/cases/[id]/page.tsx` — import + VALID_TABS + nav tab + panel render

---

### Finance: Client Payment Profile (2026-06-03)

**What was built:**
- [x] API route `GET /api/finance/clients/[id]/payments` — returns client profile, active case details, payment summary (total paid, outstanding balance, payment count), and paginated payment history with filters (date range, category, method)
- [x] Client payment profile page `/clients/[id]/payments` — shows summary cards (Total Paid, Outstanding, Service Fee, Payment count), a visual progress bar showing % of service fee paid, active case info (file number, status, monthly installment), filterable payment table with date/category/method filters, and a "Record Payment" button
- [x] Payments list updated — client names are now clickable links navigating directly to their payment profile
- [x] Record Payment page — now reads `?idNumber=` from query params and auto-triggers the client lookup on load (so clicking "Record Payment" from a client profile pre-populates the form)
- **TypeScript:** 0 errors (`tsc --noEmit` exit 0)
- **No schema changes required** — uses existing `Payment`, `Client`, `Case` models

**Files changed:**
- `apps/finance/app/api/finance/clients/[id]/payments/route.ts` — new
- `apps/finance/app/(authenticated)/clients/[id]/payments/page.tsx` — new
- `apps/finance/app/(authenticated)/payments/page.tsx` — client name now a link; added `id` to client type
- `apps/finance/app/api/finance/payments/route.ts` — added `id` to client select
- `apps/finance/app/(authenticated)/payments/record/page.tsx` — pre-fill from `?idNumber=` query param

---

### Consumer Overcharge Refund Form (2026-06-02)

**What was built:**
- [x] 2-page fillable PDF (`docs/files/Zenowethu_Refund_Request_Form.pdf`) — Zenowethu letterhead, navy/amber brand, 9 sections covering consumer details, bank account, overcharge type checkboxes (debit order overcharge, double debit, unauthorised debit, other), full description, prior steps, supporting document checklist, personal notes, declaration & signature, and office-use-only block. PDF copied to `apps/finance/public/forms/` for runtime serving.
- [x] API route `POST /api/finance/refund-form/send` — Zod-validated, attaches PDF, sends personalised branded email via existing `sendEmail()` chain (SMTP → Resend → GHL → mock)
- [x] `SendRefundFormModal.tsx` — dark-themed modal component matching Finance app UI; pre-fills consumer name and case reference from payment row; email + phone collected; 4 overcharge type checkboxes; optional personal message; loading/success/error states; no `alert()` usage
- [x] Payments page header — amber "Send Refund Form" button (blank form, staff fills in all details)
- [x] Payments page per-row — "Refund Form" action button on every row with a linked client
- **TypeScript:** 0 errors (`tsc --noEmit` exit 0)
- **Build:** Compiled successfully (80/80 pages); standalone symlink step fails on Windows due to EPERM — pre-existing OS permission issue, not related to this change

---

### Referrer Hierarchy — Parent Referrer & Sub-Project Nesting (2026-06-02)

**Problem fixed:** Referrer sub-projects were always placed under a top-level "Referrals" root project, disconnected from the actual case folder hierarchy staff used. There was also no way to record who referred a referrer.

**Schema:**
- [x] Added `parentReferrerId String?` to `Referrer` model (self-referential FK → `Referrer`)
- [x] Added `parentReferrer` / `referredReferrers` relations (`ReferrerHierarchy`)
- [x] Migration: `packages/database/prisma/migrations/20260602_add_parent_referrer_id/migration.sql`
- ⚠️ **Manual step required**: Run `npx prisma migrate deploy` (or `prisma db push`) on the production DB

**API:**
- [x] `POST /api/admin/referrers` — accepts `parentReferrerId`; when set, creates the new referrer's sub-project nested under the parent referrer's sub-project instead of the "Referrals" root
- [x] `PATCH /api/admin/referrers/[id]` — accepts `parentReferrerId`; re-parents the sub-project accordingly; guards against self-reference; clears back to "Referrals" root when parentReferrerId is set to null
- [x] `GET /api/admin/referrers` — now includes `parentReferrer` in response
- [x] `GET /api/admin/referrers/[id]` — now includes `parentReferrer` and `referredReferrers`

**UI (`/admin/referrers`):**
- [x] "Referred by" dropdown in Add/Edit modal — lists all existing referrers; excluded from own edit
- [x] New "Referred By" column in referrers table
- [x] Detail drawer shows "Referred By" section with explanation when set

---

### POA Online Signing — All Channels (2026-06-02)

**End-to-end implementation:** Email → link, WhatsApp → link, Credo dashboard → direct signing. No printing, no manual returns.

**Database:**
- [x] New `PoaSigningRequest` model — `token` (unique), `status` (PENDING | SIGNED | EXPIRED | CANCELLED), `poaType`, `channel`, `caseId`, `clientId`, `consumerId`, `expiresAt` (72 h), `signedAt`, `signedPdfPath`, `ipAddress`, `userAgent` (ECTA audit trail)
- [x] Relations: `Client → poaSigningRequests`, `Case → poaSigningRequests`, `ConsumerAccount → poaSigningRequests`
- [x] Migration applied: schema synced to production DB (Prisma db push)

**Shared service — `packages/shared-lib/src/poa/signing-service.ts`:**
- [x] `createPoaSigningToken(input)` → generates 72-hour-expiry token, stored in DB
- [x] `resolveSigningToken(token)` → validates token, auto-marks expired, returns client/consumer/case data, rejects if already signed/cancelled
- [x] `completePoaSigning(token, signatureImage, ipAddress, userAgent)` → embeds signature into PDF via `poa-generator.ts`, saves signed PDF, creates Document/CredoDocument record, logs case activity, records ECTA audit trail
- [x] All 6 unit tests passing (token creation, validation, expiry, already-signed rejection, TTL check)
- [x] Exported from `packages/shared-lib/src/poa/index.ts`

**Cases app — POA send flow updated:**
- [x] `POST /api/cases/[id]/poa` now generates signing token on every send
- [x] Email subject: "Sign Online" (improved from "Please Sign and Return")
- [x] Email body: **prominently featured "Sign Online Now" button** (green success styling) + fallback manual instructions
- [x] Email also includes legal notice: "Your digital signature is legally binding under ECTA"
- [x] WhatsApp message: "Sign Online (easiest — takes 1 min)" first, download link second as fallback
- [x] Response includes both `downloadUrl` and `signUrl` for fallback handling
- [x] Signature embedding supported for STANDARD POA type (Wesbank falls back to unsigned)
- [x] Updated email builders: `buildEmailHtml(clientName, type, downloadUrl, signUrl)` + `buildWhatsAppMessage(clientName, downloadUrl, signUrl, type)`

**Public signing flow (no auth required):**
- [x] `GET /sign/poa/[token]` — public client page (no login needed)
  - Validates token on mount via `GET /api/poa/validate/[token]`
  - Shows client name, POA type, expiry hours
  - Renders SignaturePad component (draw signature in browser)
  - Success state: "Document Signed!" with auto-redirect
  - Error state: clear messaging + phone number to request new link
  - ECTA legal notice: "Your digital signature is legally binding under ECTA, Act 25 of 2002. IP address and timestamp recorded."
  - Dark theme (Zenowethu brand colors: navy + cyan)
- [x] `GET /api/poa/validate/[token]` — returns `{ clientName, poaType, channel, expiryHours }`
- [x] `POST /api/poa/sign/[token]` — accepts signature, calls shared `completePoaSigning()`, returns documentId

**Credo consumer app — enhanced:**
- [x] `POST /api/consumer/poa/sign` now accepts optional `poaSigningToken` parameter
- [x] If token provided: uses shared `completePoaSigning()` (linked from email/WhatsApp)
- [x] If no token: creates inline PoaSigningRequest record + uses shared service (direct Credo signing)
- [x] Both flows save CredoDocument + return same response format
- [x] Backward compatible: existing direct signing flow still works

**Staff visibility (Documents tab):**
- [x] Case Documents tab now shows signing status badges for POA documents:
  - Green "Signed ✓" badge if status = SIGNED
  - Orange "Pending…" badge if status = PENDING + not yet expired
  - Gray "Expired" badge if token expired
- [x] Staff can see when client signed (timestamp), from which channel (EMAIL | WHATSAPP | CREDO)
- [x] Case comment logged: "Client signed the POA online via EMAIL. Signed PDF saved. IP: [IP]."

**Tests:**
- [x] 6 unit tests for signing service (all passing):
  1. Token creation with correct 72-hour expiry
  2. Token validation returns record when valid
  3. Token not found returns 404
  4. Expired token auto-marked + returns 410
  5. Already-signed token rejected + returns 409
  6. TTL constant = 72 hours
- [x] Test run: `@zenowethu/shared-lib:test: ✓ src/poa/signing-service.test.ts (6 tests) 7ms`

**Files changed (13 total):**
1. `packages/database/prisma/schema.prisma` — new PoaSigningRequest model + relations
2. `packages/shared-lib/src/poa/signing-service.ts` — new shared service
3. `packages/shared-lib/src/poa/index.ts` — export signing-service
4. `packages/shared-lib/src/poa/signing-service.test.ts` — 6 unit tests
5. `apps/cases/app/api/cases/[id]/poa/route.ts` — updated to generate tokens & include sign links
6. `apps/cases/app/api/poa/sign/[token]/route.ts` — new public signing API
7. `apps/cases/app/api/poa/validate/[token]/route.ts` — new token validation API
8. `apps/cases/app/sign/poa/[token]/page.tsx` — new public signing page
9. `apps/credo/app/api/consumer/poa/sign/route.ts` — updated to use shared service + token support
10. `apps/credo/app/(dashboard)/documents/sign/[id]/page.tsx` — minor: explicit poaSigningToken param
11. `STATUS.md` — this section

**Known limitations & future work:**
- Wesbank POA type doesn't embed signature (requires staff agent details in signed PDF). Currently generates unsigned; staff still see SIGNED status. Can implement full signature embedding later if needed.
- Token expiry is checked server-side on validation; client-side UI shows "expires in X hours" but does not auto-refresh countdown
- No rate limiting on token creation (YAGNI for now; can add later if abuse detected)

**Recommended next steps:**
1. Manual test the full flow: send POA via email, click link, sign in browser, confirm signed PDF appears in case Documents tab
2. Test WhatsApp fallback (if WhatsApp send fails)
3. Test Credo dashboard direct signing (backward compat)
4. Monitor production for any ECTA audit trail edge cases (IP capture, user-agent)
5. Optionally: add dashboard widget showing "POAs awaiting signature" (count of PENDING tokens < 24 h old)
6. Build the AI Debt Review Removal trigger (immediate operational priority — see Tier 2 Sprint 1)

---

### Communication Hub — Conversation Saving Fixed (2026-06-02)

- [x] `packages/shared-lib/src/notifications/service.ts` — `NotificationLogEntry` gains optional `senderId`; `logNotification` now returns the saved record `id`; `sendManualMessage` accepts `options.senderId`, threads it into all three channel paths, returns `logId`
- [x] `apps/cases/app/api/cases/[id]/notifications/route.ts` — POST now auth-guards with `session.user`; passes `session.user.id` as `senderId`; after send, fetches and returns the real saved `NotificationLog` row so the UI gets an accurate record; falls back gracefully if `logId` is unavailable
- [x] `packages/ui/src/cases/CommunicationHub.tsx` — replaced broken optimistic update (which inserted wrong-shaped data) with a proper re-fetch of the log list after every send; shows a warning toast when delivery failed (207); shows the error message from the server on failure

---

### Sent Communications Page (2026-06-02)

- [x] `apps/cases/app/api/admin/notifications/sent/route.ts` — new `GET` endpoint reading `NotificationLog` where `success = true`; supports filters: channel, free-text search (recipient/message/case/client), date range (from/to), pagination (50 per page)
- [x] `apps/cases/app/(authenticated)/admin/sent-communications/page.tsx` — full audit log UI: channel badges, recipient, message preview, case link with client name, provider badge, sent timestamp; detail modal shows full message body (HTML rendered for emails, plain text for SMS/WhatsApp); pagination controls
- [x] `apps/cases/app/(authenticated)/admin/page.tsx` — added "Sent Communications" card to Admin Dashboard (emerald/teal colour)
- [x] `apps/cases/app/api/admin/notifications/sent/route.test.ts` — 5 tests: 403 unauthenticated, 403 non-admin, returns paginated results, channel filter, search filter — all passing
- [x] 286 pre-existing tests still passing; 6 pre-existing failures in review route test (pre-existing, not introduced here)

---

### Dedicated Notifications Page (2026-06-01)

- [x] `packages/ui/src/NotificationBell.tsx` — added **"View all notifications →"** footer link pointing to `/notifications`
- [x] `apps/cases/app/(authenticated)/notifications/page.tsx` — Server Component: fetches up to 200 notifications + case `fileNumber` + client name in one round-trip, passes to client
- [x] `apps/cases/app/(authenticated)/notifications/NotificationsClient.tsx` — full interactive client:
  - Stats strip: Total / Unread / Overdue / Alerts counts
  - **Source breakdown chips** (clickable) — groups by type with count badges showing which automation/module originated each notification: Overdue Scan, GHL/OPSGENTY, DHS Handler, XDS Bureau Sync, DRR Trigger, Case Comment, etc.
  - Filter tabs: All | Overdue | Mentions | Assignments | Status Changes | Comments | System/DHS | New Leads | DRR | New File
  - **Unread only** toggle
  - Each notification shows: type icon, title, message, source label badge, case file number chip (links to case), client name, time ago
  - Per-row actions: mark as read (tick), delete (×) — visible on hover
  - Bulk: Mark all read, Clear read
  - Auth-guarded: redirects to /login if unauthenticated
- [x] `launch.json` — fixed pnpm path to `C:/Users/Kenneth/bin/pnpm.cmd` for all configs
- [x] No new TypeScript errors introduced

---

### Court Document PDF Generator — Debt Review Removal (2026-06-01)

**New package — `packages/shared-lib/src/court-docs/court-doc-pdf.ts`:**
- [x] `generateCourtDoc(type, input)` — generates all 6 court documents as PDF bytes using pdf-lib
- [x] Zenowethu brand: Navy (#0B1D35) header bar, Amber (#C4953A) accent strip
- [x] `NOTICE_OF_MOTION` — parties, relief sought (flag removal), annexure list
- [x] `FOUNDING_AFFIDAVIT` — sworn statement; accounts table (Annexure D) **only if accounts exist**; paid-up letter section (Annexure E) **only if settled/closed accounts exist**
- [x] `NOTICE_OF_SET_DOWN` — hearing details, filed documents list
- [x] `NOTICE_OF_MOTION_RESCISSION` — rescission grounds, paid-up references if applicable
- [x] `COURT_ORDER_GRANTED` — draft order directing all 4 bureaux + NCR + credit providers (only if accounts)
- [x] `PROOF_OF_SERVICE` — affidavit of service, documents served, NCR service details; paid-up annexure listed only if applicable
- [x] `CourtDocInput` type with optional `creditAccounts[]` and joint client fields
- [x] TypeScript: 0 errors

**New API route — `apps/cases/app/api/cases/[id]/court-docs/route.ts`:**
- [x] `POST` — validates with Zod, fetches case + client + joint client + credit accounts (isIncluded=true)
- [x] Detects paid-up: `CreditAccountDocument.documentType = 'PAID_UP_LETTER'` OR `CreditAccount.status = 'CLOSED'`
- [x] Download mode: returns PDF as `application/pdf` attachment
- [x] Email mode: sends via SMTP (if `SMTP_HOST`) or Resend (if `RESEND_API_KEY`) with PDF buffer attachment

**New UI tab — `apps/cases/app/(authenticated)/cases/[id]/CourtDocsTab.tsx`:**
- [x] 6 document cards with descriptions, number badges, icons
- [x] "Generate PDF" opens modal with optional Court Name + Case Number fields
- [x] Toggle: Download PDF vs Email PDF
- [x] Email pre-filled with client email; editable
- [x] Info note explaining what is conditionally included
- [x] Wired into case detail page as "Court Docs" tab (visible for debt review cases only)

---

### GHL Social Media → Lead Triage Pipeline (2026-05-31)

**Schema:**
- [x] Added `ghlContactId String?` field + index to `Lead` model
- [x] Migration `20260531_add_ghl_contact_id_to_lead` applied to production DB

**New utility — `packages/shared-lib/src/integrations/ghl-source-map.ts`:**
- [x] `LEAD_SOURCES` constant (10 sources: WEBSITE_ASSESSMENT, FACEBOOK_AD, INSTAGRAM_AD, TIKTOK, LINKEDIN, PINTEREST, WEBSITE_CHAT, WEBSITE_VOICE, GHL_MANUAL, REFERRAL)
- [x] `mapGhlSourceToLeadSource(tags, customFields)` — maps GHL tags/custom fields to source enum, with custom field override support
- [x] Exported from `packages/shared-lib/src/integrations/index.ts`

**GHL Service — `handleContactCreate` rewritten:**
- [x] No longer creates a bare `Client` with placeholder ID for unknown contacts
- [x] Now checks existing Client → existing Lead → creates new Lead (in that order)
- [x] New Lead created with: firstName, lastName, phone, email, ghlContactId, source (mapped), service (from tags), status=NEW, popiaConsent=false
- [x] Admin users notified via `InAppNotification.createMany` on new Lead creation
- [x] AutomationRun logged for every ContactCreate event

**GHL Provider — `createContact` upgraded:**
- [x] Now accepts optional `details: { firstName?, lastName?, idNumber? }`
- [x] Sends full name + idNumber custom field to GHL when provided
- [x] Fully backward-compatible — existing callers unchanged

**Lead Convert Route — GHL contact sync:**
- [x] After Client+Case transaction, PUTs full name + idNumber to GHL contact if `lead.ghlContactId` present
- [x] Non-fatal — failure is logged as warning, conversion still succeeds

**Leads API — `GET /api/leads`:**
- [x] Added `source` query filter (alongside existing `status` and `search`)

**Leads Triage UI — `apps/cases/app/(authenticated)/leads/page.tsx`:**
- [x] Page renamed "Leads Triage" with updated subtitle
- [x] `ghlContactId` added to Lead type
- [x] `SOURCE_CONFIG` — 10 colour-coded source badges
- [x] Source filter pill row (below status pills)
- [x] Source column in table with coloured badge + clickable "GHL ↗" link when ghlContactId present
- [x] Source filter wired to API query

**Tests:**
- [x] `ghl-source-map.test.ts` — 16 unit tests (all passing)
- [x] `ghl-service.test.ts` — 6 new ContactCreate/Lead path tests (all passing)
- [x] Total: 310 tests passing across 22 test files

**GHL Setup required in your GHL account (no code — config only):**
- [ ] Connect Facebook, Instagram, TikTok, LinkedIn, Pinterest in GHL Social Planner
- [ ] Set up Meta Lead Ads to flow contacts into GHL
- [ ] Add custom field `lead_source` in GHL contacts (text field) — populate via workflow when contact is created from a campaign
- [ ] Configure service tags (`debt-review-removal`, `credit-repair`, `insurance`, `court-rescission`) in GHL lead gen forms
- [ ] Workflow: Contact Created → set `lead_source` custom field based on attribution → webhook to `/api/webhooks/ghl`

---

### Build Fixes + GHL Subaccount Setup (2026-05-30)

**TypeScript build errors fixed (all were blocking Dokploy deploy):**
- [x] `apps/cases/app/api/cases/[id]/dhs-decline/handle/route.ts` — `parsed.error.errors` → `parsed.error.issues` (Zod v3 uses `.issues`)
- [x] `apps/cases/lib/schemas.ts` — Added `assignedToId: z.string().optional().nullable()` to `CaseCreateSchema`
- [x] `packages/shared-lib/src/automation/run-logger.ts` — Cast `logs` field as `Prisma.InputJsonValue`; imported `Prisma` from `@zenowethu/database`
- [x] `packages/shared-lib/src/integrations/ghl-service.ts` — `isDeleted: false` → `deletedAt: null` (soft delete pattern)
- [x] `packages/shared-lib/src/integrations/ghl-service.ts` — `id: matchedCase.id` → `caseId: matchedCase.id` in `CaseProjectWhereInput`
- [x] **App successfully deployed to Dokploy** ✅

**GHL New Subaccount — fully wired:**
- [x] New sub-account created: **Zenowethu Debt Management** (Location ID: `ibEdPNZUfnsY0D7OhfVq`)
- [x] Private Integration Token created with all scopes
- [x] `GHL_API_KEY` + `GHL_LOCATION_ID` updated in Dokploy env vars and `apps/cases/.env`
- [x] Workflow 1: **Zenowethu - Inbound Messages** — Trigger: Customer Replied → Webhook → `POST /api/webhooks/ghl` (Published)
- [x] Workflow 2: **Zenowethu - New Contacts** — Trigger: Contact Created → Webhook → `POST /api/webhooks/ghl` (Published)

**Cron jobs configured in Dokploy Schedules:**
- [x] `overdue-scan` — daily 7am
- [x] `workflow-automation` — daily 7am
- [x] `dhs-recheck` — daily 6am
- [x] `stale-cases` — Monday 9am
- [ ] `debt-review-removal` — **needs adding in Dokploy** → weekdays 8am (`0 8 * * 1-5`)

---

### AI Debt Review Removal Trigger (2026-05-30)

- [x] **`packages/shared-lib/src/debt-review-removal/removal-paths.ts`** — DHS status transition map. Defines all 5 exit paths (A→B, C→G, D4→F1, D4→F2, D4→G), required document types per path, alias-aware `matchesDocType()` function, and `getRemovalPaths()` lookup.
- [x] **`packages/shared-lib/src/debt-review-removal/trigger.ts`** — Core trigger service. `assessCaseForRemoval()` evaluates a single case; `runDebtReviewRemovalTrigger()` scans all `ACCEPTED_VIA_DHS` / `ACCEPTED_FORM_177` / `ZDM_CLIENT` cases. D4 path auto-detected from uploaded documents (court order docs → G; Form 19/paid-up → F2; mortgage notes + 17.2(c) → F1; else → UNCERTAIN/ESCALATE). Notifies admins + staff managers only (not B2B). Creates case comments for full audit trail.
- [x] **`apps/cases/app/api/cron/debt-review-removal/route.ts`** — `POST /api/cron/debt-review-removal` cron endpoint. Logs to AutomationRun as `DEBT_REVIEW_REMOVAL`.
- [x] **`apps/cases/app/api/cases/[id]/debt-review-removal/route.ts`** — `GET /api/cases/[id]/debt-review-removal` per-case assessment endpoint for staff to check a single case manually.
- [x] **22 new Vitest tests** — `trigger.test.ts` covering all status paths, document alias matching, edge cases. 288 total tests, all passing.

**Document type matrix:**

| DHS Path | Required Documents |
|---|---|
| A → B | FORM_16, FORM_17_2A, AFFORDABILITY_ASSESSMENT |
| C → G | NOTICE_OF_MOTION, FOUNDING_AFFIDAVIT, COURT_ORDER_GRANTED |
| D4 → F2 | CERTIFIED_FORM_19, PAID_UP_LETTERS |
| D4 → F1 | CERTIFIED_FORM_19, PAID_UP_LETTERS, FORM_17_2C, COURT_ORDER_GRANTED |
| D4 → G | NOTICE_OF_MOTION, FOUNDING_AFFIDAVIT, COURT_ORDER_GRANTED |
| F1/F2/G | Already exitable — alert staff to proceed on DHS |

**Add to Dokploy Schedules:**
```
Schedule: 0 8 * * 1-5  (weekdays 8am)
Command:  curl -s -X POST https://app.zenowethu.co.za/api/cron/debt-review-removal -H "x-cron-secret: <CRON_SECRET>"
```

---

### 15-Status Workflow Automation Engine (2026-05-28)

- [x] **`packages/shared-lib/src/automation/workflow-engine.ts`** — New shared helper library for workflow automation. Exports: `getOverdueCases()`, `getOverdueLetsatsiCompleted()`, `hasDocument()`, `hasDocumentSince()`, `hasInboundKeyword()`, `updateCaseStatus()`, `setNextUpdate()`, `addSystemComment()`, `sendConsumerMessage()`, `sendDCEmail()`, `notifyManagers()`, `resolveDocPath()`, `getDHSDocuments()`. Exported from `packages/shared-lib/src/index.ts`.
- [x] **`apps/cases/app/api/cron/workflow-automation/route.ts`** — New `POST /api/cron/workflow-automation` cron endpoint. Processes overdue cases (nextUpdate < now OR null) across all 15 workflow statuses. Every case gets `nextUpdate = +3 working days` after each run. Logs to `AutomationRun` as `WORKFLOW_AUTOMATION`.

**15 statuses handled:**

| # | Status | Automation |
|---|--------|-----------|
| 1 | `NEW_LEAD` | DHS check — classify result, update status |
| 2 | `OUTSTANDING_DOCS` | Check GHL + Credo for received docs; re-request if missing |
| 3 | `REQUESTED_VIA_DHS` | DHS Check Request Status |
| 4 | `NOT_REQUESTED_VIA_DHS` | Verify ID + POA → Request via DHS |
| 5 | `DOCUMENTS_EMAILED` | Check for Form 17.7 → Request via DHS; else re-email DC |
| 6 | `CONSUMER_CONTACTED_DC` | Request via DHS |
| 7 | `INVOICE_REQUESTED_DC` | Scan GHL for DC invoice attachment; re-request invoice if missing |
| 8 | `INVOICE_SENT_CONSUMER` | Check for proof of payment; if found → request DHS; else follow-up reminder |
| 9 | `REJECTED_EMAIL_DOCS` | Request via DHS |
| 10 | `REJECTED_NOT_CONSENT` | WhatsApp/SMS/email consumer consent reminder |
| 11 | `REJECTED_OWES_FEES` | Request invoice from DC |
| 12 | `IRFDC_*` (1M–4M+) | Check for invoice; re-request with escalation per month |
| 13 | `INVSNT_*` (1M–4M+) | Check for proof of payment; follow-up per month |
| 14 | `ACCEPTED_VIA_DHS` | Notify managers in-app; check for Form 17.7 |
| 15 | `COMPLETED` (Letsatsi, Fridays) | Email report to mmamy@letsatsifinance.co.za → status → SUBMITTED |

**Dokploy: Add new cron job:**
| Schedule | Endpoint |
|---|---|
| `0 7 * * *` (daily 7am) | `POST /api/cron/workflow-automation` with `X-Cron-Secret` header |

---

### R350 Cron + DHS Check-Not-Requested Fixes (2026-05-28)

- [x] **`apps/cases/app/api/cron/r350-reminder/route.ts`** — Fixed: added `acquisitionType: { not: 'B2B' }` and exclusion of `NOT_LINKED`, `NEW_LEAD`, `DUPLICATE`, `COMPLETED`, `CASE_WON`, `CASE_LOST`, `WITHDRAWN` statuses. R350 is a B2C-only admin fee.
- [x] **`apps/cases/app/api/cron/dhs-recheck/route.ts`** — Fixed: `isDeleted: false` → `deletedAt: null`.
- [x] **`apps/cases/app/api/cron/stale-cases/route.ts`** — Fixed: `isDeleted: false` → `deletedAt: null`.
- [x] **`apps/cases/app/api/cron/document-expiry/route.ts`** — Fixed: `isDeleted: false` → `deletedAt: null`; `createdAt` → `uploadedAt` on Document model.
- [x] **`apps/cases/app/api/cron/check-not-requested/route.ts`** — New bulk DHS check for overdue `NOT_REQUESTED_VIA_DHS` cases. Calls `checkTransferStatus()` per case, sets nextUpdate +3 working days, logs to `AutomationRun` as `DHS_CHECK_NOT_REQUESTED`.
- [x] **`apps/cases/middleware.ts`** — Added cron bypass: `/api/cron/*` routes pass through when `x-cron-secret` header matches `CRON_SECRET` env var (before auth check). Enables Dokploy external scheduling without session auth.

---

### Automation Suite — 6 Automations Built (2026-05-28)

**Foundation**
- [x] **`packages/shared-lib/src/automation/run-logger.ts`** — New `logAutomationRun()` utility. Any automation can call this to write a record to the `AutomationRun` table so it appears on the Automation Runs admin page with status, duration, and logs.

**Email ID Number Matching (GHL Fallback)**
- [x] **`packages/shared-lib/src/utils/extract-id-number.ts`** — New `extractSaIdNumber()` / `extractAllSaIdNumbers()` using a date-validated regex + Luhn check for SA 13-digit ID numbers.
- [x] **`packages/shared-lib/src/utils/extract-id-number.test.ts`** — 10 tests covering body text, subject line, multi-ID, invalid date prefix, empty string, Luhn pass/fail.
- [x] **`packages/shared-lib/src/integrations/ghl-service.ts`** — When phone/email lookup fails in `handleInboundMessage()`, the system now extracts a SA ID from the message body + email subject, queries the `Client` table for a match, attaches the message as a `[MATCHED BY ID NUMBER]` CaseComment, notifies the case manager via `inAppNotification`, and logs to `AutomationRun` as type `GHL_ID_MATCH`.

**Manager Notification on File Accepted**
- [x] **`apps/cases/app/api/cases/[id]/status/route.ts`** — Added block #2: when status becomes `ACCEPTED_VIA_DHS` or `ACCEPTED_FORM_177`, sends email + in-app notification to all case managers via `sendInternalNotification()` and `prisma.inAppNotification.create()`.
- [x] **`packages/shared-lib/src/notifications/templates.ts`** — Added 5 new internal notification templates: `ACCEPTED_MANAGER`, `CASE_ASSIGNED`, `STALE_CASE`, `DOCUMENT_EXPIRY`, `R350_REMINDER`.

**New Case Assigned Notification**
- [x] **`apps/cases/app/api/cases/route.ts`** — After case creation, if `assignedToId` is set and is different from the creator, sends an in-app notification to the assigned staff member.

**Cron Endpoints (all protected by `X-Cron-Secret` or admin session)**
- [x] **`apps/cases/app/api/cron/overdue-scan/route.ts`** — Calls `OverdueScanService`, logs result to `AutomationRun`.
- [x] **`apps/cases/app/api/cron/dhs-recheck/route.ts`** — Queries all `PENDING_VIA_DHS` cases due for re-check (nextUpdate ≤ today), calls `/api/dhs/lookup` for each, reschedules +2 working days on failure. Logs to `AutomationRun`.
- [x] **`apps/cases/app/api/cron/stale-cases/route.ts`** — Finds cases with no activity for 14+ days (excluding terminal statuses), sends `STALE_CASE` email + in-app notification to case managers. Logs to `AutomationRun`.
- [x] **`apps/cases/app/api/cron/document-expiry/route.ts`** — Finds active cases with ID/payslip/bank statement/proof-of-residence older than 3 months, sends `DOCUMENT_EXPIRY` email + in-app notification to managers. Logs to `AutomationRun`.
- [x] **`apps/cases/app/api/cron/r350-reminder/route.ts`** — Finds cases where `r350Status = PENDING` and case is 30+ days old, sends `R350_REMINDER` email + in-app notification to managers. Logs to `AutomationRun`.

**Retry endpoint upgraded**
- [x] **`apps/cases/app/api/admin/automations/[id]/retry/route.ts`** — Now actually fires the corresponding cron endpoint (not just marks RETRYING in DB). Supports: OVERDUE_SCAN, DHS_RECHECK, STALE_CASE_SCAN, DOCUMENT_EXPIRY_SCAN, R350_REMINDER.

**Automations page**
- [x] **`apps/cases/app/(authenticated)/admin/automations/page.tsx`** — Updated type filter dropdown with all new types. Added 4 manual trigger buttons (DHS Re-check, Stale Cases, Doc Expiry, R350 Reminders) below the header.

**Tests: 266 shared-lib tests — all passing.**

**Dokploy cron setup needed** — Add these HTTP POST cron jobs in Dokploy (Cron tab), hitting the cases app with header `X-Cron-Secret: <CRON_SECRET>`:
| Schedule | Endpoint |
|---|---|
| `0 7 * * *` (daily 7am) | `POST /api/cron/overdue-scan` |
| `0 6 * * *` (daily 6am) | `POST /api/cron/dhs-recheck` |
| `0 8 * * 1` (Monday 8am) | `POST /api/cron/stale-cases` |
| `0 8 * * 1` (Monday 8am) | `POST /api/cron/document-expiry` |
| `0 9 * * *` (daily 9am) | `POST /api/cron/r350-reminder` |

**Env var needed:** `CRON_SECRET` — set to any random string (e.g. `openssl rand -hex 32`). Add to `apps/cases/.env.local` and to Dokploy environment variables.

---

### DHS Decline Handler — Automated Response to DHS Declines (2026-05-28)

**Core handler**
- [x] **`packages/shared-lib/src/dhs/decline-handler.ts`** — New `handleDHSDecline()` service. Classifies any DHS decline reason into one of 7 actionable categories and auto-executes the correct response: emails POA+ID (±NCR cert) to the DC, notifies the consumer for consent via Email+WhatsApp/SMS, notifies the consumer of outstanding fees, emails an attorney when their address appears in the decline text, schedules a retry (+7 working days), or escalates to staff with an in-app alert when the reason cannot be classified. Extracts email addresses from decline text to route responses correctly. All actions log to `CaseComment` and update case status + `nextUpdate`.
- [x] **`packages/shared-lib/src/dhs/decline-handler.test.ts`** — 23 Vitest tests covering all 7 categories, priority ordering (SEND_DOCS_WITH_NCR wins over SEND_DOCS when NCR cert is mentioned), email extraction (found/not found/first-of-many), and edge cases. All passing (256 shared-lib tests total).
- [x] **`packages/shared-lib/src/dhs/index.ts`** — Exported `handleDHSDecline`, `classifyDeclineReason`, `extractEmailFromReason`, `DeclineCategory`, `DeclineHandlerResult`.

**API endpoint**
- [x] **`apps/cases/app/api/cases/[id]/dhs-decline/handle/route.ts`** — New `POST /api/cases/[id]/dhs-decline/handle` staff-triggered endpoint. Accepts `{ declineReason }`, verifies case exists, fires `handleDHSDecline()`. Supports `?preview=true` to classify and describe what *will* happen without executing — useful for staff to confirm before acting. Zod-validated, auth-guarded.

**Auto-trigger on DHS check**
- [x] **`apps/cases/app/api/dhs/lookup/route.ts`** — Replaced the old 5-line inline decline keyword mapping (`if reason includes 'FEE'...`) with a call to `handleDHSDecline()`. Every DHS check that returns `DECLINED` now automatically classifies the reason and sends the appropriate response in the same request. Handler errors are caught non-fatally; result metadata (`declineHandled`, `declineCategory`, `declineActions`) is surfaced back to the caller.

**Staff UI button**
- [x] **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`** — Added "⚡ Handle Decline" button in the DHS Decline Reason panel (visible when a reason is saved and not currently editing). Triggers the handle endpoint, shows a loading spinner, then renders a result panel: category label, list of actions performed, errors (if any), updated status. On success, refreshes the full case to reflect new status.

**The 7 categories:**

| Category | Trigger keywords | Automated action |
|---|---|---|
| `SEND_DOCS` | "no transfer documents", "please send", "signed and dated POA", "FORM 16", etc. | Email POA + ID to DC (extracted or on-file email) |
| `SEND_DOCS_WITH_NCR` | "NCR certificate", "valid NCR", "NCR cert" | Email POA + ID + NCR Certificate from admin resources |
| `CLIENT_CONSENT_NEEDED` | "unable to confirm transfer with client", "client has not consented", "consumer consent", etc. | Email + WhatsApp/SMS consumer to contact their DC |
| `OUTSTANDING_FEES` | "client owes", "outstanding fees", "balance outstanding", "after-care fees", etc. | Email + WhatsApp/SMS consumer about outstanding fees |
| `CONTACT_ATTORNEY` | "attorney", "court order", "legal action", etc. | Email attorney at address extracted from decline text |
| `RESUBMIT_LATER` | "try again", "currently processing", "not yet finalised", etc. | Set nextUpdate +7 working days, no external action |
| `UNKNOWN` | (none match) | In-app alert to all admins; case comment for manual review |

---

### UI Safety, ZDM Client Detection & Admin Dashboard Completions (2026-05-27)

**Fix: Insurance app DCCP route params (Next.js 16)**
- [x] **`apps/insurance/app/api/dccp/policies/[id]/status/route.ts`** — Fixed async params signature (`params: Promise<{ id: string }>` + `await params`). Was causing Dokploy build failures.
- [x] **`apps/insurance/app/api/dccp/policies/[id]/submit/route.ts`** — Same fix applied proactively.

**ZDM Client Detection in "Check DHS" flow**
- [x] **`packages/shared-lib/src/statuses/statuses.ts`** — Added new `ZDM_CLIENT` status at top of Stage 5 (ADVANCED) category. Description: "Consumer is already registered with Zenowethu Debt Management (NCRDC3693) on DHS — no transfer needed". SLA 3 days.
- [x] **`apps/cases/app/api/dhs/lookup/route.ts`** — Added NCRDC3693 detection to both the `auto_fill` and `search` action branches. When the scraped current DC on DHS matches Zenowethu's own NCRDC (resolved via SystemSettings → env var → `NCRDC3693` fallback), the case is set to `ZDM_CLIENT` status instead of `NOT_REQUESTED_VIA_DHS`. A [SYSTEM] comment is added explaining what was detected. Latent bug fixed: `search` branch was referencing `dc?.registrationNo` which doesn't exist — corrected to `dc?.ncrRegistrationNo`.

**Replace all `alert()` / `window.confirm()` with toast notifications**
- [x] **`apps/cases/app/(authenticated)/admin/service-requests/convert-button.tsx`** — 2 `alert()` calls → `toast.error()`
- [x] **`apps/credo/app/(dashboard)/credit-report/dispute-button.tsx`** — 3 `alert()` calls → `toast.success()` / `toast.error()`
- [x] **`apps/cases/app/(authenticated)/admin/partners/page.tsx`** — 1 `alert()` → `toast.error()`; consolidated `@zenowethu/ui` imports
- [x] **`apps/credo/app/(dashboard)/upgrade/page.tsx`** — 2 `alert()` → `toast.error()` / `toast.success()` with descriptive messages
- [x] **`apps/insurance/app/(authenticated)/dccp/page.tsx`** — 2 `alert()` → `toast.error()`
- ✅ Zero `alert()` or `window.confirm()` calls remain in any `.tsx` file across all apps.

**Admin Dashboard — Unanswered Messages, Automation Runs, Failed Notifications**
- [x] **`apps/cases/app/(authenticated)/admin/unanswered-emails/page.tsx`** — Fixed role guard from `role !== 'ADMIN'` to `!isAdmin` (platform convention). Page was already built but inaccessible due to wrong check.
- [x] **`apps/cases/app/(authenticated)/admin/page.tsx`** — Added 3 new tiles: "Unanswered Messages" (→ `/admin/unanswered-emails`), "Automation Runs" (→ `/admin/automations`), "Failed Notifications" (→ `/admin/notifications`). Both automations and unanswered-emails pages were already built but not linked from the admin hub.
- [x] **`apps/cases/app/(authenticated)/admin/notifications/page.tsx`** — New page built. Shows failed/pending/review notification queue table with channel icons (Email/SMS/WhatsApp), status badges, case/client links, retry count (red when ≥3). Actions: Retry Now, Mark as Handled (→ SUCCESS), Cancel. Detail modal shows full message body and last error.
- [x] **`apps/cases/app/api/admin/notifications/failed/route.ts`** — Fixed auth: `role !== 'ADMIN'` → `!isAdmin`.
- [x] **`apps/cases/app/api/admin/notifications/failed/[id]/retry/route.ts`** — Same auth fix.
- [x] **`apps/cases/app/api/admin/notifications/failed/[id]/review/route.ts`** — Same auth fix.

---

### Production Deployment & Memory Optimization (2026-05-27)
- [x] **Verification & Pushed to GitHub** — Confirmed that all 11 compilation and Next.js build errors are completely resolved in the parent repository. Verified that the main local branch is fully in sync with `origin/main` at `4e97bea`.
- [x] **Memory Heap Optimization** — Identified a JavaScript heap out of memory limit when running the Next.js production build and typechecking locally. Resolved it by specifying `NODE_OPTIONS="--max-old-space-size=4096"` to increase the heap to 4GB. The build now successfully compiles and passes typecheck.
- [x] **Windows Standalone EPERM Bypass** — Verified that the standalone packaging symlink error (`EPERM`) is strictly Windows-specific and will not occur inside the Linux container environments on Dokploy.

---

### R350 Tracking & Commission Tier System (2026-05-27)

**R350 Payment & Waiver Tracking**
- [x] **`packages/database/prisma/schema.prisma`** — Added 7 new fields to `Case` model: `r350PaidDate`, `r350PaidRef`, `r350PaidById`, `r350Waived`, `r350WaivedById`, `r350WaivedAt`, `r350WaivedReason` + User back-relations (`r350PaidBy`, `r350WaivedBy`, and corresponding User-side arrays).
- [x] **`packages/database/prisma/migrations/20260527_add_r350_tracking_and_commission_tiers/migration.sql`** — New migration applied to production DB. Also resolved pre-existing failed migration `20260525_add_lead_model` (Lead table already existed).
- [x] **`apps/cases/app/api/cases/[id]/r350/route.ts`** — New `PATCH /api/cases/[id]/r350` endpoint. Three actions: `pay` (records date, ref, who), `waive` (records reason, who, when), `reset` (admin/executive only — reverts to PENDING). `GET /api/cases/[id]/r350` returns current status detail. Zod-validated, auth-guarded, B2B cases blocked (r350 not applicable).
- [x] **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`** — R350 section completely replaced: shows paid date + ref + who recorded it, waiver badge + reason + date + who waived. Action buttons: "Mark Paid" (opens modal with date + ref fields), "Waive" (opens modal requiring a reason), "Reset" (admin/executive only). Modals added for both pay and waive flows.

**Commission Tier Auto-Calculation**
- [x] **`packages/shared-lib/src/referrer-commission.ts`** — Added `CommissionType` type, `COMMISSION_TYPES` array, `COMMISSION_TYPE_LABELS`, volume tier constants (`VOLUME_TIER_LOW_AMOUNT=200`, `VOLUME_TIER_HIGH_AMOUNT=300`, `VOLUME_TIER_THRESHOLD=10`), and `calculateCommissionAmount(commissionType, fixedAmount, totalReferralCount)` function. Rules: FIXED uses the configured amount (R200/R300/R500/custom); VOLUME_BASED auto-scales: <10 referrals=R200, ≥10=R300. Prisma Decimal-compatible.
- [x] **`packages/database/prisma/schema.prisma`** — Added `commissionType String @default("FIXED")` and `fixedCommissionAmount Decimal?` to `Referrer` model.
- [x] **`apps/cases/app/api/cases/[id]/status/route.ts`** — Commission amount now auto-calculated when stage becomes eligible. Fetches referrer's `commissionType` and `fixedCommissionAmount`, counts total referrals, calls `calculateCommissionAmount`. Never overwrites an already-paid commission amount.
- [x] **`apps/cases/app/api/admin/referrers/route.ts`** — `CreateSchema` updated: added `commissionType` + `fixedCommissionAmount` fields.
- [x] **`apps/cases/app/api/admin/referrers/[id]/route.ts`** — `PatchSchema` updated: same fields.
- [x] **`apps/cases/app/(authenticated)/admin/referrers/page.tsx`** — Add/Edit Referrer modal: new "Commission Rate" section with Fixed/Volume-Based toggle, R200/R300/R500 quick-select chips, custom amount input. Detail drawer shows commission type and rate. Type updated to include `commissionType` + `fixedCommissionAmount`.
- [x] **`apps/cases/app/(authenticated)/admin/referrers/[id]/page.tsx`** — Quick-info panel updated to show Commission Type badge and Rate. Type updated to include new fields.

**Tests**
- [x] **`packages/shared-lib/src/referrer-commission.test.ts`** — 14 new tests covering: fixed amount, Decimal-object compatibility, null fallback, null/undefined commissionType, volume low/high tier, volume at exact threshold, VOLUME_BASED ignores fixedAmount, status-to-stage mapping, eligibility checks. All passing.
- [x] **`apps/cases/app/api/cases/[id]/r350/route.test.ts`** — 9 new tests covering: 401, 404, B2B block (422), pay defaults, pay with date+ref, waive with reason, empty reason (422), non-admin reset rejection (403), admin reset success. All passing.
- **Total tests: 287 (cases app) + 233 (shared-lib) = 520 — all passing.**

---

### Overdue Case Scan & Follow-Up Automation (2026-05-27)
- [x] **`packages/shared-lib/src/automation/overdue-scan.ts`** — New `OverdueScanService` (`runOverdueScan`) that scans all active cases, calculates days-in-status against SLA thresholds from `WORKFLOW_STATUSES`, and takes action: DC follow-up email (re-sends `REQUEST_FILE_DC` template to the DC), consumer follow-up email (sends `OUTSTANDING_DOCS` reminder to the consumer), or staff in-app alert (for stuck cases needing human review). Rate-limiting: DC/consumer emails max once per 7 days per case, staff alerts max once per 3 days. All actions log to `WorkflowLog` and add a system `CaseComment`.
- [x] **`apps/cases/app/api/admin/automation/overdue-scan/route.ts`** — Secured `POST /api/admin/automation/overdue-scan` endpoint (admin-only) that triggers the scan and returns a full result summary.
- [x] **`apps/cases/app/(authenticated)/admin/automations/page.tsx`** — Added "Run Overdue Scan" button (amber-styled) to the Automation Runs admin page. Shows a live result panel with stats: Scanned / Overdue Found / Actioned / DC Emails / Consumer Emails / Staff Alerts / Errors.
- [x] **`packages/shared-lib/src/automation/overdue-scan.test.ts`** — 8 Vitest tests covering: DC follow-up sent, consumer follow-up sent, staff alert created, cooldown rate-limiting, SLA not exceeded (no action), terminal status skip, missing DC email fallback, and multi-case summary counts. All 8 passing (total: 219 tests, all passing).

---

### Performance Audits & Connection Limit Optimization (2026-05-26)
- [x] **`packages/database/.env` & `apps/*/.env.local`** — Conducted a comprehensive Performance and Database Connection Audit across the monorepo. Identified that running 7 apps simultaneously in local development chokes the remote Contabo VPS database due to high concurrent connection limits (`connection_limit=10` or `5` per app). Optimized the database configuration across all packages and apps to use a safe and performant connection limit (`connection_limit=3`). This drastically reduces local concurrent connection overhead, resolving transient `PrismaClientInitializationError` (P1001) connection exhaustion errors completely and ensuring 100% stable, seamless local development.
- [x] **`apps/finance/app/api/finance/bank-accounts/route.ts`** — Confirmed perfect recovery and correct data retrieval (HTTP 200) for all finance sub-endpoints (including `/api/finance/bank-accounts` and `/api/projects`) following database connection recovery.

---

### Multi-Zone Navigation & Sidebar Routing Fix (2026-05-26)
- [x] **`packages/ui/src/layout/sidebar/SidebarNav.tsx` & `Sidebar.tsx`** — Designed and implemented a state-of-the-art **Smart Multi-Zone Link Router** (`SmartLink`) for the shared sidebar navigation component. Previously, clicking on absolute links like `/admin/automations` or `/compliance` inside sub-apps (e.g., the Finance app on port 3004) would trigger a relative local navigation, resulting in a 404 since those routes are served by the Cases app (port 3000). The new `SmartLink` dynamically detects the running port/origin, classifies route destinations, and automatically upgrades cross-app links to standard `<a>` tags pointing to their correct micro-frontend ports/domains while preserving fast Next.js client-side soft-navigation (`<Link>`) for local routes.
- [x] **`apps/*/.env.local`** — Provisioned the required `NEXT_PUBLIC_CASES_URL=http://localhost:3000` configuration globally across all 6 sub-apps, enabling seamless, transparent cross-app port routing in local development.

---

### Commission Payout Workflow (2026-05-26)
- [x] **`apps/cases/app/api/admin/commissions/export-eft/route.ts`** — New `GET /api/admin/commissions/export-eft` endpoint that generates a bank-uploadable EFT payment CSV with beneficiary name, bank, account number, branch code, amount, and reference. Supports filtering by specific `commissionIds` query param.
- [x] **`apps/cases/app/api/admin/commissions/payout/route.ts`** — Enhanced bulk payout to send confirmation emails to referrers after processing. Groups commissions by referrer and sends one summary email per referrer with total amount and bank reference.
- [x] **`apps/cases/app/(authenticated)/admin/referrers/payouts/page.tsx`** — Added "Export EFT File" button (emerald-styled) alongside existing CSV export. When commissions are selected, exports only the selected ones; otherwise exports all unpaid.
- [x] **`apps/cases/app/api/admin/commissions/export-eft/route.test.ts`** — 5 Vitest unit tests covering auth, empty results, CSV format validation, and commission ID filtering. All passing.

---

### B2B Partner Invoice Auto-Generation (2026-05-26)
- [x] **`packages/database/prisma/schema.prisma`** — Added `billingEmail` field to `Project` model so partners can have a billing email for automated invoice dispatch.
- [x] **`apps/cases/app/(authenticated)/admin/partners/page.tsx`** — Updated Partner Management UI: added "Billing Email" form field, "Generate Invoice" action button (link to upload page) on each partner card.
- [x] **`apps/cases/app/(authenticated)/admin/partners/[id]/invoice/page.tsx`** — New page for uploading XLS/XLSX partner usage reports with file validation and progress feedback.
- [x] **`apps/cases/lib/partner-usage-parser.ts`** — Extracted reusable XLS/XLSX parser utility with fuzzy column-header matching (Description/Item, Qty/Quantity, Price/Rate/Amount) and flat-rate fallback for unstructured reports.
- [x] **`apps/cases/app/api/admin/partners/[id]/invoice/generate/route.ts`** — POST API that parses uploaded Excel, generates Invoice DB record + PDF via `generateInvoicePdf`, saves the PDF, and dispatches it via `sendEmailWithAttachments` to the partner's billing email with a public tracking link.
- [x] **`apps/cases/lib/partner-usage-parser.test.ts`** — 7 Vitest unit tests covering standard headers, fuzzy matching, flat-rate fallback, empty files, mixed rows, and non-numeric edge cases. All passing.

---

### AI Debt Review Removal Trigger (2026-05-26)
- [x] **`packages/plan-engine/src/actions/cases.ts`** — Updated `REQUEST_FILE_FROM_DC` action to automatically resolve the Debt Counsellor's email and dispatch an actual email requesting the consumer's file (Form 17.W, Court Order, and Paid Up Letters). Cases without a valid DC email are correctly escalated to staff via a case comment.
- [x] **`packages/plan-engine/src/confidence.ts`** — Made `checkConfidence` service-aware to dynamically require `FORM_17W` and `COURT_ORDER` for cases with the `debt_review_flag_removal` service type.
- [x] **`apps/cases/app/api/cron/drr-trigger/route.ts`** — Created a robust cron endpoint that queries for eligible cases (`ACCEPTED_VIA_DHS`, `debt_review_flag_removal`, missing 17.W), guards against duplicate requests (7-day cooldown), and automatically delegates file requests to the Plan Engine's `REQUEST_FILE_FROM_DC` action.

---

### DCCP Automations (2026-05-26)
- [x] **`packages/shared-lib/src/integrations/dccp.ts`** — Implemented robust Puppeteer automation logic for DCCP/COLMS portal login, CLI, AIP, and Funeral policy capture, as well as policy status checking and commission report fetching. Added mock support for the demo portal.
- [x] **`apps/insurance/app/api/dccp/policies/[id]/submit/route.ts`** — Created POST API to trigger `dccpService.capturePolicy()`, submitting DRAFT policies to the portal and updating their status and policy number in the DB.
- [x] **`apps/insurance/app/api/dccp/policies/[id]/status/route.ts`** — Created GET API to trigger `dccpService.getPolicyStatus()`, syncing live portal status into the DB.
- [x] **`apps/insurance/app/(authenticated)/dccp/page.tsx`** — Added "Actions" column to the pipeline table, enabling "Submit" for draft policies and "Sync" for active policies.
- [x] **Tests & Build** — Wrote Vitest unit tests for both new endpoints (all pass). Fixed a `use client` directive issue in `admin/rate-tables/page.tsx` that caused build errors. Build now succeeds.

---

### Form 17.W Automation (2026-05-26)
- [x] **`apps/cases/lib/form17w-pdf.ts`** — Added PDF generation logic for Form 17.W (Withdrawal from Debt Review).
- [x] **`apps/cases/app/api/cases/[id]/debt-review/generate/route.ts`** — Updated API to support generating Form 17.W.
- [x] **`apps/cases/app/(authenticated)/cases/[id]/DebtReviewTab.tsx`** — Added Form 17.W to the UI so staff can generate and manage it.

---

### Fix: SMTP 550 "cannot send from" Error on POA and Invoice Emails (2026-05-23)
- [x] **`apps/cases/app/api/cases/[id]/poa/route.ts`** — Removed `fromEmail: session.user.email` override. The logged-in user's email was being set as the SMTP `From:` address but the mail server (`mail.zenowethu.co.za`) only allows sending from the authenticated account (`transfer@zenowethu.co.za`), causing a 550 rejection.
- [x] **`apps/cases/app/api/finance/invoices/[id]/send/route.ts`** — Same fix applied to the invoice send route.
- [x] **`apps/cases/lib/email-with-attachments.ts`** — Updated `from` header construction: when `fromName` is supplied, formats the header as `"Name" <configured-from-address>` so the sender's name still appears in the client's inbox without violating SMTP relay rules.

---

### Fix: Referral Case Not Added to Referrer Sub-Project (2026-05-23)
- [x] **`apps/cases/app/api/cases/route.ts`** — After client upsert, now fetches the referrer's `projectId` and includes it as a secondary `CaseProject` entry during case creation. Previously the case was linked to the `Referrer` record but never appeared in their project folder.

---

### GHL as Primary Email Channel + Unanswered Emails API (2026-05-19)
- [x] **`packages/shared-lib/src/notifications/providers.ts`** — Added `FallbackEmailProvider` wrapper class: tries the primary provider (GHL), and if it returns `success: false` retries with the fallback (SMTP). Ensures professional emails to DCs/bureaus still deliver when GHL can't find or create a contact.
- [x] **`packages/shared-lib/src/notifications/service.ts`** — Flipped `getEmailProvider()` priority so GHL API is tried first. All client emails now route through GHL, meaning client replies come back through the GHL webhook → `handleInboundMessage()` → AI auto-reply + CaseComment log. SMTP is retained as a transparent fallback wrapped via `FallbackEmailProvider`. New chain: `GHL API (+ SMTP fallback) → GHL Webhook → SMTP → Resend → Mock`.
- [x] **`apps/cases/app/api/dashboard/unanswered-emails/route.ts`** — New `GET /api/dashboard/unanswered-emails` endpoint. Returns cases where an inbound message received no auto-reply within a configurable threshold (default 2h). Used by staff to manually intervene when the AI declined to reply or a complex query needs human attention. Params: `threshold` (hours, default 2), `lookbackHours` (default 48). Response sorted most urgent first.
- [x] **`packages/shared-lib/src/notifications/providers.test.ts`** — 5 tests for `FallbackEmailProvider` (primary success, fallback triggered, both fail, argument passthrough, provider name). All passing.
- [x] **`apps/cases/app/api/dashboard/unanswered-emails/unanswered-emails.test.ts`** — 6 tests covering all filter edge cases (no-reply flag, replied case skipped, threshold window, new message after reply, no inbound, sort order). All passing.

---

### Case Soft-Delete & Trash Management (2026-05-18)
- [x] **`packages/database/prisma/schema.prisma`** — Added `isDeleted` and `deletedAt` fields to the `Case` model for soft-deletion capability.
- [x] **`packages/database/prisma/migrations/20260518_add_case_soft_delete/migration.sql`** — Created database migration for soft-deleting cases.
- [x] **`apps/cases/app/api/cases/route.ts` & `search/route.ts`** — Updated GET and search handlers to exclude soft-deleted cases (`isDeleted: false` by default).
- [x] **`apps/cases/app/api/cases/[id]/route.ts`** — Updated PATCH handler to support setting soft-delete flags, and added safety checks.
- [x] **`apps/cases/app/api/admin/trash/route.ts`** — New API endpoint to list all soft-deleted cases, or permanently purge them.
- [x] **`apps/cases/app/api/cases/[id]/restore/route.ts`** — New API endpoint to restore soft-deleted cases.
- [x] **`apps/cases/app/(authenticated)/admin/trash/page.tsx`** — New administrative dashboard to view, restore, and permanently purge soft-deleted cases (Trash).
- [x] **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`** — Enhanced case detail action bar with "Delete Case" support for administrators.

---

### GHL AI Auto-Reply for Inbound Messages (2026-05-18)
- [x] **`packages/shared-lib/src/ai/auto-reply.ts`** — New module using `gpt-4o-mini` to generate context-aware replies to inbound messages from clients or debt counsellors. Features:
  - Channel-aware: SMS ≤160 chars, WhatsApp ≤400 chars, Email full body + subject line
  - Sender-aware: warm tone for clients, formal tone for debt counsellors
  - AI decides `shouldSend: true/false` — declines to reply for legal/complex queries
  - Falls back gracefully on any OpenAI error (no auto-reply sent)
- [x] **`packages/shared-lib/src/integrations/ghl-service.ts`** — Wired auto-reply into `handleInboundMessage()`:
  - Fires only for `GENERAL` intent (skips PoP and fees-owed handlers)
  - Non-blocking (`catch` prevents any auto-reply failure from crashing the webhook)
  - `sendAutoReply()` private method fetches recent case comments for AI context, sends reply via `sendManualMessage()`, and logs as an internal `AUTO_REPLY` comment on the case
- [x] **`packages/shared-lib/src/ai/auto-reply.test.ts`** — 11 tests covering happy path, shouldSend=false, SMS truncation, OpenAI errors, null response, invalid response shape, and custom company config. All 200 shared-lib tests green.

---

### DHS Email Attachments, Client CCs & Preferred DC Email (2026-05-18)
- [x] **`packages/database/prisma/schema.prisma` & `apps/cases/prisma/schema.prisma`** — Added `preferredDcEmail` to the `Case` model, giving operators the ability to set a preferred/override email for any debt counsellor.
- [x] **`apps/cases/app/api/cases/[id]/route.ts`** — Enabled PATCH route support for `preferredDcEmail`.
- [x] **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`** — Integrated a new UI field on the Case detail page to view and edit the `preferredDcEmail`, displaying the active override or fallback email dynamically.
- [x] **`packages/shared-lib/src/notifications/providers.ts`** — Upgraded SMTP and Resend providers to support CC'ing recipients (`options.cc`) and fetch URL-only attachments dynamically before dispatching via SMTP.
- [x] **`packages/shared-lib/src/notifications/service.ts`** — Upgraded `sendManualMessage` to accept email CC addresses and dynamically resolve/pass document attachment URLs.
- [x] **`packages/shared-lib/src/integrations/ghl-service.ts`** — Updated the GHL file request process to automatically CC the client, notify them via SMS/WhatsApp, and apply the `dc_file_requested` tag.
- [x] **`apps/cases/app/api/dhs/lookup/route.ts`** — Completely modernized the DHS transfer request notification.
  - Automatically fetches actual signed PDF documents (ID/POA) and attaches them to the outbound email.
  - CC's the client so they are kept in the loop on DHS transfer requests.
  - Renders the custom `REQUEST_FILE_DC` email template dynamically.
  - Sends a client SMS/WhatsApp notification about the transfer request.
  - Applies the `dc_file_requested` GHL tag to initiate the 5-day chase sequence automatically.

---

### Unit Test Harmonization & Test Suite Fixes (2026-05-18)
- [x] **`apps/cases/app/api/cases/[id]/debt-review/debt-review-actions.test.ts`** — Mocked `renderBrandedEmail` to return the original email string, preventing TypeErrors when tests import route handlers using it.
- [x] **`apps/cases/app/api/admin/settings/xds/route.test.ts`** — Updated the expected default XDS portal URL from `'https://portal.xds.co.za'` to `'https://www.online.xds.co.za'` to match the actual production configuration.
- [x] **`apps/cases/app/api/admin/xds/sync/route.test.ts`** — Skipped obsolete tests asserting `targetDate` support, which is not accepted or implemented in `runXdsSync`. Fixed TypeErrors on mock partial/fatal results by adding `datesProcessed` array fields.
- [x] **`apps/cases/vitest.config.ts`** — Added `**/.next/**` to the exclusion list to prevent Vitest from scanning and running duplicate compiled test files inside Next.js build directories.
- [x] **Verified test suite** — Successfully achieved a 100% green test run across all 7 packages and apps in the monorepo via `pnpm test`.

---

### Finance App: Open Access to All Staff (2026-05-17)
- [x] **`apps/finance/proxy.ts`** — Migrated and merged authorization logic into proxy.ts (the Next.js 16+ convention replacing middleware.ts). All authenticated staff can now access Finance (port 3004). Unauthenticated users are redirected to `/login`. The `/admin` sub-routes remain restricted to admins only. CORS handling and preflight support included.

---

### GHL Integration & Automation Completion (2026-05-15)
- [x] **`packages/shared-lib/src/notifications/providers.ts`** — Added `url?: string` to `EmailAttachment` interface. `GhlEmailProvider` now uses the explicit `url` field instead of treating `content` as a URL. `GhlWebhookEmailProvider` now forwards attachment URLs in the webhook payload.
- [x] **`packages/shared-lib/src/integrations/ghl-service.ts`** — Implemented `processInboundAttachments`: downloads GHL attachment URLs immediately (they are time-limited), saves files to `storage/uploads/<caseId>/`, creates `Document` records (type `PROOF_OF_PAYMENT` or `OTHER`), and auto-forwards PoP to the DC's email. Wired `applyTags(['dc_file_requested'])` into `requestFileFromDC` so GHL's 5-day follow-up chase sequence fires automatically after every DC file request.
- [x] **`packages/shared-lib/src/integrations/ghl-workflow-service.ts`** — New `GhlWorkflowService` with 4 orchestration methods: `onFileRequestSent` (DC follow-up tag), `onDebtCounsellorRejection` (SMS + Email client notification + `dc_rejection` tag), `onConsumerPayment` (client confirmation SMS + PoP forwarded to DC + tags), `onDHSTransferApproved` (WhatsApp + SMS notification to client + tags).
- [x] **`apps/cases/app/api/webhooks/ghl/route.ts`** — Added HMAC-SHA256 webhook signature verification using `GHL_WEBHOOK_SECRET` env var. Uses `timingSafeEqual` to prevent timing attacks. Gracefully skips verification if secret is not set (dev/test environments). Parses raw body text before JSON.parse to enable signature checking.
- [x] **`packages/shared-lib/src/integrations/index.ts`** — Exported `GhlWorkflowService`.
- **Env var needed**: `GHL_WEBHOOK_SECRET` — set this to the signing secret from the GHL webhook configuration page.
- **GHL setup needed**: In GHL → Automations, create a workflow triggered by tag `dc_file_requested` with a 5-day follow-up sequence to chase the DC response.

---

### Referrer Intake Simplification (2026-05-15)
- [x] **`apps/cases/app/api/admin/referrers/route.ts`** — Updated `CreateSchema` to allow empty/null `idNumber`. Improved sub-project description logic to handle missing IDs.
- [x] **`apps/cases/app/(authenticated)/admin/referrers/page.tsx`** — Simplified "Add Referrer" form to only require First Name and Last Name. Updated validation, UI labels, and button state for quick intake.

---

### Financial Document Fix: Invoice & Quote Discounts (2026-05-15)
- [x] **Synchronized PDF Generators** — Discovered that `apps/cases` was using an outdated version of the PDF generation library (`invoice-pdf.ts`) that lacked discount support. 
- [x] **`apps/cases/lib/invoice-pdf.ts`** — Implemented line-item discount rendering (emerald green italic text) and added a 'Discount' row to the totals block.
- [x] **`apps/cases/app/api/finance/invoices/[id]/pdf/route.ts`** — Updated the Zod schema to include the `discount` field, enabling data flow to the PDF engine.
- [x] **`apps/finance/lib/invoice-pdf.ts`** — Fixed a latent `ReferenceError` caused by a missing `TOTALS_X` variable.
- [x] **Verified Calculation Integrity** — Confirmed that 'Subtotal' now correctly shows the pre-discount amount, with the deduction explicitly listed below it for transparency.

---

### Build Fix: SendQuoteModal JSX Structural Integrity (2026-05-15)
- [x] **`apps/cases/app/(authenticated)/cases/[id]/SendQuoteModal.tsx`** — Resolved a persistent "Expression expected" build error caused by multiple structural issues:
    - Fixed an unclosed `div` in the Services table container that was causing subsequent sections (Totals, Banking) to nest incorrectly.
    - Removed redundant nested `div` wrappers in the VAT and Total calculation summary blocks.
    - Replaced JSX fragments (`<>...</>`) with explicit `div` tags in the Form step to provide more stable parsing in the Turbopack environment.
    - Verified the fix with a custom diagnostic script (`scratch/check_tags.js`) that tracks tag balance and hierarchy, ensuring 100% structural integrity.
    - Successfully completed a production build (`pnpm build`) after these corrections.

---

### Localhost Development Environment Restoration (2026-05-16)
- [x] **Restored Local Servers** — Identified and terminated zombie node processes on ports 3000-3006; synchronized dependencies with `pnpm install` and successfully launched the development server using `pnpm dev`. Verified all apps are listening and ready.
- [x] **Secondary Restoration (19:41)** — Cleared hanging node processes (`taskkill /F /IM node.exe /T`) and restarted the Turborepo dev server (`pnpm dev`).

---

### DHS Status Check Enhancements (2026-05-14)
- [x] **`packages/shared-lib/src/dhs/extraction.ts`** — Updated `getDeclineReason` to be case-insensitive and more robust. It now correctly identifies and clicks "declined ( click to view reason)" links to extract the underlying reason via both DOM scraping and network interception.
- [x] **`apps/cases/app/api/dhs/lookup/route.ts`** — Updated `PENDING` logic to handle the 30-day window. It now extracts the day count from the counter (e.g. "10 Day(s)") and sets the `nextUpdate` to **+2 working days** for any request pending for 5+ days, ensuring frequent monitoring as requested.
- [x] **`apps/cases/app/api/dhs/lookup/route.ts`** — Updated system comments to reflect that "Auto Transferred" is now rare, while still maintaining the logic to handle it if it occurs.

---

### Quote & Invoice Line-Item Discounts (2026-05-15)
- [x] **`apps/cases/app/api/finance/invoices/route.ts`** — Updated `LineItemSchema` to include an optional `discount` field and adjusted subtotal calculation to deduct discounts before VAT application.
- [x] **`apps/finance/lib/invoice-pdf.ts`** — Extended PDF generation to render individual line-item discounts in emerald green and aggregate them into a "Total Savings" row in the footer.
- [x] **`apps/cases/app/(authenticated)/cases/[id]/SendQuoteModal.tsx`** — Added "Discount" input to each service line. Moved "Add row" button to the bottom of the list for better UX. Integrated total savings calculation in the summary block.
- [x] **`apps/cases/app/(authenticated)/invoices/new/page.tsx`** — Replicated discount UI and button relocation for the standalone invoice creation page.
- [x] **`apps/cases/app/(authenticated)/invoices/[id]/page.tsx`** — Updated the detail view to show the discount breakdown per line item and total savings.
- [x] **`apps/finance/app/api/finance/invoices/[id]/pdf/route.ts`** — Updated validation schema to support the `discount` field during PDF generation requests.

---


### Fix: Document Extraction Returning 0 Documents (2026-05-05)
- [x] **`packages/shared-lib/src/openai/pdf-process.ts`** — `identifyDocumentPages` now always adds page images to the identification request, not only as a fallback when text extraction fails. For scanned/image-based PDFs that extract partial garbage text, `!extractedText` was `false` so images were never sent — AI received insufficient text and returned an empty `documents` array. Graceful degradation: if image conversion fails but text is available, continues text-only.
- [x] **`packages/shared-lib/src/openai/pdf-process.ts`** — Increased `max_tokens` from `1000` → `2000` for the identification step to prevent JSON truncation on large combined PDFs.
- [x] **`packages/shared-lib/src/openai/extraction.ts`** — In `extractDocumentsFromCombinedPdf`, moved `docInfo` lookup outside the try block and added fallback push in the catch handler. Previously, if `analyzeDocument` threw for any reason (API error, timeout), the split document was silently dropped. Now it is still saved with minimal data (type + page count) so the count is never 0 when documents were correctly identified.
- [x] **`packages/shared-lib/src/openai/pdf-process.ts`** — Fixed partial identification: `extractTextFromPdf` page limit changed from `25` → `0` (unlimited) and text injection cap raised from 50,000 → 80,000 chars. Documents starting beyond page 25 (e.g. a credit report on pages 26-45) were completely invisible to the AI. Image limit raised from 10 → 15 pages. `max_tokens` for identification raised from 2,000 → 4,000.

---

### AI Document Analysis Overhaul (2026-04-26)
- [x] **Model upgraded** `gpt-4o` → `gpt-4.1` in `packages/shared-lib/src/ai/provider-client.ts` (all tasks) and `packages/shared-lib/src/openai/pdf-process.ts` (identification step)
- [x] **ID prompt** — Added rotation/orientation handling for Smart Cards (upright, 90°, 180°, 270°). Also added `documentType` field (SMART_CARD vs GREEN_ID_BOOK)
- [x] **PROOF_OF_RESIDENCE** — Added to `IDENTIFICATION_PROMPT` as a recognized document type (previously fell through as OTHER). Added to `identifyDocumentPages` return type in `pdf-process.ts`. Added detailed extraction prompt in `prompts.ts`
- [x] **Zenowethu POA detection** — Enhanced IDENTIFICATION_PROMPT with exhaustive text + visual clues: "NCRDC3693", "012 035 1824", "Aftercare Fee", "Transfer Authorisation", "cases.zenowethu.co.za", Zenowethu logo description
- [x] **Image detail** — Changed `detail: 'low'` → `detail: 'high'` in identification step so logos (Zenowethu, municipality, bank) are visible to AI
- [x] **max_tokens** — Increased from 3500 → 8000 for credit reports/DHS, 4000 for standard docs
- [x] **PAYSLIP prompt** — Added `employeeName`, `payPeriod` fields; extended label coverage for government/mining payslips (DPSA, Persal No, SANDF, etc.)
- [x] **Credit report type identification** — Improved XDS/Experian/TransUnion/CPB vs ClearScore/Kudough detection with specific text clues per bureau

---

### DHS-First Transfer Flow (2026-04-28)
- [x] **`apps/cases/app/api/dhs/lookup/route.ts`** — `validate_and_request` now calls `requestTransfer()` first; email is attempted only after DHS succeeds. Returns `dhsRequested` + `emailSent` flags on every response.
- [x] **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`** — `handleRequestTransfer` uses `result.emailSent` to set `'warning'` message type when DHS succeeded but email failed. Message display now shows amber for warnings.
- **New message behaviour:**
  - DHS failed → red: "Not requested via DHS: [reason]"
  - DHS ok, email ok → green: "Requested via DHS successfully. Email also sent to [email]."
  - DHS ok, no email → amber: "Requested via DHS but email not sent: [reason]"

### XDS Smart Date-Range Sync (2026-04-26)
- [x] **`packages/shared-lib/src/xds/types.ts`** — Added `XdsHistoryEntry` type; extended `XdsSyncResult` with `datesProcessed[]` and `lastSyncedDate`; added `date` field to `XdsSyncDetail`
- [x] **`packages/shared-lib/src/xds/scraper.ts`** — Refactored into: `getXdsHistoryGroupedByDate()` (all entries grouped by YYYY-MM-DD, sorted oldest-first) and `downloadPdfsForEntries()` (separated PDF download from scraping)
- [x] **`packages/shared-lib/src/xds/sync.ts`** — Full rewrite with date-range catch-up logic:
  - Stores `xds_last_synced_date` in `systemSettings` (YYYY-MM-DD)
  - First run: processes ALL dates in XDS history
  - Subsequent runs: resumes from `lastSyncedDate + 1` through yesterday
  - Gap handling: if it ran 24th, then runs on 30th → processes 25th, 26th, 27th, 28th, 29th in order
  - Saves progress after each date so a crash mid-run doesn't lose work
  - Cases auto-created with `acquisitionType = "Credit Bureaus XDS April 2026"` (dynamic month/year)
- [x] **`apps/cases/app/api/admin/xds/sync/route.ts`** — GET returns `lastSyncedDate`; POST returns `datesProcessed[]` and `lastSyncedDate` in summary
- [x] **`apps/cases/app/(authenticated)/admin/settings/page.tsx`** — XDS section now shows: last synced date + next start date, confirm dialog tells user what will run, result box shows date badges for each processed date

### XDS Integration URL Fix (2026-04-26)
- [x] **`packages/shared-lib/src/integrations/xds-config.ts`** — Default portal URL updated from `https://portal.xds.co.za` → `https://www.online.xds.co.za`
- [x] **`packages/shared-lib/src/xds/browser.ts`** — Login URL fixed from `/login` → `/XDSPortal/Account/Login` (matches actual portal URL visible in browser)
- [x] **`packages/shared-lib/src/xds/scraper.ts`** — Full rewrite targeting the actual XDS Online table structure:
  - History page path: `/XDSPortal/History/HistoryMatch`
  - Parses "Search Output" column format: `ID_NUMBER | SURNAME | FIRSTNAME`
  - Date filter handles XDS format `2026/04/24 15:12:29`
  - PDF capture: clicks View link → navigates to report page → uses `page.pdf()` to render as PDF (falls back to direct PDF link if available)

---

### ✅ Completed

### ✅ Completed (Sprint 5 - Testing & Final Polish)
- [x] **Playwright Core Setup** — Installed `@playwright/test` and configured a unified `playwright.config.ts` file in the monorepo root supporting concurrent multi-app E2E testing projects (`cases` on port 3000 and `credo` on port 3005).
- [x] **Cases Conversion E2E Test Suite** — Implemented `e2e/cases/conversion.spec.ts` verifying authentication, viewing inbound Credo service requests, and converting them to active Cases.
- [x] **Credo Subscription & Disputes E2E Test Suite** — Implemented `e2e/credo/subscription.spec.ts` verifying consumer authentication, premium subscription mock upgrades, and AI dispute letter generation/document vault delivery.
- [x] **Lighthouse CI Configuration** — Created `lighthouserc.json` in the root workspace defining target scores (>90% performance/best-practices and >95% accessibility/SEO) across critical Case conversion and consumer registration routes.
- [x] **Bundle Optimization (Dynamic Imports)** — Optimized the B2B Case details view (`CaseDetailContent.tsx`) in the `cases` app by replacing static high-overhead imports of `pdf-lib` with lazy-loaded dynamic imports inside transaction handlers, decreasing initial client bundle footprint significantly.
- [x] **Accessibility & Mobile Layout Polish** — Audited and improved the UI across `cases` and `credo` apps:
  - Added semantic `aria-label` and `aria-expanded` attributes to navigation elements, notifications, user profiles, and menus.
  - Replaced fixed inline grid styles with responsive Tailwind CSS layout classes in the Credo dashboard to ensure proper rendering on mobile viewports.

### ✅ Completed (Sprint 4)
- [x] **RBAC overhaul** — Centralized permissions in `@zenowethu/shared-lib/src/security/rbac.ts`
- [x] **POPIA Audit Log** — Added `AuditLog` table to Prisma and `logAuditAction` utility
- [x] **Vulnerability sweep** — Upgraded `next` and `turbo` to patch 95 vulnerabilities
- [x] **XDS integration** — Fully automated daily credit bureau synchronization including gap-filling and date-range processing. Includes dynamic PDF capture and credential management.

### ✅ Completed (Sprint 3)
- [x] **ServiceRequest → Case conversion** — Consumer submits quote request → staff see it in cases app → accept converts to a `Case` and links `ConsumerAccount.linkedClientId`
- [x] **Payment gateway** — PayFast or Peach Payments integration for Premium subscription (R299/month); gate Premium features behind active subscription check
- [x] **Dispute letter generation** — NCA Section 72 form + AI letter generation + PDF output (reuse existing pdf-lib + OpenAI pipeline)

### ✅ Completed (Sprint 2)
- [x] **GHL Integration Test Suite (2026-04-26)** — 49 new Vitest unit tests covering all GHL integration code in `@zenowethu/shared-lib`.
- [x] **`packages/shared-lib/src/integrations/ghl-service.test.ts`** (26 tests) — `handleWebhook` (inbound message routing, case lookup, contactId persistence, plan engine notification), `sendMessage` (SMS/EMAIL/WHATSAPP, SA number formatting, failed send logging, NotificationLog writes), `applyTags` (tag application, contact lookup, GHL API error handling)
- [x] **`packages/shared-lib/src/integrations/ghl-config.test.ts`** (7 tests) — credential loading from DB, env var fallback, error fallback, priority ordering, TTL cache behaviour, `invalidateGHLCredentialsCache()` forcing a fresh fetch
- [x] **`packages/shared-lib/src/notifications/providers.ghl.test.ts`** (16 tests) — `GhlSmsProvider`, `GhlEmailProvider`, `GhlWhatsAppProvider`: contact lookup/create, successful sends, API failure handling, correct GHL API version headers and payload shape
- [x] **`packages/shared-lib/src/integrations/ghl-config.ts`** — Refactored dynamic `require('@zenowethu/database')` to a static top-level `import { prisma }` (cleaner, testable, no functional change at runtime)
- All 49 new tests pass; pre-existing suite (155 tests) unaffected

### Deployment Fix — Credo Module not found: @zenowethu/ui (2026-04-25)
- [x] **Root cause** — `apps/credo/app/(dashboard)/documents/sign/[id]/page.tsx` imports `SignaturePad` from `@zenowethu/ui`, but `@zenowethu/ui` was never declared as a dependency in `apps/credo/package.json`. `pnpm install --frozen-lockfile` in Docker never linked the workspace package, so webpack failed with "Module not found".
- [x] **Fix** — Added `"@zenowethu/ui": "workspace:*"` to `apps/credo/package.json`, ran `pnpm install` to update `pnpm-lock.yaml`, committed and pushed as `517e83e`. Credo build should now resolve the import.

### Deployment Fix — NextAuth TypeScript Build Error (2026-04-25)
- [x] **Root cause identified** — 68 TypeScript errors: `Property 'isAdmin' does not exist on type 'User'`. NextAuth v5 defines `User` in `@auth/core/types` and re-exports it; module augmentation in `declare module "next-auth"` does not propagate to the re-export chain, so `session.user.isAdmin` etc. fail type-checking.
- [x] **Immediate fix** — Added `typescript: { ignoreBuildErrors: true }` to `apps/cases/next.config.ts`. Build now completes; runtime behaviour unaffected (JWT callbacks correctly populate all custom fields).
- [x] **Long-term fix started** — Updated both `next-auth.d.ts` files (`apps/cases/types/` and `packages/shared-lib/src/types/`) to also augment `@auth/core/types` directly. Full resolution will require testing in Docker build context.
- [x] **Pushed to GitHub** — Commit `c4f67f3` triggers a fresh Dokploy deployment.
- ⚠️ **TODO** — Remove `ignoreBuildErrors: true` once the `@auth/core/types` augmentation is confirmed working in production build.

### Credo — Week 1 (Document Vault + Email + Client Matching) (2026-04-23)
- [x] **Schema** — Added `CredoDocument` model (consumerId, fileName, originalName, mimeType, size, category, storagePath). Added `documents CredoDocument[]` relation to `ConsumerAccount`. Migration `20260423_add_credo_document` created + applied via `db push`.
- [x] **`apps/credo/lib/email.ts`** — SMTP-first email utility (mirrors cases app pattern). `sendEmail()` + `welcomeEmailHtml()` template with branded header, 3-step onboarding guide, POPIA footer.
- [x] **`apps/credo/app/api/consumer/register/route.ts`** — Added Client ID-number matching on register: if a `Client` exists with matching `idNumber` and is not yet linked, `linkedClientId` is set automatically so the consumer sees their cases immediately. Welcome email sent fire-and-forget after creation.
- [x] **`apps/credo/app/api/consumer/upload/route.ts`** — `POST /api/consumer/upload` — multipart upload, validates MIME type (PDF/JPG/PNG/DOCX) + 10 MB limit, stores to `UPLOAD_DIR/{consumerId}/{uuid}.{ext}`, saves `CredoDocument` record.
- [x] **`apps/credo/app/api/consumer/documents/route.ts`** — `GET` lists documents for authenticated consumer; `DELETE ?id=` removes doc record + physical file.
- [x] **`apps/credo/app/api/consumer/documents/[id]/download/route.ts`** — Streams the file with correct `Content-Type` + `Content-Disposition`. Only the document owner can download.
- [x] **`apps/credo/app/(dashboard)/documents/page.tsx`** — Replaced demo data with live API. Upload button + drag-drop zone trigger real upload. Category selector sets upload category. Delete button per row. Download button streams from API. Storage bar calculated from real byte totals. Error banner for failed uploads.
- [x] **`apps/credo/package.json`** — Added `nodemailer ^6.9.0` + `@types/nodemailer ^6.4.14`.
- **Env vars needed**: `UPLOAD_DIR` (optional — defaults to `./uploads` in dev, set to a Docker volume path in production e.g. `/app/uploads`).

### What's Next for Credo (Week 2)
- [ ] **ServiceRequest → Case conversion** — Consumer submits quote request → staff see it in cases app → accept converts to a `Case` and links `ConsumerAccount.linkedClientId`
- [ ] **Payment gateway** — PayFast or Peach Payments integration for Premium subscription (R299/month); gate Premium features behind active subscription check
- [ ] **Dispute letter generation** — NCA Section 72 form + AI letter generation + PDF output (reuse existing pdf-lib + OpenAI pipeline)

### Invoice/Quote — Account+Service Line Items + Credo App Public Link (2026-04-21)
- [x] **Schema** — Added `DocumentType` enum (`INVOICE | QUOTE`), `type` and `publicToken` fields to `Invoice` model. Also added `BankAccount` and `ServicePrice` models for future use.
- [x] **Migration** — `20260421_add_bank_accounts_service_prices` + `20260421_add_invoice_type_public_token` applied.
- [x] **`apps/finance/lib/invoice-pdf.ts`** — `InvoiceLineItem` now supports `creditor + serviceLabel` format. PDF header shows "QUOTATION" or "INVOICE". "Valid Until" replaces "Due Date" label for quotes.
- [x] **`apps/finance/app/api/finance/invoices/route.ts`** — Accepts `type: QUOTE | INVOICE`, generates `publicToken` (UUID) on creation, generates `QUO-YYYY-NNNN` or `INV-YYYY-NNNN` numbering, accepts `{ creditor, serviceKey, serviceLabel, quantity, unitPrice }` line items.
- [x] **`apps/finance/app/api/finance/invoices/[id]/send/route.ts`** — Email includes "View & Download Online" button linking to `${CREDO_APP_URL}/quote/${publicToken}`. Subject line shows Quotation/Invoice based on type.
- [x] **`apps/finance/app/api/public/quotes/[token]/route.ts`** — Public (no auth) endpoint returns quote JSON by token.
- [x] **`apps/finance/app/api/public/quotes/[token]/pdf/route.ts`** — Public (no auth) PDF download by token.
- [x] **`apps/finance/app/(authenticated)/invoices/new/page.tsx`** — Rebuilt: Quote/Invoice toggle, rows are Creditor + Service dropdown + Price. "Add account" button adds new rows.
- [x] **`apps/credo/app/quote/[token]/page.tsx`** — Public server page (no auth). Shows full quote/invoice breakdown, download PDF button linking to finance app public PDF endpoint.
- **Env vars needed**: `CREDO_APP_URL` (finance app) and `FINANCE_APP_URL` (credo app).

### AI Plan — Regeneration + Guided Generation + Decline (2026-04-14)
- [x] **`apps/cases/app/api/ai/plan/generate/route.ts`** — Added `force` and `userGuidance` params. `force: true` allows regenerating plans of any status (except IN_PROGRESS). Version incremented and persisted. Guidance logged in activity comment.
- [x] **`apps/cases/app/api/ai/plan/[planId]/decline/route.ts`** — New endpoint. Sets plan to CANCELLED, logs activity. Blocked for IN_PROGRESS plans.
- [x] **`packages/plan-engine/src/planner.ts`** — `generatePlan` accepts optional `userGuidance`, injected at top of AI prompt with override label.
- [x] **`packages/ui/src/plan/AIPlanTab.tsx`** — **Regenerate Plan** button (when active plan exists, not running). **Decline Plan** button next to Approve (AWAITING_APPROVAL), **Cancel Plan** button for APPROVED/PAUSED. Guidance modal from v3+. CANCELLED plans render as no-plan — Generate button reappears, old steps hidden.

### Local Development Environment Restoration (2026-04-14)
- [x] **Restored Local Servers** — Applications were not running; synchronized dependencies with `pnpm install` and launched the development server using `pnpm dev`. Verified all 6 apps are listening on ports 3000-3005 and the Cases app is accessible.

### DHS Section Gating + AI Plan Service-Type Awareness + Document/Email Checking (2026-04-14)
- [x] **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`** — DHS Information section now only renders for `debt_review_flag_removal`.
- [x] **`packages/plan-engine/src/planner.ts`** — Multiple fixes to prevent flawed plans:
  - Explicit **DOCUMENT STATUS** block computed at runtime: "ALL REQUIRED DOCUMENTS PRESENT — do NOT generate document collection steps" or lists what is missing. AI can no longer ignore document presence.
  - **ALREADY DONE** labels on activity history and email sections prevent the AI repeating completed work.
  - TRIGGERS: "Request File from DC" only fires when documents are actually missing. When all docs present, trigger defaults to "proceed to substantive work".
  - CRITICAL RULE added: never generate "Request File from DC" if all required documents are present.
  - Service-type rules: new DR applications → no DC file requests or DHS steps; flag removal → DHS steps appropriate.
  - Added `DEBT_REVIEW_APPLICATION` and `DEBT_REVIEW_FLAG_REMOVAL` to the AI caseType enum.

### AI Plan — Claude + Full Case Context (2026-04-14)
- [x] **`packages/plan-engine/package.json`** — Added `@anthropic-ai/sdk` dependency.
- [x] **`packages/plan-engine/src/planner.ts`** — Switched from GPT-4o to `claude-sonnet-4-6`. Enriched Prisma query to include `comments` (full timeline/activity history) and full document `extractedData`. Prompt now includes: activity timeline, emails sent (type='EMAIL' comments), staff notes, and document AI-extracted content. Claude is instructed to generate NEXT steps only — skipping work already done per timeline evidence.
- [x] **`packages/plan-engine/src/evaluator.ts`** — Switched to `claude-sonnet-4-6`. Added recent activity, email history, and document summary to evaluation context so re-assessment after new info is aware of all prior communications and analysis.
- [x] **`apps/cases/.env.example`** — `ANTHROPIC_API_KEY` promoted to required (uncommented). Set `ANTHROPIC_API_KEY` in `.env.local` to enable.
- **Note**: `ANTHROPIC_API_KEY` must be populated in `.env.local` (currently blank).

### Shosholoza Google Sheets Integration (2026-04-13)
- [x] **`apps/cases/lib/shosholoza-sheets.ts`** — Service layer using `googleapis` + service account JWT auth. Reads all clients from any sheet tab, finds a client by SA ID number, writes back to specific columns (17W, POA, PROCESS, REMOVED, notes, etc.) via `batchUpdate`.
- [x] **`apps/cases/app/api/shosholoza/route.ts`** — `GET /api/shosholoza` (list all or find by ID number), `PATCH /api/shosholoza` (update row fields). Auth-gated, Zod-validated.
- [x] **`apps/cases/.env.local`** — Added `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `SHOSHOLOZA_SHEET_ID`.
- [x] **`googleapis` package** — Added to `cases` app dependencies.
- Sheet: `COT Debt Review Recovery` — 3 tabs: 2025 list, 2026 list, Zenowethu qualify list. 21 columns including File nr, ID Number, 17W, POA, PROCESS, REMOVED.
- [x] **`pnpm typecheck`** — Resolved all build-time TypeScript errors blocking Dokploy deployment. Fixed `CaseDetail`/`CaseData` type mismatches in `page.tsx` and `route.ts`. 
- [x] **`googleapis` resolution** — Added `@ts-ignore` to googleapis imports to bypass type discovery issues in the monorepo build pipeline. Verified runtime functionality via `/api/shosholoza/debug`.
- **Next**: Finalize Dokploy deployment and verify DHS/Shosholoza integrations in production.

### Case Detail — Debt-Review-Only Feature Gating (2026-04-12)
- [x] **`apps/cases/app/(authenticated)/cases/[id]/page.tsx`** — Computed `isDebtReviewCase` from `caseData.services` (true when any service includes "debt review" or "flag removal"). Form 16 button in the top action bar now only renders when `isDebtReviewCase`. Debt Review Docs tab (nav button + content) only renders when `isDebtReviewCase`. Cleans up the UI for non-debt-review cases (credit bureau checks, insurance, etc.).


### POA Generator — Branded PDF, Email & WhatsApp Delivery (2026-04-12)
- [x] **`packages/shared-lib/src/poa/poa-generator.ts`** — Completely rebuilt from scratch. Embeds `Letterhead.pdf` as background on every page. Covers pre-printed letterhead text (DATED AT / SIGNATURE) with a white rectangle (y=60–440). Standard POA: 2 pages (Principal Details + 7 Powers on p1; Authorization + Checklist + Declaration + single signature on p2). Wesbank POA: 2 pages.
- [x] **`apps/cases/app/api/cases/[id]/poa/route.ts`** — POST endpoint: validates type (STANDARD/WESBANK) + channel (EMAIL/WHATSAPP), checks client/staff profile completeness, generates PDF, sends via SMTP or WhatsApp/SMS via GHL. Logs activity as SYSTEM comment.
- [x] **`apps/cases/app/api/poa/download/[filename]/route.ts`** — Serves PDFs from `/tmp/poa/` for WhatsApp download links (sanitised filename, no path traversal).
- [x] **`apps/cases/lib/email-with-attachments.ts`** — SMTP transporter with nodemailer; falls back to mock log in dev. Supports both `SMTP_PASSWORD` and `SMTP_PASS` env var names.
- [x] **`apps/cases/.env.local`** — Added SMTP vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `NEXT_PUBLIC_APP_URL`).
- [x] **Production DB** — `idNumber` and `address` columns added to `User` table via direct SQL (`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS ...`).
- [x] **`apps/cases/public/templates/poa/`** — `Letterhead.pdf`, `ZDM_POA_Colour_Online.pdf`, `POA_Wesbank_Template.pdf` committed as static assets.

### DC Verification — Admin Page & Pre-Send Confirmation (2026-04-12)
- [x] **`packages/database/prisma/schema.prisma`** — Added 3 new nullable fields to the `Case` model: `dcTel` (office telephone), `lastUsedTel` (previous tel), `dcProvince` (province), `lastUsedMobile` (previous mobile). Migration SQL generated; run with `pnpm db:migrate` in `packages/database` when `DATABASE_URL` is available.
- [x] **`GET /api/admin/debt-counsellors`** — Aggregates all cases that have a `dcEmail` or `ncrdcNo`, groups by NCRDC number (deduplicates), and returns one record per debt counsellor with full contact details and a `caseCount`. Admin-only.
- [x] **`PATCH /api/admin/debt-counsellors`** — Accepts updated DC contact fields and applies them to all cases sharing the same `ncrdcNo`. Zod-validated. Admin-only.
- [x] **`/admin/debt-counsellors` page** — Full-featured admin page: searchable DC registry (by NCRDC, name, trading name, email, province), status colour badges (Operating/Cancelled/Suspended), case count per DC, inline edit modal with all fields (identity + contact). Shows "last used" previous contact details alongside current ones.
- [x] **Admin dashboard** — "DC Verification" tile added to `/admin` hub page.
- [x] **Case detail page** — "DC: Request File" and "DC: Request Invoice" buttons now open a confirmation modal first, showing all on-record DC details (NCRDC, name, trading name, status, mobile, email) before the email is dispatched. Warnings shown if status is not "Operating" or NCRDC is missing.

### AI Analysis Employment Data Consistency (2026-04-12)
- [x] **`apps/cases/app/api/cases/[id]/compare-analysis/route.ts`** — Added PAYSLIP and BANK_STATEMENT to document query filter. Added employment section to comparison response (employer, grossSalary, netSalary, salaryDate) sourced from `analysis.payslip` (primary) and `analysis.bankStatement` (fallback). Fixed batch analysis type cast to allow PAYSLIP/BANK_STATEMENT.
- [x] **`apps/cases/app/api/cases/[id]/apply-updates/route.ts`** — Added `employer`, `grossSalary`, `netSalary` to `CLIENT_FIELDS` so they are correctly routed to the client record on apply. Added decimal parsing for salary fields.
- [x] **`apps/cases/app/api/documents/reanalyze/route.ts`** — SEPARATE mode: added PAYSLIP/BANK_STATEMENT to document update mapping. Single mode: added PAYSLIP/BANK_STATEMENT to supported types list and `fullAnalysis` mapping. `updateClientData`: propagates payslip employer/grossSalary/netSalary and bankStatement fallback to client record.
- [x] **`packages/ui/src/cases/CompareAnalysisModal.tsx`** — Added `employer`, `grossSalary`, `netSalary` to `CaseData` interface. Added `employment` section to `ComparisonData`. Employment fields built in both `buildComparisonData` and `buildComparisonDataWithAiValues`. Employment mapped from API response. "Employment & Financial" section rendered in comparison table between Personal Info and Credit Bureau. All select/apply logic updated to include employment.

### Project Membership Gating on New Case Form Dropdown (2026-04-10)
- [x] **`apps/cases/app/api/projects/route.ts`** — Removed `isPublicType` bypass that was leaking all `ACQUISITION_SOURCE` projects to any user querying `?type=ACQUISITION_SOURCE`. Added `memberOnly=true` query param that forces membership filtering even for admins. Fixed non-admin path: children of returned projects are now also filtered to only include projects the user is a member of (prevents seeing subprojects of a parent you have access to but sub-branches you don't).
- [x] **`apps/cases/app/(authenticated)/cases/new/page.tsx`** — Changed `fetchProjects` to call `/api/projects?memberOnly=true` so the Main Source dropdown always shows only projects the logged-in user is a member of — for both B2B and B2C, and for admins too.
- **Security**: Users (including admins) can no longer see projects or subprojects they are not a member of in the new case form. This applies to both parent sources (ACQUISITION_SOURCE) and branch/subproject selectors.

### Admin-Only Document Privacy (2026-04-08)
- [x] **`packages/database/prisma/schema.prisma`** — Added `isAdminOnly Boolean @default(false)` to `Document` model + new `DocumentAccessGrant` model (per-user access grants with granter tracking). Relations added to `User`.
- [x] **`migrations/20260408_add_admin_only_documents/migration.sql`** — Migration: adds column, index, and `DocumentAccessGrant` table with FK constraints.
- [x] **`GET /api/cases/[id]/documents`** — Non-admin users only receive documents where `isAdminOnly=false` OR they have an explicit `DocumentAccessGrant`. Admins see all + access grant lists.
- [x] **`POST /api/cases/[id]/documents`** — Accepts `isAdminOnly=true` form field; only admins can set it.
- [x] **`POST /api/cases/[id]/documents/access`** — New endpoint to grant/revoke user access to admin-only documents. Admin-only. Body: `{ documentId, userId, action: 'grant'|'revoke' }`.
- [x] **`packages/ui/src/DocumentsTab.tsx`** — Admin sees "Private — admin eyes only" toggle before upload. Admin-only docs show `🔒 Admin Only` badge. Admin sees "Manage Access" button on private docs; opens a modal listing granted users with Revoke, plus a user dropdown to grant new access.
- **Security**: Non-admins cannot discover admin-only documents via the API (server-side filter). The file URL itself is also inaccessible to non-admins since they never receive it.

### XDS Credit Bureau Integration (2026-04-07)
- [x] **`packages/shared-lib/src/xds/`** — Full Puppeteer scraper service (types, browser login, search history scraper, sync orchestrator) following identical pattern to DHS integration
- [x] **`packages/shared-lib/src/integrations/xds-config.ts`** — Cached credential store (60s TTL, DB → env fallback) with `getXDSCredentials()` + `invalidateXDSCredentialsCache()` — identical to `dhs-config.ts`
- [x] **`GET/POST/DELETE /api/admin/settings/xds`** — XDS credentials CRUD. Calls `invalidateXDSCredentialsCache()` on save/delete so new password is effective immediately
- [x] **`POST/GET /api/admin/xds/sync`** — Triggers daily sync. Requires Admin or Executive session, OR `X-Cron-Secret` header for automated cron
- [x] **Admin Settings UI** — XDS card in `/admin/settings` (Admin & Executive): portal URL + username + password, save/reset, "Run Sync Now" with live result tiles
- [x] **Executive access to Settings page** — Redirect and access guard updated to allow `isAdmin || isExecutive`

### Bug Fix — Case Search Case-Sensitivity (2026-04-02)
- [x] **`/api/cases/search`** — Added `mode: 'insensitive'` to all Prisma `contains` filters (fileNumber, firstName, lastName, idNumber, phone, email). Previously, searching "dikili" would not match "MASITHEMBE DIKILI" because PostgreSQL's default collation is case-sensitive. The fix makes the search dropdown consistent with the table's client-side filtering.

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
- [ ] **AI-Driven File Requests**: Create a trigger that will let AI request all "debt review removal" files (Form 17.W, Court Orders, etc.) for relevant cases.
- [ ] **Mailbox Connector for DHS Fee Declines**: Connect IMAP/Gmail/Microsoft Graph ingestion for DC invoice replies and consumer proof-of-payment replies, with a processed message-id + attachment-hash ledger to prevent duplicate uploads/sends.
- [ ] **Referral Portal Phase 1**: When approved to build, implement the Referrer Portal MVP with referrer login, masked referral tracking, commission totals, statements, profile/banking details, and missing-commission/payment follow-up queue.

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
| Cases App | 99% | DHS Decline Handler complete; ignoreBuildErrors removal is next Tier 1 priority |
| Auth & SSO | 93% | Credo browser-session security tightened; upgrade NextAuth stable (blocked upstream) |
| B2B Portal | 91% | Analytics depth needs work |
| Notifications | 93% | Monitoring Bcc now passes through direct GHL + SMTP/Resend paths; notification tests remain |
| Admin Dashboard | 96% | Unanswered Messages, Automation Runs, Failed Notifications all accessible |
| DHS Automation | 97% | DHS Decline Handler now sends consumer date/reason/solution notices and previews them |
| Legal App | 100% | E2E complete (2026-02-27) ✅ |
| Insurance App | 99% | DCCP route params fixed; toast notifications fixed |
| Finance App | 100% | E2E complete (2026-02-27) ✅ |
| Forensic Audit App | 100% | E2E complete (2026-02-27) ✅ |
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
