# Zenowethu Cases System — Product Requirements Document

## 1. Product Overview

**Zenowethu** is a comprehensive debt counselling case management platform built for the South African market. It manages the entire consumer debt review lifecycle through 5 interconnected applications.

### Business Domain
- **Industry**: Debt counselling / credit repair (regulated by NCR under the National Credit Act)
- **Users**: Debt counselling staff (case managers, legal officers, insurance agents, auditors, finance team)
- **Clients**: South African consumers seeking debt review, insurance restructuring, or reckless lending assessment
- **Partners**: B2B referral partners (dealerships, walk-in franchises) who refer clients

### System Goals
1. Streamline case management from intake to completion
2. Automate DHS interactions (transfer requests, status checks)
3. Use AI to extract and validate document data
4. Enable multi-department collaboration via specialized apps
5. Provide B2B portal for referral partner management

---

## 2. User Roles & Permissions

| Role | Description | Access Level |
|------|------------|-------------|
| **ADMIN** | System administrator | Full access to all features, user management, settings |
| **MANAGER** | Team lead / senior staff | All cases, reports, API keys; no user management |
| **MEMBER** | Case worker / staff | Own assigned cases only, limited reports |
| **B2B_PARTNER** | External referral partner | Own partner's cases only, via B2B portal |

---

## 3. Feature Specifications

### 3.1 Core Case Management (Cases App)

#### Client Intake
- Create client profiles with: name, SA ID number (13 digits), phone, email, employment info
- Auto-extract client data from uploaded ID documents via OpenAI
- Duplicate client detection by ID number

#### Case Creation & Tracking
- Auto-generated file numbers (ZEN-XXXXX pattern)
- Assignment to staff members
- Service fee tracking
- Acquisition type (B2C direct, B2B partner referral)
- 80+ workflow statuses across 9 categories (see `lib/statuses.ts`)

#### Workflow Status System
| Category | Statuses | SLA Enabled | Description |
|----------|---------|-------------|-------------|
| INTAKE | 5 statuses | Yes | New case → client contacted → docs requested |
| DOCUMENTATION | 6 statuses | Yes | Documents received → verified → analyzed by AI |
| DHS | 7 statuses | Yes | DHS login → transfer check → transfer request → approval |
| PROCESSING | 5 statuses | Yes | File processing → credit account review → fees |
| LEGAL | 6 statuses | Yes | Legal assessment → prescription check → court filing |
| INSURANCE | 6 statuses | Yes | Premium analysis → cancellation → new policy |
| PAYMENT | 5 statuses | Yes | Payment due → received → reconciled |
| FOLLOW_UP | 4 statuses | Yes | Follow-up scheduled → completed |
| INACTIVE | 3 statuses | No | On hold, cancelled, closed |

### 3.2 AI Document Analysis

#### Supported Document Types
| Type | Extracted Data |
|------|---------------|
| **SA ID Document** | Full name, ID number, date of birth, gender |
| **Proof of Address** | Address, utility type, account holder |
| **Credit Report** | Creditor names, account numbers, balances, monthly payments, total debt, open/closed/prescribed account counts |
| **Payslip** | Employer, gross salary, net salary, deductions |
| **Bank Statement** | Account holder, account number, opening/closing balance, transactions |

#### Processing Pipeline
1. Upload document (PDF or image)
2. If combined PDF → AI splits into individual documents
3. Each document analyzed via OpenAI Vision API
4. Structured data extracted and stored in database
5. Staff reviews and confirms extracted data

### 3.3 DHS Automation

#### Capabilities
- **Login**: Automated login to ncrdebthelp.co.za
- **Consumer search**: Find consumer by ID number
- **Transfer status**: Check if consumer is under debt review, identify current debt counsellor
- **Transfer request**: Submit transfer request with POA and ID document
- **Decline tracking**: Extract decline reasons from DHS portal popups
- **Counsellor info extraction**: Get DC name, email, trading name, NCRDC number

### 3.4 Insurance Module

#### Insurance Assessment
- Analyze credit accounts for credit life insurance opportunities
- Calculate premium savings with rate table lookups
- Generate substitution notices for consumers switching insurers
- Track cancellation letter generation and sending
- Monitor new policy issuance

### 3.5 Legal Module

#### Legal Matter Management
- Prescription checking (3-year rule under SA law)
- Reckless lending assessment
- Court document generation
- Legal letter management (drafting, sending, tracking)
- Rescission engine for court order modifications

### 3.6 Forensic Audit Module

#### Audit Functions
- Reckless lending detection via affordability analysis
- Evidence collection and document management
- Audit findings with recommendations
- Report generation

### 3.7 Finance Module

#### Financial Management
- Payment recording (manual + batch Excel upload)
- Payment-to-case matching
- Reconciliation dashboards
- Invoicing (B2B partner collection split — see Invoice Types below)

---

### 3.8 Invoice Types

Zenowethu has multiple invoice flows. Each is distinct in parties, frequency, and calculation method.

---

#### Invoice Type 1 — B2B Partner Collection Split Invoice

> **Plain English:** A B2B lending partner (e.g. Letsatsi Finance) gives the consumer a loan to pay for credit repair. They collect repayments from the consumer each month. Whatever they collect, Zenowethu is owed exactly 50%. At the end of each collection cycle, Zenowethu raises an invoice to the partner for that 50%.

##### Parties
| Role | Entity |
|------|--------|
| **Invoice sender** | Zenowethu Debt Management |
| **Invoice recipient** | B2B Lending Partner (e.g. Letsatsi Finance, Excel Finance) |

##### Full Business Flow

```
1. INTAKE
   └─ B2B partner (e.g. Letsatsi branch) loads client via B2B Portal in Cases App
   └─ They capture the loan amount = what the consumer will repay monthly
   └─ Notification sent to consumer (SMS / Email / WhatsApp):
      "Your credit repair application is being processed"

2. CASE PROCESSING (Zenowethu works the file)
   └─ At every milestone, consumer is notified automatically
   └─ DHS transfer, credit bureau, legal, insurance handled internally

3. COMPLETION
   └─ Debt review flag removed
   └─ Zenowethu status → COMPLETED
   └─ Zenowethu notifies B2B partner + sends all required documents
   └─ B2B partner verifies flag removal on their side

4. CLOSURE
   └─ B2B partner creates loan code
   └─ Case status changes: COMPLETED → CLOSED
   └─ B2B partner notifies their branch
   └─ Branch contacts consumer to collect clearance certificate / Form 17.W
   └─ (Zenowethu sometimes assists with this consumer notification)

5. REPAYMENT OPTIONS FOR THE CONSUMER
   Option A — Loan (most common): Consumer takes a loan from the lender.
     Lender pays Zenowethu + Credit Repair upfront in full.
     Lender collects the loan + interest from the consumer over time.
     In this case Zenowethu is already paid — no monthly split invoice needed.

   Option B — Monthly debit order / payroll deduction:
     Consumer repays monthly via Debicheck (TT3) or payroll deduction (bank transfer).
     Lender collects → splits 50/50 with Zenowethu.
     Zenowethu invoices the partner for their 50% share each cycle.
```

##### Collection Cycles — Two Invoices Per Month

| Report Name | Period Covered | Sent By Partner Approx. |
|-------------|---------------|------------------------|
| **Mid-Month Report** | 1st – 15th of calendar month | ~15th of the month |
| **End-of-Month Report** | 1st – last day of calendar month | ~3rd–4th of the following month |

Zenowethu raises a separate invoice for each report received.

##### Collection Types in Partner Spreadsheet

| Code | Description | Payment Method |
|------|-------------|----------------|
| **TT1** | Non-payroll (direct payment, rare) | Direct deposit |
| **TT3** | ALLPS Debicheck | Debit order (non-payroll clients) |
| **Bank Transfer** | Direct bank transfer | Payroll deduction (employer pays) |
| **Write Off** | Uncollectable — journals negative | N/A |

##### Revenue Split Calculation

```
Total Collected by Partner (from their spreadsheet)
  ÷ 2
= Zenowethu's 50% Share

Invoice Line Items:
  Non Payroll (TT3 Debicheck)  = 50% of TT3 receipt total
  Payroll (Bank Transfer)      = 50% of bank transfer receipt total
  Less Cost                    = 50% of cost deductions (negative)
  ─────────────────────────────────────────────────────────────────
  Grand Total                  = Zenowethu's invoice amount to partner
```

##### Real Example — August 2024 (Letsatsi Finance)

| Description | Partner 50% | Zenowethu 50% | Combined Total |
|-------------|-------------|---------------|----------------|
| Non Payroll TT3 | R68,261.57 | R68,261.57 | R136,523.14 |
| Payroll (Bank Transfer) | R88,069.57 | R88,069.57 | R176,139.14 |
| Less Cost | -R878.37 | -R878.37 | -R1,756.74 |
| **Total** | **R155,452.77** | **R155,452.77** | **R310,905.54** |

Zenowethu invoice to Letsatsi = **R155,452.77**

##### Invoice Format

| Field | Value / Rule |
|-------|-------------|
| **Invoice Number** | `INV{MM}{YYYY}` — e.g. `INV082024` for August 2024 |
| **Reference** | Month name — e.g. `AUGUST` |
| **Date** | Last day of the collection period |
| **VAT** | 0% — financial services exemption |
| **Line items** | One row per collection type (Non Payroll, Payroll, Less Cost) |
| **Sender** | Zenowethu Debt Management, VAT No: 4590307072 |
| **Sender Address** | Suite 2, 2nd Floor, Old Mutual Building, 17 Central Road, Mabopane |

##### Zenowethu Banking Details (on invoice)
| Field | Value |
|-------|-------|
| Bank | CAPITEC BUSINESS |
| Branch Code | 450105 |
| Account Number | 105 181 8346 |

##### Partner Spreadsheet Columns (what Letsatsi sends)
| Column | Description |
|--------|-------------|
| File nr | Client case/loan file number |
| ID number | Consumer South African ID number |
| Surname and Initials | Consumer name |
| Sub type | Transaction sub-type (e.g. ALLPS Debicheck TT3 ZENO) |
| Group type | RECEIPT, LOAN: NEW, JOURNAL: WRITE OFF, PAYOUT |
| Nick name | Branch or product nickname |
| Employer | Consumer employer |
| Loan nr | Lender's loan reference number |
| First paydate | Date of first repayment |
| Period | Loan term (months) |
| Overpay | Overpayment amount |
| Insurance | Credit life insurance premium |
| Total | Total collected for this row |

##### System Requirements for This Invoice Type
- [ ] Parse incoming partner Excel/XLS spreadsheet (two per month per partner)
- [ ] Extract RECEIPT rows, group by collection type (TT1 / TT3 / Bank Transfer)
- [ ] Calculate 50% split per collection type
- [ ] Deduct 50% of costs
- [ ] Generate PDF invoice in the format above (INV number, banking details, line items)
- [ ] Link invoice to B2B partner account and calendar month
- [ ] Track invoice status: Draft → Sent → Paid
- [ ] Store against partner project in the project hierarchy

##### Known B2B Lending Partners Using This Model
- **Letsatsi Finance** — sends mid-month + end-of-month XLS reports
- **Excel Finance** — sends reports in the same format (confirmed from September 2024 spreadsheet)

---

> ℹ️ **More invoice types exist** (e.g. direct client invoices, once-off service fees). These will be documented here as they are defined.

### 3.8 Cross-Cutting Features

#### B2B Portal
- Partner-specific dashboards showing only their referred cases
- API key management for programmatic access
- Project-based case organization

#### GoHighLevel CRM Integration
- Send SMS, Email, WhatsApp via GHL API
- Receive inbound messages as case comments
- Auto-acknowledgment responses

#### Notifications
- In-app notifications with @mention support
- Email notifications via Nodemailer
- Notification preferences per user

---

## 4. Non-Functional Requirements

### Performance
| Metric | Target |
|--------|--------|
| Dashboard TTFB | < 500ms |
| API response (list) | < 200ms |
| API response (search) | < 300ms |
| Document upload + AI analysis | < 30s per document |
| DHS automation (full check) | < 60s |

### Security
- JWT-based SSO across all subdomains
- bcryptjs password hashing (min 10 rounds)
- POPIA compliance for SA privacy law
- Zod input validation on all API routes
- RBAC authorization on all endpoints
- See `docs/SECURITY.md` for full specification

### Reliability
- Database backups (daily automated)
- Docker container auto-restart
- SSL via Let's Encrypt (Traefik ACME)
- Structured error logging

### Scalability
- Horizontal scaling via Docker replicas
- Database connection pooling via Prisma
- Static asset CDN (future)

---

## 5. Integration Specifications

### 5.1 NCR DHS Portal
- **Type**: Browser automation (Puppeteer)
- **URL**: https://ncrdebthelp.co.za
- **Auth**: Username/password stored in SystemSettings DB
- **Rate limiting**: Human-like delays between actions
- **Error handling**: Screenshot on failure, retry with backoff

### 5.2 OpenAI API
- **Model**: GPT-4 Vision (for document analysis)
- **Usage**: Document classification + data extraction
- **Cost control**: Batch analysis, combined PDF processing
- **Fallback**: Manual data entry if AI fails

### 5.3 GoHighLevel
- **Type**: REST API + Webhooks
- **Channels**: SMS, Email, WhatsApp
- **Auth**: API key + Location ID (stored in SystemSettings DB)
- **Webhooks**: Inbound message → CaseComment creation

### 5.4 SMTP (Nodemailer)
- **Type**: SMTP connection
- **Usage**: Password reset, notifications, system alerts
- **Config**: Via environment variables

---

## 6. Data Items Extracted Per Case

From project requirements (`Items to be extracted.txt`):

| Field | Source | Required |
|-------|--------|----------|
| Referrer | Manual/B2B | Optional |
| Project Name | Selected by user | Required |
| Surname | ID document / Manual | Required |
| Names | ID document / Manual | Required |
| ID Number | ID document / Manual | Required |
| Cell Number | Manual | Required |
| WhatsApp Number | Manual | Optional |
| Email Address | Manual | Optional |
| NCRDC No | Credit report / DHS | Optional |
| Debt Review Date | DHS | Optional |
| Service Fee | Manual | Optional |
| Category | Manual (Payroll/Non-Payroll, Single/Joint) | Required |
| DHS Status | DHS automation | Auto |
| Debt Counsellor Name | DHS automation | Auto |
| Trading Name | DHS automation | Auto |
| DC Email | DHS automation | Auto |
| After Care Fees | DHS (post-decline) | Manual |
| Legal Fees | Manual | Manual |
| Legal Fees Status | Manual | Manual |
| Fees Consent | Manual | Manual |
| Total Fees | Calculated | Auto |
| Closed Accounts | Credit report | Required |
| Open Accounts | Credit report | Required |
| Prescribed Accounts | Credit report | Optional |
| Insurance Notes | Assessment engine | Auto |
