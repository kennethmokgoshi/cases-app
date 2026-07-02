/**
 * Debt Counsellor Fee Invoice — pure helpers (browser + server safe).
 *
 * Business context
 * ----------------
 * When another debt counsellor (DC) submits a DHS transfer request to take one of
 * Zenowethu's existing clients, staff decline the request on the NCR Debt Help
 * System because the consumer still owes Zenowethu fees. The requesting DC then
 * asks for an invoice itemising those fees before they will proceed. This module
 * defines the fee catalogue, validation and money maths used to produce that
 * invoice. The bill-to party is the debt counsellor; the consumer the fees relate
 * to is referenced on the invoice.
 *
 * This is the INVERSE of the inbound `OUTSTANDING_FEES` decline path in
 * `../dhs/decline-handler.ts` (where ANOTHER DC declines Zenowethu's OUTBOUND
 * request). That path is unrelated and unchanged.
 *
 * NOTE: this file must stay free of Node-only imports (no `prisma`, `fs`, etc.)
 * so the React form can import the catalogue/schema. The Prisma-backed persistence
 * lives in `./dc-fee-invoice-service.ts`.
 */

import { z } from 'zod';

/**
 * Catalogue of reasons a consumer may owe fees to the previous (Zenowethu) debt
 * counsellor at the point of a DHS transfer. Staff pick one or more; each becomes
 * an itemised line on the invoice. `OTHER` lets staff type a free-text reason.
 */
export const DC_FEE_REASONS = [
  { key: 'COMMISSION_PAID_OUT', label: 'Commission paid out' },
  { key: 'AFTER_CARE_FEES', label: 'After-care fees' },
  { key: 'ADMIN_FEES', label: 'Admin fees' },
  { key: 'LEGAL_FEES', label: 'Legal fees' },
  { key: 'RESTRUCTURING_FEE', label: 'Restructuring / Section 86 proposal fee' },
  { key: 'REJECTION_FEE', label: 'Rejection fee (Form 17.1)' },
  { key: 'COURT_NCT_FEE', label: 'Court / NCT application fee' },
  { key: 'DISTRIBUTION_FEE', label: 'Distribution / PDA administration fees' },
  { key: 'MONTHLY_SERVICE_FEE', label: 'Monthly debt review service fee (arrears)' },
  { key: 'CONSULTATION_FEE', label: 'Initial consultation / application fee' },
  { key: 'DISBURSEMENTS', label: 'Disbursements (bureau, printing, postage)' },
  { key: 'OTHER', label: 'Other' },
] as const;

export type DcFeeReasonKey = (typeof DC_FEE_REASONS)[number]['key'];

const DC_FEE_REASON_KEYS = DC_FEE_REASONS.map((r) => r.key) as [DcFeeReasonKey, ...DcFeeReasonKey[]];

/** Look up the human label for a reason key (falls back to the key itself). */
export function dcFeeReasonLabel(key: string): string {
  return DC_FEE_REASONS.find((r) => r.key === key)?.label ?? key;
}

/** Human label for the document kind — "Quotation" or "Invoice". */
export function dcFeeDocLabel(documentType: 'INVOICE' | 'QUOTE'): string {
  return documentType === 'QUOTE' ? 'Quotation' : 'Invoice';
}

/** Standard South African VAT rate applied when `applyVat` is true. */
export const ZA_VAT_RATE = 0.15;

// ─── Validation ────────────────────────────────────────────────────────────────

export const dcFeeLineItemSchema = z.object({
  reasonKey: z.enum(DC_FEE_REASON_KEYS),
  /** Editable description; defaults to the reason label in the UI. */
  description: z.string().trim().min(1, 'Description is required').max(300),
  /** Rand amount for this fee line (must be positive). */
  amount: z.number().positive('Amount must be greater than zero').max(10_000_000),
});

export type DcFeeLineItemInput = z.infer<typeof dcFeeLineItemSchema>;

export const dcFeeInvoiceInputSchema = z.object({
  // Debt counsellor (bill-to)
  dcName: z.string().trim().min(1, 'Debt counsellor name is required').max(200),
  dcEmail: z.string().trim().email('Invalid email').max(200).optional().or(z.literal('')),
  dcTradingName: z.string().trim().max(200).optional().or(z.literal('')),
  // Consumer the fees relate to
  clientFirstName: z.string().trim().min(1, 'Client name is required').max(100),
  clientLastName: z.string().trim().min(1, 'Client surname is required').max(100),
  clientIdNumber: z
    .string()
    .trim()
    .regex(/^\d{13}$/, 'Client ID number must be 13 digits'),
  // Fees
  lineItems: z.array(dcFeeLineItemSchema).min(1, 'Add at least one fee line').max(50),
  applyVat: z.boolean().default(true),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  /**
   * Whether to issue a formal INVOICE (default) or a QUOTATION. A quote is the
   * same document addressed to the same debt counsellor, but labelled
   * "QUOTATION", numbered `QUO-…`, and dated "Valid Until" rather than "Due".
   */
  documentType: z.enum(['INVOICE', 'QUOTE']).default('INVOICE'),
});

export type DcFeeInvoiceInput = z.infer<typeof dcFeeInvoiceInputSchema>;

// ─── Money maths ─────────────────────────────────────────────────────────────

export interface DcFeeTotals {
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

/** Round to 2 decimals avoiding binary float drift (e.g. 1.005 → 1.01). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Sum the fee lines and apply VAT when requested. Pure — used for both the live
 * total preview in the form and the persisted invoice totals, so they always agree.
 */
export function computeDcFeeTotals(
  lineItems: Pick<DcFeeLineItemInput, 'amount'>[],
  applyVat: boolean,
): DcFeeTotals {
  const subtotal = round2(lineItems.reduce((sum, li) => sum + (li.amount || 0), 0));
  const vatRate = applyVat ? ZA_VAT_RATE : 0;
  const vatAmount = round2(subtotal * vatRate);
  const total = round2(subtotal + vatAmount);
  return { subtotal, vatRate, vatAmount, total };
}

/**
 * Human-readable consumer reference stored on the invoice and printed as the
 * "RE:" line, so the DC can see exactly which consumer the fees relate to.
 */
export function buildConsumerReference(input: {
  clientFirstName: string;
  clientLastName: string;
  clientIdNumber: string;
}): string {
  const name = `${input.clientFirstName} ${input.clientLastName}`.trim();
  return `Outstanding fees re: ${name} (ID: ${input.clientIdNumber})`;
}

/**
 * Strip the "Outstanding fees re: " prefix from a stored consumer reference,
 * leaving just the "Name (ID: …)" portion. Used so the consumer the fees relate
 * to can be folded into each fee line's DESCRIPTION instead of printed as a
 * separate line under BILL TO.
 */
export function consumerLabelFromReference(reference: string | null | undefined): string {
  return (reference ?? '').replace(/^\s*Outstanding fees re:\s*/i, '').trim();
}

/**
 * Compose a single fee-line description that names the consumer the fees relate
 * to, e.g. "Outstanding fees commission paid out for John Dlamini (ID: 8001…)".
 * The reason's first letter is lower-cased so the sentence reads naturally while
 * preserving embedded acronyms (Form 17.1, NCT, Section 86).
 */
export function buildDcFeeLineDescription(
  reasonDescription: string,
  consumerLabel: string,
): string {
  const reason = (reasonDescription ?? '').trim();
  const lowered = reason ? reason.charAt(0).toLowerCase() + reason.slice(1) : reason;
  const consumer = (consumerLabel ?? '').trim();
  const base = `Outstanding fees ${lowered}`.trim();
  if (!consumer) return base;
  // Put the ID number on its own line, so the consumer's full name and their ID
  // read on separate lines: "… for Name\n(ID: 8608…)". The `\n` is honoured by the
  // invoice PDF renderer (it splits each line-item description on newlines).
  const consumerBroken = consumer.replace(/\s*\((ID:[^)]*)\)\s*$/i, '\n($1)');
  return `${base} for ${consumerBroken}`;
}
