# Insurance App - Detailed Features & Workflow
## Zenowethu Insurance Management System

---

## 🎯 Overview

The Insurance App manages all insurance-related services for Zenowethu clients. It integrates with the **Cases App** to link insurance policies to existing clients and cases, enabling a unified view of each client's financial journey.

---

## 📊 Dashboard Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     INSURANCE DASHBOARD                                     │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  ACTIVE     │  │  PENDING    │  │  CLAIMS     │  │  MONTHLY    │       │
│  │  POLICIES   │  │  CLAIMS     │  │  PAID       │  │  PREMIUMS   │       │
│  │    247      │  │     12      │  │     89      │  │  R 45,230   │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                                             │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐       │
│  │  CLAIMS REQUIRING ACTION     │  │  PREMIUM ARREARS             │       │
│  │                              │  │                              │       │
│  │  • John Doe - Death Claim    │  │  • 15 policies overdue       │       │
│  │  • Mary Smith - Disability   │  │  • Total: R 12,450           │       │
│  │  • Peter Jones - Hospital    │  │  • Oldest: 45 days           │       │
│  └──────────────────────────────┘  └──────────────────────────────┘       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐      │
│  │                    RECENT ACTIVITY                               │      │
│  │  🟢 Policy #INS-2024-0234 activated for Thabo Mokoena           │      │
│  │  🟡 Claim #CLM-2024-0089 moved to Under Review                   │      │
│  │  🔴 Premium overdue for Policy #INS-2024-0156                    │      │
│  └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ 1. POLICY MANAGEMENT

### 1.1 Policy Types

| Type | Description | Typical Coverage |
|------|-------------|-----------------|
| **LIFE** | Life insurance policy | R 50,000 - R 500,000 |
| **FUNERAL** | Funeral cover for family | R 10,000 - R 50,000 |
| **CREDIT_LIFE** | Covers debt on death/disability | Matches outstanding debt |
| **SHORT_TERM** | Vehicle, household insurance | Asset value |
| **DISABILITY** | Income protection | Monthly salary replacement |
| **HOSPITAL** | Hospital cash plan | Daily benefit amount |

### 1.2 Policy Statuses

```
┌──────────────────────────────────────────────────────────────────┐
│                    POLICY LIFECYCLE                               │
└──────────────────────────────────────────────────────────────────┘

  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
  │ PENDING │───▶│ ACTIVE  │───▶│ LAPSED  │───▶│CANCELLED│
  └─────────┘    └────┬────┘    └────┬────┘    └─────────┘
                      │              │
                      │   [Payment]  │
                      │◀─────────────┘
                      │
                      ▼
                 ┌─────────┐
                 │ CLAIMED │
                 └─────────┘
```

| Status | Description | Actions Available |
|--------|-------------|-------------------|
| **PENDING** | Application submitted, awaiting approval | Approve, Reject, Request Docs |
| **ACTIVE** | Policy is live and covered | File Claim, Cancel, View |
| **LAPSED** | Premiums not paid (grace period) | Reinstate, Cancel |
| **CANCELLED** | Policy terminated | Reactivate (if within rules) |
| **CLAIMED** | Successful claim processed | View History |

### 1.3 Policy Creation Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      NEW POLICY WORKFLOW                                 │
└─────────────────────────────────────────────────────────────────────────┘

Step 1: CLIENT SELECTION
┌────────────────────────────────────────┐
│  Search for existing client OR         │
│  Link from Cases app (clientId)        │
│  ────────────────────────────────      │
│  🔍 [Search: ID Number / Name     ]    │
│                                        │
│  Found: John Doe (ID: 8501015020089)   │
│  📁 Active Cases: 2                    │
│  🛡️ Existing Policies: 1               │
└────────────────────────────────────────┘
              │
              ▼
Step 2: POLICY DETAILS
┌────────────────────────────────────────┐
│  Policy Type:    [🔽 Funeral Cover   ] │
│  Provider:       [🔽 Old Mutual      ] │
│  Cover Amount:   [R 25,000           ] │
│  Premium:        [R 199              ] │
│  Frequency:      [🔽 Monthly         ] │
│  Start Date:     [📅 2024-02-06      ] │
│                                        │
│  □ Link to Case: [🔽 CASE-2024-0123 ] │
└────────────────────────────────────────┘
              │
              ▼
Step 3: ADD BENEFICIARIES
┌────────────────────────────────────────┐
│  Beneficiary 1:                        │
│  Name:           [Mary Doe           ] │
│  ID Number:      [8605120320085      ] │
│  Relationship:   [🔽 Spouse          ] │
│  Percentage:     [60%                ] │
│                                        │
│  Beneficiary 2:                        │
│  Name:           [James Doe          ] │
│  ID Number:      [1001015020083      ] │
│  Relationship:   [🔽 Child           ] │
│  Percentage:     [40%                ] │
│                                        │
│  Total: 100% ✓                         │
│  [+ Add Another Beneficiary]           │
└────────────────────────────────────────┘
              │
              ▼
Step 4: UPLOAD DOCUMENTS
┌────────────────────────────────────────┐
│  Required Documents:                   │
│  ☑️ Client ID Copy         [Uploaded]  │
│  ☑️ Proof of Address       [Uploaded]  │
│  ☑️ Bank Statement         [Uploaded]  │
│  ☐ Spouse ID Copy          [Upload  ]  │
│                                        │
│  [📤 Upload Document]                  │
└────────────────────────────────────────┘
              │
              ▼
Step 5: REVIEW & SUBMIT
┌────────────────────────────────────────┐
│  Policy Summary:                       │
│  ─────────────────────────────────     │
│  Client: John Doe                      │
│  Type: Funeral Cover                   │
│  Provider: Old Mutual                  │
│  Cover: R 25,000                       │
│  Premium: R 199/month                  │
│  Beneficiaries: 2                      │
│  Documents: 3/4 uploaded               │
│                                        │
│  [Cancel] [Save Draft] [✓ Submit]      │
└────────────────────────────────────────┘
```

### 1.4 Policy Detail View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ Policy #INS-2024-0234                                    [Edit] [Cancel] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STATUS: 🟢 ACTIVE                            Provider: Old Mutual          │
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ CLIENT INFORMATION              │  │ POLICY DETAILS                  │  │
│  │                                 │  │                                 │  │
│  │ Name: John Doe                  │  │ Type: Funeral Cover             │  │
│  │ ID: 8501015020089               │  │ Cover Amount: R 25,000          │  │
│  │ Phone: 083 123 4567             │  │ Premium: R 199/month            │  │
│  │ Email: john@email.com           │  │ Start Date: 01 Feb 2024         │  │
│  │                                 │  │ Next Premium: 01 Mar 2024       │  │
│  │ [View Client in Cases App →]   │  │ Months Active: 12               │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ BENEFICIARIES                                                        │   │
│  │                                                                      │   │
│  │  Name              │ Relationship │ ID Number     │ Percentage      │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  Mary Doe          │ Spouse       │ 8605120320085 │ 60%             │   │
│  │  James Doe         │ Child        │ 1001015020083 │ 40%             │   │
│  │                                                                      │   │
│  │  [+ Add Beneficiary] [Edit Beneficiaries]                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌────────────────────────────────┐  ┌─────────────────────────────────┐   │
│  │ PREMIUM HISTORY                │  │ QUICK ACTIONS                   │   │
│  │                                │  │                                 │   │
│  │ Mar 2024  R199  ✓ Paid         │  │ [📄 File a Claim]              │   │
│  │ Feb 2024  R199  ✓ Paid         │  │ [💳 Record Payment]            │   │
│  │ Jan 2024  R199  ✓ Paid         │  │ [📤 Upload Document]           │   │
│  │ Dec 2023  R199  ✓ Paid         │  │ [📞 Contact Client]            │   │
│  │                                │  │ [🔗 Link to Case]              │   │
│  │ [View All Payments]            │  │                                 │   │
│  └────────────────────────────────┘  └─────────────────────────────────┘   │
│                                                                              │
│  LINKED CASE: CASE-2024-0123 (Debt Review) [View Case →]                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 2. CLAIMS PROCESSING

### 2.1 Claim Types

| Claim Type | Trigger Event | Required Documents |
|------------|--------------|-------------------|
| **DEATH** | Policyholder passes away | Death Certificate, BI-1663, ID copies |
| **DISABILITY** | Permanent disability | Medical Report, Doctor's Letter, ID |
| **RETRENCHMENT** | Loss of employment | Retrenchment Letter, UIF docs, ID |
| **HOSPITAL** | Hospital admission | Hospital Invoice, Admission docs |
| **CRITICAL_ILLNESS** | Diagnosis of covered illness | Medical Report, Specialist Letter |

### 2.2 Claim Statuses & Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLAIMS WORKFLOW                                  │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐
│ SUBMITTED │───▶│ UNDER REVIEW │───▶│   APPROVED   │───▶│   PAID    │
└───────────┘    └──────┬───────┘    └──────────────┘    └───────────┘
                        │
                        │ [Missing docs / Invalid]
                        ▼
                 ┌──────────────┐
                 │ DOCS PENDING │──────┐
                 └──────────────┘      │
                        │              │
                        │ [Docs received]
                        └──────────────┘
                        
                        │ [Invalid claim]
                        ▼
                 ┌──────────────┐
                 │   REJECTED   │
                 └──────────────┘
```

### 2.3 Claim Submission Process

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      FILE A CLAIM                                        │
└─────────────────────────────────────────────────────────────────────────┘

Step 1: SELECT POLICY
┌─────────────────────────────────────────┐
│  Client: John Doe                       │
│                                         │
│  Active Policies:                       │
│  ○ INS-2024-0234 - Funeral (R25,000)   │
│  ● INS-2024-0189 - Life (R100,000)     │
│  ○ INS-2024-0102 - Credit Life         │
│                                         │
│  [Next →]                               │
└─────────────────────────────────────────┘
                │
                ▼
Step 2: CLAIM DETAILS
┌─────────────────────────────────────────┐
│  Claim Type:     [🔽 Death Claim      ] │
│  Incident Date:  [📅 2024-02-01       ] │
│                                         │
│  Description:                           │
│  ┌─────────────────────────────────┐   │
│  │ Policyholder passed away on     │   │
│  │ 1st February 2024 due to...     │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Claimant (if not policyholder):       │
│  Name:    [Mary Doe                   ] │
│  Phone:   [083 456 7890               ] │
│  Relationship: [🔽 Spouse             ] │
│                                         │
│  [← Back] [Next →]                      │
└─────────────────────────────────────────┘
                │
                ▼
Step 3: UPLOAD CLAIM DOCUMENTS
┌─────────────────────────────────────────┐
│  Required for Death Claim:              │
│                                         │
│  ☑️ Death Certificate (BI-1663)         │
│     └─ death_cert.pdf [✓ Uploaded]     │
│                                         │
│  ☑️ Certified ID Copy (Deceased)        │
│     └─ id_deceased.pdf [✓ Uploaded]    │
│                                         │
│  ☑️ Certified ID Copy (Claimant)        │
│     └─ id_claimant.pdf [✓ Uploaded]    │
│                                         │
│  ☐ Bank Statement (for payout)          │
│     └─ [📤 Upload]                      │
│                                         │
│  ☐ Marriage Certificate (if spouse)     │
│     └─ [📤 Upload]                      │
│                                         │
│  [← Back] [Submit Claim]                │
└─────────────────────────────────────────┘
                │
                ▼
Step 4: CONFIRMATION
┌─────────────────────────────────────────┐
│  ✅ Claim Submitted Successfully!        │
│                                         │
│  Claim Number: CLM-2024-0156            │
│  Policy: INS-2024-0189                  │
│  Type: Death Claim                      │
│  Cover Amount: R 100,000                │
│                                         │
│  Next Steps:                            │
│  1. Our team will review your claim     │
│  2. We may request additional docs      │
│  3. Expected processing: 5-10 days      │
│                                         │
│  [View Claim] [Back to Dashboard]       │
└─────────────────────────────────────────┘
```

### 2.4 Claims Review (Staff View)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📋 Claim #CLM-2024-0156                          [Approve] [Reject] [Pend] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STATUS: 🟡 UNDER REVIEW              Submitted: 02 Feb 2024               │
│  Days in Queue: 3                     Assigned To: Sarah (Claims Dept)      │
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ POLICY INFORMATION              │  │ CLAIM DETAILS                   │  │
│  │                                 │  │                                 │  │
│  │ Policy #: INS-2024-0189         │  │ Type: Death Claim               │  │
│  │ Client: John Doe                │  │ Incident Date: 01 Feb 2024      │  │
│  │ Type: Life Insurance            │  │ Claim Amount: R 100,000         │  │
│  │ Cover: R 100,000                │  │                                 │  │
│  │ Status: ACTIVE ✓                │  │ Claimant: Mary Doe (Spouse)     │  │
│  │ Premiums: Up to date ✓          │  │ Phone: 083 456 7890             │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DOCUMENT VERIFICATION                                                │   │
│  │                                                                      │   │
│  │  Document                │ Status    │ Verified By  │ Date          │   │
│  │  ───────────────────────────────────────────────────────────────    │   │
│  │  Death Certificate       │ ✓ Valid   │ Sarah M.     │ 03 Feb 2024   │   │
│  │  Deceased ID Copy        │ ✓ Valid   │ Sarah M.     │ 03 Feb 2024   │   │
│  │  Claimant ID Copy        │ ✓ Valid   │ Sarah M.     │ 03 Feb 2024   │   │
│  │  Bank Statement          │ ⏳ Pending │ -            │ -             │   │
│  │  Marriage Certificate    │ ⏳ Pending │ -            │ -             │   │
│  │                                                                      │   │
│  │  [View Documents] [Request More Documents]                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ BENEFICIARY PAYOUT SPLIT                                            │   │
│  │                                                                      │   │
│  │  Beneficiary        │ Percentage │ Payout Amount │ Bank Details    │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  Mary Doe (Spouse)  │ 60%        │ R 60,000      │ ✓ On file       │   │
│  │  James Doe (Child)  │ 40%        │ R 40,000      │ ⏳ Required      │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  NOTES:                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ [02 Feb] Claim received - Sarah                                      │   │
│  │ [03 Feb] Documents verified, waiting for bank statement - Sarah      │   │
│  │ [Add Note...]                                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  DECISION:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ○ Approve - All documents verified, proceed to payment             │   │
│  │  ○ Reject - Reason: [________________________]                      │   │
│  │  ● Request Documents - Bank statement for child beneficiary         │   │
│  │                                                                      │   │
│  │  [Submit Decision]                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 👨‍👩‍👧‍👦 3. BENEFICIARY MANAGEMENT

### 3.1 Beneficiary Types

| Relationship | Description | Typical Scenarios |
|--------------|-------------|-------------------|
| **SPOUSE** | Legal spouse | Primary beneficiary for life/funeral |
| **CHILD** | Biological/adopted child | Often split among multiple children |
| **PARENT** | Mother/Father | Common for single policyholders |
| **SIBLING** | Brother/Sister | Secondary beneficiaries |
| **EXTENDED_FAMILY** | Aunt, Uncle, Cousin | Funeral policies |
| **OTHER** | Non-family member | Business partners, etc. |

### 3.2 Beneficiary Rules

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      BENEFICIARY VALIDATION RULES                        │
└─────────────────────────────────────────────────────────────────────────┘

✓ Percentages must total exactly 100%
✓ Each beneficiary must have a valid SA ID number
✓ Minor beneficiaries (under 18) require a guardian
✓ At least one beneficiary required for all policies
✓ Maximum 10 beneficiaries per policy
✓ Changes require client signature/confirmation
```

### 3.3 Beneficiary Update Flow

```
Current Beneficiaries:
┌────────────────────────────────────────────────────────────────┐
│  Mary Doe         │ Spouse  │ 60% │ [Edit] [Remove]           │
│  James Doe        │ Child   │ 40% │ [Edit] [Remove]           │
├────────────────────────────────────────────────────────────────┤
│  [+ Add Beneficiary]                                           │
└────────────────────────────────────────────────────────────────┘

                    │ Click "Edit" on Mary
                    ▼

Edit Beneficiary:
┌────────────────────────────────────────────────────────────────┐
│  Name:          [Mary Doe                              ]       │
│  ID Number:     [8605120320085                         ]       │
│  Relationship:  [🔽 Spouse                             ]       │
│  Percentage:    [50%                                   ]       │
│  Phone:         [083 456 7890                          ]       │
│  Email:         [mary@email.com                        ]       │
│                                                                │
│  ⚠️ Warning: Total will be 90%. Adjust other beneficiaries.   │
│                                                                │
│  [Cancel] [Save Changes]                                       │
└────────────────────────────────────────────────────────────────┘
```

---

## 💳 4. PREMIUM TRACKING

### 4.1 Premium Payment Statuses

| Status | Description | System Action |
|--------|-------------|--------------|
| **PENDING** | Payment due but not yet | Send reminder 3 days before |
| **PAID** | Payment received | Update policy status |
| **OVERDUE** | Payment past due date | Send urgent reminder |
| **WAIVED** | Premium waived (e.g., claim in progress) | No action required |
| **REFUNDED** | Premium returned to client | Record refund transaction |

### 4.2 Premium Calendar View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PREMIUM CALENDAR - February 2024                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    Mon     Tue     Wed     Thu     Fri     Sat     Sun                      │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐                                │
│  │     │     │     │  1  │  2  │  3  │  4  │                                │
│  │     │     │     │ 🔴15│     │     │     │                                │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                                │
│  │  5  │  6  │  7  │  8  │  9  │ 10  │ 11  │                                │
│  │     │     │     │     │     │     │     │                                │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                                │
│  │ 12  │ 13  │ 14  │ 15  │ 16  │ 17  │ 18  │                                │
│  │     │     │     │ 🟡23│     │     │     │                                │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                                │
│  │ 19  │ 20  │ 21  │ 22  │ 23  │ 24  │ 25  │                                │
│  │     │     │     │     │     │     │ 🟢45│                                │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                                │
│  │ 26  │ 27  │ 28  │ 29  │     │     │     │                                │
│  │ 🟢38│     │ 🔴8 │     │     │     │     │                                │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┘                                │
│                                                                              │
│     🟢 Paid (XX policies)   🟡 Pending   🔴 Overdue                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Premium Payment Recording

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RECORD PREMIUM PAYMENT                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Single Payment:
┌────────────────────────────────────────────────────────────────┐
│  Policy:        INS-2024-0234 (John Doe - Funeral)             │
│  Amount Due:    R 199.00                                       │
│  Due Date:      01 March 2024                                  │
│                                                                │
│  Payment Details:                                              │
│  Amount Paid:   [R 199.00                        ]             │
│  Payment Date:  [📅 28 Feb 2024                  ]             │
│  Method:        [🔽 Bank Transfer                ]             │
│  Reference:     [REF123456789                    ]             │
│                                                                │
│  [Cancel] [Record Payment]                                     │
└────────────────────────────────────────────────────────────────┘

Bulk Import (from Excel):
┌────────────────────────────────────────────────────────────────┐
│  📤 Upload Premium Payment File                                │
│                                                                │
│  [Choose File] premiums_feb_2024.xlsx                          │
│                                                                │
│  Preview:                                                      │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ ID Number      │ Amount  │ Date       │ Reference       │  │
│  │ 8501015020089  │ R199    │ 2024-02-28 │ PMT001         │  │
│  │ 7201015020083  │ R350    │ 2024-02-28 │ PMT002         │  │
│  │ 9001015020086  │ R199    │ 2024-02-28 │ PMT003         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  Matched: 145   Unmatched: 3   Total: R 32,450                │
│                                                                │
│  [Cancel] [Import Payments]                                    │
└────────────────────────────────────────────────────────────────┘
```

### 4.4 Arrears Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PREMIUM ARREARS REPORT                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Filter: [All Types ▼] [Overdue > 30 days ▼] [Search...]                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Policy         │ Client       │ Amount │ Days  │ Status    │ Action │   │
│  │                │              │  Due   │ Overdue│          │        │   │
│  │ ──────────────────────────────────────────────────────────────────  │   │
│  │ INS-2024-0156  │ Peter Jones  │ R 398  │ 45    │ 🔴 LAPSED │ [📞]   │   │
│  │ INS-2024-0178  │ Mary Smith   │ R 199  │ 32    │ 🔴 LAPSED │ [📞]   │   │
│  │ INS-2024-0201  │ Thabo M.     │ R 550  │ 15    │ 🟡 OVERDUE│ [📞]   │   │
│  │ INS-2024-0189  │ Sarah N.     │ R 199  │ 8     │ 🟡 OVERDUE│ [📞]   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Total Arrears: R 12,450 across 15 policies                                 │
│                                                                              │
│  Actions: [Send Bulk Reminder SMS] [Export to Excel] [Generate Report]      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔗 5. INTEGRATION WITH CASES APP

### 5.1 Data Sharing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SHARED DATA BETWEEN APPS                              │
└─────────────────────────────────────────────────────────────────────────┘

FROM CASES APP (Read):                FROM INSURANCE APP (Write):
├── Clients                           ├── InsurancePolicy
│   ├── Personal details              │   ├── Policy details
│   ├── Contact info                  │   ├── Coverage info
│   └── Employment info               │   └── Premium schedule
│                                     │
├── Cases                             ├── InsuranceClaim
│   ├── Case status                   │   ├── Claim details
│   ├── Debt amounts                  │   └── Claim status
│   └── Service history               │
│                                     ├── PolicyBeneficiary
├── Users                             │   └── Beneficiary details
│   ├── Authentication                │
│   ├── Roles & Permissions           └── PremiumPayment
│   └── Team assignments                  └── Payment records
```

### 5.2 Cross-App Links

```
In Cases App:
┌────────────────────────────────────────────────────────────────┐
│  CASE #2024-0123 - John Doe                                    │
│                                                                │
│  LINKED INSURANCE:                                             │
│  🛡️ Policy INS-2024-0234 (Funeral - Active)                   │
│  🛡️ Policy INS-2024-0189 (Life - Active)                      │
│                                                                │
│  [View in Insurance App →]                                     │
└────────────────────────────────────────────────────────────────┘

In Insurance App:
┌────────────────────────────────────────────────────────────────┐
│  POLICY #INS-2024-0234 - John Doe                              │
│                                                                │
│  LINKED CASE:                                                  │
│  📁 Case CASE-2024-0123 (Debt Review - In Progress)           │
│                                                                │
│  [View in Cases App →]                                         │
└────────────────────────────────────────────────────────────────┘
```

---

## 📊 6. REPORTS & ANALYTICS

### 6.1 Available Reports

| Report | Description | Frequency |
|--------|-------------|-----------|
| **Policy Summary** | Active policies by type, provider | Daily |
| **Premium Collection** | Collected vs expected premiums | Monthly |
| **Claims Report** | Claims by status, type, processing time | Weekly |
| **Arrears Report** | Overdue premiums, lapse risk | Daily |
| **Provider Report** | Policies per insurance provider | Monthly |
| **Commission Report** | Commission earned per policy | Monthly |

### 6.2 Dashboard Metrics

```
Key Performance Indicators (KPIs):
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  📈 POLICIES                 📊 CLAIMS                        │
│  ──────────────────────     ──────────────────────            │
│  Total Active: 247          Submitted: 156                    │
│  New This Month: 23         Approved: 89 (57%)                │
│  Lapsed: 15                 Rejected: 12 (8%)                 │
│  Retention Rate: 94%        Processing: 12                    │
│                             Avg Processing: 7 days            │
│                                                                │
│  💰 PREMIUMS                 📋 CLAIMS VALUE                  │
│  ──────────────────────     ──────────────────────            │
│  Expected: R 48,500         Total Claimed: R 2.4M             │
│  Collected: R 45,230        Total Paid: R 1.8M                │
│  Collection Rate: 93%       Pending: R 450K                   │
│  Arrears: R 12,450          Rejection Saved: R 150K           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔔 7. NOTIFICATIONS

### 7.1 Automated Notifications

| Event | Channel | Timing |
|-------|---------|--------|
| Premium due reminder | SMS, Email | 3 days before |
| Premium overdue | SMS, Email | 1, 7, 14 days after |
| Policy lapse warning | SMS, Email, Call | 21 days overdue |
| Claim submitted | Email | Immediate |
| Claim status update | SMS, Email | On status change |
| Claim approved | SMS, Email | Immediate |
| Policy activated | SMS, Email | Immediate |

### 7.2 Notification Templates

```
Premium Reminder:
"Hi {firstName}, your {policyType} premium of R{amount} is due on {dueDate}. 
Ref: {policyNumber}. Pay to avoid policy lapse."

Claim Update:
"Hi {firstName}, your claim #{claimNumber} has been {status}. 
{additionalInfo} Contact us for details."
```

---

## 👥 8. USER ROLES & PERMISSIONS

| Role | Permissions |
|------|-------------|
| **ADMIN** | Full access to all features |
| **INSURANCE_MANAGER** | Manage policies, approve claims, view reports |
| **CLAIMS_OFFICER** | Process claims, request documents |
| **SALES_AGENT** | Create policies, view own clients |
| **FINANCE** | View/record payments, financial reports |
| **VIEWER** | Read-only access to dashboards |

---

## ✅ SUMMARY

The Insurance App will be a **complete insurance management solution** that:

1. **Manages Policies** - Full lifecycle from application to claim
2. **Processes Claims** - Structured workflow with document verification
3. **Tracks Beneficiaries** - Flexible beneficiary management with validation
4. **Monitors Premiums** - Payment tracking with arrears management
5. **Integrates Seamlessly** - Links to Cases app for unified client view
6. **Provides Insights** - Comprehensive reporting and analytics

---

## 🚀 READY TO BUILD?

Let me know when you want to:
1. Start building the Insurance app
2. Discuss the Legal app in similar detail
3. Begin with the shared infrastructure
