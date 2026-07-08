/**
 * Overpayment reporting (server-only).
 *
 * Node-only (imports `prisma`). Import directly from this file in server
 * components / route handlers — do NOT re-export from the package index, and
 * never import it into a client component.
 *
 * Two read-only views live here:
 *
 * 1. `getCaseQuoteCapture` — snapshot of captured payments vs a case's most
 *    recently accepted quote (same measurement `checkQuoteFulfilment` uses,
 *    without advancing the case). Powers the settled/overpaid display on the
 *    quote detail page.
 *
 * 2. `getOverpaymentSummary` — every client currently overpaid, either against
 *    an accepted quote (case-level payments) or against a standalone invoice.
 *    Powers the admin-only dashboard panel.
 */

import { prisma } from '@zenowethu/database';

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Per-case capture snapshot
// ---------------------------------------------------------------------------

export interface CaseQuoteCapture {
    quoteId: string;
    quoteNumber: string;
    quoteTotal: number;
    /** All non-cancelled payments captured against the case */
    captured: number;
    /** true once captured ≥ quote total (and the quote total is > 0) */
    settled: boolean;
    /** Amount captured above the quote total — 0 unless the client overpaid */
    overpaidBy: number;
}

/**
 * Compare the total captured against a case (all non-cancelled payments) with
 * its most recently accepted quote — read-only twin of `checkQuoteFulfilment`.
 * Returns null when the case has no accepted quote to measure against.
 */
export async function getCaseQuoteCapture(caseId: string): Promise<CaseQuoteCapture | null> {
    const quote = await prisma.invoice.findFirst({
        where: {
            caseId,
            type: 'QUOTE',
            OR: [
                { status: 'ACCEPTED' },
                { status: 'CONVERTED', acceptedAt: { not: null } },
            ],
        },
        orderBy: { acceptedAt: 'desc' },
        select: {
            id: true,
            invoiceNumber: true,
            total: true,
            convertedToInvoice: { select: { status: true, total: true } },
        },
    });
    if (!quote) return null;

    const agg = await prisma.payment.aggregate({
        where: { caseId, status: { not: 'CANCELLED' } },
        _sum: { amount: true },
    });
    let captured = Number(agg._sum.amount ?? 0);

    // Legacy path: invoices marked PAID before payment allocation existed carry
    // no Payment rows — treat the converted invoice's total as captured.
    if (quote.convertedToInvoice?.status === 'PAID') {
        captured = Math.max(captured, Number(quote.convertedToInvoice.total));
    }

    const quoteTotal = Number(quote.total);
    const settled = quoteTotal > 0 && captured >= quoteTotal;

    return {
        quoteId: quote.id,
        quoteNumber: quote.invoiceNumber,
        quoteTotal,
        captured,
        settled,
        overpaidBy: settled ? round2(captured - quoteTotal) : 0,
    };
}

// ---------------------------------------------------------------------------
// Admin overpayment summary
// ---------------------------------------------------------------------------

export interface OverpaymentItem {
    /** QUOTE — case payments exceed the accepted quote; INVOICE — allocated payments exceed the invoice total */
    kind: 'QUOTE' | 'INVOICE';
    /** Invoice/quote row id — detail page lives at /invoices/{id} for both */
    invoiceId: string;
    number: string;
    clientName: string | null;
    caseId: string | null;
    caseFileNumber: string | null;
    /** The quoted / invoiced amount the client was expected to pay */
    expected: number;
    captured: number;
    overpaidBy: number;
}

export interface OverpaymentSummary {
    /** Total number of overpaid documents found (items may be truncated by limit) */
    count: number;
    /** Sum of all overpaid amounts across every item found */
    totalOverpaid: number;
    items: OverpaymentItem[];
}

/**
 * Find every client who has paid more than they were quoted or invoiced.
 *
 * Quote-based entries measure all case payments against the case's latest
 * accepted quote (the same rule that settles a case). Invoice-based entries
 * cover standalone invoices whose allocated payments exceed their total — but
 * only when the invoice's case is not already measured by an accepted quote,
 * so the same money is never reported twice.
 */
export async function getOverpaymentSummary(
    options: { limit?: number } = {},
): Promise<OverpaymentSummary> {
    const limit = options.limit ?? 10;

    // --- Quote-based: case payments vs latest accepted quote ---------------
    const quotes = await prisma.invoice.findMany({
        where: {
            type: 'QUOTE',
            caseId: { not: null },
            OR: [
                { status: 'ACCEPTED' },
                { status: 'CONVERTED', acceptedAt: { not: null } },
            ],
        },
        orderBy: { acceptedAt: 'desc' },
        select: {
            id: true,
            invoiceNumber: true,
            total: true,
            caseId: true,
            client: { select: { firstName: true, lastName: true } },
            case: { select: { fileNumber: true } },
            convertedToInvoice: { select: { status: true, total: true } },
        },
    });

    // Rows arrive newest-accepted first, so the first quote seen per case is
    // the one the settlement rule measures against.
    const latestByCase = new Map<string, (typeof quotes)[number]>();
    for (const q of quotes) {
        if (q.caseId && !latestByCase.has(q.caseId)) latestByCase.set(q.caseId, q);
    }

    const caseIds = Array.from(latestByCase.keys());
    const caseSums = caseIds.length
        ? await prisma.payment.groupBy({
              by: ['caseId'],
              where: { caseId: { in: caseIds }, status: { not: 'CANCELLED' } },
              _sum: { amount: true },
          })
        : [];
    const capturedByCase = new Map(
        caseSums.map(s => [s.caseId as string, Number(s._sum.amount ?? 0)]),
    );

    const items: OverpaymentItem[] = [];
    for (const [caseId, quote] of latestByCase) {
        let captured = capturedByCase.get(caseId) ?? 0;
        if (quote.convertedToInvoice?.status === 'PAID') {
            captured = Math.max(captured, Number(quote.convertedToInvoice.total));
        }
        const expected = Number(quote.total);
        if (expected > 0 && captured > expected) {
            items.push({
                kind: 'QUOTE',
                invoiceId: quote.id,
                number: quote.invoiceNumber,
                clientName: quote.client
                    ? `${quote.client.firstName} ${quote.client.lastName}`
                    : null,
                caseId,
                caseFileNumber: quote.case?.fileNumber ?? null,
                expected,
                captured,
                overpaidBy: round2(captured - expected),
            });
        }
    }

    // --- Invoice-based: allocated payments vs invoice total ----------------
    const invoiceSums = await prisma.payment.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { not: null }, status: { not: 'CANCELLED' } },
        _sum: { amount: true },
    });
    const paidByInvoice = new Map(
        invoiceSums.map(s => [s.invoiceId as string, Number(s._sum.amount ?? 0)]),
    );

    const invoiceIds = Array.from(paidByInvoice.keys());
    const invoices = invoiceIds.length
        ? await prisma.invoice.findMany({
              where: { id: { in: invoiceIds }, type: 'INVOICE', status: { not: 'CANCELLED' } },
              select: {
                  id: true,
                  invoiceNumber: true,
                  total: true,
                  caseId: true,
                  client: { select: { firstName: true, lastName: true } },
                  case: { select: { fileNumber: true } },
              },
          })
        : [];

    for (const inv of invoices) {
        // Payments on a case with an accepted quote are already measured above
        if (inv.caseId && latestByCase.has(inv.caseId)) continue;
        const expected = Number(inv.total);
        const captured = paidByInvoice.get(inv.id) ?? 0;
        if (expected > 0 && captured > expected) {
            items.push({
                kind: 'INVOICE',
                invoiceId: inv.id,
                number: inv.invoiceNumber,
                clientName: inv.client
                    ? `${inv.client.firstName} ${inv.client.lastName}`
                    : null,
                caseId: inv.caseId,
                caseFileNumber: inv.case?.fileNumber ?? null,
                expected,
                captured,
                overpaidBy: round2(captured - expected),
            });
        }
    }

    items.sort((a, b) => b.overpaidBy - a.overpaidBy);

    return {
        count: items.length,
        totalOverpaid: round2(items.reduce((s, i) => s + i.overpaidBy, 0)),
        items: items.slice(0, limit),
    };
}
