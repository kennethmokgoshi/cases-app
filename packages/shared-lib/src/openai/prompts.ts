export const PROMPTS = {
    ID: `You are analyzing a South African ID document (green ID book or smart card).

IMPORTANT: On South African IDs:
- The SURNAME (family name/last name) is clearly labeled as "SURNAME" or "VAN"
- The NAMES (first names/given names) are labeled as "NAMES" or "VOORNAME"
- The ID NUMBER is a 13-digit number starting with the birth date (YYMMDD)

Extract the following information in JSON format:
{
  "surname": "string (the family name/last name ONLY)",
  "names": "string (first and middle names ONLY, NOT the surname)",
  "idNumber": "string (13 digits)",
  "dateOfBirth": "string (YYYY-MM-DD)"
}

Be very careful to distinguish between surname and names - they are separate fields on the ID. If any field is not clearly visible, use null.`,

    PAYSLIP: `You are analyzing a Payslip or Salary Advice document.
        
Extract the following information in JSON format:
{
  "employer": "string (Company/Employer name)",
  "grossSalary": number (Total earnings before deductions),
  "netSalary": number (Take home pay),
  "payDate": "string (YYYY-MM-DD)",
  "employeeNumber": "string if found"
}
Return valid JSON only.`,

    BANK_STATEMENT: `You are analyzing a Bank Statement.
        
Extract the following information in JSON format:
{
  "bankName": "string (e.g., FNB, ABSA, Standard Bank)",
  "accountHolder": "string",
  "accountNumber": "string",
  "statementDate": "string (YYYY-MM-DD)",
  "latestSalaryDeposit": {
     "amount": number,
     "date": "string (YYYY-MM-DD)",
     "description": "string"
  }
}
Return valid JSON only.`,

    OTHER: `You are analyzing a generic document affecting a credit repair case.
Extract any identifiable information:
{
  "idNumber": "string if found",
  "clientName": "string if found",
  "cellNumber": "string if found"
}
If nothing relevant is found, return empty strings/nulls.`,

    POA: `You are analyzing a Power of Attorney document signed by a client.

Extract the following information in JSON format:
{
  "clientName": "string (the client's full name who signed the POA)",
  "cellNumber": "string (cell/mobile phone number - 10 digits, may start with 0 or +27)",
  "idNumber": "string (13-digit ID number, often handwritten or typed)",
  "whatsappNumber": "string or null",
  "email": "string or null",
  "address": "string or null"
}

IMPORTANT: The cell number should be a phone number (typically 10 digits like 0741502090), NOT an ID number.
If any field is not clearly visible, use null.`,

    CREDIT_REPORT: `You are analyzing a South African credit report (likely XDS/Experian/CPB format).
        
CRITICAL: Use the specific sections below to extract data.

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

3. **ACCOUNT SUMMARY**
   - Look for "Accounts Summary" table.
   - totalDebt: "Balance Exposure" column value.
   - totalInstallment: "Monthly Instalment" column value.
   - activeAccounts: "Active Accounts" count (open/serviced).
   - closedAccounts: "Closed Accounts" count (paid up/prescribed/written off).

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

7. **OPEN ACCOUNT DETAILS** (Manual Scan)
   - Scan the report for OPEN/ACTIVE/ARREARS accounts.
   - Extract details for each.

Output JSON:
{
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
  "consumer": {
    "latestAddress": "string",
    "idNumber": "string",
    "cellNumber": "string",
    "workNumber": "string",
    "homeNumber": "string",
    "employer": "string",
    "occupation": "string"
  },
  "accounts": [
    {
      "creditor": "string",
      "accountNumber": "string",
      "balance": number,
      "installment": number,
      "arrearsAmount": number,
      "status": "string"
    }
  ],
  "insuranceNotes": "string"
}`,

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

export const IDENTIFICATION_PROMPT = `Analyze this text content extracted from a PDF and identify the different document types contained within it.
                        
[EXTRACTED TEXT CONTENT]
{{EXTRACTED_TEXT}}

You need to identify:
1. ** ID Document ** - South African ID(green ID book or smart card)
2. ** POA(Power of Attorney) ** - Client's signed Power of Attorney document granting authority
3. ** CREDIT_REPORT ** - Credit bureau report(XDS, Experian, TransUnion) showing credit history
4. ** ZENOWETHU_POA ** - The full Zenowethu packet(approx 4 pages).
                   - INCLUDES: Aftercare Fees, Transfer Authorization, Power of Attorney, Credit Info Authorization.
5. ** PAYSLIP ** - Salary advice or payslip from an employer.
6. ** BANK_STATEMENT ** - Document showing bank transactions and account details.

For each document found, provide:
- type: "ID", "POA", "CREDIT_REPORT", "ZENOWETHU_POA", "PAYSLIP", "BANK_STATEMENT", or "OTHER"
    - startPage: the page number where this document starts(1 - based, use the--- Page X--- headers in the text)
        - endPage: the page number where this document ends(1 - based)
            - confidence: how confident you are(0.0 to 1.0)
                - description: brief description of what you see

IMPORTANT:
- Page numbers are 1 - based(first page is 1)
    - If a document spans multiple pages, include all pages
        - ZENOWETHU_POA is a PACKET of ~4 pages.Group them together.

Return JSON format:
{
    "documents": [
        { "type": "ID", "startPage": 1, "endPage": 1, "confidence": 0.95, "description": "SA green ID book" },
        { "type": "ZENOWETHU_POA", "startPage": 2, "endPage": 5, "confidence": 0.9, "description": "Zenowethu Packet (4 pages)" },
        { "type": "CREDIT_REPORT", "startPage": 6, "endPage": 10, "confidence": 0.85, "description": "XDS Credit Report" }
    ],
        "totalPages": 10
}

ONLY return the JSON object, no other text.`;
