/**
 * Centralized Demo Data for the Credo application.
 * This file contains high-quality, mock data used for demonstration purposes.
 * It is used both by the frontend components and the database seeding script.
 */

export const DEMO_USER = {
  firstName: "Sipho",
  lastName: "Sithole",
  email: "demo@credo.co.za",
  password: "password123", // For seeding
  idNumber: "850324 5182 084",
  phone: "082 555 1234",
  province: "Gauteng",
  language: "English",
  plan: "Standard",
};

export const DEMO_BUREAUS = [
  { key: "transunion", name: "TransUnion", score: 648, change: 12, lastPulled: "20 Mar 2026" },
  { key: "experian",   name: "Experian",   score: 622, change: 8,  lastPulled: "20 Mar 2026" },
  { key: "xds",        name: "XDS",        score: 671, change: 18, lastPulled: "20 Mar 2026" },
  { key: "lightstone", name: "Lightstone", score: 635, change: 5,  lastPulled: "20 Mar 2026" },
];

export const DEMO_CASES = [
  {
    id: "CR-2024-001",
    title: "Judgment Removal — Standard Bank",
    type: "Judgment Rescission",
    status: "IN_PROGRESS",
    bureau: "TransUnion",
    openedDate: "10 Jan 2026",
    daysOpen: 73,
    daysLeft: 14,
    progress: 43,
    step: "Step 3 of 7",
    steps: [
      { label: "Case opened",                  done: true,  date: "10 Jan" },
      { label: "Documents collected",           done: true,  date: "15 Jan" },
      { label: "Rule 49 application drafted",   done: true,  date: "22 Jan" },
      { label: "Filed with Magistrate's Court", done: false, date: null     },
      { label: "Court hearing",                 done: false, date: null     },
      { label: "Rescission order granted",      done: false, date: null     },
      { label: "Bureau removal confirmed",      done: false, date: null     },
    ],
    updates: [
      { date: "22 Jan", text: "Rule 49 application completed and ready for filing." },
      { date: "15 Jan", text: "All supporting documents received. ID, payslip, bank statement confirmed." },
      { date: "10 Jan", text: "Case opened. Initial assessment complete. Judgment amount: R 28 500." },
    ],
  },
  {
    id: "CR-2024-002",
    title: "Default Dispute — Capitec",
    type: "Section 72 Dispute",
    status: "WAITING",
    bureau: "Experian",
    openedDate: "5 Feb 2026",
    daysOpen: 47,
    daysLeft: 6,
    progress: 60,
    step: "Awaiting bureau response",
    steps: [
      { label: "Case opened",                done: true,  date: "5 Feb"  },
      { label: "Section 72 letter drafted",  done: true,  date: "8 Feb"  },
      { label: "Letter sent to bureau",      done: true,  date: "10 Feb" },
      { label: "Bureau investigation",       done: false, date: null     },
      { label: "Bureau response received",   done: false, date: null     },
      { label: "Default removed",            done: false, date: null     },
    ],
    updates: [
      { date: "10 Feb", text: "Section 72 dispute letter sent to Experian. 20-business-day clock starts." },
      { date: "8 Feb",  text: "Dispute letter drafted. Grounds: incorrect balance and dates." },
      { date: "5 Feb",  text: "Case opened. Default listing confirmed: R 6 200 — Capitec credit facility." },
    ],
  },
  {
    id: "CR-2024-003",
    title: "Debt Review Flag Removal",
    type: "DHS Clearance",
    status: "PENDING",
    bureau: "All bureaus",
    openedDate: "1 Mar 2026",
    daysOpen: 23,
    daysLeft: null,
    progress: 20,
    step: "Clearance certificate required",
    steps: [
      { label: "Case opened",                       done: true,  date: "1 Mar"  },
      { label: "DHS status confirmed",              done: true,  date: "3 Mar"  },
      { label: "Clearance certificate required",    done: false, date: null     },
      { label: "Certificate obtained from DC",      done: false, date: null     },
      { label: "Form 17.7 submitted to bureaus",    done: false, date: null     },
      { label: "Flag removed from all bureaus",     done: false, date: null     },
    ],
    updates: [
      { date: "3 Mar",  text: "DHS system confirms debt review flag still active. Debt counsellor: M. Khumalo." },
      { date: "1 Mar",  text: "Case opened. Debt review completed in 2023 but flag never removed." },
    ],
  },
  {
    id: "CR-2023-008",
    title: "Prescribed Debt Challenge — Edgars",
    type: "Prescription Challenge",
    status: "RESOLVED",
    bureau: "XDS",
    openedDate: "10 Aug 2025",
    daysOpen: 226,
    daysLeft: null,
    progress: 100,
    step: "Listing removed",
    steps: [
      { label: "Case opened",                     done: true, date: "10 Aug" },
      { label: "Prescription assessed",           done: true, date: "12 Aug" },
      { label: "Challenge letter sent",           done: true, date: "15 Aug" },
      { label: "Bureau response received",        done: true, date: "2 Sep"  },
      { label: "Listing removed — XDS confirmed", done: true, date: "8 Sep"  },
    ],
    updates: [
      { date: "8 Sep",  text: "XDS confirmed removal of prescribed listing. Case closed." },
      { date: "2 Sep",  text: "Bureau acknowledged prescription. Removal approved." },
      { date: "15 Aug", text: "Prescription challenge letter sent to XDS." },
    ],
  },
];

export const DEMO_STATS = [
  { label: "Active Cases", value: "3", sub: "2 in progress", color: "#2563EB", bg: "#EFF6FF" },
  { label: "Disputes Filed", value: "7", sub: "Since joining", color: "#7C3AED", bg: "#F5F3FF" },
  { label: "Items Removed", value: "4", sub: "Negative items cleared", color: "#059669", bg: "#ECFDF5" },
  { label: "Months Active", value: "8", sub: "Credit repair journey", color: "#C4953A", bg: "#F6EDD6" },
];

export const DEMO_ACTIVITIES = [
  {
    iconBg: "#ECFDF5",
    type: "CHECK",
    title: "Default removed",
    subtitle: "Capitec — TransUnion confirmed",
    time: "2h ago",
  },
  {
    iconBg: "#EFF6FF",
    type: "CLOCK",
    title: "Bureau response received",
    subtitle: "Experian — Section 72 dispute",
    time: "1d ago",
  },
  {
    iconBg: "#F6EDD6",
    type: "SHIELD",
    title: "Document uploaded",
    subtitle: "ID copy — identity verification",
    time: "3d ago",
  },
  {
    iconBg: "#F5F3FF",
    type: "USER",
    title: "Case assigned",
    subtitle: "Debt Review Flag Removal — initiated",
    time: "5d ago",
  },
  {
    iconBg: "#FEF2F2",
    type: "ALERT",
    title: "Alert: New hard inquiry",
    subtitle: "FNB — vehicle finance application",
    time: "1w ago",
  },
];

export const DEMO_NEGATIVE_ITEMS = [
  {
    id: 1, type: "Judgment", creditor: "Standard Bank", amount: "R 28 500", date: "2022-04-15",
    bureau: "TransUnion", status: "DISPUTED", isPrescribed: false,
    description: "Unsecured personal loan default judgment",
  },
  {
    id: 2, type: "Default", creditor: "Capitec Bank", amount: "R 6 200", date: "2021-01-10",
    bureau: "Experian", status: "IN_REVIEW", isPrescribed: false,
    description: "Credit facility — 90-day default listing",
  },
  {
    id: 3, type: "Debt Review", creditor: "Multiple creditors", amount: "—", date: "2020-06-01",
    bureau: "All bureaus", status: "PENDING_CLEARANCE", isPrescribed: false,
    description: "Debt review flag — clearance certificate required",
  },
  {
    id: 4, type: "Default", creditor: "Edgars / Edcon", amount: "R 1 840", date: "2020-09-14",
    bureau: "XDS", status: "PRESCRIBED", isPrescribed: true,
    description: "Retail account default — may be prescribed",
  },
];

export const DEMO_PAYMENT_PROFILE = [
  { creditor: "Nedbank Home Loan",     balance: "R 1 240 000", payment: "R 9 800",  status: "CURRENT",   months: 24 },
  { creditor: "FNB Vehicle Finance",   balance: "R 185 000",   payment: "R 4 200",  status: "CURRENT",   months: 18 },
  { id: 3, creditor: "Standard Bank CC",      balance: "R 12 400",    payment: "R 800",    status: "CURRENT",   months: 12 },
  { creditor: "Mr Price Account",      balance: "R 0",         payment: "R 0",      status: "PAID_UP",   months: 36 },
];

export const DEMO_DOCS = [
  { id: 1, name: "South African ID Copy",            category: "IDENTITY",     size: "1.2 MB",  date: "10 Jan 2026", type: "pdf",  locked: false },
  { id: 2, name: "Proof of Residence — Municipality", category: "IDENTITY",    size: "840 KB",  date: "10 Jan 2026", type: "pdf",  locked: false },
  { id: 3, name: "Latest Payslip — March 2026",       category: "INCOME",      size: "220 KB",  date: "5 Mar 2026",  type: "pdf",  locked: false },
  { id: 4, name: "3-Month Bank Statement — FNB",      category: "INCOME",      size: "3.4 MB",  date: "5 Mar 2026",  type: "pdf",  locked: false },
  { id: 5, name: "TransUnion Credit Report",          category: "BUREAU",      size: "1.8 MB",  date: "20 Mar 2026", type: "pdf",  locked: false },
  { id: 6, name: "Experian Credit Report",            category: "BUREAU",      size: "1.6 MB",  date: "20 Mar 2026", type: "pdf",  locked: false },
  { id: 7, name: "XDS Credit Report",                 category: "BUREAU",      size: "1.5 MB",  date: "20 Mar 2026", type: "pdf",  locked: false },
  { id: 8, name: "Lightstone Credit Report",          category: "BUREAU",      size: "1.3 MB",  date: "20 Mar 2026", type: "pdf",  locked: false },
  { id: 9, name: "Rule 49 Rescission Application",    category: "LEGAL",       size: "980 KB",  date: "22 Jan 2026", type: "pdf",  locked: false },
  { id: 10, name: "Section 72 Dispute — Capitec",     category: "LEGAL",       size: "640 KB",  date: "8 Feb 2026",  type: "pdf",  locked: false },
  { id: 11, name: "Standard Bank — Judgment Letter",  category: "CORRESPONDENCE", size: "310 KB", date: "2 Jan 2026", type: "pdf", locked: false },
  { id: 12, name: "Experian — Bureau Response",       category: "CORRESPONDENCE", size: "450 KB", date: "2 Mar 2026", type: "pdf", locked: false },
];
