export const PROMPTS = {
    ID: `You are analyzing a South African ID document. It may be a GREEN ID BOOK or a SMART CARD ID.

⚠️ ORIENTATION WARNING: The document image may be rotated (upside-down, sideways left, sideways right, or any angle).
ALWAYS mentally rotate the image to read text correctly before extracting. A rotated card is still valid — read all text regardless of orientation.

SMART CARD IDENTITY CLUES (credit-card sized, plastic):
- Front side has: a small photo, "REPUBLIC OF SOUTH AFRICA" or "REPUBLIEK VAN SUID-AFRIKA", coat of arms (three animals)
- Back side has: a barcode/QR code, SURNAME, NAMES, ID NUMBER printed as text, a green stripe
- Fields may appear in Afrikaans: VAN = SURNAME, VOORNAME = NAMES

GREEN ID BOOK IDENTITY CLUES (booklet/passport style):
- Says "IDENTITY DOCUMENT" or "IDENTITEITSDOKUMENT"
- Has a green cover with the SA coat of arms
- SURNAME and NAMES are on separate labeled lines

FIELD EXTRACTION RULES:
- SURNAME = the family/last name labeled "SURNAME", "VAN", or "Last Name"
- NAMES = first and middle names labeled "NAMES", "VOORNAME", or "First Name(s)" — NEVER include the surname here
- ID NUMBER = 13 consecutive digits. The first 6 digits are the birth date (YYMMDD). Look for it on BOTH sides of the card and in barcodes/QR code text.
- DATE OF BIRTH = derived from the first 6 digits of the ID number (YYMMDD → YYYY-MM-DD), OR read from an explicit "Date of Birth" field.

CRITICAL: The 13-digit ID number may appear:
- Printed as text on the front or back
- As a barcode or QR code (read the decoded number if visible)
- In multiple locations — use the one that appears most times

Extract the following information in JSON format:
{
  "surname": "string (the family name/last name ONLY)",
  "names": "string (first and middle names ONLY, NOT the surname)",
  "idNumber": "string (13 digits)",
  "dateOfBirth": "string (YYYY-MM-DD)",
  "documentType": "string (SMART_CARD or GREEN_ID_BOOK)",
  "_occurrences": {
    "surname": [{"value": "THWALA", "count": 2}, {"value": "TWALA", "count": 1}],
    "names": [{"value": "SIMON KHETHUKUTHULA", "count": 2}],
    "idNumber": [{"value": "9001015800085", "count": 3}]
  }
}

Be very careful to distinguish between surname and names — they are SEPARATE labeled fields.
IMPORTANT: If any field is not found or not clearly visible, use the string "NA" (not null, not empty string).
ADDITIONALLY: For each field in _occurrences, list ALL values found across the ENTIRE document and how many times each appeared. If all occurrences are the same value, just list that one.`,

    PAYSLIP: `You are analyzing a South African Payslip, Salary Advice, or Salary Slip document.

⚠️ This document may be called: "Payslip", "Salary Advice", "Salary Slip", "Pay Advice", "Remuneration Statement", "Earnings Statement", or similar.
Common South African employers: government departments (DPSA, DOH, SAPS, SANDF), municipalities, mines (Anglo, Impala, Sibanye), retailers, banks.

FIELD MAPPING — look for these ALTERNATIVE LABELS for each field:

EMPLOYER NAME (company that pays the employee):
- "Employer", "Company", "Organisation", "Department", "Establishment", "Institution"
- For government: department name like "Department of Health", "South African Police Service"

GROSS SALARY (total earnings BEFORE deductions — the LARGEST total figure):
- "Total Earnings", "Gross Salary", "Gross Pay", "Total Gross", "Gross Income", "CTC", "Cost to Company"
- "Total Remuneration", "Gross Remuneration", "Earnings Total"
- This is the SUM of all earnings BEFORE any deductions are subtracted

NET SALARY (final take-home AFTER ALL deductions — usually the SMALLEST total figure):
- "Net Pay", "Net Salary", "Take Home Pay", "Net Income", "Amount Payable", "Nett Pay"
- "Net Remuneration", "Net Earnings", "Payment Amount", "Cash Pay"
- This is what the employee actually receives in their bank account

EMPLOYEE NAME:
- "Employee Name", "Employee", "Name", "Full Name", "Payee"

EMPLOYEE NUMBER / PERSAL NUMBER:
- "Employee No", "Employee Number", "Emp No", "Persal No", "Personnel Number", "Staff No", "Payroll No"

PAY DATE — the ACTUAL date the salary was paid. Use this priority order:
1. FIRST: Explicit label — "Pay Date", "Payment Date", "Date Paid", "Paid On", "Date of Payment", "Salary Date"
2. SECOND: "Pay Period" end date — if shown as range "01.01.2026 To 31.01.2026" → use 2026-01-31
3. THIRD: Month only — "January 2026" or "Jan 2026" → last day of that month (2026-01-31)
4. LAST RESORT: "NA" if truly no date information exists

DEDUCTIONS TO IGNORE (do not confuse with net/gross):
- PAYE (tax), UIF, Medical Aid, Pension/Provident Fund, Garnishee Orders — these reduce gross to net

Extract the following information in JSON format:
{
  "employer": "string (Company/Department/Employer name)",
  "employeeName": "string (name of the employee being paid)",
  "employeeNumber": "string (employee/persal/staff number, or NA)",
  "grossSalary": number (Total Earnings BEFORE deductions — the TOTAL row value),
  "netSalary": number (Net Pay AFTER all deductions — what goes into the bank),
  "payDate": "string (YYYY-MM-DD)",
  "payDateSource": "string ('explicit' | 'period_end' | 'month_end' | 'NA')",
  "payPeriod": "string (e.g. '2026-01-01 to 2026-01-31', or the month shown, or NA)"
}

IMPORTANT:
- grossSalary = the TOTAL EARNINGS row (e.g. "79,893.40" → 79893.40). NOT an individual line item.
- netSalary = the NET PAY / TAKE HOME row (e.g. "31,788.55" → 31788.55). NOT gross.
- Remove ALL commas and spaces from numbers: "79,893.40" → 79893.40
- For string fields not found, use "NA". For number fields not found, use 0.
- Return valid JSON only. No extra text.`,

    BANK_STATEMENT: `You are analyzing a South African Bank Statement.

SALARY DEPOSIT — this is the most important extraction:
Look through ALL transactions for salary/wage credits. They may appear as:
- A single large credit labeled "SALARY", "SAL", "PAYROLL", "WAGES", "REMUNERATION"
- Multiple credits on the SAME DATE from the same employer (e.g. basic + allowances + bonus split into separate lines)
- Credits with the employer name in the description
- Any regular large credit that recurs monthly

If multiple salary-related credits appear on the SAME DATE, they are components of one salary payment.
In that case: sum all the amounts together for the total, and use that single date as the salary date.
Use the most RECENT such date in the statement.

Extract the following information in JSON format:
{
  "bankName": "string (e.g., FNB, ABSA, Standard Bank, Capitec)",
  "accountHolder": "string",
  "accountNumber": "string",
  "statementDate": "string (YYYY-MM-DD, the statement period end date)",
  "latestSalaryDeposit": {
     "amount": number (TOTAL salary received on that date — sum all salary components if split across multiple lines),
     "date": "string (YYYY-MM-DD — the ACTUAL TRANSACTION DATE the salary hit the account, NOT the statement date)",
     "description": "string (employer name or transaction description)"
  }
}
IMPORTANT:
- latestSalaryDeposit.date = the transaction date (e.g. 14/01/2026 → 2026-01-14) — extract from the transaction row, not from the statement header
- statementDate = statement period end date — this is usually different from the salary date
- For string fields not found, use "NA". For number fields not found, use 0.
- Return valid JSON only.`,

    OTHER: `You are analyzing a document that may contain client information for a debt counselling case.
Extract any identifiable information you can find:
{
  "idNumber": "string",
  "clientName": "string",
  "cellNumber": "string"
}
IMPORTANT: For any field not found, use "NA" (never return null or empty string).`,

    PROOF_OF_RESIDENCE: `You are analyzing a South African Proof of Residence document.

This document proves where a person lives. It could be ANY of:
- A municipal utility bill (water, electricity, refuse, rates) — from a municipality like City of Tshwane, City of Joburg, Ekurhuleni, eThekwini, etc.
- A bank confirmation letter stating the client's residential address
- A signed lease/rental agreement
- A government letter addressed to the client at a residential address
- A SARS correspondence with a residential address
- A prepaid electricity/Eskom/municipal statement

KEY FIELDS TO EXTRACT:
- Client name: the name the document is addressed TO (the person who lives there)
- Address: the full residential address shown on the document (street number, street, suburb, city, postal code)
- Document type: describe what kind of document it is (e.g. "Municipal Water Bill", "FNB Bank Letter", "Lease Agreement")
- Issuer: who issued the document (e.g. "City of Tshwane", "Nedbank", "SARS", landlord name)
- Document date: the date printed on the document (statement date, letter date, etc.)
- ID number: if the client's ID number appears on the document

Extract the following information in JSON format:
{
  "clientName": "string (full name on the document)",
  "address": "string (full street address including suburb and city)",
  "documentType": "string (e.g. 'Municipal Water Bill', 'Bank Letter', 'Lease Agreement', 'Government Letter')",
  "issuer": "string (e.g. 'City of Johannesburg', 'ABSA Bank', landlord name)",
  "documentDate": "string (YYYY-MM-DD — date on the document)",
  "idNumber": "string (if present, otherwise NA)"
}
IMPORTANT: For any field not found, use "NA" (never return null or empty string). Return valid JSON only.`,

    POA: `You are analyzing a South African debt counselling application or Power of Attorney document.

This could be:
- A Zenowethu "Approved Application" form (contains personal info, employment, income fields)
- A standard Power of Attorney (POA) signed by a client
- A client intake / application form

Look carefully through ALL pages of the document for any of these fields:

PERSONAL INFORMATION:
- Surname / Last Name / Family Name (separate from first names)
- First Names / Given Names / Full Names (separate from surname)
- ID Number (13-digit South African ID)
- Cell / Mobile number (10 digits, starts with 0 or +27)
- WhatsApp number
- Email address
- Residential address

EMPLOYMENT & FINANCIAL:
- Employer / Company name
- Gross Salary / Total Income (before deductions)
- Net Salary / Take-home pay (after deductions)
- Service Fee (if mentioned)

Extract into this JSON format:
{
  "surname": "string (family/last name ONLY)",
  "names": "string (first/given names ONLY, not the surname)",
  "clientName": "string (full name if surname/names cannot be separated)",
  "cellNumber": "string (10-digit cell number starting with 0)",
  "idNumber": "string (13-digit SA ID number)",
  "whatsappNumber": "string",
  "email": "string",
  "address": "string",
  "employer": "string (company/employer name)",
  "grossSalary": number (gross/total income before deductions, or 0 if not found),
  "netSalary": number (net/take-home pay after deductions, or 0 if not found),
  "serviceFee": number (service fee amount if stated, or 0 if not found),
  "_occurrences": {
    "surname": [{"value": "string", "count": number}],
    "names": [{"value": "string", "count": number}],
    "idNumber": [{"value": "string", "count": number}],
    "cellNumber": [{"value": "string", "count": number}],
    "email": [{"value": "string", "count": number}],
    "employer": [{"value": "string", "count": number}]
  }
}

IMPORTANT:
- Cell number must be a PHONE NUMBER (10 digits like 0741502090), NOT an ID number
- Surname and names should be SEPARATE fields (not combined)
- For any string field not found, use "NA". For number fields not found, use 0.
- Never return null or empty string.
- ADDITIONALLY: For each field listed in _occurrences, list ALL values you found across the entire document and how many times each appeared. Example: if surname appeared as 'THWALA' twice and 'TWALA' once, list both. If all occurrences of a field are the same, just list that one value.`,

    CREDIT_REPORT: `You are analyzing a MAJOR South African credit bureau report (e.g. XDS, Experian, TransUnion, or CPB).

CRITICAL: Use the specific sections below to extract data.

0. **CREDIT SCORE**
   - Look for "Credit Score", "Score", "Risk Score", or "Bureau Score" section.
   - score: The numeric credit score (e.g. 612). Use 0 if not found.
   - band: Map the score to a band:
       0–499 → "Poor"
       500–579 → "Below Average"
       580–669 → "Average"
       670–739 → "Good"
       740–999 → "Great"
       Not found → "Unknown"
   - suppressors: List ALL listed score suppressor codes or descriptions shown on the report (e.g. ["Adverse listing", "High utilisation", "Recent enquiries"]). Empty array if none found.

1. **CODIX RESULTS**
   - Look for "Codix Results" section.
   - Extract the outcome (e.g., "Decline", "Approve").
   - Extract the reason (e.g., "CLIENT IS LISTED UNDER DEBT COUNSELLING").

2. **DEBT RESTRUCTURING INFORMATION**
   - Look for "Debt Restructuring" section.
   - ncrdcNo: Registration number (NCRDC No)
   - debtCounsellorName: Contact person / Debt Counsellor Name
   - debtCounsellorNumber: Contact number
   - debtReviewDate: Application date (Date applied/enquired/placed)
   - dhsStatus: Status description (e.g., "D3", "D4", "Consent order granted")
   - statusDate: Status date

3. **ACCOUNT SUMMARY (Case Metadata)**
   - Look for "Accounts Summary" table.
   - totalDebt: "Balance Exposure" column value (total outstanding debt in Rands).
   - totalInstallment: "Monthly Instalment" column value (total monthly repayment in Rands).
   - activeAccounts: "Active Accounts" count (open/serviced accounts).
   - closedAccounts: "Closed Accounts" count (paid up/prescribed/written off accounts).

3b. **CONSUMER INCOME / DECLARED INCOME**
   - Look for "Consumer Income", "Income", "Declared Income", or "Affordability" section.
   - grossSalary: Gross income / Total income before deductions (number in Rands, 0 if not found).
   - netSalary: Net income / Disposable income / Take-home pay after deductions (number in Rands, 0 if not found).
   - affordability: Affordability status or disposable income description (e.g., "Positive", "Negative", "R2500.00 disposable income"). Use "NA" if not found.

4. **CONSUMER RESIDENTIAL ADDRESS**
   - Look for "Addresses" section.
   - latestAddress: Pick the LATEST address with type "Residential".

5. **CONTACT NUMBERS**
   - Look for "Contact numbers" section.
   - cellNumber: Latest Cellphone number.
   - workNumber: Latest Work number.
   - homeNumber: Latest Home number.
   - If duplicates, use the one with the LATEST date.

6. **EMPLOYER**
   - Look for "Employers" section.
   - employer: Employer name with the most RECENT date.
   - occupation: Occupation from the most RECENT date.

7. **ADVERSE LISTINGS** (Separate from open accounts)
   - Look for accounts coded as: "Handed Over", "Written Off", "Judgment", "Administration", "Bad Debt", "Default".
   - For each adverse listing extract:
     - creditor: credit provider name
     - accountNumber: account/reference number
     - adverseCode: the specific adverse classification (e.g. "Handed Over", "Written Off", "Judgment")
     - adverseDate: date the adverse listing was placed (YYYY-MM-DD or NA)
     - lastPaymentDate: date of last payment recorded (YYYY-MM-DD or NA)
     - openBalance: total outstanding balance (number)
     - overdueBalance: overdue / arrears amount (number)
     - monthsInArrears: number of months in arrears (number, 0 if not applicable)
     - paymentHistory: 24-month payment history string (e.g. "CCCCCC333300" or NA)
     - status: current status label from the report

8. **ALL ACCOUNT DETAILS — OPEN AND CLOSED** (Manual Scan)
   - Scan the report for EVERY individual credit account listed — both OPEN/ACTIVE/ARREARS accounts AND CLOSED/PAID-UP/SETTLED accounts (exclude adverse/written-off/judgment accounts already captured in section 7 above — those stay in adverseListings only).
   - Do not skip closed or paid-up accounts. A closed account typically has balance 0 and a status like "Closed" or "Paid Up" — extract it anyway with that status.
   - Extract details for each account found, open or closed. Go through the ENTIRE accounts table row by row — do not stop after the first several rows, and do not summarize or skip rows to save space.
   - originalAmount: the ORIGINAL loan amount / opening balance / credit limit when the account was first opened (look for "Original Amount", "Opening Balance", "Loan Amount", or "Credit Limit"). Use 0 if not found. This is different from the current/closing balance.
   - For each account, also extract the 24-month payment history code string if available.
   - **INSURANCE AUDIT**: Extract the "Insurance", "Credit Life", or "Monthly Fee" specifically related to the account if visible.
   - **SAVINGS METRICS**: Extract the **"Contract Start Date"** and **"Contract Term"** (e.g., 72 months) or "Months Remaining".

9. **ENQUIRY HISTORY**
   - Look for "Enquiries", "Credit Enquiries", or "Search History" section.
   - Extract ALL enquiries from the last 12 months.
   - For each: date, enquirer name (credit provider), enquiry type, and reason.
   - If more than 4 enquiries appear within any 3-month window, flag as excessive.

IMPORTANT: For ALL string fields not found, use "NA". For number fields not found, use 0. Never use null.

Output JSON:
{
  "creditScore": {
    "score": number,
    "band": "string (Poor | Below Average | Average | Good | Great | Unknown)",
    "suppressors": ["string"]
  },
  "codixResult": { "outcome": "string", "reason": "string" },
  "debtRestructuring": {
    "ncrdcNo": "string",
    "debtCounsellorName": "string",
    "debtCounsellorNumber": "string",
    "debtReviewDate": "string",
    "dhsStatus": "string",
    "statusDate": "string"
  },
  "summary": {
    "totalDebt": number,
    "totalInstallment": number,
    "activeAccounts": number,
    "closedAccounts": number
  },
  "income": {
    "grossSalary": number,
    "netSalary": number,
    "affordability": "string"
  },
  "consumer": {
    "latestAddress": "string",
    "idNumber": "string",
    "cellNumber": "string",
    "workNumber": "string",
    "homeNumber": "string",
    "employer": "string",
    "occupation": "string"
  },
  "adverseListings": [
    {
      "creditor": "string",
      "accountNumber": "string",
      "adverseCode": "string (e.g. Handed Over | Written Off | Judgment | Administration)",
      "adverseDate": "string (YYYY-MM-DD or NA)",
      "lastPaymentDate": "string (YYYY-MM-DD or NA)",
      "openBalance": number,
      "overdueBalance": number,
      "monthsInArrears": number,
      "paymentHistory": "string (24-month code string or NA)",
      "status": "string"
    }
  ],
  "accounts": [
    {
      "creditor": "string",
      "accountNumber": "string",
      "originalAmount": number,
      "balance": number,
      "installment": number,
      "insurancePremium": number,
      "contractStart": "string (YYYY-MM-DD)",
      "contractTerm": number,
      "remainingMonths": number,
      "arrearsAmount": number,
      "status": "string (include CLOSED/PAID UP accounts here too, not just open ones)",
      "paymentHistory": "string (24-month code string e.g. CCCCCC000122C, or NA if not found)",
      "lastPaymentDate": "string (YYYY-MM-DD or NA if not found)"
    }
  ],
  "enquiries": [
    {
      "date": "string (YYYY-MM-DD)",
      "enquirer": "string (credit provider name)",
      "type": "string (e.g. Application, Account Review)",
      "reason": "string"
    }
  ],
  "enquirySummary": {
    "totalLast12Months": number,
    "excessiveFlag": "boolean (true if > 4 enquiries in any 3-month window)"
  },
  "insuranceNotes": "string",
  "_occurrences": {
    "idNumber": [{"value": "string", "count": number}],
    "surname": [{"value": "string", "count": number}],
    "cellNumber": [{"value": "string", "count": number}]
  }
}

ADDITIONALLY: For the _occurrences object, list ALL values found across the entire report for: idNumber (consumer ID number), surname/name from the consumer section, and cellNumber. If a value appears multiple times, count each occurrence. If all occurrences are the same, just list that one value.`,

    CREDIT_REPORT_OTHER: `You are analyzing an alternative South African credit report or consumer summary (e.g. ClearScore, Kudough, Kughdo).
        
These reports are often summaries rather than full bureau data. Focus on extracting the high-level financial summary.

Extract the following information in JSON format:
{
  "summary": {
    "totalDebt": number (e.g. from "Total Debt", "Total Balance", "You owe"),
    "totalInstallment": number (e.g. from "Monthly Payment", "Instalments"),
    "activeAccounts": number,
    "closedAccounts": number
  },
  "income": {
    "grossSalary": number,
    "netSalary": number,
    "affordability": "string"
  },
  "consumer": {
    "latestAddress": "string",
    "idNumber": "string",
    "cellNumber": "string",
    "employer": "string"
  },
  "accounts": [
    {
      "creditor": "string",
      "balance": number,
      "installment": number,
      "status": "string"
    }
  ],
  "_occurrences": {
    "idNumber": [{"value": "string", "count": number}],
    "surname": [{"value": "string", "count": number}],
    "cellNumber": [{"value": "string", "count": number}]
  }
}

IMPORTANT: For ALL string fields not found, use "NA". For number fields not found, use 0. Never use null.`,

    CREDIT_REPORT_TYPE_IDENTIFICATION: `Identify the type of South African credit report from the extracted text.

MAJOR BUREAU reports (type = "CREDIT_REPORT"):
- XDS: Look for "XDS", "X D S", "xds.co.za", "Codix Results", "Debt Restructuring Information"
- Experian: Look for "Experian", "experian.co.za", "Consumer Credit Profile", "Payment Profile Index"
- TransUnion: Look for "TransUnion", "TU", "transunion.co.za", "ITC", "Consumer Assessment"
- CPB / Credit Profile Bureau: Look for "CPB", "Credit Profile Bureau", "cpb.co.za"
These reports are COMPREHENSIVE — they have: account-by-account payment history, enquiry history, debt restructuring section, credit score, 20+ pages.

SUMMARY / ALTERNATIVE reports (type = "CREDIT_REPORT_OTHER"):
- ClearScore: Look for "ClearScore", "clearscore.com"
- Kudough: Look for "Kudough", "kudough.co.za"
- Kughdo / Kugdho: any misspelling variant
- Carbon: Look for "Carbon", "getcarbon"
- Any other consumer-facing credit summary app
These reports are SUMMARIES — they show a score and high-level account totals, NOT full payment histories.

Return JSON format:
{
  "type": "CREDIT_REPORT" | "CREDIT_REPORT_OTHER",
  "bureauName": "string (exact bureau name, e.g. 'XDS Credit Report', 'Experian Credit Report', 'ClearScore Summary')",
  "confidence": number (0.0 to 1.0)
}

Return ONLY valid JSON.`,

    DHS_SUMMARY_REPORT: `You are a data extraction assistant for Zenowethu Debt Management (NCRDC3693).
Your job is to extract structured consumer case data from a DHS Debt Counsellor Summary Report (XLS or PDF) and return it as clean JSON for case creation or update.

## FILE STRUCTURE (DHS XLS Format)
The report has 13 columns (many blank/spacer columns). The relevant data is:
- Column index 1  → NCR System Reference Number (e.g. 615, 4285, 23662)
- Column index 3  → Surname (e.g. MOKOENA, Makoko)
- Column index 6  → First Name(s) (may include multiple names)
- Column index 10 → RSA ID Number (13-digit string, e.g. 8305195459081)
- Column index 12 → Case Status Code (e.g. F2, G, H, B, C, A, D3, D4, F1, A1, G1)

## STATUS CODE REFERENCE
Map status codes as follows:
F1 = Awaiting Proposal Acceptance
F2 = Under Debt Review (Active)
G  = Court Order Granted
G1 = Conditional Court Order
H  = Clearance Certificate Issued
B  = Rejected / Withdrawn
C  = Transferred to Another DC
D3 = Debt Review Removed (Paid Up)
D4 = Debt Review Removed (Other)
A  = Application Received
A1 = Awaiting Credit Provider Response

## EXTRACTION RULES
1. Skip all header rows, blank rows, and footer rows (page number rows).
2. Only extract rows where NCR System Reference is a valid number.
3. Clean name fields: trim whitespace, normalize spacing.
4. RSA ID: extract as a string, preserve leading zeros.
5. Split First Name(s) into: first_name (first word) and additional_names (remaining words).
6. Flag any row where RSA ID is missing, malformed (<13 digits), or duplicated.

## DUPLICATE HANDLING
- If the same NCR reference appears more than once, mark action as "update" and flag it.
- If RSA ID appears on multiple records, flag each with "Duplicate ID - verify".

## INSTRUCTIONS FOR PDF FILES
If the uploaded file is a PDF version of the same report:
- Extract text column by column, matching the same field positions.
- Use the header row labels (NCR Sys Ref., Surname, FirstName(s), RSA ID, Status) as anchors to identify columns.
- Apply the same extraction and output rules above.

## OUTPUT FORMAT
Return a JSON object with key "records" containing an array. Each object must contain:
{
  "ncr_ref": "string",
  "surname": "string",
  "first_name": "string",
  "additional_names": "string",
  "rsa_id": "string",
  "status_code": "string",
  "status_label": "string",
  "action": "string",
  "flag": "string|null"
}

Return ONLY the JSON object { "records": [...] }. No preamble, no explanation, no markdown fences.`,

    CREDIT_REPORT_SUMMARY: `You are extracting FINANCIAL TOTALS ONLY from a South African credit report.

IMPORTANT: You will ONLY extract dollar amounts, NOT account counts.

TASK: Find the "Accounts Summary" table and extract these 2 values:

1. **Balance Exposure** (Column 2)
   - Look for "Balance Exposure" header
   - Extract the value (e.g., "R 90,545.00")
   - Convert to number: 90545

2. **Monthly Instalment** (Column 3)
   - Look for "Monthly Instalment" header  
   - Extract the value (e.g., "R 11,270.00")
   - Convert to number: 11270

DO NOT extract account counts. We will count those separately.

Output JSON (ONLY these 2 fields):
{
  "totalDebt": number,
  "totalInstallment": number
}

Return ONLY valid JSON with these 2 fields.`
};

export const IDENTIFICATION_PROMPT = `Analyze this text content and page images extracted from a PDF and identify the different document types contained within it.

[EXTRACTED TEXT CONTENT]
{{EXTRACTED_TEXT}}

PRIORITY ORDER — classify documents in this strict order of priority:

1. *** ID DOCUMENT (HIGHEST PRIORITY) ***
   South African ID document — green ID book or smart card.
   TEXT CLUES: 13-digit number, "IDENTITY DOCUMENT", "IDENTITEITSDOKUMENT", "REPUBLIC OF SOUTH AFRICA", "REPUBLIEK VAN SUID-AFRIKA", "SURNAME", "NAMES", "VAN", "VOORNAME"
   IMAGE CLUES: SA coat of arms (three animals), small photo, credit-card sized card, green booklet
   NOTE: Smart cards may appear rotated/sideways — still classify as ID.
   RULE: ALWAYS identify separately. Never merge into another type.

2. *** ZENOWETHU_POA (HIGH PRIORITY) ***
   Any document with Zenowethu company branding — this is a packet of ~4 pages.
   TEXT CLUES (any ONE of these is enough): "Zenowethu", "ZENOWETHU", "ZDM", "ZDM_POA", "zenowethu@", "NCRDC3693", "Aftercare Fee", "Transfer Authorisation", "Credit Information Authorization", "Power of Attorney" combined with Zenowethu name, "012 035 1824", "081 747 7616", "cases.zenowethu.co.za", "www.zenowethu"
   IMAGE CLUES: Zenowethu logo (teal/green logo), Zenowethu letterhead at top of page, "ZDM" logo or text
   RULE: If ANY page contains Zenowethu branding (text, "ZDM", or logo), group ALL connected pages as ZENOWETHU_POA. Do NOT classify as generic POA or OTHER.
   TYPICAL CONTENT: Page 1=Aftercare Fees schedule, Page 2=Transfer Authorization, Page 3=Power of Attorney, Page 4=Credit Info Authorization

3. *** CREDIT_REPORT (HIGH PRIORITY) ***
   Official credit bureau report from XDS, Experian, TransUnion, or CPB.
   TEXT CLUES: Bureau name (XDS, Experian, TransUnion, CPB/Credit Profile Bureau), "Consumer Credit Profile", "Payment Profile", "Account Summary", "Balance Exposure", "Enquiry History", "Codix Results", credit score section, "NCRDC" in debt restructuring section
   IMAGE CLUES: Bureau logo at top, tabular account data, payment history codes (CCCC000111)

4. ** CREDIT_REPORT_OTHER **
   Summary or alternative credit reports: ClearScore, Kudough, Kughdo, Carbon, or any non-major-bureau summary.
   TEXT CLUES: "ClearScore", "Kudough", "Kughdo", "Your credit score", "Your accounts", score displayed prominently without full account data

5. ** PROOF_OF_RESIDENCE **
   Document proving where a person lives.
   TEXT CLUES: Municipality name (City of Tshwane, City of Joburg, Ekurhuleni, eThekwini), "Account Number", "Municipal Account", utility bill headers (Water, Electricity, Refuse, Rates), "Rental Agreement", "Lease", "Landlord", bank letter with residential address, "SARS" with address, "Account Statement" from a utility/municipality
   IMAGE CLUES: Municipality logo, utility company logo, table showing consumption/charges

6. ** PAYSLIP **
   Salary slip or salary advice from an employer.
   TEXT CLUES: "Salary Advice", "Payslip", "Pay Slip", "Employee Number", "Gross Salary", "Net Pay", "Basic Salary", "Deductions", "PAYE", "UIF", "Medical Aid", employer name with pay period, "Gross Earnings", "Total Deductions"
   IMAGE CLUES: Table with earnings/deductions columns, employer letterhead with period dates

7. ** BANK_STATEMENT **
   Bank account transaction history.
   TEXT CLUES: Bank name (FNB, ABSA, Standard Bank, Capitec, Nedbank, African Bank, TymeBank, Discovery Bank), "Account Number", "Statement Period", "Opening Balance", "Closing Balance", "Available Balance", debit/credit transaction list
   IMAGE CLUES: Bank logo at top, table of transactions with dates/amounts/balances

8. ** FORM_17W **
   Withdrawal from Debt Review form.
   TEXT CLUES: "17.W", "Form 17.W", "Withdrawal from Debt Review", "Section 71", "Notification of Withdrawal"

9. ** COURT_ORDER **
   Legal court order or judgment.
   TEXT CLUES: "Court Order", "High Court", "Magistrate's Court", "Case Number", "In the matter between"

10. ** CLEARANCE_CERTIFICATE **
    Certificate proving debt review is complete.
    TEXT CLUES: "Clearance Certificate", "Form 19", "Paid Up", "Section 71"

11. ** SETTLEMENT_LETTER **
    Letter proving an account is paid up.
    TEXT CLUES: "Paid up letter", "Settlement letter", "Zero Balance", "Settled in full"

12. ** POA **
   Generic Power of Attorney NOT branded as Zenowethu.
   TEXT CLUES: "Power of Attorney", "I hereby authorise", signed POA without Zenowethu branding.

For each document found, provide:
- type: "ID", "ZENOWETHU_POA", "CREDIT_REPORT", "CREDIT_REPORT_OTHER", "PROOF_OF_RESIDENCE", "PAYSLIP", "BANK_STATEMENT", "FORM_17W", "COURT_ORDER", "CLEARANCE_CERTIFICATE", "SETTLEMENT_LETTER", "POA", or "OTHER"
- startPage: page number where this document starts (1-based)
- endPage: page number where this document ends (1-based)
- confidence: confidence score (0.0 to 1.0)
- description: brief description (e.g. "SA Smart ID Card", "XDS Credit Report", "City of Tshwane Municipal Bill")
- bureauName: for credit reports only — bureau name (e.g. "XDS", "Experian", "ClearScore")

CRITICAL RULES:
- Page numbers are 1-based (first page is 1).
- Group multi-page documents correctly (e.g. a 10-page credit report = startPage: 6, endPage: 15).
- ZENOWETHU_POA: group all Zenowethu-branded pages as ONE entry spanning all connected pages.
- Any page with Zenowethu text or logo → ZENOWETHU_POA, never POA or OTHER.
- ID documents must always be identified separately — never merged into another type.
- Smart card IDs may occupy only 1 page — use the SAME page for startPage and endPage.

Return JSON format:
{
    "documents": [
        { "type": "ID", "startPage": 1, "endPage": 1, "confidence": 0.95, "description": "SA Smart ID Card" },
        { "type": "ZENOWETHU_POA", "startPage": 2, "endPage": 5, "confidence": 0.95, "description": "Zenowethu POA Packet (4 pages)" },
        { "type": "PROOF_OF_RESIDENCE", "startPage": 6, "endPage": 6, "confidence": 0.90, "description": "City of Tshwane Municipal Water Bill" },
        { "type": "PAYSLIP", "startPage": 7, "endPage": 7, "confidence": 0.95, "description": "Employer Salary Advice" },
        { "type": "BANK_STATEMENT", "startPage": 8, "endPage": 10, "confidence": 0.92, "description": "FNB Bank Statement" },
        { "type": "CREDIT_REPORT", "startPage": 11, "endPage": 20, "confidence": 0.90, "description": "XDS Credit Report" }
    ],
    "totalPages": 20
}

ONLY return the JSON object, no other text.`;

export const DHS_IDENTIFICATION_PROMPT = `You are analyzing a combined PDF to identify ONLY two specific document types for a DHS case intake. Extract ONLY these and NOTHING else.

[EXTRACTED TEXT CONTENT]
{{EXTRACTED_TEXT}}

=== DOCUMENT 1: ID ===
South African ID — green ID book or smart card.
VISUAL: SA coat of arms, small photo, credit-card, green booklet.
TEXT: 13-digit number, "IDENTITY DOCUMENT", "REPUBLIC OF SOUTH AFRICA", "SURNAME", "NAMES".
RULE: In joint cases (two clients), put BOTH ID pages into ONE "ID" entry using the pages array.

=== DOCUMENT 2: ZENOWETHU_POA ===
ONLY these THREE specific Zenowethu documents qualify (ALL must have the Zenowethu Diamond-Z logo):

A. Transfer Authorization / Transfer Authorisation
   - Page heading: "Transfer Authorization" or "Transfer Authorisation"
   - Body: "I consent that the Debt Counsellor may request my debt review file from my current debt counsellor"
   - Has: "Debt Counsellor Name:" and "Counsellor Number: NCRDC"

B. Power of Attorney
   - Page heading: "POWER OF ATTORNEY"
   - Body: "This Power of Attorney (the 'Agreement') is made BETWEEN: Zenowethu Debt Management"
   - Body: "nominate, constitute and appoint Zenowethu Debt Management"
   - Has Witness Signature lines and footer "+27 12 035 1824" or "+27 81 747 7616"

C. Authorisation to Obtain Confidential Information
   - Page heading: "Authorisation to Obtain Confidential Information with All Credit Bureaus"
   - Body: "I consent to the Debt Counsellor obtaining and updating my credit records details from any/all registered credit bureaus"
   - Has footer "+27 12 035 1824" or "+27 81 747 7616"

=== STRICT EXCLUSIONS — NEVER EXTRACT THESE ===
❌ Any page headed "SCHEDULE 6" or "Schedule 6: Power of Attorney in favour of Zenowethu" — SKIP even if Zenowethu logo is present
❌ Any page headed "Aftercare fees and legal fees consent" or listing aftercare fee tables — SKIP even if Zenowethu logo is present
❌ Any page headed "CREDIT REPAIR SERVICES AGREEMENT (ZENOWETHU)" or "CREDIT REPAIR SERVICES AGREEMENT(ZENOWETHU)" — this is a Letsatsi Finance document, SKIP even though it says Zenowethu in the title
❌ Letsatsi Finance contracts or any document with the Letsatsi Finance and Loan logo — SKIP
❌ Credit reports, bank statements, payslips, bills — SKIP

=== OUTPUT RULES ===
- pages: array of 1-based page numbers.
- ALL valid Zenowethu pages (A+B+C from any/all clients) → ONE "ZENOWETHU_POA" entry.
- ALL ID pages → ONE "ID" entry.

Return JSON only:
{
    "documents": [
        { "type": "ID", "pages": [1], "confidence": 0.98, "description": "SA Smart ID Card" },
        { "type": "ZENOWETHU_POA", "pages": [3, 4, 5], "confidence": 0.97, "description": "Transfer Auth + POA + Authorisation" }
    ],
    "totalPages": 50
}

If nothing found: { "documents": [], "totalPages": X }
ONLY return the JSON object, no other text.`;

