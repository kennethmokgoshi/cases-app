# Website ↔ Cases Integration Specification (v1)

**Status:** Specification — public API not yet built (see §12)
**Owner:** Cases platform (Mokgoshi Empire)
**Applies to:** every external website that needs to send leads to, or read data from, a Cases tenant — firm marketing sites, campaign landing pages, and the product/SaaS marketing site.
**Last updated:** 2026-09-18

> Reuse this document unchanged for every website. The only per-site difference is which API key the website holds, and therefore which organisation receives its leads (§6). Site-specific branding, copy, service selection and disclaimer wording are the website's concern and are not part of this contract.

---

## 1. Integration principle

The website is a separate application on separate hosting. It **never connects to the Cases database**. All integration is through the **Cases Public API** over HTTPS, authenticated with an API key issued by Cases and bound to one tenant organisation. Every record created via the API lands in that organisation only.

```
Visitor ──► Website (form) ──► Website server ──HTTPS + API key──► Cases Public API ──► Lead queue in the tenant's Cases
                                                                                     └─► Staff notified (email / OPSGENTY)
```

The API key is used **server-side only** (website backend or serverless function). It is never shipped to the browser.

> Note: the in-repo `apps/website` currently writes leads directly to the database via Prisma (`apps/website/app/api/leads/route.ts`). That is acceptable only because it lives inside the monorepo. External websites must use the public API described here, and `apps/website` should migrate to it once the API exists so all sites share one path.

---

## 2. What the website sends to Cases

| Flow | Trigger on website | Cases endpoint | Result in Cases |
|---|---|---|---|
| Consumer lead | Assessment / "Get help" / contact form | `POST /api/public/v1/leads` | New `Lead` (status `NEW`, source `WEBSITE_*`) in the lead queue; staff notified; one-click convert to client + case + consumer account |
| Firm enquiry / demo request *(product site only)* | "Request a demo" form | `POST /api/public/v1/leads` with `leadType: "FIRM"` | Lead in the Mokgoshi Empire platform organisation's sales queue |
| Callback request | "Call me back" widget | `POST /api/public/v1/leads` with `service: "callback"` | Lead flagged for phone follow-up |
| Document upload from a landing page *(optional, later)* | Upload after lead is created | `POST /api/public/v1/leads/{id}/documents` | Document attached to the lead, quarantined until staff review |

---

## 3. What the website reads from Cases

| Data | Endpoint | Used for |
|---|---|---|
| Service catalogue and prices | `GET /api/public/v1/services` | Live pricing on services pages so the website never shows stale fees |
| Lead status *(optional)* | `GET /api/public/v1/leads/{id}` | "Thank you — we've received your request, reference `L-…`" page and follow-up emails |
| Health | `GET /api/public/v1/health` | Website monitoring; fallback behaviour if Cases is unreachable |

---

## 4. Links from the website into Cases products

| Link | Destination | Notes |
|---|---|---|
| "Client login" | `https://crediva.[tenant-domain]` | Consumer portal (Crediva), white-labelled per firm |
| "Sign your POA" (from SMS/email, not from website nav) | `https://crediva.[tenant-domain]/sign/{token}` | Token issued by Cases; website only needs to know the URL pattern |
| "Staff login" | `https://cases.[tenant-domain]/login` | Footer only |
| Referral links | `https://[website]/?ref={referrerCode}` | Website captures `ref` and passes it as `referrerCode` on lead submission so commissions attribute correctly |

---

## 5. Lead submission contract

**Request** — `POST /api/public/v1/leads`

Headers:

```
Authorization: Bearer <api-key>
Content-Type: application/json
Idempotency-Key: <uuid>        # prevents duplicate leads on retry
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `leadType` | `"CONSUMER" \| "FIRM"` | no (default `CONSUMER`) | `FIRM` only on the product website |
| `firstName` | string | yes | 1–100 chars |
| `lastName` | string | yes | 1–100 chars |
| `phone` | string | yes | SA mobile, 10–20 chars; normalised to `+27` by Cases |
| `email` | string | no | valid email |
| `idNumber` | string | no | 13 digits; used for duplicate detection and later bureau lookup |
| `service` | enum | yes | `debt-review-removal` · `court-rescission` · `credit-repair` · `insurance` · `debt-review` · `prescription` · `callback` · `saas-demo` |
| `message` | string | no | ≤ 2000 chars |
| `popiaConsent` | boolean | yes | must be `true` |
| `consentTextVersion` | string | yes | e.g. `"popia-v2-2026-09"` — which consent wording the visitor saw |
| `marketingConsent` | boolean | no | separate opt-in for marketing messages |
| `source` | string | yes | `WEBSITE_ASSESSMENT` · `WEBSITE_CONTACT` · `WEBSITE_CHAT` · `WEBSITE_CALLBACK` · `LANDING_PAGE` |
| `referrerCode` | string | no | from `?ref=` — attributes the lead to a referrer for commission |
| `campaign` | object | no | `{ utmSource, utmMedium, utmCampaign, utmContent, gclid, fbclid, landingPage, referrerUrl }` |
| `firm` | object | `FIRM` only | `{ name, ncrdc, sizeBand, province, website }` |
| `meta` | object | no | `{ ipAddress, userAgent, submittedAt, formId, locale }` — for consent evidence and bot analysis |

**Example request**

```json
{
  "leadType": "CONSUMER",
  "firstName": "Thabo",
  "lastName": "Mokoena",
  "phone": "0821234567",
  "email": "thabo@example.com",
  "idNumber": "9001015009087",
  "service": "debt-review-removal",
  "message": "I finished paying my debt review in 2024 and need the flag removed.",
  "popiaConsent": true,
  "consentTextVersion": "popia-v2-2026-09",
  "marketingConsent": false,
  "source": "WEBSITE_ASSESSMENT",
  "referrerCode": "REF-PM-014",
  "campaign": {
    "utmSource": "facebook",
    "utmMedium": "cpc",
    "utmCampaign": "drr-sept",
    "landingPage": "https://example.co.za/debt-review-removal"
  },
  "meta": {
    "ipAddress": "196.0.0.1",
    "userAgent": "Mozilla/5.0 ...",
    "submittedAt": "2026-09-18T09:12:44Z",
    "formId": "assessment-v3",
    "locale": "en-ZA"
  }
}
```

**Responses**

| Status | Body | Meaning |
|---|---|---|
| `201` | `{ "id": "…", "reference": "L-2026-00123", "status": "NEW", "duplicateOf": null }` | Lead created |
| `200` | `{ "id": "…", "reference": "…", "status": "DUPLICATE", "duplicateOf": "<existing id>" }` | Same phone/ID submitted within 30 days; recorded as `DUPLICATE`, staff still see it |
| `401` | `{ "error": "Invalid or expired API key" }` | — |
| `403` | `{ "error": "API key lacks write:leads" }` | — |
| `422` | `{ "error": "Validation failed", "issues": { "phone": ["…"] } }` | Field-level errors |
| `429` | `{ "error": "Rate limit exceeded", "retryAfter": 30 }` | Per-key limit hit |
| `5xx` | — | Retry with backoff |

**Website behaviour on failure:** retry `5xx` up to 3× with exponential backoff (1 s, 3 s, 9 s) reusing the same `Idempotency-Key`; if still failing, store the submission locally and email it to the firm's intake address (`INTAKE_FALLBACK_EMAIL`) so no lead is lost; show the visitor a success message regardless (the retry is server-side).

---

## 6. Which organisation receives the lead

The **API key decides**. Each key is created inside a firm's Cases admin (Admin → API Keys) and is bound to that organisation. The website never sends an organisation identifier.

| Website | Key belongs to | Leads land in |
|---|---|---|
| Mokgoshi Empire credit-repair website | Mokgoshi Empire operations org | Mokgoshi's lead queue |
| Product / SaaS marketing website | Mokgoshi Empire platform-owner org | Sales queue (firm enquiries) |
| zenowethu.co.za | Zenowethu org | Zenowethu's lead queue |
| Any future firm's website | Their org | Their lead queue |

A single website may run several campaign landing pages on the same key — distinguish them with `source`, `campaign` and `meta.formId`.

---

## 7. Security requirements

- HTTPS only; key in `Authorization` header, never in URL or browser code
- Keys have permission scopes (`write:leads`, `read:services`, `read:leads`), expiry, per-key rate limit, revocation from admin UI, last-used tracking
- CORS: the public API allows only server-to-server calls; browser calls are rejected (forces the key to stay server-side)
- Bot protection on every website form: Cloudflare Turnstile or hCaptcha + honeypot field + per-IP rate limit on the website side; Cases additionally rate-limits per key
- No personal data in query strings; all PII in request bodies
- Consent evidence stored with the lead: consent flag, wording version, timestamp, IP

---

## 8. Compliance content the website must carry

- POPIA consent checkbox (unticked by default) with link to the firm's privacy policy — submission blocked without it
- Privacy policy and terms pages that resolve (URLs supplied to Cases so lead confirmations can link them)
- Disclaimers on debt-review-removal, credit-score and legal-outcome claims: no guarantees; outcomes depend on NCR / bureau / court processes
- Statement that DHS / bureau automation is performed under the firm's own registrations
- AI-generated content (where shown) is a draft requiring professional review

---

## 9. Configuration the website needs

| Variable | Example | Notes |
|---|---|---|
| `CASES_API_BASE_URL` | `https://cases.[tenant-domain]/api/public/v1` | Per tenant |
| `CASES_API_KEY` | `zk_live_…` | Server-side secret; separate `zk_test_…` key for staging |
| `CREDIVA_URL` | `https://crediva.[tenant-domain]` | Client-login link |
| `POPIA_CONSENT_VERSION` | `popia-v2-2026-09` | Bump when consent wording changes |
| `INTAKE_FALLBACK_EMAIL` | `intake@[firm].co.za` | Used only when the API is unreachable |

---

## 10. Environments and testing

- Cases provides a **staging tenant** and test API key; leads created there are never visible in production
- Cases publishes an **OpenAPI 3 spec** for `/api/public/v1` and a Postman collection
- Acceptance tests for every website before go-live:
  1. Valid lead → appears in the tenant's queue and staff notified within 60 s
  2. Resubmitting the same phone/ID within 30 days → `DUPLICATE`, not a second `NEW` lead
  3. Missing `popiaConsent` → `422`, nothing stored
  4. Invalid / revoked key → `401`
  5. Burst of submissions → `429` with `retryAfter`
  6. API unreachable → fallback email fires, visitor still sees success
  7. `?ref=` on landing → `referrerCode` present on the lead

---

## 11. Ownership

| Item | Owner |
|---|---|
| Public API, keys, OpenAPI spec, staging tenant, staff notification | Cases (platform) |
| Forms, validation UX, bot protection, retry/fallback, consent wording, disclaimers | Website team |
| Privacy policy / terms / consent text | Firm + attorney |
| Referral code format and referrer onboarding | Cases + firm |

---

## 12. Build status on the Cases side

| Component | Status |
|---|---|
| `Lead` model, lead queue UI, convert-to-case, staff notification | ✅ Live |
| Lead validation schema (Zod) | ✅ Live (internal route in `apps/website`) |
| `ApiKey` model + `validateApiKey()` with scopes, rate limit, expiry (`packages/shared-lib/src/auth/api-auth.ts`) | ✅ Live |
| `POST /api/public/v1/leads` (key-authenticated, idempotent, duplicate detection) | 🔨 To build |
| `GET /api/public/v1/services`, `/leads/{id}`, `/health` | 🔨 To build |
| Lead fields: `leadType`, `referrerCode`, `campaign`, consent evidence, `firm` | 🔨 Schema additions |
| API keys bound to organisation (not project) | 🔨 Multi-tenancy Phase 1 |
| Staging tenant + OpenAPI spec | 🔨 To build |
| Shared client module (`@zenowethu/cases-client`) wrapping `POST /leads` with retry, idempotency and fallback | 🔨 To build |

---

## 13. Versioning

This is **v1** of the contract. Backwards-incompatible changes will be published as `/api/public/v2`; `v1` remains available for existing websites for at least 12 months after `v2` ships. Additive changes (new optional fields, new enum values) are made in place and noted in the changelog below.

### Changelog

| Date | Change |
|---|---|
| 2026-09-18 | Initial specification |
