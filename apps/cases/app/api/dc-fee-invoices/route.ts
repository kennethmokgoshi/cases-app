/**
 * POST /api/dc-fee-invoices
 *
 * Standalone debt-counsellor fee invoice — used when there is no case in the
 * system for the consumer. The consumer's name/surname/ID are captured on the
 * invoice's `reference` line; no case/client link is created.
 */

import { auth } from '@zenowethu/shared-lib';
import { dcFeeInvoiceInputSchema } from '@zenowethu/shared-lib';
import { createDcFeeInvoice } from '@zenowethu/shared-lib/src/finance/dc-fee-invoice-service';
import { logger } from '@zenowethu/shared-lib';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = dcFeeInvoiceInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Optional consumer link (when raised from a client picker).
  const clientId =
    body && typeof body === 'object' && typeof (body as { clientId?: unknown }).clientId === 'string'
      ? (body as { clientId: string }).clientId
      : null;

  try {
    const invoice = await createDcFeeInvoice({
      input: parsed.data,
      clientId,
      createdById: session.user.id,
    });

    logger.info(
      `[dc-fee-invoice] ${invoice.invoiceNumber} raised (standalone) → DC "${parsed.data.dcName}" by ${session.user.id}`,
    );

    return NextResponse.json(
      { id: invoice.id, invoiceNumber: invoice.invoiceNumber, total: Number(invoice.total) },
      { status: 201 },
    );
  } catch (err) {
    logger.error('[POST /api/dc-fee-invoices]', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
