# Credit Life Premium Extraction System
## Statement Upload + Estimation Fallback

---

## 🎯 Objective

Extract the **credit life insurance premium** amount from each of the consumer's credit accounts using:
1. **Primary Method:** Document upload (statements/contracts) + extraction
2. **Fallback Method:** Estimation based on lender rate tables

---

## 📊 System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CREDIT LIFE PREMIUM EXTRACTION WORKFLOW                   │
└─────────────────────────────────────────────────────────────────────────────┘

                           ┌─────────────────────┐
                           │  1. INPUT: CREDIT   │
                           │     REPORT (DHS)    │
                           └──────────┬──────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │  2. EXTRACT CREDIT ACCOUNTS     │
                    │     - Creditor Name             │
                    │     - Account Type              │
                    │     - Outstanding Balance       │
                    │     - Monthly Instalment        │
                    └──────────────────┬──────────────┘
                                       │
                    ┌──────────────────┴──────────────┐
                    │  FOR EACH ACCOUNT:              │
                    └──────────────────┬──────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────┐
                    │  3. REQUEST DOCUMENT UPLOAD     │
                    │     "Please upload statement    │
                    │      or contract for [Account]" │
                    └──────────────────┬──────────────┘
                                       │
                          ┌────────────┴────────────┐
                          │                         │
                    ┌─────▼─────┐            ┌──────▼──────┐
                    │ DOCUMENT  │            │ NO DOCUMENT │
                    │ UPLOADED  │            │ AVAILABLE   │
                    └─────┬─────┘            └──────┬──────┘
                          │                         │
                          ▼                         ▼
              ┌───────────────────┐    ┌────────────────────────┐
              │ 4A. EXTRACT DATA  │    │ 4B. ESTIMATE PREMIUM   │
              │     FROM DOCUMENT │    │     FROM RATE TABLE    │
              │                   │    │                        │
              │ - OCR/AI Extract  │    │ - Look up creditor     │
              │ - Find premium    │    │ - Apply typical rate   │
              │ - Validate data   │    │ - Calculate estimate   │
              │                   │    │ - Flag as "ESTIMATED"  │
              └─────────┬─────────┘    └───────────┬────────────┘
                        │                          │
                        │   CONFIDENCE: HIGH       │   CONFIDENCE: LOW
                        │                          │
                        └────────────┬─────────────┘
                                     │
                                     ▼
                      ┌──────────────────────────┐
                      │  5. STORE PREMIUM DATA   │
                      │     - Amount             │
                      │     - Source             │
                      │     - Confidence         │
                      └──────────────┬───────────┘
                                     │
                                     ▼
                      ┌──────────────────────────┐
                      │  6. CALCULATE TOTALS &   │
                      │     SAVINGS POTENTIAL    │
                      └──────────────────────────┘
```

---

## 📄 Document Types Accepted

### **Statement of Account (Preferred)**
Shows the latest premium being charged.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ABSA HOME LOAN STATEMENT - February 2024                                   │
│  Account: 9012345678                                                        │
│  ───────────────────────────────────────────────────────────────────────    │
│                                                                             │
│  Account Summary:                                                           │
│  Outstanding Balance:          R 892,450.23                                 │
│  Interest Rate:                11.25% p.a.                                  │
│                                                                             │
│  Monthly Instalment Details:                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Principal:                                R 4,230.00               │   │
│  │  Interest:                                 R 8,356.12               │   │
│  │  Credit Life Insurance:                    R 892.45   ◀── EXTRACT  │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  Total Monthly Instalment:                 R 13,478.57              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Insurance Details:                                                         │
│  Provider: ABSA Life                                                        │
│  Cover: Death, Disability, Retrenchment                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### **Credit Agreement/Contract**
Shows the agreed rate at origination.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CREDIT AGREEMENT                                                           │
│  ───────────────────────────────────────────────────────────────────────    │
│                                                                             │
│  14. CREDIT LIFE INSURANCE                                                  │
│                                                                             │
│  14.1 The Consumer has elected to take credit life insurance as follows:   │
│                                                                             │
│       Insurer:                 Old Mutual Credit Life                       │
│       Coverage:                Death, Permanent Disability, Retrenchment    │
│       Premium Basis:           Reducing Balance                             │
│       Premium Rate:            0.42% per month  ◀── EXTRACT RATE           │
│       Initial Premium:         R 2,100.00 (based on R 500,000 loan)        │
│                                                                             │
│  14.2 The premium will be collected monthly as part of your instalment.    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Data Extraction - What to Look For

### **Key Terms to Search (OCR/Pattern Matching)**

```javascript
const PREMIUM_KEYWORDS = [
  // English terms
  "credit life insurance",
  "credit life premium",
  "life insurance",
  "insurance premium",
  "credit life",
  "CLI premium",
  "cover premium",
  "credit protection",
  "loan protection",
  "payment protection",
  "death cover",
  "death and disability",
  "retrenchment cover",
  
  // Abbreviations
  "CLI",
  "CL Insurance",
  "Credit Life Ins",
  
  // Context clues
  "insurance:",
  "life cover:",
  "premium:",
  "protection:",
];

const AMOUNT_PATTERNS = [
  /R\s*[\d,]+\.?\d*/gi,           // R 892.45, R 1,234.56
  /ZAR\s*[\d,]+\.?\d*/gi,         // ZAR 892.45
  /[\d,]+\.?\d*\s*(?:pm|per month)/gi,  // 892.45 pm
];

const RATE_PATTERNS = [
  /(\d+\.?\d*)\s*%\s*(?:per month|p\.m\.|pm|monthly)/gi,  // 0.42% per month
  /(\d+\.?\d*)\s*%\s*(?:per annum|p\.a\.|annual)/gi,      // 5.04% per annum
];
```

### **Extraction Logic**

```javascript
async function extractPremiumFromDocument(documentText, accountBalance) {
  const result = {
    premiumAmount: null,
    premiumRate: null,
    insurer: null,
    coverageTypes: [],
    confidence: 'LOW',
    extractionMethod: null,
  };

  // Method 1: Find explicit premium amount
  const premiumMatch = findAmountNearKeyword(documentText, PREMIUM_KEYWORDS);
  if (premiumMatch) {
    result.premiumAmount = premiumMatch.amount;
    result.confidence = 'HIGH';
    result.extractionMethod = 'EXPLICIT_AMOUNT';
    return result;
  }

  // Method 2: Find rate and calculate
  const rateMatch = findRateInText(documentText);
  if (rateMatch && accountBalance) {
    result.premiumRate = rateMatch.rate;
    result.premiumAmount = calculatePremiumFromRate(accountBalance, rateMatch.rate, rateMatch.period);
    result.confidence = 'MEDIUM';
    result.extractionMethod = 'CALCULATED_FROM_RATE';
    return result;
  }

  // Method 3: Parse instalment breakdown table
  const tableData = parseInstalmentBreakdown(documentText);
  if (tableData && tableData.insuranceLine) {
    result.premiumAmount = tableData.insuranceLine;
    result.confidence = 'HIGH';
    result.extractionMethod = 'TABLE_EXTRACTION';
    return result;
  }

  return result; // Return with LOW confidence if nothing found
}
```

---

## 📊 Estimation Rate Table (Fallback)

When no document is available, estimate using typical South African lender rates:

### **Home Loans**

| Creditor | Typical Rate (Monthly) | Rate Range | Basis |
|----------|----------------------|------------|-------|
| ABSA | 0.10% | 0.08% - 0.12% | Reducing Balance |
| Standard Bank | 0.095% | 0.08% - 0.11% | Reducing Balance |
| FNB | 0.10% | 0.09% - 0.12% | Reducing Balance |
| Nedbank | 0.10% | 0.08% - 0.12% | Reducing Balance |
| Capitec | 0.11% | 0.09% - 0.13% | Reducing Balance |
| SA Home Loans | 0.09% | 0.08% - 0.11% | Reducing Balance |
| Other/Unknown | 0.10% | 0.08% - 0.15% | Reducing Balance |

### **Vehicle Finance**

| Creditor | Typical Rate (Monthly) | Rate Range | Basis |
|----------|----------------------|------------|-------|
| WesBank | 0.35% | 0.30% - 0.45% | Original Amount |
| MFC | 0.38% | 0.32% - 0.48% | Original Amount |
| ABSA Vehicle | 0.35% | 0.30% - 0.42% | Reducing Balance |
| Standard Bank Vehicle | 0.33% | 0.28% - 0.40% | Reducing Balance |
| Nedbank Vehicle | 0.35% | 0.30% - 0.42% | Reducing Balance |
| BMW Financial | 0.30% | 0.25% - 0.38% | Reducing Balance |
| Toyota Financial | 0.32% | 0.28% - 0.40% | Reducing Balance |
| Other/Unknown | 0.35% | 0.25% - 0.50% | Reducing Balance |

### **Personal Loans**

| Creditor | Typical Rate (Monthly) | Rate Range | Basis |
|----------|----------------------|------------|-------|
| ABSA | 0.40% | 0.35% - 0.50% | Reducing Balance |
| Standard Bank | 0.42% | 0.35% - 0.52% | Reducing Balance |
| FNB | 0.40% | 0.35% - 0.50% | Reducing Balance |
| Nedbank | 0.42% | 0.38% - 0.55% | Reducing Balance |
| Capitec | 0.45% | 0.40% - 0.55% | Reducing Balance |
| African Bank | 0.55% | 0.45% - 0.70% | Original Amount |
| Bayport | 0.50% | 0.42% - 0.65% | Original Amount |
| DirectAxis | 0.48% | 0.40% - 0.60% | Reducing Balance |
| Other/Unknown | 0.45% | 0.35% - 0.70% | Reducing Balance |

### **Store/Retail Credit**

| Creditor | Typical Rate (Monthly) | Rate Range | Basis |
|----------|----------------------|------------|-------|
| Edgars/Jet | 0.60% | 0.50% - 0.75% | Reducing Balance |
| Woolworths | 0.55% | 0.45% - 0.65% | Reducing Balance |
| Mr Price | 0.58% | 0.48% - 0.70% | Reducing Balance |
| Truworths | 0.55% | 0.45% - 0.68% | Reducing Balance |
| Foschini Group | 0.55% | 0.45% - 0.65% | Reducing Balance |
| Lewis | 0.65% | 0.55% - 0.80% | Original Amount |
| JD Group | 0.60% | 0.50% - 0.75% | Original Amount |
| Other Retail | 0.60% | 0.45% - 0.85% | Reducing Balance |

### **Micro Lenders**

| Creditor | Typical Rate (Monthly) | Rate Range | Basis |
|----------|----------------------|------------|-------|
| Wonga | 0.70% | 0.60% - 0.90% | Original Amount |
| Boodle | 0.65% | 0.55% - 0.80% | Original Amount |
| Lime24 | 0.68% | 0.58% - 0.85% | Original Amount |
| Finbond | 0.55% | 0.45% - 0.70% | Original Amount |
| Other Micro | 0.65% | 0.50% - 1.00% | Original Amount |

---

## 🧮 Estimation Calculation Logic

```javascript
function estimatePremium(creditorName, accountType, outstandingBalance, originalAmount) {
  // 1. Look up rate from table
  const rateInfo = lookupRate(creditorName, accountType);
  
  // 2. Determine which balance to use
  let balanceForCalc;
  if (rateInfo.basis === 'ORIGINAL_AMOUNT') {
    balanceForCalc = originalAmount || outstandingBalance * 1.3; // Estimate original if unknown
  } else {
    balanceForCalc = outstandingBalance;
  }
  
  // 3. Calculate estimate with range
  const estimate = {
    low: balanceForCalc * (rateInfo.minRate / 100),
    typical: balanceForCalc * (rateInfo.typicalRate / 100),
    high: balanceForCalc * (rateInfo.maxRate / 100),
    confidence: 'LOW',
    method: 'ESTIMATED',
    disclaimer: 'This is an estimate. Actual premium may differ. Upload statement for accuracy.',
  };
  
  return estimate;
}

// Example:
// estimatePremium('ABSA', 'HOME_LOAN', 800000, 1000000)
// Returns:
// {
//   low: R 640 (0.08%)
//   typical: R 800 (0.10%)
//   high: R 960 (0.12%)
//   confidence: 'LOW',
//   method: 'ESTIMATED'
// }
```

---

## 🗄️ Database Schema

```prisma
// Rate table for estimation
model CreditLifeRateTable {
  id              String    @id @default(cuid())
  creditorName    String    // "ABSA", "Standard Bank", etc.
  creditorAlias   String?   // Alternative names "ABSA Bank", "ABSA Group"
  accountType     String    // "HOME_LOAN", "VEHICLE", "PERSONAL_LOAN", "RETAIL", "MICRO"
  
  // Rates (as decimal, e.g., 0.10 for 0.10%)
  minRate         Decimal   
  typicalRate     Decimal   
  maxRate         Decimal   
  
  // Calculation basis
  rateType        String    // "REDUCING_BALANCE", "ORIGINAL_AMOUNT"
  
  // Metadata
  source          String?   // "Industry Research", "Consumer Data", etc.
  effectiveDate   DateTime  @default(now())
  isActive        Boolean   @default(true)
  
  @@unique([creditorName, accountType])
  @@index([creditorName])
  @@index([accountType])
}

// Consumer's credit accounts
model CreditAccount {
  id                    String    @id @default(cuid())
  clientId              String
  caseId                String?
  
  // From Credit Report
  creditorName          String
  accountType           String    // HOME_LOAN, VEHICLE, PERSONAL_LOAN, RETAIL, MICRO
  accountNumber         String?
  originalAmount        Decimal?
  outstandingBalance    Decimal
  monthlyInstalment     Decimal?
  openDate              DateTime?
  
  // Insurance Status
  hasInsurance          String    @default("ASSUMED_YES") // "YES", "NO", "ASSUMED_YES", "UNKNOWN"
  
  // Premium Data
  premiumAmount         Decimal?  // Monthly premium
  premiumRate           Decimal?  // Rate if known
  premiumBasis          String?   // "REDUCING_BALANCE", "ORIGINAL_AMOUNT"
  insurer               String?   // Insurance company name
  coverageTypes         String?   // JSON: ["DEATH", "DISABILITY", "RETRENCHMENT"]
  
  // Data Quality
  dataSource            String    @default("PENDING") 
                                  // "DOCUMENT_EXTRACTED" - from uploaded doc
                                  // "ESTIMATED" - from rate table
                                  // "CLIENT_DECLARED" - client told us
                                  // "PENDING" - awaiting document
  
  confidenceLevel       String    @default("PENDING")
                                  // "HIGH" - verified from document
                                  // "MEDIUM" - calculated from rate in doc
                                  // "LOW" - estimated
                                  // "PENDING" - not yet determined
  
  extractionNotes       String?   // Any notes from extraction process
  
  // Document linkage
  statementDocumentId   String?
  contractDocumentId    String?
  
  // Timestamps
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  premiumVerifiedAt     DateTime? // When premium was confirmed
  
  // Relations
  client                Client    @relation(fields: [clientId], references: [id])
  case                  Case?     @relation(fields: [caseId], references: [id])
  statementDocument     CreditAccountDocument? @relation("Statement", fields: [statementDocumentId], references: [id])
  contractDocument      CreditAccountDocument? @relation("Contract", fields: [contractDocumentId], references: [id])
  
  @@index([clientId])
  @@index([caseId])
  @@index([dataSource])
}

// Uploaded documents for credit accounts
model CreditAccountDocument {
  id                String    @id @default(cuid())
  clientId          String
  
  // Document details
  type              String    // "STATEMENT", "CONTRACT", "POLICY_SCHEDULE"
  creditorName      String?   // Which creditor this doc is for
  fileName          String
  fileUrl           String
  fileSize          Int
  mimeType          String
  
  // Extraction status
  extractionStatus  String    @default("PENDING")
                              // "PENDING" - not yet processed
                              // "PROCESSING" - OCR/AI running
                              // "COMPLETED" - extraction done
                              // "FAILED" - extraction failed
                              // "MANUAL_REVIEW" - needs human review
  
  extractedText     String?   // OCR output
  extractedData     String?   // JSON of structured extracted data
  extractionError   String?   // Error message if failed
  
  // Timestamps
  uploadedAt        DateTime  @default(now())
  processedAt       DateTime?
  
  // Relations
  client            Client    @relation(fields: [clientId], references: [id])
  statementAccounts CreditAccount[] @relation("Statement")
  contractAccounts  CreditAccount[] @relation("Contract")
  
  @@index([clientId])
  @@index([extractionStatus])
}
```

---

## 🖥️ User Interface Flow

### **Step 1: Import Credit Accounts from Report**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📊 Credit Accounts Imported from Credit Report                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  We found 4 credit accounts. Upload documents to determine insurance costs. │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Account          │ Balance    │ Premium  │ Status       │ Action   │   │
│  │ ────────────────────────────────────────────────────────────────── │   │
│  │ 🏠 ABSA Home Loan │ R 892,450 │ ⏳ Pending│ Need Document│ [Upload] │   │
│  │ 🚗 WesBank Vehicle│ R 185,230 │ ⏳ Pending│ Need Document│ [Upload] │   │
│  │ 💳 Capitec Personal│ R 45,000 │ ⏳ Pending│ Need Document│ [Upload] │   │
│  │ 🛍️ Edgars         │ R 8,500  │ ⏳ Pending│ Need Document│ [Upload] │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  💡 Tip: Upload your latest bank statement or loan contract for each        │
│     account to get the exact insurance premium.                             │
│                                                                              │
│  [Skip & Use Estimates Instead]                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### **Step 2: Document Upload**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📤 Upload Document for ABSA Home Loan                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Please upload ONE of the following:                                         │
│                                                                              │
│  ○ Recent Loan Statement (last 3 months) - PREFERRED                        │
│  ○ Original Credit Agreement/Contract                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │     📄 Drag & drop your document here                               │   │
│  │        or                                                            │   │
│  │     [Browse Files]                                                   │   │
│  │                                                                      │   │
│  │     Accepted: PDF, JPG, PNG (max 10MB)                              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ℹ️ Don't have the document?                                                │
│                                                                              │
│  [I'll enter the premium manually]  [Skip & Estimate This Account]         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### **Step 3: Extraction Result**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ✅ Document Processed - ABSA Home Loan                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  We extracted the following information:                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Credit Life Insurance Premium:     R 892.45 per month              │   │
│  │                                      ───────────────────             │   │
│  │  Insurer:                           ABSA Life                       │   │
│  │  Coverage:                          Death, Disability, Retrenchment │   │
│  │                                                                      │   │
│  │  Confidence: ████████░░ HIGH                                        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Is this correct?                                                           │
│                                                                              │
│  [✓ Yes, Confirm]  [✏️ Edit Amount]                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### **Step 4: Estimation (When No Document)**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📊 Estimated Premium - ABSA Home Loan                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Based on typical ABSA Home Loan rates:                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Outstanding Balance:               R 892,450                       │   │
│  │  Typical Premium Rate:              0.10% per month                 │   │
│  │                                                                      │   │
│  │  ─────────────────────────────────────────────────────              │   │
│  │                                                                      │   │
│  │  ESTIMATED Premium:                                                 │   │
│  │                                                                      │   │
│  │     Low:      R 714    (0.08%)                                     │   │
│  │     Typical:  R 892    (0.10%)  ◀── Used for calculations          │   │
│  │     High:     R 1,071  (0.12%)                                     │   │
│  │                                                                      │   │
│  │  Confidence: ███░░░░░░░ LOW                                         │   │
│  │                                                                      │   │
│  │  ⚠️ This is an estimate. Upload your statement for accurate amount. │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  [Use This Estimate]  [Upload Document Instead]  [Enter Amount Manually]   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### **Step 5: Summary & Total**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  💰 Credit Life Insurance Summary                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Account           │ Balance    │ Premium   │ Source      │ Conf.   │   │
│  │ ─────────────────────────────────────────────────────────────────── │   │
│  │ 🏠 ABSA Home Loan  │ R 892,450 │ R 892.45  │ ✅ Document  │ HIGH   │   │
│  │ 🚗 WesBank Vehicle │ R 185,230 │ R 648.31  │ ✅ Document  │ HIGH   │   │
│  │ 💳 Capitec Personal│ R 45,000  │ R 202.50  │ 📊 Estimated │ LOW    │   │
│  │ 🛍️ Edgars          │ R 8,500   │ R 51.00   │ 📊 Estimated │ LOW    │   │
│  │ ─────────────────────────────────────────────────────────────────── │   │
│  │ TOTAL             │R 1,131,180│ R 1,794.26│              │        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  📋 Summary:                                                                 │
│  • 2 accounts with verified premiums (from documents)                       │
│  • 2 accounts with estimated premiums (no documents uploaded)               │
│                                                                              │
│  Total Monthly Credit Life Premiums: R 1,794.26                             │
│  Total Annual Cost: R 21,531.12                                             │
│                                                                              │
│  [Continue to Replacement Quote →]                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✅ Summary - What You Need

### **To Build This System:**

| Component | Purpose | Priority |
|-----------|---------|----------|
| **Credit Account Model** | Store accounts from credit report | 🔴 Must Have |
| **Document Upload** | Accept statements/contracts | 🔴 Must Have |
| **Rate Table** | Store typical lender rates | 🔴 Must Have |
| **Estimation Logic** | Calculate when no doc | 🔴 Must Have |
| **OCR/AI Extraction** | Extract premium from docs | 🟡 High Value |
| **UI Forms** | Upload & review interface | 🔴 Must Have |

### **Data Flow:**
```
Credit Report → Account List → For Each:
  ├─ Document Uploaded? → Extract Premium (HIGH confidence)
  └─ No Document? → Estimate from Rate Table (LOW confidence)
```

---

## 🚀 Ready to Build?

Would you like me to:
1. **Create the database schema** in your Prisma file?
2. **Build the Rate Table** with the SA lender rates?
3. **Create the document upload API**?
4. **Build the estimation calculator**?

Let me know which part to start with!
